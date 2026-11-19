import { describe, expect, it } from 'vitest'
import { agenda, setupStatus } from './assistantBrief'
import { createApplication, moveApplication, saveDebrief, scheduleEvent } from './applications'
import { importCareer } from './content'
import { postingFit } from './cvReview'
import { createEmptyDocument, type ResumeDocument } from './model'

const now = new Date('2026-11-19T15:00:00.000Z')
const missing = (document: ResumeDocument) => setupStatus(document).checks.filter((check) => !check.done).map((check) => check.key)

function career(): ResumeDocument {
  return importCareer(createEmptyDocument(), {
    profile: { name: 'Ada', fields: [{ label: 'Email', value: 'ada@example.com' }] },
    entries: [
      { section: 'experience', title: 'Tech Lead', subtitle: 'Weball', start: '2022', experiences: [{ text: 'Reduje un 40% la latencia con Redis', skills: ['Redis', 'Node.js'] }] },
      { section: 'experience', title: 'Developer', subtitle: 'Globex', start: '2019' },
    ],
  }).document
}

describe('setupStatus', () => {
  it('sees an empty account as empty, with everything to do', () => {
    const setup = setupStatus(createEmptyDocument())
    expect(setup.mode).toBe('empty')
    expect(missing(createEmptyDocument())).toEqual(expect.arrayContaining(['name', 'email', 'roles', 'achievements', 'education', 'cv']))
  })

  it('names the roles without achievements and the achievements without numbers', () => {
    let document = career()
    const setup = setupStatus(document)
    expect(setup.mode).toBe('incomplete')
    expect(setup.checks.find((check) => check.key === 'roles_without_achievements')).toMatchObject({ done: false, items: ['Developer — Globex'] })
    expect(missing(document)).toEqual(expect.arrayContaining(['phone', 'location', 'linkedin', 'education']))
    expect(missing(document)).not.toContain('achievements_without_results')

    const globex = document.profile.jobs.find((job) => job.company === 'Globex')!.roles[0].id
    document = importCareer(document, { experiences: [{ entryId: globex, text: 'Armé el design system del producto' }] }).document
    const next = setupStatus(document)
    expect(next.mode).toBe('ready')
    expect(next.checks.find((check) => check.key === 'achievements_without_results')).toMatchObject({ done: false, items: ['Armé el design system del producto'] })
  })
})

describe('agenda', () => {
  function withProcess() {
    const document = career()
    const statuses = document.applicationStatuses
    let acme = createApplication({ company: 'Acme', title: 'Backend' }, statuses, new Date('2026-11-01T10:00:00.000Z'))
    acme = moveApplication(acme, 'hr-call', '', new Date('2026-11-10T10:00:00.000Z'))
    acme = scheduleEvent(acme, { at: '2026-11-18T18:00:00.000Z', kind: 'call', text: 'Call con Laura (RRHH)' }).application
    acme = scheduleEvent(acme, { at: '2026-11-21T13:00:00.000Z', kind: 'interview', text: 'Técnica con el CTO' }).application
    const weighing = createApplication({ company: 'Initech', title: 'SRE', statusId: 'considering' }, statuses, new Date('2026-11-12T10:00:00.000Z'))
    const quiet = createApplication({ company: 'Hooli', title: 'Dev' }, statuses, new Date('2026-10-01T10:00:00.000Z'))
    return { ...document, applications: [acme, weighing, quiet] }
  }

  it('lists what is coming up, what happened without a debrief, postings to decide and quiet processes', () => {
    const plan = agenda(withProcess(), now)
    expect(plan.upcoming.map((item) => [item.company, item.text])).toEqual([['Acme', 'Técnica con el CTO']])
    expect(plan.toDebrief).toEqual([expect.objectContaining({ company: 'Acme', text: 'Call con Laura (RRHH)', days: 0 })])
    expect(plan.considering).toEqual([expect.objectContaining({ company: 'Initech', days: 7 })])
    expect(plan.stale.map((item) => item.company)).toEqual(['Hooli'])
  })

  it('stops asking for a debrief once there is one from that day on', () => {
    const document = withProcess()
    const [acme, ...others] = document.applications
    const told = saveDebrief(acme, { text: 'Bien', at: '2026-11-18T20:00:00.000Z' }, now).application
    expect(agenda({ ...document, applications: [told, ...others] }, now).toDebrief).toEqual([])
  })
})

describe('postingFit', () => {
  it('splits what the posting asks into backed and missing, with the closest placed achievements', () => {
    const fit = postingFit(career().bank, 'Buscamos backend con Node.js, Redis y Kubernetes.')!
    expect(fit.backed).toEqual(expect.arrayContaining(['Node.js', 'Redis']))
    expect(fit.missing).toContain('Kubernetes')
    expect(fit.closest.map((item) => item.text)).toEqual(['Reduje un 40% la latencia con Redis'])
    expect(postingFit([], '  ')).toBeUndefined()
  })
})
