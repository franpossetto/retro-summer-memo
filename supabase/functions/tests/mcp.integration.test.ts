/**
 * The MCP server end to end, against the local stack:
 *   npm run db:start
 *   npx supabase functions serve mcp      (keep it running)
 *   npm run test:mcp
 * Users sign in with a password here; real clients get an equivalent token through OAuth.
 */
import { createClient } from '@supabase/supabase-js'
import { beforeAll, describe, expect, it } from 'vitest'
import { createSupabaseStore } from '../../../src/adapters/supabase/store'
import { openDocument } from '../../../src/app/openDocument'
import { sampleDocument } from '../../../src/test/sample'

const url = import.meta.env.VITE_SUPABASE_URL ?? ''
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? ''
const endpoint = `${url}/functions/v1/mcp`

async function newUser() {
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await client.auth.signUp({ email: `mcp-${crypto.randomUUID()}@example.com`, password: 'integration-test-password' })
  if (error || !data.session || !data.user) throw error ?? new Error('Sign-up returned no session')
  return { client, userId: data.user.id, token: data.session.access_token }
}

async function rpc(token: string | null, method: string, params: unknown = {}) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2025-06-18',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const body = await response.text()
  const payload = body.split('\n').find((line) => line.startsWith('data:'))?.slice(5) ?? body
  return { response, message: response.ok ? JSON.parse(payload) : null }
}

/** Calls a tool and returns its JSON result, or `{ error }` when the tool reported one. */
async function tool(token: string, name: string, args: Record<string, unknown> = {}) {
  const { message } = await rpc(token, 'tools/call', { name, arguments: args })
  if (message.error) throw new Error(JSON.stringify(message.error))
  const text = message.result.content[0].text as string
  return message.result.isError ? { error: text } : JSON.parse(text)
}

beforeAll(async () => {
  if (!url || !key) throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (see .env.local)')
  const probe = await fetch(endpoint, { method: 'POST' }).catch(() => null)
  if (!probe || probe.status === 503 || probe.status === 404) {
    throw new Error('The MCP function is not being served: run `npx supabase functions serve mcp` first.')
  }
})

describe('MCP server', () => {
  it('asks clients without a token to sign in through OAuth', async () => {
    const { response } = await rpc(null, 'initialize')
    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toContain('/functions/v1/mcp/oauth-protected-resource')

    const metadata = await (await fetch(`${endpoint}/oauth-protected-resource`)).json()
    expect(metadata.authorization_servers).toEqual([`${url}/auth/v1`])
  })

  it('lists the tools and the nuevo-job prompt', async () => {
    const { token } = await newUser()
    const { message: tools } = await rpc(token, 'tools/list')
    expect(tools.result.tools.map((item: { name: string }) => item.name)).toEqual(
      expect.arrayContaining(['check_duplicates', 'create_application', 'move_application', 'list_experiences']),
    )
    const { message: prompts } = await rpc(token, 'prompts/list')
    expect(prompts.result.prompts.map((item: { name: string }) => item.name)).toContain('nuevo-job')
  })

  it('does not write before the app has created the account', async () => {
    const { token } = await newUser()
    const result = await tool(token, 'create_application', { company: 'Initech', title: 'SRE' })
    expect(result.error).toMatch(/abrí la app/)
  })

  describe('with an account', () => {
    let user: Awaited<ReturnType<typeof newUser>>
    beforeAll(async () => {
      user = await newUser()
      await openDocument(createSupabaseStore(user.client, user.userId), () => sampleDocument())
    })

    it('finds earlier applications to the same posting even with other tracking params', async () => {
      const result = await tool(user.token, 'check_duplicates', {
        company: 'ACME Inc.',
        title: 'Sr Backend Engineer',
        url: 'https://www.linkedin.com/jobs/view/4012345678/?trk=other',
      })
      expect(result.already_applied).toBe(true)
      expect(result.matches[0]).toMatchObject({ reason: 'same-posting', company: 'Acme', status: 'Call con RRHH' })
    })

    it('only creates a duplicate once the user confirms', async () => {
      const posting = { company: 'Acme', title: 'Backend Engineer', url: 'https://www.linkedin.com/jobs/view/4012345678/' }
      expect(await tool(user.token, 'create_application', posting)).toMatchObject({ created: false })
      expect(await tool(user.token, 'create_application', { ...posting, confirm_duplicate: true })).toMatchObject({ created: true })
    })

    it('creates, moves and edits applications that the app then reads back', async () => {
      const created = await tool(user.token, 'create_application', {
        company: 'Initech',
        title: 'Site Reliability Engineer',
        location: 'Remoto',
        note: 'Referida por Peter',
      })
      expect(created.application.status).toBe('CV enviado')
      const id = created.application.id

      expect(await tool(user.token, 'move_application', { id, status: 'take HOME', note: 'Entrega el viernes' })).toMatchObject({
        status: 'Take home',
      })
      expect(await tool(user.token, 'move_application', { id, status: 'Contratado' })).toMatchObject({
        error: expect.stringContaining('No existe el estado'),
      })
      // Only the fields sent change.
      expect(await tool(user.token, 'update_application', { id, location: 'Híbrido' })).toMatchObject({
        company: 'Initech',
        title: 'Site Reliability Engineer',
        location: 'Híbrido',
      })

      const document = await createSupabaseStore(user.client, user.userId).load()
      const stored = document?.applications.find((application) => application.id === id)
      expect(stored).toMatchObject({ statusId: 'take-home', location: 'Híbrido' })
      expect(stored?.events.map((event) => event.kind === 'note' ? event.text : event.statusId)).toEqual([
        'sent',
        'Referida por Peter',
        'take-home',
        'Entrega el viernes',
      ])
    })

    it("never shows one user's applications to another", async () => {
      const stranger = await newUser()
      await openDocument(createSupabaseStore(stranger.client, stranger.userId), () => ({ ...sampleDocument(), applications: [] }))
      const result = await tool(stranger.token, 'search_applications', { text: 'acme' })
      expect(result.total).toBe(0)
    })
  })
})
