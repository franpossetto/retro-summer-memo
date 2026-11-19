/**
 * The MCP tools through the same HTTP handler the Edge Function uses, over an in-memory store.
 */
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server'
import { describe, expect, it } from 'vitest'
import { createLocalStore } from '../adapters/local'
import { memoryStorage } from '../test/memoryStorage'
import { sampleDocument } from '../test/sample'
import { registerTools } from './tools'

const now = new Date('2026-11-18T12:00:00.000Z')

async function setup() {
  const store = createLocalStore(memoryStorage(), 'mcp-test')
  const document = sampleDocument()
  await store.save(document)
  const handler = createMcpHandler(() => {
    const server = new McpServer({ name: 'test', version: '0' })
    registerTools(server, { store, now: () => now })
    return server
  })

  async function rpc(method: string, params: unknown) {
    const response = await handler.fetch(
      new Request('http://localhost/mcp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      }),
    )
    const body = await response.text()
    return JSON.parse(body.split('\n').find((line) => line.startsWith('data:'))?.slice(5) ?? body)
  }

  /** Calls a tool: its JSON result, or `{ error }` when the tool reported one. */
  async function call(name: string, args: Record<string, unknown> = {}) {
    const message = await rpc('tools/call', { name, arguments: args })
    if (message.error) throw new Error(JSON.stringify(message.error))
    const text = message.result.content[0].text as string
    return message.result.isError ? { error: text } : text.startsWith('{') || text.startsWith('[') ? JSON.parse(text) : text
  }

  return { store, document, rpc, call, load: async () => (await store.load())! }
}

describe('MCP tools', () => {
  it('exposes the generic and the dedicated tools, and the everyday prompts', async () => {
    const { rpc } = await setup()
    const tools = (await rpc('tools/list', {})).result.tools.map((tool: { name: string }) => tool.name)
    expect(tools).toEqual(
      expect.arrayContaining(['describe_model', 'cv_guidelines', 'get_document', 'update_document', 'list_sections', 'save_entry', 'save_experience', 'build_cv', 'move_application']),
    )
    const prompts = (await rpc('prompts/list', {})).result.prompts.map((prompt: { name: string }) => prompt.name)
    expect(prompts).toEqual(['actualizar-mi-info', 'armar-cv', 'novedad'])
  })

  it('returns the document without graphs unless asked', async () => {
    const { call } = await setup()
    const view = await call('get_document', { include: ['cvs', 'profile'] })
    expect(Object.keys(view)).toEqual(['cvs', 'profile'])
    expect(view.cvs[0].nodes).toBeUndefined()
    expect(view.cvs[0].versions[0].snapshot).toBeUndefined()
    const full = await call('get_document', { include: ['cvs'], graphs: true })
    expect(full.cvs[0].nodes.length).toBeGreaterThan(0)
  })

  describe('update_document', () => {
    it('edits anything by id, fills new ids and copies the profile into every CV', async () => {
      const { call, load, document } = await setup()
      const acme = document.applications.find((application) => application.company === 'Acme')!
      const result = await call('update_document', {
        operations: [
          { op: 'replace', path: '/profile/name', value: 'Ada King' },
          { op: 'add', path: '/profile/jobs/-', value: { company: 'S64', roles: [{ title: 'Tech Lead', location: 'Madrid', start: '2023', end: 'Actualidad' }] } },
          { op: 'add', path: '/bank/-', value: { category: 'Leadership', text: 'Led a team of 6 engineers', skills: ['Leadership'] } },
          { op: 'replace', path: `/applications/[id=${acme.id}]/location`, value: 'Remoto' },
        ],
      })
      expect(result).toMatchObject({ saved: true, warnings: [] })
      expect(result.changes.map((change: { table: string }) => change.table)).toEqual(expect.arrayContaining(['profiles', 'experiences', 'applications']))

      const stored = await load()
      const job = stored.profile.jobs.find((item) => item.company === 'S64')!
      expect(job.id).toBeTruthy()
      expect(job.roles[0]).toMatchObject({ title: 'Tech Lead', start: '2023', end: 'Actualidad' })
      expect(job.roles[0].id).toBeTruthy()
      expect(stored.bank.find((item) => item.text === 'Led a team of 6 engineers')?.id).toBeTruthy()
      expect(stored.applications.find((item) => item.id === acme.id)?.location).toBe('Remoto')
      for (const cv of stored.cvs) {
        const person = (cv.id === stored.activeCvId ? stored.nodes : cv.nodes).find((node) => node.type === 'person')
        if (person) expect(person.data).toMatchObject({ name: 'Ada King' })
      }
    })

    it('previews with dry_run and applies nothing when an operation fails', async () => {
      const { call, load } = await setup()
      const preview = await call('update_document', { operations: [{ op: 'replace', path: '/profile/name', value: 'Preview' }], dry_run: true })
      expect(preview.saved).toBe(false)
      // The name lands in the profile and in every CV's person node.
      expect(preview.changes).toEqual(expect.arrayContaining([{ table: 'profiles', upserted: 1, deleted: 0 }]))
      const failed = await call('update_document', {
        operations: [
          { op: 'replace', path: '/profile/name', value: 'Half done' },
          { op: 'replace', path: '/applications/[id=nope]/company', value: 'X' },
        ],
      })
      expect(failed.error).toMatch(/Operation 2 .*no element with id "nope"/)
      expect((await load()).profile.name).toBe('Ada Lovelace')
    })

    it('accepts applications in statuses the pipeline does not have yet, creating them', async () => {
      const { call, load, document } = await setup()
      const globex = document.applications.find((application) => application.company === 'Globex')!
      const result = await call('update_document', {
        operations: [{ op: 'replace', path: `/applications/[id=${globex.id}]/statusId`, value: 'call-con-el-ceo' }],
      })
      expect(result.warnings).toEqual([])
      const stored = await load()
      expect(stored.applications.find((item) => item.id === globex.id)?.statusId).toBe('call-con-el-ceo')
      expect(stored.applicationStatuses.find((status) => status.id === 'call-con-el-ceo')).toMatchObject({ name: 'Call con el ceo' })
    })

    it('keeps any extra data the assistant adds to an entity', async () => {
      const { call, load, document } = await setup()
      const globex = document.applications.find((application) => application.company === 'Globex')!
      await call('update_document', {
        operations: [
          { op: 'add', path: `/applications/[id=${globex.id}]/extra`, value: { salary: '85k EUR', modality: 'remoto' } },
          { op: 'add', path: `/applications/[id=${globex.id}]/recruiter`, value: 'Laura' },
          {
            op: 'add',
            path: `/applications/[id=${globex.id}]/events/-`,
            value: { kind: 'interview', at: '2099-03-20T10:00:00.000Z', statusId: globex.statusId, text: 'Challenge técnico' },
          },
          { op: 'add', path: '/profile/jobs/0/roles/0/extra', value: { stack: ['Node.js', 'Azure'] } },
        ],
      })
      const stored = await load()
      const application = stored.applications.find((item) => item.id === globex.id)!
      expect(application.extra).toEqual({ salary: '85k EUR', modality: 'remoto', recruiter: 'Laura' })
      expect(application.events.at(-1)).toMatchObject({ kind: 'interview', text: 'Challenge técnico' })
      expect(stored.profile.jobs[0].roles[0].extra).toEqual({ stack: ['Node.js', 'Azure'] })
    })

    it('reports items the rules reject instead of saving them half-way', async () => {
      const { call } = await setup()
      const result = await call('update_document', { operations: [{ op: 'add', path: '/bank/-', value: { category: 'Empty' } }], dry_run: true })
      expect(result.warnings[0]).toMatch(/bank were invalid and dropped/)
    })
  })

  it('moves applications into new statuses by name', async () => {
    const { call, load, document } = await setup()
    const acme = document.applications.find((application) => application.company === 'Acme')!
    const moved = await call('move_application', { id: acme.id, status: 'Call con el CEO', note: 'El 20/3 a las 10' })
    expect(moved).toMatchObject({ status: 'Call con el CEO', created_status: 'Call con el CEO' })
    const stored = (await load()).applications.find((item) => item.id === acme.id)!
    expect(stored.events.some((event) => event.kind === 'note' && event.text === 'El 20/3 a las 10')).toBe(true)
    // What is scheduled for later stays after it in the history.
    expect(stored.events.at(-1)).toMatchObject({ kind: 'interview', extra: { place: 'Zoom' } })
  })

  it('fills sections, entries and experiences with one CRUD, then builds and reviews a CV', async () => {
    const { call, load, document } = await setup()
    const globex = document.applications.find((application) => application.company === 'Globex')!

    const role = await call('save_entry', { section: 'experiencia', title: 'Tech Lead', subtitle: 'S64 Capital', start: '2025', end: 'Actualidad' })
    expect(role.section_id).toBe('experience')
    const project = await call('save_entry', { section: 'Proyectos', title: 'Weball', subtitle: 'Founder', start: '2024', end: 'Actualidad' })
    expect(project.section_id).toBe('projects')
    const certification = await call('save_entry', { section: 'Certificaciones', title: 'AWS Solutions Architect', subtitle: 'Amazon', end: '2024' })

    const latency = await call('save_experience', { text: 'Reduje un 40% la latencia de órdenes con Redis', entry_id: role.entry_id, skills: ['Redis', 'Node.js'], level: 'profesional' })
    const team = await call('save_experience', { text: 'Responsable del equipo de backend', entry_id: role.entry_id, skills: ['Leadership'] })
    const leagues = await call('save_experience', { text: 'Plataforma usada por 300 ligas', entry_id: project.entry_id, skills: ['React'] })
    const loose = await call('save_experience', { text: 'Mentoría a juniors' })
    expect(await call('save_experience', { text: 'X', entry_id: 'nope' })).toMatchObject({ error: expect.stringContaining('No existe la entrada') })

    const sections = await call('list_sections')
    expect(sections.find((section: { id: string }) => section.id === 'experience').entries.at(-1)).toMatchObject({ title: 'Tech Lead', subtitle: 'S64 Capital', experiences: 2 })
    const experiences = await call('list_experiences', { query: 'latencia' })
    expect(experiences[0]).toMatchObject({ where: 'Experiencia laboral: Tech Lead — S64 Capital', level: 'profesional' })

    const built = await call('build_cv', {
      title: 'Globex — Tech Lead',
      position: 'Tech Lead',
      company: 'Globex',
      posting: 'Buscamos Tech Lead con Node.js, Redis, Kubernetes y React.',
      summary: 'Tech Lead con 10 años en backend y producto.',
      experience_ids: [latency.experience_id, team.experience_id, leagues.experience_id, loose.experience_id],
      section_ids: ['Proyectos', 'Certificaciones'],
      application_id: globex.id,
    })
    expect(built.outline.roles.find((item: { company: string }) => item.company === 'S64 Capital')).toMatchObject({ experiences: 2 })
    // Sections asked for show all their entries: the sample's project plus Weball.
    expect(built.outline.sections).toEqual([
      { name: 'Personal projects', entries: 2 },
      { name: 'Certificaciones', entries: 1 },
    ])
    expect(built.outline.unplaced).toEqual([{ id: loose.experience_id, text: 'Mentoría a juniors' }])
    // The review points at what to fix: weak wording and keywords the bank backs but the CV lacks.
    const kinds = built.review.findings.map((finding: { kind: string }) => finding.kind)
    expect(kinds).toEqual(expect.arrayContaining(['wording', 'results']))
    expect(built.review.keywords.covered).toEqual(expect.arrayContaining(['Node.js', 'Redis', 'React']))
    expect(built.review.keywords.notInExperience).toContain('Kubernetes')

    const stored = await load()
    expect(stored.applications.find((item) => item.id === globex.id)?.attachment).toEqual({ kind: 'cv', cvId: built.cv_id, versionId: built.version_id })
    expect(stored.cvs.find((cv) => cv.id === built.cv_id)?.enabledSections).toEqual(
      expect.arrayContaining(['experience', 'projects', stored.sections.find((section) => section.name === 'Certificaciones')!.id]),
    )
    expect(certification.entry_id).toBeTruthy()
  })

  it('deletes experiences and entries', async () => {
    const { call, load, document } = await setup()
    const [first, second] = document.bank
    expect(await call('delete_experiences', { experience_ids: [first.id, second.id] })).toEqual({ deleted: 2 })
    const stored = await load()
    expect(stored.bank.some((item) => item.id === first.id)).toBe(false)
    await call('delete_entry', { section: 'experience', entry_id: 'job-1-r1' })
    expect((await load()).profile.jobs).toEqual([])
  })

  it('deletes statuses re-homing their applications, and deletes applications', async () => {
    const { call, load, document } = await setup()
    const acme = document.applications.find((application) => application.company === 'Acme')!
    expect(await call('delete_status', { status: 'Call con RRHH', move_to: 'CV aceptado' })).toMatchObject({ moved: 1, to: 'CV aceptado' })
    let stored = await load()
    expect(stored.applicationStatuses.some((status) => status.id === 'hr-call')).toBe(false)
    expect(stored.applications.find((item) => item.id === acme.id)?.statusId).toBe('accepted')

    await call('delete_application', { id: acme.id })
    stored = await load()
    expect(stored.applications.some((item) => item.id === acme.id)).toBe(false)
  })
})
