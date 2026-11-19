/**
 * Job applications tracker: postings you applied to, the CV you sent, and the steps
 * (custom statuses) each one goes through. Pure functions only — no I/O.
 */

import { readExtra, withExtra, type Extra } from './extra'

/**
 * Kinds the app understands; any other string is accepted and counts as an open step.
 * `considering`: a posting the user is weighing and has not applied to yet.
 */
export type KnownStatusKind = 'considering' | 'active' | 'offer' | 'rejected' | 'withdrawn'
export type ApplicationStatusKind = KnownStatusKind | (string & {})

export type ApplicationStatus = {
  id: string
  name: string
  color: string
  /** Lets filters tell open processes from finished ones, whatever the user calls them. */
  kind: ApplicationStatusKind
  extra?: Extra
}

export type ApplicationAttachment =
  | { kind: 'cv'; cvId: string; versionId: string }
  | { kind: 'file'; path: string; name: string }

export type ApplicationEvent = {
  id: string
  /** ISO timestamp. */
  at: string
  /**
   * `status`: the application moved into `statusId`. `note`: something added while in `statusId`.
   * `debrief`: how a step went (`text`), with the details in `debrief`. Any other kind is accepted
   * too (interview, call, email, task…); with `at` in the future it is something coming up.
   */
  kind: 'status' | 'note' | 'debrief' | (string & {})
  statusId: string
  text: string
  /** What happened in an interview or call, told by the user. */
  debrief?: Debrief
  extra?: Extra
}

/** The user's own account of a step (a call, an interview, a challenge review). */
export type Debrief = {
  /** How it felt, 1 (mal) to 5 (excelente); null when not said. */
  rating: number | null
  /** Who was there: "Laura (RRHH)", "el CTO". */
  people: string[]
  /** What they asked or asked for. */
  asked: string[]
  /** What the user said: answers, points made, numbers given. */
  said: string[]
  /** What the user did not say, held back or forgot. */
  unsaid: string[]
  /** What they liked. */
  liked: string[]
  /** Doubts or objections they raised, what did not land. */
  concerns: string[]
}

export const debriefLists = ['people', 'asked', 'said', 'unsaid', 'liked', 'concerns'] as const satisfies readonly (keyof Debrief)[]

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
  /** Anything else: salary, recruiter, modality, source… */
  extra?: Extra
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
  /** Step it starts in; default: the first open step (initialStatus). */
  statusId?: string
}

/** Default step for postings the user is weighing. */
const CONSIDERING_ID = 'considering'
const CONSIDERING_NAME = 'Analizando propuesta'

export const statusKinds: { kind: ApplicationStatusKind; label: string }[] = [
  { kind: 'considering', label: 'Analizando' },
  { kind: 'active', label: 'En proceso' },
  { kind: 'offer', label: 'Oferta' },
  { kind: 'rejected', label: 'Rechazado' },
  { kind: 'withdrawn', label: 'Descartado' },
]

export function defaultApplicationStatuses(): ApplicationStatus[] {
  return [
    { id: CONSIDERING_ID, name: CONSIDERING_NAME, color: '#1b7c83', kind: 'considering' },
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

/** First open step of the pipeline: where applications the user already sent start. */
export function initialStatus(statuses: ApplicationStatus[]): ApplicationStatus {
  const status = statuses.find((item) => item.kind === 'active') ?? statuses[0]
  if (!status) throw new Error('No application statuses defined')
  return status
}

/**
 * The step for postings the user is weighing (kind `considering`, "Analizando propuesta" by
 * default). Pipelines saved before it existed get it, first.
 */
export function consideringStatus(statuses: ApplicationStatus[]): { statuses: ApplicationStatus[]; status: ApplicationStatus; created: boolean } {
  const existing = statuses.find((status) => status.kind === 'considering')
  if (existing) return { statuses, status: existing, created: false }
  const added = addStatus(statuses, CONSIDERING_NAME, 'considering')
  const status = statuses.some((item) => item.id === CONSIDERING_ID) ? added.status : { ...added.status, id: CONSIDERING_ID }
  return { statuses: added.statuses.map((item) => (item === added.status ? status : item)), status, created: true }
}

/** True for the steps where the user has not applied yet. */
export function isConsidering(status: ApplicationStatus | undefined): boolean {
  return status?.kind === 'considering'
}

export function createApplication(
  input: NewApplication,
  statuses: ApplicationStatus[],
  now: Date = new Date(),
): Application {
  const status = (input.statusId && statuses.find((item) => item.id === input.statusId)) || initialStatus(statuses)
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
    // Unknown unless given: "today" depends on the user's time zone, which the server does not know.
    appliedOn: input.appliedOn ?? '',
    statusId: status.id,
    attachment: input.attachment ?? null,
    events,
    createdAt: at,
    updatedAt: at,
  }
}

export type MoveOptions = {
  /** The pipeline: with it, leaving "Analizando propuesta" for a real step records the day the user applied. */
  statuses?: ApplicationStatus[]
  /** That day (yyyy-mm-dd, the user's local date). Default: today in UTC. */
  appliedOn?: string
}

/**
 * Moves an application to another step, recording it in the history. Moving out of a considering
 * step into an open one or an offer means the user applied: `appliedOn` is set when still empty.
 */
export function moveApplication(application: Application, statusId: string, note = '', now: Date = new Date(), options: MoveOptions = {}): Application {
  if (application.statusId === statusId && !note.trim()) return application
  const at = now.toISOString()
  const added: ApplicationEvent[] = []
  if (application.statusId !== statusId) added.push({ id: crypto.randomUUID(), at, kind: 'status', statusId, text: '' })
  if (note.trim()) added.push({ id: crypto.randomUUID(), at, kind: 'note', statusId, text: note.trim() })
  const next = { ...application, statusId, events: withEvents(application.events, added), updatedAt: at }
  return appliesNow(application, statusId, options.statuses) && !application.appliedOn ? { ...next, appliedOn: options.appliedOn || at.slice(0, 10) } : next
}

/** Leaving a considering step for one where the process goes on (not discarded nor rejected). */
function appliesNow(application: Application, statusId: string, statuses: ApplicationStatus[] | undefined): boolean {
  if (!statuses || application.statusId === statusId) return false
  const from = statuses.find((status) => status.id === application.statusId)
  const to = statuses.find((status) => status.id === statusId)
  return isConsidering(from) && !!to && !isConsidering(to) && to.kind !== 'rejected' && to.kind !== 'withdrawn'
}

export type ScheduledInput = {
  /** The event to change; a new one is added when missing. */
  id?: string
  /** When it is (ISO). */
  at: string
  /** call, interview, challenge, meeting… */
  kind: string
  /** What it is: "Call con Laura de RRHH", "Entrega del challenge". */
  text: string
  /** Step it belongs to; defaults to the step the application is in. */
  statusId?: string
}

/** Puts something on the application's calendar (a call, an interview, a deadline), or moves it. */
export function scheduleEvent(application: Application, input: ScheduledInput, now: Date = new Date()): { application: Application; eventId: string } {
  const existing = input.id ? application.events.find((event) => event.id === input.id) : undefined
  if (input.id && !existing) throw new Error(`No existe el evento ${input.id} en esta postulación.`)
  if (existing && (existing.kind === 'status' || existing.kind === 'debrief')) throw new Error('Ese evento no es algo agendado.')
  const kind = input.kind.trim() || 'event'
  if (kind === 'status' || kind === 'debrief' || kind === 'note') throw new Error(`"${kind}" no es un tipo de evento agendable: usá call, interview, challenge…`)
  const event: ApplicationEvent = {
    ...(existing ?? { id: crypto.randomUUID() }),
    at: input.at,
    kind,
    text: input.text.trim(),
    statusId: input.statusId ?? existing?.statusId ?? application.statusId,
  }
  const events = withEvents(application.events.filter((item) => item.id !== event.id), [event])
  return { application: { ...application, events, updatedAt: now.toISOString() }, eventId: event.id }
}

/**
 * History order: by date; at the same moment a status change comes before what happened in it;
 * then by id so every store returns the same order.
 */
export function compareEvents(left: ApplicationEvent, right: ApplicationEvent): number {
  return (
    left.at.localeCompare(right.at) ||
    (left.kind === right.kind ? 0 : left.kind === 'status' ? -1 : right.kind === 'status' ? 1 : 0) ||
    left.id.localeCompare(right.id)
  )
}

/** `events` plus `added`, kept in history order (things scheduled later stay after them). */
function withEvents(events: ApplicationEvent[], added: ApplicationEvent[]): ApplicationEvent[] {
  return [...events, ...added].sort(compareEvents)
}

/** Adds a note to the step the application is currently in. */
export function addApplicationNote(application: Application, text: string, now: Date = new Date()): Application {
  const note = text.trim()
  if (!note) return application
  const at = now.toISOString()
  return {
    ...application,
    events: withEvents(application.events, [{ id: crypto.randomUUID(), at, kind: 'note', statusId: application.statusId, text: note }]),
    updatedAt: at,
  }
}

/** Deletes a note or any other event. Status changes stay: they are the history of the process. */
export function removeApplicationNote(application: Application, eventId: string, now: Date = new Date()): Application {
  const events = application.events.filter((event) => event.id !== eventId || event.kind === 'status')
  if (events.length === application.events.length) return application
  return { ...application, events, updatedAt: now.toISOString() }
}

export type DebriefInput = Partial<Debrief> & {
  /** The debrief to change; a new one is added when missing. */
  id?: string
  /** Step it belongs to; defaults to the step the application is in. */
  statusId?: string
  /** When it happened (ISO); defaults to now. */
  at?: string
  /** How it went, in the user's words. */
  text?: string
}

export function emptyDebrief(): Debrief {
  return { rating: null, people: [], asked: [], said: [], unsaid: [], liked: [], concerns: [] }
}

/**
 * Adds how a step went, or changes one already told (only the fields given change). Returns the
 * application and the debrief's event id.
 */
export function saveDebrief(application: Application, input: DebriefInput, now: Date = new Date()): { application: Application; eventId: string } {
  const existing = input.id ? application.events.find((event) => event.id === input.id) : undefined
  if (input.id && !existing) throw new Error(`No existe el evento ${input.id} en esta postulación.`)
  if (existing?.kind === 'status') throw new Error('Un cambio de estado no lleva bitácora: agregá una nueva.')
  const base = existing?.debrief ?? emptyDebrief()
  const debrief: Debrief = { ...base, rating: input.rating === undefined ? base.rating : readRating(input.rating) }
  for (const key of debriefLists) if (input[key] !== undefined) debrief[key] = cleanList(input[key])
  const event: ApplicationEvent = {
    ...(existing ?? { id: crypto.randomUUID(), kind: 'debrief', text: '' }),
    at: input.at ?? existing?.at ?? now.toISOString(),
    statusId: input.statusId ?? existing?.statusId ?? application.statusId,
    text: input.text === undefined ? existing?.text ?? '' : input.text.trim(),
    debrief,
  }
  const events = withEvents(application.events.filter((item) => item.id !== event.id), [event])
  return { application: { ...application, events, updatedAt: now.toISOString() }, eventId: event.id }
}

/** True when the debrief says nothing yet. */
export function isEmptyDebrief(debrief: Debrief): boolean {
  return debrief.rating === null && debriefLists.every((key) => debrief[key].length === 0)
}

export type StageVisit = {
  statusId: string
  /** When the application got there (ISO). */
  since: string
  /** What happened while there: notes, debriefs, past calls… in date order. */
  events: ApplicationEvent[]
  current: boolean
}

/**
 * The process told step by step: each time the application moved, with what happened in that
 * step. Things scheduled after `now` are left out (they are coming up, not history).
 */
export function stageVisits(application: Application, now: Date = new Date()): StageVisit[] {
  const cutoff = now.toISOString()
  const visits: StageVisit[] = []
  for (const event of application.events) {
    if (event.at > cutoff) continue
    if (event.kind === 'status') {
      visits.push({ statusId: event.statusId, since: event.at, events: [], current: false })
      continue
    }
    const visit = visits.findLast((item) => item.statusId === event.statusId)
    if (visit) visit.events.push(event)
    else visits.push({ statusId: event.statusId, since: event.at, events: [event], current: false })
  }
  let current = visits.findLastIndex((visit) => visit.statusId === application.statusId)
  if (current < 0) {
    visits.push({ statusId: application.statusId, since: application.updatedAt || application.createdAt, events: [], current: false })
    current = visits.length - 1
  }
  visits[current].current = true
  return visits
}

/**
 * Open steps still ahead in the pipeline: after the current one, not visited yet. None once the
 * process is closed (offer, rejected, withdrawn).
 */
export function stepsAhead(application: Application, statuses: ApplicationStatus[], visits: StageVisit[]): ApplicationStatus[] {
  const index = statuses.findIndex((status) => status.id === application.statusId)
  const current = statuses[index]
  if (!current || (current.kind !== 'active' && current.kind !== 'considering')) return []
  const visited = new Set(visits.map((visit) => visit.statusId))
  return statuses.slice(index + 1).filter((status) => status.kind === 'active' && !visited.has(status.id))
}

export function updateApplication(
  application: Application,
  patch: Partial<Pick<Application, 'company' | 'title' | 'url' | 'posting' | 'location' | 'appliedOn' | 'attachment' | 'extra'>>,
  now: Date = new Date(),
): Application {
  const next = { ...application, ...patch, updatedAt: now.toISOString() }
  if (patch.url !== undefined) next.postingKey = postingKey(patch.url)
  return next
}

const statusPalette = ['#0969da', '#8250df', '#bf8700', '#bc4c00', '#1b7c83', '#bf3989', '#1a7f37', '#6e7781']

/**
 * Adds a step to the pipeline. Considering steps go first, open steps after the last open one
 * (before offer, rejected…), closing steps at the end. Picks a color not used yet when possible.
 */
export function addStatus(
  statuses: ApplicationStatus[],
  name: string,
  kind: ApplicationStatusKind = 'active',
): { statuses: ApplicationStatus[]; status: ApplicationStatus } {
  const used = new Set(statuses.map((status) => status.color.toLowerCase()))
  const color = statusPalette.find((candidate) => !used.has(candidate)) ?? statusPalette[statuses.length % statusPalette.length]
  const status: ApplicationStatus = { id: crypto.randomUUID(), name: name.trim() || 'Nuevo estado', color, kind }
  if (kind !== 'active' && kind !== 'considering') return { statuses: [...statuses, status], status }
  let insertAt = 0
  statuses.forEach((item, index) => {
    if (item.kind === kind || (kind === 'active' && item.kind === 'considering')) insertAt = index + 1
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
    return [withExtra({
      id: entry.id,
      name: readString(entry.name) || 'Estado',
      color: /^#[0-9a-f]{6}$/i.test(readString(entry.color)) ? readString(entry.color) : '#6e7781',
      kind: readString(entry.kind).trim() || 'active',
    }, readExtra(entry, statusKeys))]
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
    return [withExtra({
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
      events: Array.isArray(entry.events) ? entry.events.flatMap(readEvent).sort(compareEvents) : [],
      createdAt,
      updatedAt: readString(entry.updatedAt) || createdAt,
    }, readExtra(entry, applicationKeys))]
  })
}

const statusKeys = ['id', 'name', 'color', 'kind']
const applicationKeys = [
  'id', 'company', 'title', 'url', 'postingKey', 'posting', 'location', 'appliedOn', 'statusId', 'attachment', 'events', 'createdAt', 'updatedAt',
]
const eventKeys = ['id', 'at', 'kind', 'statusId', 'text', 'debrief']

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
  const kind = readString(value.kind).trim()
  if (!kind) return []
  const debrief = readDebrief(value.debrief)
  const event: ApplicationEvent = { id: value.id, at: readString(value.at), kind, statusId: readString(value.statusId), text: readString(value.text) }
  return [withExtra(debrief ? { ...event, debrief } : event, readExtra(value, eventKeys))]
}

export function readDebrief(value: unknown): Debrief | undefined {
  if (!isRecord(value)) return undefined
  const debrief: Debrief = { ...emptyDebrief(), rating: readRating(value.rating) }
  for (const key of debriefLists) debrief[key] = cleanList(value[key])
  return debrief
}

function readRating(value: unknown): number | null {
  const rating = typeof value === 'string' ? Number(value) : value
  return typeof rating === 'number' && Number.isFinite(rating) ? Math.min(5, Math.max(1, Math.round(rating))) : null
}

/** Strings, trimmed, without blanks. A single string becomes one item per line. */
function cleanList(value: unknown): string[] {
  const items = typeof value === 'string' ? value.split('\n') : Array.isArray(value) ? value : []
  return items.flatMap((item) => (typeof item === 'string' && item.trim() ? [item.trim()] : []))
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
