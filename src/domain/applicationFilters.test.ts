import { describe, expect, it } from 'vitest'
import {
  companyFromUrl,
  countByStatus,
  daysSince,
  defaultQuery,
  filterApplications,
  lastActivity,
  upcomingEvents,
  type ApplicationQuery,
} from './applicationFilters'
import { addApplicationNote, createApplication, defaultApplicationStatuses, moveApplication, type Application } from './applications'

const statuses = defaultApplicationStatuses()
const day = (n: number) => new Date(Date.UTC(2026, 10, n, 12))
const now = day(30)

function applied(company: string, title: string, on: number, extra: Partial<Application> = {}): Application {
  return { ...createApplication({ company, title, location: 'Buenos Aires' }, statuses, day(on)), ...extra }
}

const acme = moveApplication(applied('Acme', 'Senior Backend Engineer', 1), 'challenge', 'Take-home en Go', day(20))
const globex = applied('Globex', 'Diseñador UX', 10)
const initech = moveApplication(applied('Initech', 'Frontend Developer', 2), 'rejected', '', day(5))
const all = [acme, globex, initech]

function query(patch: Partial<ApplicationQuery>): ApplicationQuery {
  return { ...defaultQuery(), ...patch }
}

const companies = (items: Application[]) => items.map((item) => item.company)

describe('filterApplications', () => {
  it('orders by latest activity by default', () => {
    expect(companies(filterApplications(all, statuses, defaultQuery(), now))).toEqual(['Acme', 'Globex', 'Initech'])
  })

  it('matches every word across company, title, status and notes, ignoring accents', () => {
    expect(companies(filterApplications(all, statuses, query({ text: 'disenador' }), now))).toEqual(['Globex'])
    expect(companies(filterApplications(all, statuses, query({ text: 'tecnico' }), now))).toEqual(['Acme'])
    expect(companies(filterApplications(all, statuses, query({ text: 'take-home go' }), now))).toEqual(['Acme'])
    expect(companies(filterApplications(all, statuses, query({ text: 'rechazado' }), now))).toEqual(['Initech'])
    expect(companies(filterApplications(all, statuses, query({ text: 'acme frontend' }), now))).toEqual([])
  })

  it('excludes words prefixed with a dash', () => {
    expect(companies(filterApplications(all, statuses, query({ text: '-rechazado' }), now))).toEqual(['Acme', 'Globex'])
  })

  it('filters by status and by open or closed', () => {
    expect(companies(filterApplications(all, statuses, query({ statusIds: ['sent', 'challenge'] }), now))).toEqual(['Acme', 'Globex'])
    expect(companies(filterApplications(all, statuses, query({ scope: 'open' }), now))).toEqual(['Acme', 'Globex'])
    expect(companies(filterApplications(all, statuses, query({ scope: 'closed' }), now))).toEqual(['Initech'])
  })

  it('finds open applications with no movement for a while', () => {
    // Globex: applied on the 10th, nothing since. Acme moved on the 20th. Initech is closed.
    expect(companies(filterApplications(all, statuses, query({ staleDays: 14 }), now))).toEqual(['Globex'])
    expect(companies(filterApplications(all, statuses, query({ staleDays: 7 }), now))).toEqual(['Acme', 'Globex'])
  })

  it('sorts by applied date or company', () => {
    const byApplied = filterApplications(all, statuses, query({ sort: 'applied' }), now)
    expect(companies(byApplied)).toEqual(['Globex', 'Initech', 'Acme'])
    const byCompany = filterApplications(all, statuses, query({ sort: 'company' }), now)
    expect(companies(byCompany)).toEqual(['Acme', 'Globex', 'Initech'])
  })

  it('counts per status ignoring the status filter itself', () => {
    const counts = countByStatus(all, statuses, query({ statusIds: ['sent'], scope: 'open' }), now)
    expect(counts.get('sent')).toBe(1)
    expect(counts.get('challenge')).toBe(1)
    expect(counts.get('rejected')).toBe(0)
  })
})

describe('lastActivity and daysSince', () => {
  it('uses the latest event', () => {
    const noted = addApplicationNote(globex, 'Me escribió el recruiter', day(25))
    expect(lastActivity(noted)).toBe(day(25).toISOString())
    expect(daysSince(lastActivity(noted), now)).toBe(5)
    expect(daysSince('', now)).toBe(0)
  })
})

describe('companyFromUrl', () => {
  it('reads the company from job boards that name it', () => {
    expect(companyFromUrl('https://jobs.lever.co/acme-corp/1b2c3d')).toBe('Acme Corp')
    expect(companyFromUrl('boards.greenhouse.io/globex/jobs/123')).toBe('Globex')
    expect(companyFromUrl('https://job-boards.greenhouse.io/initech/jobs/9')).toBe('Initech')
    expect(companyFromUrl('https://jobs.ashbyhq.com/umbrella/abc')).toBe('Umbrella')
    expect(companyFromUrl('https://apply.workable.com/hooli/j/ABC123/')).toBe('Hooli')
    expect(companyFromUrl('https://wayne.wd5.myworkdayjobs.com/en-US/careers/job/1')).toBe('Wayne')
  })

  it('returns nothing when the URL does not say', () => {
    expect(companyFromUrl('https://www.linkedin.com/jobs/view/4012345678/')).toBe('')
    expect(companyFromUrl('https://example.com/careers/1')).toBe('')
    expect(companyFromUrl('not a url')).toBe('')
  })
})

describe('upcomingEvents', () => {
  it('lists what is scheduled later, never a status change whose clock ran ahead', () => {
    const ahead = moveApplication(globex, 'hr-call', '', day(31))
    const scheduled = { ...ahead, events: [...ahead.events, { id: 'call', at: day(31).toISOString(), kind: 'call', statusId: 'hr-call', text: 'Call' }] }
    expect(upcomingEvents(scheduled, now).map((event) => event.id)).toEqual(['call'])
  })
})
