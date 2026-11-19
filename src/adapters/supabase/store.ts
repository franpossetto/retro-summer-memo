import type { SupabaseClient } from '@supabase/supabase-js'
import type { DocumentStore } from '../../ports/documentStore'
import {
  COLUMNS,
  TABLES,
  diffTables,
  emptyTables,
  fromTables,
  mergeTables,
  normalizeRows,
  tablesEqual,
  toTables,
  type Row,
  type TableName,
  type TableOps,
  type Tables,
} from './rows'

const PAGE = 1000
const WRITE_CHUNK = 100
const REMOTE_DEBOUNCE_MS = 300
/** Time after SUBSCRIBED until postgres changes are reliably delivered. */
const SETTLE_MS = 2500

/**
 * Document stored in Supabase, one set of rows per user (RLS enforces ownership).
 *
 * Keeps the last state known to be in the database (`base`) so each save writes only the rows
 * that changed, and remote changes (another device, Claude through the MCP) are merged row by row
 * without dropping what the user is still editing.
 */
export function createSupabaseStore(client: SupabaseClient, userId: string): DocumentStore {
  let base: Tables | null = null
  let queue: Promise<unknown> = Promise.resolve()

  /** Loads, saves and remote refreshes run one at a time, so `base` always matches the database. */
  function exclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task, task)
    queue = run.catch(() => undefined)
    return run
  }

  async function readTable(table: TableName): Promise<Row[]> {
    const rows: Row[] = []
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await client
        .from(table)
        .select(COLUMNS[table])
        .eq('user_id', userId)
        .order('id')
        .range(from, from + PAGE - 1)
      if (error) throw new Error(`Could not read ${table}: ${error.message}`)
      const page = (data ?? []) as unknown as Row[]
      rows.push(...page)
      if (page.length < PAGE) return normalizeRows(table, rows)
    }
  }

  async function readTables(): Promise<Tables> {
    const entries = await Promise.all(TABLES.map(async (table) => [table, await readTable(table)] as const))
    return Object.fromEntries(entries) as Tables
  }

  async function write(ops: TableOps[]) {
    for (const { table, upserts } of ops) {
      for (const rows of chunks(upserts, WRITE_CHUNK)) {
        const { error } = await client
          .from(table)
          .upsert(rows.map((row) => ({ ...row, user_id: userId })), { onConflict: 'user_id,id' })
        if (error) throw new Error(`Could not save ${table}: ${error.message}`)
      }
    }
    for (const { table, deletes } of [...ops].reverse()) {
      for (const ids of chunks(deletes, WRITE_CHUNK)) {
        const { error } = await client.from(table).delete().eq('user_id', userId).in('id', ids)
        if (error) throw new Error(`Could not delete from ${table}: ${error.message}`)
      }
    }
  }

  return {
    label: 'Supabase',

    load: () =>
      exclusive(async () => {
        const tables = await readTables()
        base = tables
        return tables.profiles.length === 0 ? null : fromTables(tables)
      }),

    save: (document) =>
      exclusive(async () => {
        const next = toTables(document)
        await write(diffTables(base ?? emptyTables(), next))
        base = next
      }),

    subscribe(onRemote) {
      let timer: ReturnType<typeof setTimeout> | undefined
      const refresh = () =>
        exclusive(async () => {
          if (!base) return
          const remote = await readTables()
          // Echo of our own write, or nothing new.
          if (tablesEqual(remote, base)) return
          const known = base
          base = remote
          onRemote((local) => fromTables(mergeTables(known, toTables(local), remote), local))
        }).catch(() => {
          // Transient read failure: the next change notification retries.
        })

      const schedule = () => {
        clearTimeout(timer)
        timer = setTimeout(refresh, REMOTE_DEBOUNCE_MS)
      }
      const channel = client.channel(`document:${userId}`)
      for (const table of TABLES) {
        channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `user_id=eq.${userId}` }, schedule)
      }
      // Re-read whenever the channel (re)connects: changes made while it was joining or offline
      // (laptop asleep, network drop) produce no event. Postgres changes start flowing a moment
      // after SUBSCRIBED, so read once more after that gap too.
      let settle: ReturnType<typeof setTimeout> | undefined
      channel.subscribe((status) => {
        if (status !== 'SUBSCRIBED') return
        schedule()
        clearTimeout(settle)
        settle = setTimeout(schedule, SETTLE_MS)
      })
      return () => {
        clearTimeout(timer)
        clearTimeout(settle)
        void client.removeChannel(channel)
      }
    },
  }
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = []
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size))
  return result
}
