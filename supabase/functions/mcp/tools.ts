import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import {
  addApplicationNote,
  createApplication,
  findDuplicates,
  moveApplication,
  updateApplication,
  type Application,
  type ApplicationStatus,
  type DuplicateMatch,
} from '../../../src/domain/applications.ts'
import {
  STALE_DAYS,
  companyFromUrl,
  daysSince,
  defaultQuery,
  filterApplications,
  fold,
  lastActivity,
} from '../../../src/domain/applicationFilters.ts'
import {
  insertApplication,
  loadApplications,
  loadCvs,
  loadExperiences,
  loadProfile,
  loadStatuses,
  requireAccount,
  saveApplication,
  type CvSummary,
  type Db,
} from './data.ts'

const APP_URL = 'https://retro-summer-memo.vercel.app'

export const INSTRUCTIONS = `This server is the user's job-search tracker (applications, CVs, experience bank).
- Never invent experience, skills or achievements: only use what get_profile and list_experiences return.
- Before creating an application, run check_duplicates and tell the user when they already applied to that posting, a similar role or the same company (with the date and how it ended), then ask whether to continue.
- Statuses are the user's own pipeline (list_statuses); refer to them by name.
- The user sees every change live in the app (${APP_URL}). Talk to them in their language (usually Rioplatense Spanish).`

const json = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] })

const levelLabel: Record<number, string> = { 0: 'sin experiencia', 1: 'personal', 2: 'profesional' }

function resolveStatus(statuses: ApplicationStatus[], value: string): ApplicationStatus {
  const wanted = fold(value.trim())
  const status = statuses.find((item) => item.id === value || fold(item.name) === wanted)
  if (!status) throw new Error(`No existe el estado "${value}". Estados: ${statuses.map((item) => item.name).join(', ')}.`)
  return status
}

function findApplication(applications: Application[], id: string): Application {
  const application = applications.find((item) => item.id === id)
  if (!application) throw new Error(`No encontré la postulación ${id}. Usá search_applications para obtener el id.`)
  return application
}

function cvLabel(cvs: CvSummary[], attachment: Application['attachment']) {
  if (!attachment) return null
  if (attachment.kind === 'file') return { kind: 'file', name: attachment.name }
  const cv = cvs.find((item) => item.id === attachment.cvId)
  if (!cv) return { kind: 'cv', missing: true }
  const version = cv.versions.find((item) => item.id === attachment.versionId)
  return { kind: 'cv', cv_id: cv.id, title: cv.title, version: version ? `v${version.number} (${version.createdAt})` : 'última versión' }
}

function summary(application: Application, statusById: Map<string, ApplicationStatus>, now: Date) {
  const activity = lastActivity(application)
  return {
    id: application.id,
    company: application.company,
    title: application.title,
    status: statusById.get(application.statusId)?.name ?? application.statusId,
    applied_on: application.appliedOn || application.createdAt.slice(0, 10),
    last_activity: activity,
    days_without_activity: daysSince(activity, now),
    location: application.location || undefined,
    url: application.url || undefined,
  }
}

function duplicateReport(matches: DuplicateMatch[], statusById: Map<string, ApplicationStatus>, now: Date) {
  return matches.map(({ application, reason, similarity }) => ({
    reason, // same-posting | same-role | same-company
    similarity: Math.round(similarity * 100) / 100,
    ...summary(application, statusById, now),
    status_kind: statusById.get(application.statusId)?.kind,
  }))
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usá YYYY-MM-DD')

export function registerTools(server: McpServer, db: Db) {
  async function tracker() {
    const statuses = await loadStatuses(db)
    const applications = await loadApplications(db, statuses)
    return { statuses, applications, statusById: new Map(statuses.map((status) => [status.id, status])), now: new Date() }
  }

  server.registerTool(
    'get_profile',
    {
      title: 'Perfil',
      description: "The user's profile: name, contact fields, work history (companies and roles with dates) and education.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => {
      const profile = await loadProfile(db)
      if (!profile) throw new Error('Tu cuenta todavía no tiene perfil: abrí la app una vez.')
      return json(profile)
    },
  )

  server.registerTool(
    'list_experiences',
    {
      title: 'Experiencias',
      description:
        "The user's experience bank: the only achievements and skills that may go into a CV. `level` is how well they know it (profesional, personal, sin experiencia, or null if never answered). Filter with `query` (matches text, category and skills).",
      inputSchema: z.object({
        query: z.string().optional().describe('Words to match, e.g. "kubernetes" or "code review"'),
        limit: z.number().int().min(1).max(500).default(200),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ query, limit }) => {
      const words = fold(query ?? '').split(/\s+/).filter(Boolean)
      const experiences = (await loadExperiences(db))
        .filter((item) => {
          const haystack = fold([item.text, item.category, ...item.skills].join(' '))
          return words.every((word) => haystack.includes(word))
        })
        .slice(0, limit)
        .map((item) => ({ ...item, level: item.level === null ? null : levelLabel[item.level] ?? item.level }))
      return json(experiences)
    },
  )

  server.registerTool(
    'list_statuses',
    {
      title: 'Estados',
      description: "The user's pipeline steps in order. kind: active (in progress), offer, rejected, withdrawn.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => json((await loadStatuses(db)).map(({ id, name, kind }) => ({ id, name, kind }))),
  )

  server.registerTool(
    'search_applications',
    {
      title: 'Buscar postulaciones',
      description: `Search the user's job applications. \`text\` matches company, title, status, location and notes (accent-insensitive; "-word" excludes). \`stale_days\` keeps open applications with no activity for that many days (${STALE_DAYS} is a good default for "sin novedades").`,
      inputSchema: z.object({
        text: z.string().optional(),
        status: z.array(z.string()).optional().describe('Status names or ids'),
        scope: z.enum(['open', 'closed', 'all']).default('all'),
        stale_days: z.number().int().min(1).optional(),
        sort: z.enum(['activity', 'applied', 'company']).default('activity'),
        limit: z.number().int().min(1).max(200).default(50),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ text, status, scope, stale_days, sort, limit }) => {
      const { statuses, applications, statusById, now } = await tracker()
      const query = {
        ...defaultQuery(),
        text: text ?? '',
        statusIds: (status ?? []).map((value) => resolveStatus(statuses, value).id),
        scope,
        staleDays: stale_days ?? null,
        sort,
      }
      const found = filterApplications(applications, statuses, query, now)
      return json({ total: found.length, applications: found.slice(0, limit).map((item) => summary(item, statusById, now)) })
    },
  )

  server.registerTool(
    'get_application',
    {
      title: 'Ver postulación',
      description: 'One application in full: history of steps and notes, posting text, attached CV and similar applications.',
      inputSchema: z.object({ id: z.string() }),
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => {
      const { applications, statusById, now } = await tracker()
      const application = findApplication(applications, id)
      const cvs = await loadCvs(db)
      return json({
        ...summary(application, statusById, now),
        posting: application.posting || undefined,
        cv: cvLabel(cvs, application.attachment),
        history: application.events.map((event) => ({
          at: event.at,
          step: statusById.get(event.statusId)?.name ?? event.statusId,
          ...(event.kind === 'status' ? { moved_to: statusById.get(event.statusId)?.name } : { note: event.text }),
        })),
        similar: duplicateReport(findDuplicates(applications, application, application.id), statusById, now),
      })
    },
  )

  server.registerTool(
    'check_duplicates',
    {
      title: '¿Ya me postulé?',
      description:
        'Earlier applications that match a posting: the same posting (by URL), a similar role at the same company, or the same company. Always run this before create_application and tell the user what it finds.',
      inputSchema: z.object({ company: z.string(), title: z.string(), url: z.string().optional() }),
      annotations: { readOnlyHint: true },
    },
    async ({ company, title, url }) => {
      const { applications, statusById, now } = await tracker()
      const matches = findDuplicates(applications, { company: company || companyFromUrl(url ?? ''), title, url })
      return json({ already_applied: matches.length > 0, matches: duplicateReport(matches, statusById, now) })
    },
  )

  server.registerTool(
    'create_application',
    {
      title: 'Nueva postulación',
      description:
        'Records that the user applied (or is applying) to a job. Starts in the first open step of their pipeline. If it looks like a posting or role they already applied to, nothing is created and the matches come back: ask the user, then call again with confirm_duplicate=true if they want to go ahead.',
      inputSchema: z.object({
        company: z.string().min(1),
        title: z.string().min(1),
        url: z.string().optional(),
        location: z.string().optional(),
        posting: z.string().optional().describe('Full posting text, if available'),
        applied_on: isoDate.optional().describe('Defaults to today'),
        note: z.string().optional().describe('First note: referral, salary asked, contact…'),
        cv_id: z.string().optional().describe('CV sent (see list_cvs)'),
        cv_version_id: z.string().optional().describe('Exact version sent; omit for the latest'),
        confirm_duplicate: z.boolean().default(false),
      }),
    },
    async (input) => {
      await requireAccount(db)
      const { statuses, applications, statusById, now } = await tracker()
      const matches = findDuplicates(applications, input)
      if (!input.confirm_duplicate && matches.some((match) => match.reason !== 'same-company')) {
        return json({
          created: false,
          reason: 'Looks like an application the user already made. Show these to the user and ask before retrying with confirm_duplicate=true.',
          matches: duplicateReport(matches, statusById, now),
        })
      }
      let attachment: Application['attachment'] = null
      if (input.cv_id) {
        const cv = (await loadCvs(db)).find((item) => item.id === input.cv_id)
        if (!cv) throw new Error(`No existe el CV ${input.cv_id}. Usá list_cvs.`)
        if (input.cv_version_id && !cv.versions.some((version) => version.id === input.cv_version_id)) {
          throw new Error(`El CV "${cv.title}" no tiene la versión ${input.cv_version_id}.`)
        }
        attachment = { kind: 'cv', cvId: cv.id, versionId: input.cv_version_id ?? '' }
      }
      const application = createApplication(
        {
          company: input.company,
          title: input.title,
          url: input.url,
          location: input.location,
          posting: input.posting,
          appliedOn: input.applied_on,
          note: input.note,
          attachment,
        },
        statuses,
        now,
      )
      await insertApplication(db, application)
      return json({
        created: true,
        application: summary(application, statusById, now),
        other_applications_at_company: duplicateReport(matches, statusById, now),
        open_in_app: APP_URL,
      })
    },
  )

  server.registerTool(
    'move_application',
    {
      title: 'Mover de estado',
      description: 'Moves an application to another step of the pipeline (by status name or id), optionally with a note for that step.',
      inputSchema: z.object({ id: z.string(), status: z.string(), note: z.string().optional() }),
      annotations: { idempotentHint: true },
    },
    async ({ id, status, note }) => {
      await requireAccount(db)
      const { statuses, applications, statusById, now } = await tracker()
      const application = findApplication(applications, id)
      const next = moveApplication(application, resolveStatus(statuses, status).id, note ?? '', now)
      if (next !== application) await saveApplication(db, application, next)
      return json(summary(next, statusById, now))
    },
  )

  server.registerTool(
    'add_note',
    {
      title: 'Agregar nota',
      description: 'Adds a note to the step the application is currently in (call notes, contacts, dates, feedback).',
      inputSchema: z.object({ id: z.string(), text: z.string().min(1) }),
    },
    async ({ id, text }) => {
      await requireAccount(db)
      const { applications, statusById, now } = await tracker()
      const application = findApplication(applications, id)
      const next = addApplicationNote(application, text, now)
      await saveApplication(db, application, next)
      return json(summary(next, statusById, now))
    },
  )

  server.registerTool(
    'update_application',
    {
      title: 'Editar postulación',
      description: "Fixes an application's details (company, title, link, location, posting text, applied date).",
      inputSchema: z.object({
        id: z.string(),
        company: z.string().min(1).optional(),
        title: z.string().min(1).optional(),
        url: z.string().optional(),
        location: z.string().optional(),
        posting: z.string().optional(),
        applied_on: isoDate.optional(),
      }),
      annotations: { idempotentHint: true },
    },
    async ({ id, applied_on, ...patch }) => {
      await requireAccount(db)
      const { applications, statusById, now } = await tracker()
      const application = findApplication(applications, id)
      // Only the fields that were sent: an absent field must not blank the stored one.
      const changes = Object.fromEntries(Object.entries({ ...patch, appliedOn: applied_on }).filter(([, value]) => value !== undefined))
      const next = updateApplication(application, changes, now)
      await saveApplication(db, application, next)
      return json(summary(next, statusById, now))
    },
  )

  server.registerTool(
    'list_cvs',
    {
      title: 'CVs',
      description: "The user's CVs (each targets a role/company) and their saved versions, newest last.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => json(await loadCvs(db)),
  )

  server.registerTool(
    'attach_cv',
    {
      title: 'Adjuntar CV',
      description: 'Records which CV (and exact version) was sent for an application. Omit version_id to follow the latest version.',
      inputSchema: z.object({ application_id: z.string(), cv_id: z.string(), version_id: z.string().optional() }),
      annotations: { idempotentHint: true },
    },
    async ({ application_id, cv_id, version_id }) => {
      await requireAccount(db)
      const { applications, statusById, now } = await tracker()
      const application = findApplication(applications, application_id)
      const cvs = await loadCvs(db)
      const cv = cvs.find((item) => item.id === cv_id)
      if (!cv) throw new Error(`No existe el CV ${cv_id}. Usá list_cvs.`)
      if (version_id && !cv.versions.some((version) => version.id === version_id)) {
        throw new Error(`El CV "${cv.title}" no tiene la versión ${version_id}.`)
      }
      const next = updateApplication(application, { attachment: { kind: 'cv', cvId: cv.id, versionId: version_id ?? '' } }, now)
      await saveApplication(db, application, next)
      return json({ ...summary(next, statusById, now), cv: cvLabel(cvs, next.attachment) })
    },
  )

  server.registerPrompt(
    'nuevo-job',
    {
      title: 'Nuevo job',
      description: 'Analiza un aviso, chequea si ya te postulaste y lo carga en el tracker.',
      argsSchema: z.object({ aviso: z.string().describe('Link del aviso o el texto pegado') }),
    },
    ({ aviso }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Tengo un aviso nuevo:

${aviso}

1. Sacá empresa, puesto, ubicación y el texto del aviso. Si es un link y no lo podés leer, pedime que pegue el texto.
2. Usá check_duplicates. Si ya me postulé (mismo aviso, puesto parecido o misma empresa), decime cuándo, en qué estado quedó y qué pasó, y preguntame si sigo.
3. Si sigo, creá la postulación con create_application, incluyendo el texto del aviso.
4. Con get_profile y list_experiences, decime qué experiencias mías encajan mejor con el puesto y qué palabras clave del aviso conviene destacar. No inventes nada que no esté en mis datos.`,
          },
        },
      ],
    }),
  )
}
