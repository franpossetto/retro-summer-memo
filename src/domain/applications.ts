/**
 * Job applications tracker: postings you applied to, the CV you sent, and the steps
 * (custom statuses) each one goes through. Pure functions only — no I/O.
 */

export type ApplicationStatusKind = 'active' | 'offer' | 'rejected' | 'withdrawn'

export type ApplicationStatus = {
  id: string
  name: string
  color: string
  /** Lets filters tell open processes from finished ones, whatever the user calls them. */
  kind: ApplicationStatusKind
}

export type ApplicationAttachment =
  | { kind: 'cv'; cvId: string; versionId: string }
  | { kind: 'file'; path: string; name: string }

export type ApplicationEvent = {
  id: string
  /** ISO timestamp. */
  at: string
  /** `status`: the application moved into `statusId`. `note`: something added while in `statusId`. */
  kind: 'status' | 'note'
  statusId: string
  text: string
}

export type Application = {
  id: string
  company: string
  title: string
  url: string
  /** Stable identity of the posting derived from `url` (e.g. `linkedin:4012345678`). */
  postingKey: string
  posting: string
  location: string
  /** yyyy-mm-dd, or '' when unknown. */
  appliedOn: string
  statusId: string
  attachment: ApplicationAttachment | null
  events: ApplicationEvent[]
  /** ISO timestamps. */
  createdAt: string
  updatedAt: string
}

export type NewApplication = {
  company: string
  title: string
  url?: string
  posting?: string
  location?: string
  appliedOn?: string
  attachment?: ApplicationAttachment | null
  note?: string
}

export const statusKinds: { kind: ApplicationStatusKind; label: string }[] = [
  { kind: 'active', label: 'En proceso' },
  { kind: 'offer', label: 'Oferta' },
  { kind: 'rejected', label: 'Rechazado' },
  { kind: 'withdrawn', label: 'Descartado' },
]

export function defaultApplicationStatuses(): ApplicationStatus[] {
  return [
    { id: 'sent', name: 'CV enviado', color: '#6e7781', kind: 'active' },
    { id: 'accepted', name: 'CV aceptado', color: '#0969da', kind: 'active' },
    { id: 'hr-call', name: 'Call con RRHH', color: '#8250df', kind: 'active' },
    { id: 'challenge', name: 'Challenge técnico', color: '#bf8700', kind: 'active' },
    { id: 'interview', name: 'Entrevista técnica', color: '#bc4c00', kind: 'active' },
    { id: 'offer', name: 'Oferta', color: '#1a7f37', kind: 'offer' },
    { id: 'rejected', name: 'Rechazado', color: '#cf222e', kind: 'rejected' },
    { id: 'withdrawn', name: 'Descartado', color: '#57606a', kind: 'withdrawn' },
  ]
}

/** First status of the pipeline: where new applications start. */
export function initialStatus(statuses: ApplicationStatus[]): ApplicationStatus {
  const status = statuses.find((item) => item.kind === 'active') ?? statuses[0]
  if (!status) throw new Error('No application statuses defined')
  return status
}

export function createApplication(
  input: NewApplication,
  statuses: ApplicationStatus[],
  now: Date = new Date(),
): Application {
  const status = initialStatus(statuses)
  const at = now.toISOString()
  const url = (input.url ?? '').trim()
  const events: ApplicationEvent[] = [{ id: crypto.randomUUID(), at, kind: 'status', statusId: status.id, text: '' }]
  const note = input.note?.trim()
  if (note) events.push({ id: crypto.randomUUID(), at, kind: 'note', statusId: status.id, text: note })
  return {
    id: crypto.randomUUID(),
    company: input.company.trim(),
    title: input.title.trim(),
    url,
    postingKey: postingKey(url),
    posting: input.posting ?? '',
    location: (input.location ?? '').trim(),
    appliedOn: input.appliedOn ?? at.slice(0, 10),
    statusId: status.id,
    attachment: input.attachment ?? null,
    events,
    createdAt: at,
    updatedAt: at,
  }
}

/** Moves an application to another step, recording it in the history. */
export function moveApplication(application: Application, statusId: string, note = '', now: Date = new Date()): Application {
  if (application.statusId === statusId && !note.trim()) return application
  const at = now.toISOString()
  const events = [...application.events]
  if (application.statusId !== statusId) events.push({ id: crypto.randomUUID(), at, kind: 'status', statusId, text: '' })
  if (note.trim()) events.push({ id: crypto.randomUUID(), at, kind: 'note', statusId, text: note.trim() })
  return { ...application, statusId, events, updatedAt: at }
}

/** Adds a note to the step the application is currently in. */
export function addApplicationNote(application: Application, text: string, now: Date = new Date()): Application {
  const note = text.trim()
  if (!note) return application
  const at = now.toISOString()
  return {
    ...application,
    events: [...application.events, { id: crypto.randomUUID(), at, kind: 'note', statusId: application.statusId, text: note }],
    updatedAt: at,
  }
}

/** Deletes a note. Status changes stay: they are the history of the process. */
export function removeApplicationNote(application: Application, eventId: string, now: Date = new Date()): Application {
  const events = application.events.filter((event) => event.id !== eventId || event.kind !== 'note')
  if (events.length === application.events.length) return application
  return { ...application, events, updatedAt: now.toISOString() }
}

export function updateApplication(
  application: Application,
  patch: Partial<Pick<Application, 'company' | 'title' | 'url' | 'posting' | 'location' | 'appliedOn' | 'attachment'>>,
  now: Date = new Date(),
): Application {
  const next = { ...application, ...patch, updatedAt: now.toISOString() }
  if (patch.url !== undefined) next.postingKey = postingKey(patch.url)
  return next
}

const statusPalette = ['#0969da', '#8250df', '#bf8700', '#bc4c00', '#1b7c83', '#bf3989', '#1a7f37', '#6e7781']

/**
 * Adds a step to the pipeline. Open steps go after the last open one (before offer, rejected…),
 * closing steps go at the end. Picks a color not used yet when possible.
 */
export function addStatus(
  statuses: ApplicationStatus[],
  name: string,
  kind: ApplicationStatusKind = 'active',
): { statuses: ApplicationStatus[]; status: ApplicationStatus } {
  const used = new Set(statuses.map((status) => status.color.toLowerCase()))
  const color = statusPalette.find((candidate) => !used.has(candidate)) ?? statusPalette[statuses.length % statusPalette.length]
  const status: ApplicationStatus = { id: crypto.randomUUID(), name: name.trim() || 'Nuevo estado', color, kind }
  if (kind !== 'active') return { statuses: [...statuses, status], status }
  let insertAt = 0
  statuses.forEach((item, index) => {
    if (item.kind === 'active') insertAt = index + 1
  })
  return { statuses: [...statuses.slice(0, insertAt), status, ...statuses.slice(insertAt)], status }
}

/**
 * The pipeline plus any status an application is in but the pipeline does not list: those are
 * added, named after their id, instead of rewriting the application. History may still mention
 * statuses deleted since; those are not brought back.
 */
export function withReferencedStatuses(statuses: ApplicationStatus[], applications: Application[]): ApplicationStatus[] {
  const known = new Set(statuses.map((status) => status.id))
  let result = statuses
  for (const { statusId: id } of applications) {
    if (!id || known.has(id)) continue
    known.add(id)
    const { statuses: next, status } = addStatus(result, statusNameFromId(id))
    result = next.map((item) => (item === status ? { ...status, id } : item))
  }
  return result
}

/** Finds a status by id or name (ignoring case and accents); creates it when there is none. */
export function findOrCreateStatus(
  statuses: ApplicationStatus[],
  value: string,
): { statuses: ApplicationStatus[]; status: ApplicationStatus; created: boolean } {
  const wanted = normalizeText(value)
  const existing = statuses.find((status) => status.id === value || normalizeText(status.name) === wanted)
  if (existing) return { statuses, status: existing, created: false }
  return { ...addStatus(statuses, value.trim() || 'Nuevo estado'), created: true }
}

function statusNameFromId(id: string): string {
  const words = id.replace(/[-_]+/g, ' ').trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Estado'
}

/** Removes a status; applications sitting in it move to `fallbackId` so none is left orphaned. */
export function removeStatus(
  statuses: ApplicationStatus[],
  applications: Application[],
  statusId: string,
  fallbackId: string,
  now: Date = new Date(),
): { statuses: ApplicationStatus[]; applications: Application[] } {
  if (statusId === fallbackId || !statuses.some((status) => status.id === fallbackId)) {
    return { statuses, applications }
  }
  return {
    statuses: statuses.filter((status) => status.id !== statusId),
    applications: applications.map((application) =>
      application.statusId === statusId ? moveApplication(application, fallbackId, '', now) : application,
    ),
  }
}

// ---------------------------------------------------------------------------
// "Did I already apply?" — duplicate detection
// ---------------------------------------------------------------------------

export type DuplicateReason = 'same-posting' | 'same-role' | 'same-company'

export type DuplicateMatch = {
  application: Application
  reason: DuplicateReason
  /** 0..1 title similarity (1 for the same posting). */
  similarity: number
}

const reasonRank: Record<DuplicateReason, number> = { 'same-posting': 0, 'same-role': 1, 'same-company': 2 }

/** Minimum title similarity for two applications at the same company to count as the same role. */
export const SAME_ROLE_THRESHOLD = 0.5

/**
 * Earlier applications that look like `candidate`: the very same posting, the same role at the
 * same company, or just the same company. Most relevant first, then most recent.
 */
export function findDuplicates(
  applications: Application[],
  candidate: { company: string; title: string; url?: string },
  excludeId?: string,
): DuplicateMatch[] {
  const key = postingKey(candidate.url ?? '')
  const company = companyKey(candidate.company)
  const matches: DuplicateMatch[] = []
  for (const application of applications) {
    if (application.id === excludeId) continue
    if (key && application.postingKey === key) {
      matches.push({ application, reason: 'same-posting', similarity: 1 })
      continue
    }
    if (!company || !sameCompany(company, companyKey(application.company))) continue
    const similarity = titleSimilarity(candidate.title, application.title)
    matches.push({ application, reason: similarity >= SAME_ROLE_THRESHOLD ? 'same-role' : 'same-company', similarity })
  }
  return matches.sort(
    (left, right) =>
      reasonRank[left.reason] - reasonRank[right.reason] ||
      right.similarity - left.similarity ||
      right.application.createdAt.localeCompare(left.application.createdAt),
  )
}

/**
 * Normalized identity of a job posting URL. Known boards (LinkedIn, Greenhouse, Lever, Ashby,
 * Workable) map to `<board>:<id>` so tracking params and URL variants still match.
 */
export function postingKey(raw: string): string {
  const value = raw.trim()
  if (!value) return ''
  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`)
  } catch {
    return ''
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '')
  const path = url.pathname.replace(/\/+$/, '')

  if (host.endsWith('linkedin.com')) {
    const id = path.match(/\/jobs\/view\/(?:[^/]*-)?(\d+)/)?.[1] ?? url.searchParams.get('currentJobId')
    if (id && /^\d+$/.test(id)) return `linkedin:${id}`
  }
  if (host.endsWith('greenhouse.io')) {
    const id = path.match(/\/jobs\/(\d+)/)?.[1] ?? url.searchParams.get('gh_jid')
    if (id) return `greenhouse:${id}`
  }
  if (url.searchParams.get('gh_jid')) return `greenhouse:${url.searchParams.get('gh_jid')}`
  if (host === 'jobs.lever.co') {
    const id = path.split('/')[2]
    if (id) return `lever:${id.toLowerCase()}`
  }
  if (host === 'jobs.ashbyhq.com') {
    const id = path.split('/')[2]
    if (id) return `ashby:${id.toLowerCase()}`
  }
  if (host.endsWith('workable.com')) {
    const id = path.match(/\/j\/([A-Za-z0-9]+)/)?.[1]
    if (id) return `workable:${id.toUpperCase()}`
  }
  return `${host}${path.toLowerCase()}`
}

const legalSuffixes = new Set([
  'inc', 'incorporated', 'llc', 'ltd', 'limited', 'corp', 'corporation', 'co', 'company', 'gmbh', 'ag', 'plc',
  'sa', 'sas', 'srl', 'sl', 'sau', 'spa', 'bv', 'nv', 'oy', 'ab', 'pty', 'group', 'grupo',
])

/** Company name reduced to what identifies it: no accents, punctuation, spaces or legal suffix. */
export function companyKey(name: string): string {
  const words = normalizeText(name.replace(/\b([a-z])\.(?=[a-z]\.)/gi, '$1'))
    .split(' ')
    .filter(Boolean)
  while (words.length > 1 && legalSuffixes.has(words[words.length - 1])) words.pop()
  return words.join('')
}

function sameCompany(left: string, right: string) {
  if (!left || !right) return false
  if (left === right) return true
  return Math.min(left.length, right.length) >= 5 && editDistance(left, right) <= 1
}

const titleNoise = new Set(['a', 'an', 'the', 'de', 'del', 'la', 'el', 'en', 'of', 'for', 'and', 'y', 'remote', 'remoto', 'hybrid', 'hibrido'])

const titleSynonyms: Record<string, string> = {
  sr: 'senior',
  ssr: 'semisenior',
  jr: 'junior',
  dev: 'developer',
  desarrollador: 'developer',
  programador: 'developer',
  ingeniero: 'engineer',
  eng: 'engineer',
  swe: 'software engineer',
  fe: 'frontend',
  be: 'backend',
  fullstack: 'full stack',
  lider: 'lead',
  tl: 'tech lead',
}

/** Dice coefficient over normalized title words, tolerant to typos and common abbreviations. */
export function titleSimilarity(left: string, right: string): number {
  const a = titleTokens(left)
  const b = titleTokens(right)
  if (a.length === 0 || b.length === 0) return 0
  const used = new Set<number>()
  let shared = 0
  for (const token of a) {
    const index = b.findIndex((other, position) => !used.has(position) && tokensMatch(token, other))
    if (index < 0) continue
    used.add(index)
    shared += 1
  }
  return (2 * shared) / (a.length + b.length)
}

function titleTokens(title: string) {
  return normalizeText(title)
    .split(' ')
    .flatMap((word) => (titleSynonyms[word] ?? word).split(' '))
    .filter((word) => word.length > 0 && !titleNoise.has(word))
}

function tokensMatch(left: string, right: string) {
  if (left === right) return true
  return Math.min(left.length, right.length) >= 5 && editDistance(left, right) <= 1
}

function normalizeText(value: string) {
  return value
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function editDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let row = 1; row <= left.length; row += 1) {
    let diagonal = previous[0]
    previous[0] = row
    for (let column = 1; column <= right.length; column += 1) {
      const above = previous[column]
      previous[column] = Math.min(
        previous[column] + 1,
        previous[column - 1] + 1,
        diagonal + (left[row - 1] === right[column - 1] ? 0 : 1),
      )
      diagonal = above
    }
  }
  return previous[right.length]
}

// ---------------------------------------------------------------------------
// Parsing stored data (defensive: tolerate missing or malformed fields)
// ---------------------------------------------------------------------------

export function readApplicationStatuses(value: unknown): ApplicationStatus[] {
  if (!Array.isArray(value)) return defaultApplicationStatuses()
  const seen = new Set<string>()
  const statuses = value.flatMap((entry): ApplicationStatus[] => {
    if (!isRecord(entry) || typeof entry.id !== 'string' || !entry.id || seen.has(entry.id)) return []
    seen.add(entry.id)
    return [{
      id: entry.id,
      name: readString(entry.name) || 'Estado',
      color: /^#[0-9a-f]{6}$/i.test(readString(entry.color)) ? readString(entry.color) : '#6e7781',
      kind: isStatusKind(entry.kind) ? entry.kind : 'active',
    }]
  })
  return statuses.length > 0 ? statuses : defaultApplicationStatuses()
}

export function readApplications(value: unknown, statuses: ApplicationStatus[]): Application[] {
  if (!Array.isArray(value)) return []
  const fallback = initialStatus(statuses).id
  const seen = new Set<string>()
  return value.flatMap((entry): Application[] => {
    if (!isRecord(entry) || typeof entry.id !== 'string' || !entry.id || seen.has(entry.id)) return []
    seen.add(entry.id)
    const url = readString(entry.url)
    // A status the pipeline does not list yet is kept: withReferencedStatuses adds it.
    const statusId = readString(entry.statusId).trim() || fallback
    const createdAt = readString(entry.createdAt)
    return [{
      id: entry.id,
      company: readString(entry.company),
      title: readString(entry.title),
      url,
      postingKey: postingKey(url),
      posting: readString(entry.posting),
      location: readString(entry.location),
      appliedOn: /^\d{4}-\d{2}-\d{2}$/.test(readString(entry.appliedOn)) ? readString(entry.appliedOn) : '',
      statusId,
      attachment: readAttachment(entry.attachment),
      events: Array.isArray(entry.events) ? entry.events.flatMap(readEvent) : [],
      createdAt,
      updatedAt: readString(entry.updatedAt) || createdAt,
    }]
  })
}

export function readAttachment(value: unknown): ApplicationAttachment | null {
  if (!isRecord(value)) return null
  if (value.kind === 'cv' && typeof value.cvId === 'string' && typeof value.versionId === 'string') {
    return { kind: 'cv', cvId: value.cvId, versionId: value.versionId }
  }
  if (value.kind === 'file' && typeof value.path === 'string' && value.path) {
    return { kind: 'file', path: value.path, name: readString(value.name) || value.path.split('/').at(-1) || 'file' }
  }
  return null
}

function readEvent(value: unknown): ApplicationEvent[] {
  if (!isRecord(value) || typeof value.id !== 'string') return []
  if (value.kind !== 'status' && value.kind !== 'note') return []
  return [{ id: value.id, at: readString(value.at), kind: value.kind, statusId: readString(value.statusId), text: readString(value.text) }]
}

function isStatusKind(value: unknown): value is ApplicationStatusKind {
  return value === 'active' || value === 'offer' || value === 'rejected' || value === 'withdrawn'
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
