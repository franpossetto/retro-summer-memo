import { describe, expect, it } from 'vitest'
import {
  addApplicationNote,
  addStatus,
  companyKey,
  createApplication,
  defaultApplicationStatuses,
  findDuplicates,
  findOrCreateStatus,
  moveApplication,
  postingKey,
  readApplications,
  removeApplicationNote,
  removeStatus,
  titleSimilarity,
  withReferencedStatuses,
  type Application,
} from './applications'

const statuses = defaultApplicationStatuses()
const at = (iso: string) => new Date(iso)

function apply(company: string, title: string, url = '', when = '2026-01-01T00:00:00.000Z'): Application {
  return createApplication({ company, title, url }, statuses, at(when))
}

describe('postingKey', () => {
  it.each([
    ['https://www.linkedin.com/jobs/view/4012345678/?refId=abc&trk=x', 'linkedin:4012345678'],
    ['linkedin.com/jobs/view/senior-backend-engineer-at-acme-4012345678', 'linkedin:4012345678'],
    ['https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4012345678', 'linkedin:4012345678'],
    ['https://boards.greenhouse.io/acme/jobs/123456?gh_src=abc', 'greenhouse:123456'],
    ['https://acme.com/careers/open?gh_jid=123456', 'greenhouse:123456'],
    ['https://jobs.lever.co/acme/1F2E3D4C-AAAA-BBBB-CCCC-1234567890AB/apply', 'lever:1f2e3d4c-aaaa-bbbb-cccc-1234567890ab'],
    ['https://jobs.ashbyhq.com/acme/0f9e8d7c-1111-2222-3333-444455556666', 'ashby:0f9e8d7c-1111-2222-3333-444455556666'],
    ['https://apply.workable.com/acme/j/ab12cd34ef/', 'workable:AB12CD34EF'],
    ['https://Acme.com/Careers/Backend/?utm_source=x#apply', 'acme.com/careers/backend'],
    ['', ''],
    ['not a url at all', ''],
  ])('%s → %s', (url, key) => {
    expect(postingKey(url)).toBe(key)
  })
})

describe('companyKey', () => {
  it('ignores case, accents, punctuation, spaces and legal suffixes', () => {
    expect(companyKey('Acme S.A.')).toBe('acme')
    expect(companyKey('ACME, Inc.')).toBe('acme')
    expect(companyKey('Mercado Libre')).toBe(companyKey('MercadoLibre S.R.L.'))
    expect(companyKey('Telefónica')).toBe('telefonica')
  })
})

describe('titleSimilarity', () => {
  it('treats abbreviations, translations and typos as the same title', () => {
    expect(titleSimilarity('Sr. Backend Engineer', 'Senior Backend Engineer')).toBe(1)
    expect(titleSimilarity('Desarrollador Backend', 'Backend Developer')).toBe(1)
    expect(titleSimilarity('Senior Backend Enginer', 'Senior Backend Engineer')).toBe(1)
  })

  it('separates different roles', () => {
    expect(titleSimilarity('Frontend Engineer', 'Data Analyst')).toBe(0)
    expect(titleSimilarity('Backend Engineer', 'Senior Backend Engineer')).toBeGreaterThanOrEqual(0.5)
  })
})

describe('findDuplicates', () => {
  const linkedin = apply('Acme', 'Backend Engineer', 'https://www.linkedin.com/jobs/view/111/', '2026-01-10T00:00:00.000Z')
  const sameRole = apply('ACME Inc.', 'Sr Backend Engineer', '', '2026-02-10T00:00:00.000Z')
  const otherRole = apply('Acme', 'Product Designer', '', '2026-03-10T00:00:00.000Z')
  const otherCompany = apply('Globex', 'Backend Engineer', '', '2026-04-10T00:00:00.000Z')
  const history = [linkedin, sameRole, otherRole, otherCompany]

  it('flags the same posting even when the URL differs', () => {
    const matches = findDuplicates(history, {
      company: 'Whatever',
      title: 'Anything',
      url: 'https://linkedin.com/jobs/view/111?trk=feed',
    })
    expect(matches.map((match) => [match.application.id, match.reason])).toEqual([[linkedin.id, 'same-posting']])
  })

  it('ranks same posting, then same role, then same company', () => {
    const matches = findDuplicates(history, {
      company: 'acme',
      title: 'Backend Engineer',
      url: 'https://www.linkedin.com/jobs/view/111',
    })
    expect(matches.map((match) => [match.application.id, match.reason])).toEqual([
      [linkedin.id, 'same-posting'],
      [sameRole.id, 'same-role'],
      [otherRole.id, 'same-company'],
    ])
  })

  it('ignores other companies and the application being edited', () => {
    expect(findDuplicates(history, { company: 'Initech', title: 'Backend Engineer' })).toEqual([])
    expect(findDuplicates([linkedin], { company: 'Acme', title: 'Backend Engineer' }, linkedin.id)).toEqual([])
  })
})

describe('application lifecycle', () => {
  it('starts in the first open step with its history', () => {
    const application = createApplication(
      { company: ' Acme ', title: 'Backend Engineer', url: 'https://linkedin.com/jobs/view/42', note: 'Referral' },
      statuses,
      at('2026-05-01T12:00:00.000Z'),
    )
    expect(application).toMatchObject({
      company: 'Acme',
      statusId: 'sent',
      postingKey: 'linkedin:42',
      appliedOn: '2026-05-01',
      createdAt: '2026-05-01T12:00:00.000Z',
    })
    expect(application.events.map((event) => [event.kind, event.statusId, event.text])).toEqual([
      ['status', 'sent', ''],
      ['note', 'sent', 'Referral'],
    ])
  })

  it('records moves and notes per step', () => {
    let application = apply('Acme', 'Backend Engineer')
    application = moveApplication(application, 'challenge', 'Due Friday', at('2026-01-05T00:00:00.000Z'))
    application = addApplicationNote(application, 'Sent it', at('2026-01-06T00:00:00.000Z'))
    expect(application.statusId).toBe('challenge')
    expect(application.updatedAt).toBe('2026-01-06T00:00:00.000Z')
    expect(application.events.slice(1).map((event) => [event.kind, event.statusId, event.text])).toEqual([
      ['status', 'challenge', ''],
      ['note', 'challenge', 'Due Friday'],
      ['note', 'challenge', 'Sent it'],
    ])
    expect(moveApplication(application, 'challenge')).toBe(application)
  })

  it('moves applications out of a removed step', () => {
    const application = moveApplication(apply('Acme', 'Backend Engineer'), 'hr-call')
    const result = removeStatus(statuses, [application], 'hr-call', 'sent')
    expect(result.statuses.some((status) => status.id === 'hr-call')).toBe(false)
    expect(result.applications[0].statusId).toBe('sent')
    expect(removeStatus(statuses, [application], 'hr-call', 'missing')).toEqual({ statuses, applications: [application] })
  })

  it('adds open steps after the last open one and closing steps at the end', () => {
    const open = addStatus(statuses, '  Call con el CTO ')
    expect(open.statuses.map((status) => status.id).indexOf(open.status.id)).toBe(5)
    expect(open.status).toMatchObject({ name: 'Call con el CTO', kind: 'active' })
    expect(statuses.some((status) => status.color === open.status.color)).toBe(false)
    const closing = addStatus(statuses, 'Ghosteado', 'withdrawn')
    expect(closing.statuses.at(-1)).toBe(closing.status)
  })

  it('deletes notes but never status changes', () => {
    const noted = addApplicationNote(apply('Acme', 'Backend Engineer'), 'Hablé con Ana')
    const [moved, note] = noted.events
    expect(removeApplicationNote(noted, note.id).events).toEqual([moved])
    expect(removeApplicationNote(noted, moved.id)).toBe(noted)
  })

  it('reads stored applications defensively', () => {
    const [application] = readApplications(
      [{ id: 'a', company: 'Acme', statusId: 'gone', url: 'https://linkedin.com/jobs/view/7', events: [{ id: 'e', kind: 'bogus' }] }, { nope: true }],
      statuses,
    )
    // Unknown statuses are kept (withReferencedStatuses adds them to the pipeline), never rewritten.
    expect(application).toMatchObject({ id: 'a', statusId: 'gone', postingKey: 'linkedin:7', events: [], attachment: null })
  })

  it('adds statuses that applications use but the pipeline does not list', () => {
    const application = { ...apply('Acme', 'Backend Engineer'), statusId: 'call-con-el-ceo' }
    const result = withReferencedStatuses(statuses, [application])
    const added = result.find((status) => status.id === 'call-con-el-ceo')
    expect(added).toMatchObject({ name: 'Call con el ceo', kind: 'active' })
    expect(result.indexOf(added!)).toBeLessThan(result.findIndex((status) => status.id === 'offer'))
    expect(withReferencedStatuses(statuses, [apply('Acme', 'X')])).toBe(statuses)
  })

  it('finds statuses by name ignoring case and accents, or creates them', () => {
    expect(findOrCreateStatus(statuses, 'challenge TECNICO')).toMatchObject({ created: false, status: { id: 'challenge' } })
    const created = findOrCreateStatus(statuses, 'Call con el CEO')
    expect(created).toMatchObject({ created: true, status: { name: 'Call con el CEO', kind: 'active' } })
    expect(created.statuses).toHaveLength(statuses.length + 1)
  })
})
