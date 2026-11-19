/**
 * Runs against the local stack: `npm run db:start`, then `npm run test:integration`.
 * Reads VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY from .env.local.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { openDocument } from '../../app/openDocument'
import { createApplication } from '../../domain/applications'
import type { Rebase } from '../../ports/documentStore'
import { documentStoreContract } from '../../ports/documentStore.contract'
import { sampleDocument } from '../../test/sample'
import { createSupabaseStore } from './store'

const url = import.meta.env.VITE_SUPABASE_URL ?? ''
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? ''
const password = 'integration-test-password'

function client(): SupabaseClient {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function newUser(): Promise<{ client: SupabaseClient; userId: string; email: string }> {
  const supabase = client()
  const email = `test-${crypto.randomUUID()}@example.com`
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error || !data.user || !data.session) throw error ?? new Error('Sign-up returned no session (are email confirmations off?)')
  return { client: supabase, userId: data.user.id, email }
}

async function signIn(email: string): Promise<SupabaseClient> {
  const supabase = client()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return supabase
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitFor<T>(read: () => T | undefined, timeoutMs = 10_000): Promise<T> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = read()
    if (value !== undefined) return value
    if (Date.now() > deadline) throw new Error('Timed out waiting for a remote change')
    await pause(100)
  }
}

if (!url || !key) throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (see .env.local)')

documentStoreContract('Supabase store', async () => {
  const user = await newUser()
  return {
    store: createSupabaseStore(user.client, user.userId),
    reopen: async () => createSupabaseStore(user.client, user.userId),
  }
})

describe('Supabase store — access control', () => {
  it("keeps each user's rows private", async () => {
    const owner = await newUser()
    await createSupabaseStore(owner.client, owner.userId).save(sampleDocument())

    const other = await newUser()
    const { data: visible, error: readError } = await other.client.from('applications').select('id').eq('user_id', owner.userId)
    expect(readError).toBeNull()
    expect(visible).toEqual([])

    const { error: writeError } = await other.client
      .from('applications')
      .insert({ user_id: owner.userId, id: 'intruder', status_id: 'sent' })
    expect(writeError).not.toBeNull()

    const { error: anonymousError } = await client().from('applications').select('id')
    expect(anonymousError).not.toBeNull()
  })
})

describe('Supabase store — live changes', () => {
  it('merges a change made elsewhere without losing local edits', async () => {
    const user = await newUser()
    const writer = createSupabaseStore(user.client, user.userId)
    const { document } = await openDocument(writer, () => sampleDocument())

    const reader = createSupabaseStore(await signIn(user.email), user.userId)
    const onScreen = await reader.load()
    expect(onScreen).not.toBeNull()

    let rebase: Rebase | undefined
    const unsubscribe = reader.subscribe((received) => {
      rebase = received
    })
    await pause(1500) // let the realtime channel join

    const added = createApplication({ company: 'Initech', title: 'SRE' }, document.applicationStatuses)
    await writer.save({ ...document, applications: [...document.applications, added] })

    const apply = await waitFor(() => rebase)
    unsubscribe()
    const editedLocally = { ...onScreen!, profile: { ...onScreen!.profile, name: 'Typing right now' } }
    const merged = apply(editedLocally)
    expect(merged.profile.name).toBe('Typing right now')
    expect(merged.applications.map((application) => application.company)).toContain('Initech')
  })

  it('does not echo its own saves back as remote changes', async () => {
    const user = await newUser()
    const store = createSupabaseStore(user.client, user.userId)
    const { document } = await openDocument(store, () => sampleDocument())

    let notified = false
    const unsubscribe = store.subscribe(() => {
      notified = true
    })
    await pause(1500)
    await store.save({ ...document, profile: { ...document.profile, name: 'Saved here' } })
    await pause(2500)
    unsubscribe()
    expect(notified).toBe(false)
  })
})
