/**
 * Reads and writes the signed-in user's rows. The client carries the user's token, so RLS limits
 * every query to their own data. Rows mirror src/adapters/supabase/rows.ts so the app, which
 * listens to these tables, merges what Claude does in real time.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  readApplicationStatuses,
  readApplications,
  type Application,
  type ApplicationEvent,
  type ApplicationStatus,
} from '../../../src/domain/applications.ts'

export type Db = SupabaseClient
type Row = Record<string, unknown>

const PAGE = 1000
const EPOCH = '1970-01-01T00:00:00.000Z'

async function readAll(db: Db, table: string, columns: string): Promise<Row[]> {
  const rows: Row[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from(table).select(columns).order('id').range(from, from + PAGE - 1)
    if (error) throw new Error(`No se pudo leer ${table}: ${error.message}`)
    const page = (data ?? []) as unknown as Row[]
    rows.push(...page)
    if (page.length < PAGE) return rows
  }
}

const text = (value: unknown) => (typeof value === 'string' ? value : '')
const bySort = (rows: Row[]) => [...rows].sort((left, right) => Number(left.sort ?? 0) - Number(right.sort ?? 0))

/** The app creates the user's data on first sign-in; writing before that would be overwritten. */
export async function requireAccount(db: Db): Promise<void> {
  const { data, error } = await db.from('profiles').select('id').limit(1)
  if (error) throw new Error(`No se pudo leer el perfil: ${error.message}`)
  if (!data || data.length === 0) {
    throw new Error('Tu cuenta todavía no está inicializada: abrí la app una vez (https://retro-summer-memo.vercel.app) y volvé a intentar.')
  }
}

export async function loadProfile(db: Db): Promise<Row | null> {
  const { data, error } = await db.from('profiles').select('data').eq('id', 'me').maybeSingle()
  if (error) throw new Error(`No se pudo leer el perfil: ${error.message}`)
  return (data?.data as Row | undefined) ?? null
}

export type ExperienceRow = { id: string; category: string; text: string; skills: string[]; level: number | null }

export async function loadExperiences(db: Db): Promise<ExperienceRow[]> {
  const rows = bySort(await readAll(db, 'experiences', 'id,category,text,skills,level,sort'))
  return rows.map((row) => ({
    id: text(row.id),
    category: text(row.category),
    text: text(row.text),
    skills: Array.isArray(row.skills) ? row.skills.map(String) : [],
    level: typeof row.level === 'number' ? row.level : null,
  }))
}

export type CvSummary = {
  id: string
  title: string
  position: string
  company: string
  versions: { id: string; number: number; createdAt: string }[]
}

export async function loadCvs(db: Db): Promise<CvSummary[]> {
  const [cvs, versions] = await Promise.all([
    readAll(db, 'cvs', 'id,title,target_role,target_company,sort'),
    readAll(db, 'cv_versions', 'id,cv_id,created_at,sort'),
  ])
  return bySort(cvs).map((cv) => ({
    id: text(cv.id),
    title: text(cv.title),
    position: text(cv.target_role),
    company: text(cv.target_company),
    versions: bySort(versions.filter((version) => version.cv_id === cv.id)).map((version, index) => ({
      id: text(version.id),
      number: index + 1,
      createdAt: text(version.created_at),
    })),
  }))
}

export async function loadStatuses(db: Db): Promise<ApplicationStatus[]> {
  const rows = bySort(await readAll(db, 'application_statuses', 'id,name,color,kind,sort'))
  return readApplicationStatuses(rows.map((row) => ({ id: row.id, name: row.name, color: row.color, kind: row.kind })))
}

export async function loadApplications(db: Db, statuses: ApplicationStatus[]): Promise<Application[]> {
  const [applications, events] = await Promise.all([
    readAll(db, 'applications', 'id,company,title,url,posting_key,posting,location,applied_on,status_id,attachment,created_at,updated_at'),
    readAll(db, 'application_events', 'id,application_id,at,kind,status_id,text'),
  ])
  const eventsByApplication = new Map<string, Row[]>()
  for (const event of [...events].sort(
    (left, right) =>
      text(left.at).localeCompare(text(right.at)) ||
      (left.kind === right.kind ? 0 : left.kind === 'status' ? -1 : 1) ||
      text(left.id).localeCompare(text(right.id)),
  )) {
    const key = text(event.application_id)
    eventsByApplication.set(key, [...(eventsByApplication.get(key) ?? []), event])
  }
  return readApplications(
    [...applications]
      .sort((left, right) => text(left.created_at).localeCompare(text(right.created_at)))
      .map((row) => ({
        id: row.id,
        company: row.company,
        title: row.title,
        url: row.url,
        posting: row.posting,
        location: row.location,
        appliedOn: row.applied_on ?? '',
        statusId: row.status_id,
        attachment: row.attachment,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        events: (eventsByApplication.get(text(row.id)) ?? []).map((event) => ({
          id: event.id,
          at: event.at,
          kind: event.kind,
          statusId: event.status_id,
          text: event.text,
        })),
      })),
    statuses,
  )
}

function applicationRow(application: Application): Row {
  return {
    id: application.id,
    company: application.company,
    title: application.title,
    url: application.url,
    posting_key: application.postingKey,
    posting: application.posting,
    location: application.location,
    applied_on: application.appliedOn || null,
    status_id: application.statusId,
    attachment: application.attachment,
    created_at: application.createdAt || EPOCH,
    updated_at: application.updatedAt || application.createdAt || EPOCH,
  }
}

function eventRows(applicationId: string, events: ApplicationEvent[]): Row[] {
  return events.map((event) => ({
    id: event.id,
    application_id: applicationId,
    at: event.at || EPOCH,
    kind: event.kind,
    status_id: event.statusId,
    text: event.text,
  }))
}

export async function insertApplication(db: Db, application: Application): Promise<void> {
  const { error } = await db.from('applications').insert(applicationRow(application))
  if (error) throw new Error(`No se pudo crear la postulación: ${error.message}`)
  await insertEvents(db, application.id, application.events)
}

/** Saves `next` over `previous`: the application's fields plus any events it gained. */
export async function saveApplication(db: Db, previous: Application, next: Application): Promise<void> {
  const { id: _id, created_at: _created, ...fields } = applicationRow(next)
  const { error } = await db.from('applications').update(fields).eq('id', next.id)
  if (error) throw new Error(`No se pudo guardar la postulación: ${error.message}`)
  const known = new Set(previous.events.map((event) => event.id))
  await insertEvents(db, next.id, next.events.filter((event) => !known.has(event.id)))
}

async function insertEvents(db: Db, applicationId: string, events: ApplicationEvent[]) {
  if (events.length === 0) return
  const { error } = await db.from('application_events').insert(eventRows(applicationId, events))
  if (error) throw new Error(`No se pudo guardar el historial: ${error.message}`)
}
