/**
 * What the user's assistant should know when a conversation starts: how complete the account is
 * (setup) and what is going on in the job search (agenda). Pure functions over the document.
 */
import { STALE_DAYS, daysSince, isOpen, isStale, lastActivity, upcomingEvents } from './applicationFilters'
import { isConsidering, type Application, type ApplicationEvent, type ApplicationStatus } from './applications'
import { sectionsView } from './content'
import { hasResult } from './cvReview'
import { isExperienceId, type Experience } from './experiences'
import type { ResumeDocument } from './model'

export type SetupKey =
  | 'name'
  | 'email'
  | 'phone'
  | 'location'
  | 'linkedin'
  | 'roles'
  | 'achievements'
  | 'roles_without_achievements'
  | 'achievements_without_results'
  | 'unplaced_achievements'
  | 'education'
  | 'cv'

export type SetupCheck = {
  key: SetupKey
  done: boolean
  /** What is there or what is missing, for the assistant. */
  detail: string
  /** The items it is about (roles without achievements, achievements without numbers…). */
  items?: string[]
}

/** empty: nothing loaded yet · incomplete: the basics a CV needs are missing · ready. */
export type SetupMode = 'empty' | 'incomplete' | 'ready'

export type Setup = { mode: SetupMode; checks: SetupCheck[] }

/** Debriefs are asked for up to this many days after the event. */
export const DEBRIEF_WINDOW_DAYS = 21
/** Postings left in "Analizando propuesta" longer than this get a nudge. */
export const CONSIDERING_DAYS = 3

const fold = (value: string) => value.toLocaleLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const locationLabel = /(ubicacion|location|ciudad|city|pais|country|direccion|address|residencia|localidad)/

/** The user's own achievements: anything they wrote or placed, not the presets the app shipped with. */
export function ownExperiences(bank: Experience[]): Experience[] {
  return bank.filter((item) => item.entryId || !isExperienceId(item.id))
}

export function setupStatus(document: ResumeDocument): Setup {
  const { profile } = document
  const filled = profile.fields.filter((field) => field.value.trim())
  const sections = sectionsView(document)
  const roles = sections.find((section) => section.id === 'experience')?.entries ?? []
  const studies = sections.find((section) => section.id === 'education')?.entries ?? []
  const entryIds = new Set(sections.flatMap((section) => section.entries.map((entry) => entry.id)))
  const own = ownExperiences(document.bank)
  const placed = own.filter((item) => item.entryId && entryIds.has(item.entryId))
  const unplaced = own.filter((item) => !item.entryId || !entryIds.has(item.entryId))
  const rolesWithout = roles.filter((role) => !placed.some((item) => item.entryId === role.id))
  const withoutResults = placed.filter((item) => !hasResult(item.text))
  const roleName = (role: (typeof roles)[number]) => [role.title, role.subtitle].filter(Boolean).join(' — ') || role.id

  const has = (test: (label: string, value: string, kind: string) => boolean) =>
    filled.some((field) => test(fold(field.label), fold(field.value), field.kind))

  const checks: SetupCheck[] = [
    { key: 'name', done: !!profile.name.trim(), detail: profile.name.trim() ? profile.name.trim() : 'No name yet.' },
    { key: 'email', done: has((_label, _value, kind) => kind === 'email'), detail: 'Contact email for CV headers.' },
    { key: 'phone', done: has((_label, _value, kind) => kind === 'phone'), detail: 'Phone for CV headers.' },
    { key: 'location', done: has((label) => locationLabel.test(label)), detail: 'City and country (or "Remote from …").' },
    { key: 'linkedin', done: has((label, value) => label.includes('linkedin') || value.includes('linkedin')), detail: 'LinkedIn URL.' },
    {
      key: 'roles',
      done: roles.length > 0,
      detail: roles.length > 0 ? `${roles.length} role(s) in Experience.` : 'No jobs yet: every role (title, company, dates) is an entry of the experience section.',
    },
    {
      key: 'achievements',
      done: own.length > 0,
      detail: own.length > 0 ? `${own.length} achievement(s) in the bank.` : 'No achievements yet: they are what CVs are built from.',
    },
    {
      key: 'roles_without_achievements',
      done: roles.length > 0 && rolesWithout.length === 0,
      detail: rolesWithout.length > 0 ? `${rolesWithout.length} role(s) with no achievements: a CV cannot show anything under them.` : 'Every role has achievements.',
      ...(rolesWithout.length > 0 ? { items: rolesWithout.map(roleName) } : {}),
    },
    {
      key: 'achievements_without_results',
      done: withoutResults.length === 0,
      detail: withoutResults.length > 0 ? `${withoutResults.length} of ${placed.length} achievement(s) have no measurable result (number, %, scale).` : 'Every achievement shows a result.',
      ...(withoutResults.length > 0 ? { items: withoutResults.slice(0, 5).map((item) => item.text) } : {}),
    },
    {
      key: 'unplaced_achievements',
      done: unplaced.length === 0,
      detail: unplaced.length > 0 ? `${unplaced.length} achievement(s) not linked to where they happened: they cannot go on a CV.` : 'Every achievement is placed.',
      ...(unplaced.length > 0 ? { items: unplaced.slice(0, 5).map((item) => item.text) } : {}),
    },
    { key: 'education', done: studies.length > 0, detail: studies.length > 0 ? `${studies.length} stud(y/ies).` : 'No studies yet (degrees, courses, bootcamps).' },
    { key: 'cv', done: document.cvs.length > 0, detail: document.cvs.length > 0 ? `${document.cvs.length} CV(s).` : 'No CV built yet.' },
  ]

  const done = (key: SetupKey) => checks.find((check) => check.key === key)!.done
  const mode: SetupMode =
    !done('name') && !done('roles') && !done('achievements')
      ? 'empty'
      : ['name', 'email', 'roles', 'achievements', 'roles_without_achievements'].every((key) => done(key as SetupKey))
        ? 'ready'
        : 'incomplete'
  return { mode, checks }
}

export type AgendaItem = {
  applicationId: string
  company: string
  title: string
  status: string
  /** The event it is about (upcoming or to debrief). */
  eventId?: string
  at?: string
  kind?: string
  text?: string
  /** Days since it happened, since it entered the step, or without activity. */
  days?: number
}

export type Agenda = {
  /** Calls, interviews and deadlines still ahead, soonest first. */
  upcoming: AgendaItem[]
  /** Scheduled things that already happened and have no debrief yet. */
  toDebrief: AgendaItem[]
  /** Postings the user is weighing, oldest first. */
  considering: AgendaItem[]
  /** Open processes with no activity for STALE_DAYS. */
  stale: AgendaItem[]
}

const notScheduled = new Set(['status', 'note', 'debrief'])

/** Something put on the calendar (a call, an interview, a deadline), as opposed to history notes. */
export function isScheduledKind(event: ApplicationEvent): boolean {
  return !notScheduled.has(event.kind)
}

/** When the application entered the step it is in. */
export function enteredCurrentStep(application: Application): string {
  return application.events.findLast((event) => event.kind === 'status' && event.statusId === application.statusId)?.at ?? application.createdAt
}

export function agenda(document: ResumeDocument, now: Date = new Date()): Agenda {
  const statusById = new Map<string, ApplicationStatus>(document.applicationStatuses.map((status) => [status.id, status]))
  const cutoff = now.toISOString()
  const base = (application: Application) => ({
    applicationId: application.id,
    company: application.company,
    title: application.title,
    status: statusById.get(application.statusId)?.name ?? application.statusId,
  })
  const eventItem = (application: Application, event: ApplicationEvent, days?: number): AgendaItem => ({
    ...base(application),
    eventId: event.id,
    at: event.at,
    kind: event.kind,
    text: event.text,
    ...(days === undefined ? {} : { days }),
  })
  const open = document.applications.filter((application) => isOpen(application, statusById))

  const upcoming = open
    .flatMap((application) => upcomingEvents(application, now).filter(isScheduledKind).map((event) => eventItem(application, event)))
    .sort((left, right) => left.at!.localeCompare(right.at!))

  const toDebrief = open
    .flatMap((application) => {
      const debriefDays = application.events.filter((event) => event.kind === 'debrief').map((event) => event.at.slice(0, 10))
      return application.events
        .filter((event) => isScheduledKind(event) && event.at <= cutoff && daysSince(event.at, now) <= DEBRIEF_WINDOW_DAYS)
        .filter((event) => !debriefDays.some((day) => day >= event.at.slice(0, 10)))
        .map((event) => eventItem(application, event, daysSince(event.at, now)))
    })
    .sort((left, right) => right.at!.localeCompare(left.at!))

  const considering = document.applications
    .filter((application) => isConsidering(statusById.get(application.statusId)))
    .map((application) => ({ ...base(application), days: daysSince(enteredCurrentStep(application), now) }))
    .sort((left, right) => right.days - left.days)

  const stale = open
    .filter((application) => statusById.get(application.statusId)?.kind === 'active' && isStale(application, statusById, STALE_DAYS, now))
    .map((application) => ({ ...base(application), days: daysSince(lastActivity(application, now), now) }))

  return { upcoming, toDebrief, considering, stale }
}
