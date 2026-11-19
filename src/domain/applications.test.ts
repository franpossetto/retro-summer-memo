import { describe, expect, it } from 'vitest'
import {
  addApplicationNote,
  addStatus,
  companyKey,
  createApplication,
  defaultApplicationStatuses,
  emptyDebrief,
  findDuplicates,
  findOrCreateStatus,
  moveApplication,
  postingKey,
  isEmptyDebrief,
  readApplications,
  readDebrief,
  removeApplicationNote,
  removeStatus,
  saveDebrief,
  stageVisits,
  stepsAhead,
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
      // Not guessed from the server's clock: shown from createdAt, in the user's time zone.
      appliedOn: '',
      createdAt: '2026-05-01T12:00:00.000Z',
    })
    expect(createApplication({ company: 'Acme', title: 'X', appliedOn: '2026-04-30' }, statuses).appliedOn).toBe('2026-04-30')
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
      [{ id: 'a', company: 'Acme', statusId: 'gone', url: 'https://linkedin.com/jobs/view/7', events: [{ id: 'e' }], salary: '90k' }, { nope: true }],
      statuses,
    )
    // Unknown statuses are kept (withReferencedStatuses adds them to the pipeline), never rewritten.
    // Events need a kind (any kind); unknown properties are kept under extra.
    expect(application).toMatchObject({ id: 'a', statusId: 'gone', postingKey: 'linkedin:7', events: [], attachment: null, extra: { salary: '90k' } })
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

describe('debriefs and stages', () => {
  const statuses = defaultApplicationStatuses()

  function process() {
    const created = createApplication({ company: 'Globex', title: 'Dev', note: 'Referido' }, statuses, at('2026-03-01T10:00:00.000Z'))
    return moveApplication(created, 'hr-call', 'Call el lunes', at('2026-03-03T10:00:00.000Z'))
  }

  it('adds how a step went to the current step, and edits only what is given', () => {
    const { application, eventId } = saveDebrief(
      process(),
      { text: ' Bien ', rating: 4.4, asked: ['Por qué me voy', '  '], liked: 'Liderazgo\nInglés' as unknown as string[] },
      at('2026-03-06T15:00:00.000Z'),
    )
    const event = application.events.find((item) => item.id === eventId)!
    expect(event).toMatchObject({ kind: 'debrief', statusId: 'hr-call', at: '2026-03-06T15:00:00.000Z', text: 'Bien' })
    expect(event.debrief).toEqual({ ...emptyDebrief(), rating: 4, asked: ['Por qué me voy'], liked: ['Liderazgo', 'Inglés'] })

    const edited = saveDebrief(application, { id: eventId, unsaid: ['Otra oferta'], rating: null }, at('2026-03-07T00:00:00.000Z')).application
    const again = edited.events.find((item) => item.id === eventId)!
    expect(again.text).toBe('Bien')
    expect(again.debrief).toEqual({ ...emptyDebrief(), asked: ['Por qué me voy'], liked: ['Liderazgo', 'Inglés'], unsaid: ['Otra oferta'] })
    expect(edited.events.filter((item) => item.kind === 'debrief')).toHaveLength(1)
  })

  it('refuses to put a debrief on a status change or an unknown event', () => {
    const application = process()
    const status = application.events.find((event) => event.kind === 'status')!
    expect(() => saveDebrief(application, { id: status.id, text: 'x' })).toThrow(/cambio de estado/)
    expect(() => saveDebrief(application, { id: 'nope' })).toThrow(/No existe el evento/)
  })

  it('keeps debriefs through storage parsing', () => {
    const { application } = saveDebrief(process(), { text: 'Bien', rating: 5, people: ['CTO'] }, at('2026-03-06T00:00:00.000Z'))
    const [read] = readApplications(JSON.parse(JSON.stringify([application])), statuses)
    expect(read).toEqual(application)
    expect(readDebrief({ rating: '9', asked: 'a\nb', said: [1, 'ok'] })).toEqual({ ...emptyDebrief(), rating: 5, asked: ['a', 'b'], said: ['ok'] })
    expect(isEmptyDebrief(emptyDebrief())).toBe(true)
  })

  it('tells the process step by step, without what is scheduled', () => {
    let application = saveDebrief(process(), { text: 'Bien' }, at('2026-03-06T00:00:00.000Z')).application
    application = addApplicationNote(application, 'Me mandaron el challenge', at('2026-03-07T00:00:00.000Z'))
    application = {
      ...application,
      events: [...application.events, { id: 'later', at: '2026-04-01T00:00:00.000Z', kind: 'interview', statusId: 'hr-call', text: 'Entrevista' }],
    }
    const visits = stageVisits(application, at('2026-03-10T00:00:00.000Z'))
    expect(visits.map((visit) => [visit.statusId, visit.current, visit.events.map((event) => event.text)])).toEqual([
      ['sent', false, ['Referido']],
      ['hr-call', true, ['Call el lunes', 'Bien', 'Me mandaron el challenge']],
    ])
    expect(stepsAhead(application, statuses, visits).map((status) => status.id)).toEqual(['challenge', 'interview'])
  })

  it('shows the current step even without a status change for it, and nothing ahead once closed', () => {
    const application = { ...process(), statusId: 'rejected' }
    const visits = stageVisits(application, at('2026-03-10T00:00:00.000Z'))
    expect(visits.at(-1)).toMatchObject({ statusId: 'rejected', current: true, events: [] })
    expect(stepsAhead(application, statuses, visits)).toEqual([])
  })
})
