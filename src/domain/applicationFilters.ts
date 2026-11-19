/**
 * Search, filters and ordering for the applications list. Pure functions only.
 */
import type { Application, ApplicationStatus } from './applications.ts'

export type ApplicationScope = 'open' | 'closed' | 'all'
export type ApplicationSort = 'activity' | 'applied' | 'company'

export type ApplicationQuery = {
  /** Free text. Every word must match somewhere; `-word` excludes. Accents and case are ignored. */
  text: string
  /** Empty means any status. */
  statusIds: string[]
  scope: ApplicationScope
  /** Only open applications with no activity for at least this many days. */
  staleDays: number | null
  sort: ApplicationSort
}

export const STALE_DAYS = 14

export function defaultQuery(): ApplicationQuery {
  return { text: '', statusIds: [], scope: 'all', staleDays: null, sort: 'activity' }
}

/** Most recent moment something happened to the application (events scheduled later do not count). */
export function lastActivity(application: Application, now: Date = new Date()): string {
  const cutoff = now.toISOString()
  let latest = application.updatedAt || application.createdAt
  for (const event of application.events) if (event.at > latest && event.at <= cutoff) latest = event.at
  return latest
}

/**
 * Events dated in the future (a challenge on the 20th, an interview next week), soonest first. A
 * status change is history even when its clock runs a little ahead of `now` (a page whose clock
 * ticks once a minute), so it never counts.
 */
export function upcomingEvents(application: Application, now: Date = new Date()) {
  const cutoff = now.toISOString()
  return application.events.filter((event) => event.at > cutoff && event.kind !== 'status').sort((left, right) => left.at.localeCompare(right.at))
}

/** Whole days between `iso` and `now` (0 for today or a missing date). */
export function daysSince(iso: string, now: Date = new Date()): number {
  const time = Date.parse(iso)
  if (Number.isNaN(time)) return 0
  return Math.max(0, Math.floor((now.getTime() - time) / 86_400_000))
}

/** Still going: anything but a rejected or withdrawn step (custom kinds count as open). */
export function isOpen(application: Application, statusById: Map<string, ApplicationStatus>): boolean {
  const kind = statusById.get(application.statusId)?.kind ?? 'active'
  return kind !== 'rejected' && kind !== 'withdrawn'
}

/** Open, not holding an offer, nothing scheduled, and quiet for `days`. */
export function isStale(application: Application, statusById: Map<string, ApplicationStatus>, days: number, now: Date = new Date()): boolean {
  if (!isOpen(application, statusById) || statusById.get(application.statusId)?.kind === 'offer') return false
  if (upcomingEvents(application, now).length > 0) return false
  return daysSince(lastActivity(application, now), now) >= days
}

export function filterApplications(
  applications: Application[],
  statuses: ApplicationStatus[],
  query: ApplicationQuery,
  now: Date = new Date(),
): Application[] {
  const statusById = new Map(statuses.map((status) => [status.id, status]))
  const matchesText = textMatcher(query.text)
  const wanted = new Set(query.statusIds)
  const result = applications.filter((application) => {
    if (wanted.size > 0 && !wanted.has(application.statusId)) return false
    if (query.scope === 'open' && !isOpen(application, statusById)) return false
    if (query.scope === 'closed' && isOpen(application, statusById)) return false
    if (query.staleDays !== null && !isStale(application, statusById, query.staleDays, now)) return false
    return matchesText(haystack(application, statusById))
  })
  return sortApplications(result, query.sort)
}

/** How many applications each status would show, given every filter except the status one. */
export function countByStatus(
  applications: Application[],
  statuses: ApplicationStatus[],
  query: ApplicationQuery,
  now: Date = new Date(),
): Map<string, number> {
  const counts = new Map(statuses.map((status) => [status.id, 0]))
  for (const application of filterApplications(applications, statuses, { ...query, statusIds: [] }, now)) {
    counts.set(application.statusId, (counts.get(application.statusId) ?? 0) + 1)
  }
  return counts
}

export function sortApplications(applications: Application[], sort: ApplicationSort): Application[] {
  const sorted = [...applications]
  if (sort === 'company') {
    sorted.sort((left, right) => left.company.localeCompare(right.company, 'es', { sensitivity: 'base' }) || left.title.localeCompare(right.title, 'es'))
  } else if (sort === 'applied') {
    sorted.sort((left, right) => (right.appliedOn || right.createdAt).localeCompare(left.appliedOn || left.createdAt))
  } else {
    sorted.sort((left, right) => lastActivity(right).localeCompare(lastActivity(left)))
  }
  return sorted
}

function haystack(application: Application, statusById: Map<string, ApplicationStatus>) {
  const notes = application.events.filter((event) => event.kind === 'note').map((event) => event.text)
  return fold(
    [
      application.company,
      application.title,
      application.location,
      statusById.get(application.statusId)?.name ?? '',
      application.url,
      application.appliedOn,
      ...notes,
    ].join(' \n '),
  )
}

function textMatcher(text: string): (haystack: string) => boolean {
  const words = text.split(/\s+/).filter(Boolean)
  const include = words.filter((word) => !word.startsWith('-')).map(fold).filter(Boolean)
  const exclude = words.filter((word) => word.startsWith('-')).map((word) => fold(word.slice(1))).filter(Boolean)
  if (include.length === 0 && exclude.length === 0) return () => true
  return (value) => include.every((word) => value.includes(word)) && !exclude.some((word) => value.includes(word))
}

/** Lowercase without accents, so "Diseñador" matches "disenador" and "Técnico" matches "tecnico". */
export function fold(value: string): string {
  return value.toLocaleLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

// ---------------------------------------------------------------------------
// Company from a job board URL
// ---------------------------------------------------------------------------

/** Job boards whose URLs name the company: the path segment or subdomain that holds it. */
const boards: { host: RegExp; from: 'path' | 'subdomain' }[] = [
  { host: /^jobs\.lever\.co$/, from: 'path' },
  { host: /^(boards|job-boards)\.(eu\.)?greenhouse\.io$/, from: 'path' },
  { host: /^jobs\.ashbyhq\.com$/, from: 'path' },
  { host: /^apply\.workable\.com$/, from: 'path' },
  { host: /\.myworkdayjobs\.com$/, from: 'subdomain' },
  { host: /\.bamboohr\.com$/, from: 'subdomain' },
  { host: /\.recruitee\.com$/, from: 'subdomain' },
  { host: /\.teamtailor\.com$/, from: 'subdomain' },
  { host: /\.breezy\.hr$/, from: 'subdomain' },
]

/** Best guess of the company behind a posting URL, or '' (LinkedIn and generic sites say nothing). */
export function companyFromUrl(raw: string): string {
  const value = raw.trim()
  if (!value) return ''
  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`)
  } catch {
    return ''
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '')
  const board = boards.find((item) => item.host.test(host))
  if (!board) return ''
  const slug = board.from === 'path' ? url.pathname.split('/').filter(Boolean)[0] ?? '' : host.split('.')[0]
  return prettifySlug(slug)
}

function prettifySlug(slug: string) {
  const words = decodeURIComponent(slug).replace(/[-_]+/g, ' ').trim().split(/\s+/).filter(Boolean)
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}
