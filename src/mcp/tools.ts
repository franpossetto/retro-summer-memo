/**
 * MCP tools over the user's document. They depend only on the DocumentStore port: the Edge
 * Function passes a Supabase store scoped to the signed-in user, tests pass an in-memory one.
 */
import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import {
  STALE_DAYS,
  companyFromUrl,
  daysSince,
  defaultQuery,
  filterApplications,
  fold,
  lastActivity,
} from '../domain/applicationFilters'
import {
  addApplicationNote,
  createApplication,
  findDuplicates,
  findOrCreateStatus,
  moveApplication,
  removeStatus,
  updateApplication,
  type Application,
  type ApplicationStatus,
  type DuplicateMatch,
} from '../domain/applications'
import {
  deleteEntry,
  deleteExperiences,
  deleteSection,
  saveEntry,
  saveExperience,
  saveSection,
  sectionsView,
  setLevels,
  updateProfileInfo,
} from '../domain/content'
import { buildCv } from '../domain/cvBuilder'
import { buildCvVersion, deleteCv } from '../domain/documentOps'
import type { ResumeDocument } from '../domain/model'
import type { DocumentStore } from '../ports/documentStore'
import { documentView, patchDocument, type EditableDocument } from './document'
import { APP_URL, CV_GUIDE, MODEL_GUIDE } from './guide'
import { reviewCv } from '../domain/cvReview'
import type { PatchOperation } from './jsonPatch'

export type ToolContext = { store: DocumentStore; now?: () => Date }

const json = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] })
const levelLabel: Record<number, string> = { 0: 'sin experiencia', 1: 'personal', 2: 'profesional' }
const levelValue = { 'sin experiencia': 0, personal: 1, profesional: 2 } as const
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usá YYYY-MM-DD')

const documentParts = [
  'profile',
  'bank',
  'knowledge',
  'sections',
  'roleGraphs',
  'cvs',
  'activeCvId',
  'applications',
  'applicationStatuses',
] as const satisfies readonly (keyof EditableDocument)[]

const patchOperation = z.object({
  op: z.enum(['add', 'remove', 'replace', 'move', 'copy', 'test']),
  path: z.string().describe('JSON Pointer, e.g. /profile/jobs/[id=abc]/roles/-'),
  from: z.string().optional().describe('Source path, for move and copy'),
  value: z.unknown().optional().describe('For add, replace and test'),
})

function resolveStatus(statuses: ApplicationStatus[], value: string): ApplicationStatus {
  const wanted = fold(value.trim())
  const status = statuses.find((item) => item.id === value || fold(item.name) === wanted)
  if (!status) throw new Error(`No existe el estado "${value}". Estados: ${statuses.map((item) => item.name).join(', ')}.`)
  return status
}

function findApplication(document: ResumeDocument, id: string): Application {
  const application = document.applications.find((item) => item.id === id)
  if (!application) throw new Error(`No encontré la postulación ${id}. Usá search_applications para obtener el id.`)
  return application
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

function cvAttachment(document: ResumeDocument, attachment: Application['attachment']) {
  if (!attachment) return null
  if (attachment.kind === 'file') return { kind: 'file', name: attachment.name }
  const cv = document.cvs.find((item) => item.id === attachment.cvId)
  if (!cv) return { kind: 'cv', missing: true }
  const index = cv.versions.findIndex((version) => version.id === attachment.versionId)
  return { kind: 'cv', cv_id: cv.id, title: cv.title, version: index >= 0 ? `v${index + 1} (${cv.versions[index].createdAt})` : 'latest' }
}

export function registerTools(server: McpServer, { store, now: clock = () => new Date() }: ToolContext) {
  async function open(): Promise<ResumeDocument> {
    const document = await store.load()
    if (!document) throw new Error(`Tu cuenta todavía no está creada: entrá una vez a ${APP_URL} y volvé a intentar.`)
    return document
  }

  function statusesOf(document: ResumeDocument) {
    return new Map(document.applicationStatuses.map((status) => [status.id, status]))
  }

  // -------------------------------------------------------------------------
  // Reading
  // -------------------------------------------------------------------------

  server.registerTool(
    'describe_model',
    {
      title: 'Cómo es el documento',
      description: 'How the document is organized (every entity, field, allowed value and reference) and how to edit it. Read it before using update_document.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => ({ content: [{ type: 'text' as const, text: MODEL_GUIDE }] }),
  )

  server.registerTool(
    'cv_guidelines',
    {
      title: 'Cómo armar un CV',
      description: 'How to build a CV that passes screening (ATS and AI filters) and lands with recruiters: researching the company, what to select, how to write achievements and the summary, format. Read it before build_cv.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => ({ content: [{ type: 'text' as const, text: CV_GUIDE }] }),
  )

  server.registerTool(
    'get_document',
    {
      title: 'Ver todo',
      description:
        "The user's whole document: profile, experience bank and levels, CV sections, CVs, applications and statuses. CV graphs and version snapshots are left out unless graphs=true. Use include to fetch only some parts.",
      inputSchema: z.object({
        include: z.array(z.enum(documentParts)).optional(),
        graphs: z.boolean().default(false),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ include, graphs }) => json(documentView(await open(), { include, graphs })),
  )

  server.registerTool(
    'list_experiences',
    {
      title: 'Experiencias',
      description:
        "The experience bank: the achievements that may go into a CV, where each happened (the entry it is linked to) and the user's level. Filter with query (matches text, category and skills).",
      inputSchema: z.object({ query: z.string().optional() }),
      annotations: { readOnlyHint: true },
    },
    async ({ query }) => {
      const document = await open()
      const words = fold(query ?? '').split(/\s+/).filter(Boolean)
      const levels = new Map(document.knowledge.map((answer) => [answer.id, answer.level]))
      const entries = new Map(
        sectionsView(document).flatMap((section) =>
          section.entries.map((entry) => [entry.id, `${section.name}: ${[entry.title, entry.subtitle].filter(Boolean).join(' — ')}`] as const),
        ),
      )
      return json(
        document.bank
          .filter((item) => words.every((word) => fold([item.text, item.category, ...item.skills].join(' ')).includes(word)))
          .map((item) => {
            const level = levels.get(item.id)
            const where = item.entryId ? entries.get(item.entryId) : undefined
            return {
              id: item.id,
              text: item.text,
              where: where ?? (item.entryId ? 'missing entry' : null),
              entry_id: item.entryId ?? null,
              skills: item.skills,
              category: item.category,
              level: level === undefined ? null : levelLabel[level],
            }
          }),
      )
    },
  )

  server.registerTool(
    'search_applications',
    {
      title: 'Buscar postulaciones',
      description: `Search job applications. text matches company, title, status, location and notes (accent-insensitive; "-word" excludes). stale_days keeps open ones with no activity for that many days (${STALE_DAYS} is a good default).`,
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
      const document = await open()
      const now = clock()
      const statuses = document.applicationStatuses
      const query = {
        ...defaultQuery(),
        text: text ?? '',
        statusIds: (status ?? []).map((value) => resolveStatus(statuses, value).id),
        scope,
        staleDays: stale_days ?? null,
        sort,
      }
      const found = filterApplications(document.applications, statuses, query, now)
      return json({ total: found.length, applications: found.slice(0, limit).map((item) => summary(item, statusesOf(document), now)) })
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
      const document = await open()
      const now = clock()
      const statusById = statusesOf(document)
      const application = findApplication(document, id)
      return json({
        ...summary(application, statusById, now),
        posting: application.posting || undefined,
        cv: cvAttachment(document, application.attachment),
        history: application.events.map((event) => ({
          at: event.at,
          step: statusById.get(event.statusId)?.name ?? event.statusId,
          ...(event.kind === 'status' ? { moved_to: statusById.get(event.statusId)?.name } : { note: event.text, note_id: event.id }),
        })),
        similar: duplicateReport(findDuplicates(document.applications, application, application.id), statusById, now),
      })
    },
  )

  server.registerTool(
    'check_duplicates',
    {
      title: '¿Ya me postulé?',
      description:
        'Earlier applications that match a posting: the same posting (by URL), a similar role at the same company, or the same company. Run it before create_application and tell the user what it finds.',
      inputSchema: z.object({ company: z.string(), title: z.string(), url: z.string().optional() }),
      annotations: { readOnlyHint: true },
    },
    async ({ company, title, url }) => {
      const document = await open()
      const matches = findDuplicates(document.applications, { company: company || companyFromUrl(url ?? ''), title, url })
      return json({ already_applied: matches.length > 0, matches: duplicateReport(matches, statusesOf(document), clock()) })
    },
  )

  // -------------------------------------------------------------------------
  // Generic editing
  // -------------------------------------------------------------------------

  server.registerTool(
    'update_document',
    {
      title: 'Editar',
      description:
        'Changes anything in the document with JSON Patch operations (add, remove, replace, move, copy, test): profile, jobs, education, experience bank, levels, sections, CVs, applications, statuses. Paths can select array items by id: /profile/jobs/[id=abc]/company. New items may omit their id. All operations apply together or none do. See describe_model for the structure.',
      inputSchema: z.object({
        operations: z.array(patchOperation).min(1),
        dry_run: z.boolean().default(false).describe('Preview the changes without saving'),
      }),
      annotations: { destructiveHint: true },
    },
    async ({ operations, dry_run }) => {
      const document = await open()
      const result = patchDocument(document, operations as PatchOperation[], clock())
      if (!dry_run && result.changes.length > 0) await store.save(result.document)
      return json({
        saved: !dry_run && result.changes.length > 0,
        changes: result.changes,
        warnings: result.warnings,
        ...(result.changes.length === 0 ? { note: 'Nothing changed.' } : {}),
      })
    },
  )

  // -------------------------------------------------------------------------
  // Content: profile, sections → entries, experiences
  // -------------------------------------------------------------------------

  server.registerTool(
    'get_profile',
    {
      title: 'Perfil',
      description: 'Name and contact fields (email, phone, location, links…), plus any extra profile data. Jobs and studies are entries of the experience and education sections (list_sections).',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => {
      const { profile } = await open()
      return json({ name: profile.name, fields: profile.fields.map(({ label, value, kind }) => ({ label, value, kind })), extra: profile.extra ?? {} })
    },
  )

  server.registerTool(
    'update_profile',
    {
      title: 'Editar perfil',
      description: 'Sets the name and contact fields. Fields are matched by label (case-insensitive): existing ones get the new value, others are added. remove_fields deletes by label. extra merges any other data (headline, nationality…).',
      inputSchema: z.object({
        name: z.string().optional(),
        fields: z.array(z.object({ label: z.string().min(1), value: z.string(), kind: z.enum(['email', 'phone', 'text', 'link']).optional() })).optional(),
        remove_fields: z.array(z.string()).optional(),
        extra: z.record(z.string(), z.unknown()).optional(),
      }),
      annotations: { idempotentHint: true },
    },
    async ({ name, fields, remove_fields, extra }) => {
      const document = await open()
      const next = updateProfileInfo(document, { name, fields, removeFields: remove_fields, extra })
      await store.save(next)
      return json({ name: next.profile.name, fields: next.profile.fields.map(({ label, value }) => ({ label, value })) })
    },
  )

  server.registerTool(
    'list_sections',
    {
      title: 'Secciones',
      description:
        'Every CV section with its entries: experience (entries are roles: title = role, subtitle = company), education (title = degree, subtitle = school), projects, and any section the user added (certifications, languages…). Each entry lists how many experiences are linked to it.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => {
      const document = await open()
      return json(
        sectionsView(document).map((section) => ({
          ...section,
          entries: section.entries.map((entry) => ({ ...entry, experiences: document.bank.filter((item) => item.entryId === entry.id).length })),
        })),
      )
    },
  )

  server.registerTool(
    'save_section',
    {
      title: 'Crear o editar sección',
      description: 'Creates a section (any name: "Certificaciones", "Idiomas", "Voluntariado"…) or renames / describes / (de)activates one. The name is the heading printed on CVs.',
      inputSchema: z.object({ section_id: z.string().optional(), name: z.string().min(1), description: z.string().optional(), active: z.boolean().optional() }),
      annotations: { idempotentHint: true },
    },
    async ({ section_id, name, description, active }) => {
      const document = await open()
      const { document: next, sectionId } = saveSection(document, { id: section_id, name, description, active })
      await store.save(next)
      return json({ section_id: sectionId, name })
    },
  )

  server.registerTool(
    'delete_section',
    {
      title: 'Eliminar sección',
      description: 'Deletes a section the user added, with its entries (their experiences stay in the bank, unlinked). Built-in sections are deactivated instead. Ask the user first.',
      inputSchema: z.object({ section_id: z.string() }),
      annotations: { destructiveHint: true },
    },
    async ({ section_id }) => {
      const document = await open()
      await store.save(deleteSection(document, section_id))
      return json({ deleted: section_id })
    },
  )

  server.registerTool(
    'save_entry',
    {
      title: 'Crear o editar entrada',
      description:
        'Creates or updates an entry of any section (by section id or name; a section that does not exist is created). Experience: title = role, subtitle = company (roles of the same company are grouped). Education: title = degree, subtitle = school. Others: title, subtitle (organization, issuer, level…), dates, description, url. Pass entry_id to update; only the fields sent change. Returns entry_id: link experiences to it with save_experience.',
      inputSchema: z.object({
        section: z.string().describe('Section id or name: "experience", "education", "Proyectos", "Certificaciones"…'),
        entry_id: z.string().optional(),
        title: z.string().optional(),
        subtitle: z.string().optional(),
        location: z.string().optional(),
        start: z.string().optional().describe('As printed: "2021", "Mar 2021"'),
        end: z.string().optional().describe('As printed: "2024", "Actualidad"'),
        description: z.string().optional(),
        url: z.string().optional(),
        extra: z.record(z.string(), z.unknown()).optional(),
      }),
      annotations: { idempotentHint: true },
    },
    async ({ section, entry_id, ...fields }) => {
      const document = await open()
      const { document: next, sectionId, entryId } = saveEntry(document, section, { id: entry_id, ...fields })
      await store.save(next)
      return json({ section_id: sectionId, entry_id: entryId })
    },
  )

  server.registerTool(
    'delete_entry',
    {
      title: 'Eliminar entrada',
      description: 'Deletes an entry (a role, a study, a project…). Experiences linked to it stay in the bank, unlinked. Ask the user first.',
      inputSchema: z.object({ section: z.string(), entry_id: z.string() }),
      annotations: { destructiveHint: true },
    },
    async ({ section, entry_id }) => {
      const document = await open()
      await store.save(deleteEntry(document, section, entry_id))
      return json({ deleted: entry_id })
    },
  )

  server.registerTool(
    'save_experience',
    {
      title: 'Crear o editar experiencia',
      description:
        'Creates or updates an experience: one concrete achievement, written as the CV bullet ("Reduje la latencia un 40%…"). entry_id links it to where it happened (a role, a project… from list_sections; "" unlinks). level: how well the user knows it. Pass experience_id to update; only the fields sent change.',
      inputSchema: z.object({
        experience_id: z.string().optional(),
        text: z.string().optional(),
        entry_id: z.string().optional(),
        skills: z.array(z.string()).optional(),
        category: z.string().optional().describe('Short theme to group it: "Backend", "Liderazgo"…'),
        level: z.enum(['profesional', 'personal', 'sin experiencia']).nullable().optional(),
        extra: z.record(z.string(), z.unknown()).optional().describe('Metrics, dates, links…'),
      }),
      annotations: { idempotentHint: true },
    },
    async ({ experience_id, entry_id, level, ...fields }) => {
      const document = await open()
      const { document: next, experienceId } = saveExperience(document, {
        id: experience_id,
        entryId: entry_id,
        level: level === undefined ? undefined : level === null ? null : levelValue[level],
        ...fields,
      })
      await store.save(next)
      return json({ experience_id: experienceId })
    },
  )

  server.registerTool(
    'delete_experiences',
    {
      title: 'Eliminar experiencias',
      description: 'Deletes experiences from the bank (and their levels). CVs already generated keep their versions. Ask the user first.',
      inputSchema: z.object({ experience_ids: z.array(z.string()).min(1) }),
      annotations: { destructiveHint: true },
    },
    async ({ experience_ids }) => {
      const document = await open()
      const next = deleteExperiences(document, experience_ids)
      await store.save(next)
      return json({ deleted: document.bank.length - next.bank.length })
    },
  )

  server.registerTool(
    'set_experience_levels',
    {
      title: 'Niveles',
      description: 'Sets how well the user knows each experience: profesional, personal (side projects) or sin experiencia; null clears it.',
      inputSchema: z.object({
        levels: z.array(z.object({ experience_id: z.string(), level: z.enum(['profesional', 'personal', 'sin experiencia']).nullable() })).min(1),
      }),
      annotations: { idempotentHint: true },
    },
    async ({ levels }) => {
      const document = await open()
      await store.save(setLevels(document, levels.map((item) => ({ id: item.experience_id, level: item.level === null ? null : levelValue[item.level] }))))
      return json({ updated: levels.length })
    },
  )

  // -------------------------------------------------------------------------
  // Applications
  // -------------------------------------------------------------------------

  server.registerTool(
    'create_application',
    {
      title: 'Nueva postulación',
      description:
        "Records that the user applied (or is applying) to a job. Starts in the first open step of their pipeline. If it looks like a posting or role they already applied to, nothing is created and the matches come back: ask the user, then call again with confirm_duplicate=true if they want to go ahead.",
      inputSchema: z.object({
        company: z.string().min(1),
        title: z.string().min(1),
        url: z.string().optional(),
        location: z.string().optional(),
        posting: z.string().optional().describe('Full posting text, if available'),
        applied_on: isoDate.optional().describe('Defaults to today'),
        note: z.string().optional().describe('First note: referral, salary asked, contact…'),
        confirm_duplicate: z.boolean().default(false),
      }),
    },
    async (input) => {
      const document = await open()
      const now = clock()
      const statusById = statusesOf(document)
      const matches = findDuplicates(document.applications, input)
      if (!input.confirm_duplicate && matches.some((match) => match.reason !== 'same-company')) {
        return json({
          created: false,
          reason: 'Looks like an application the user already made. Show these to the user and ask before retrying with confirm_duplicate=true.',
          matches: duplicateReport(matches, statusById, now),
        })
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
        },
        document.applicationStatuses,
        now,
      )
      await store.save({ ...document, applications: [...document.applications, application] })
      return json({
        created: true,
        application: summary(application, statusById, now),
        other_applications_at_company: duplicateReport(matches, statusById, now),
      })
    },
  )

  server.registerTool(
    'move_application',
    {
      title: 'Mover de estado',
      description:
        'Moves an application to another step (status name or id), optionally with a note for that step. Keeps the history. A status that does not exist yet is created (e.g. "Call con el CEO").',
      inputSchema: z.object({ id: z.string(), status: z.string(), note: z.string().optional() }),
      annotations: { idempotentHint: true },
    },
    async ({ id, status, note }) => {
      const document = await open()
      const now = clock()
      const application = findApplication(document, id)
      const target = findOrCreateStatus(document.applicationStatuses, status)
      const next = moveApplication(application, target.status.id, note ?? '', now)
      const updated = { ...document, applicationStatuses: target.statuses, applications: document.applications.map((item) => (item.id === id ? next : item)) }
      if (next !== application || target.created) await store.save(updated)
      return json({ ...summary(next, statusesOf(updated), now), ...(target.created ? { created_status: target.status.name } : {}) })
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
      const document = await open()
      const now = clock()
      const application = findApplication(document, id)
      const next = addApplicationNote(application, text, now)
      await store.save({ ...document, applications: document.applications.map((item) => (item.id === id ? next : item)) })
      return json(summary(next, statusesOf(document), now))
    },
  )

  server.registerTool(
    'update_application',
    {
      title: 'Editar postulación',
      description: "Fixes an application's details (company, title, link, location, posting text, applied date). Only the fields sent change.",
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
      const document = await open()
      const now = clock()
      const application = findApplication(document, id)
      const changes = Object.fromEntries(Object.entries({ ...patch, appliedOn: applied_on }).filter(([, value]) => value !== undefined))
      const next = updateApplication(application, changes, now)
      await store.save({ ...document, applications: document.applications.map((item) => (item.id === id ? next : item)) })
      return json(summary(next, statusesOf(document), now))
    },
  )

  server.registerTool(
    'delete_application',
    {
      title: 'Eliminar postulación',
      description: 'Deletes an application and its history. Ask the user first.',
      inputSchema: z.object({ id: z.string() }),
      annotations: { destructiveHint: true },
    },
    async ({ id }) => {
      const document = await open()
      const application = findApplication(document, id)
      await store.save({ ...document, applications: document.applications.filter((item) => item.id !== id) })
      return json({ deleted: true, company: application.company, title: application.title })
    },
  )

  server.registerTool(
    'delete_status',
    {
      title: 'Eliminar estado',
      description: 'Removes a step from the pipeline. Applications in it move to move_to (status name or id), with that move recorded in their history.',
      inputSchema: z.object({ status: z.string(), move_to: z.string() }),
      annotations: { destructiveHint: true },
    },
    async ({ status, move_to }) => {
      const document = await open()
      const removed = resolveStatus(document.applicationStatuses, status)
      const target = resolveStatus(document.applicationStatuses, move_to)
      if (removed.id === target.id) throw new Error('move_to tiene que ser otro estado.')
      const result = removeStatus(document.applicationStatuses, document.applications, removed.id, target.id, clock())
      await store.save({ ...document, applicationStatuses: result.statuses, applications: result.applications })
      return json({ deleted: removed.name, moved: document.applications.filter((item) => item.statusId === removed.id).length, to: target.name })
    },
  )

  // -------------------------------------------------------------------------
  // CVs
  // -------------------------------------------------------------------------

  server.registerTool(
    'build_cv',
    {
      title: 'Armar CV',
      description:
        'Creates a CV (or rebuilds one with cv_id) from a selection and generates its version. You choose the experiences; the server places each under the entry it is linked to (roles in profile order, then education, then other sections like projects or certifications) and returns the outline. Experiences not linked to a shown entry are reported as unplaced: link them with save_experience and rebuild. Never draw the graph by hand.',
      inputSchema: z.object({
        cv_id: z.string().optional().describe('Rebuild this CV instead of creating one'),
        title: z.string().optional().describe('Name of the CV, e.g. "Tech Lead — Acme"'),
        position: z.string().optional().describe('Job it targets'),
        company: z.string().optional(),
        posting: z.string().optional(),
        summary: z.string().optional().describe('Profile paragraph at the top'),
        experience_ids: z.array(z.string()).describe('Experiences to show (see list_experiences), in the order you want them'),
        entry_ids: z
          .array(z.string())
          .optional()
          .describe('Only these entries (roles, studies, projects…). Default: every role and study, plus entries of other sections that have chosen experiences.'),
        section_ids: z.array(z.string()).optional().describe('Other sections to include (ids or names), in order. Default: those with chosen experiences.'),
        include_education: z.boolean().default(true),
        template: z.enum(['classic', 'timeline', 'sidebar']).optional(),
        font: z.enum(['times', 'georgia', 'palatino', 'sans']).optional(),
        application_id: z.string().optional().describe('Attach the generated version to this application'),
      }),
    },
    async (input) => {
      const document = await open()
      const missing = input.experience_ids.filter((id) => !document.bank.some((item) => item.id === id))
      if (missing.length > 0) throw new Error(`Estas experiencias no existen: ${missing.join(', ')}. Usá list_experiences.`)
      if (input.application_id) findApplication(document, input.application_id)
      const { document: built, cvId, versionId, outline } = buildCv(
        document,
        {
          cvId: input.cv_id,
          title: input.title,
          position: input.position,
          company: input.company,
          posting: input.posting,
          summary: input.summary,
          templateId: input.template,
          fontId: input.font,
          experienceIds: input.experience_ids,
          entryIds: input.entry_ids,
          sectionIds: input.section_ids,
          includeEducation: input.include_education,
        },
        clock(),
      )
      const next = input.application_id
        ? {
            ...built,
            applications: built.applications.map((application) =>
              application.id === input.application_id
                ? updateApplication(application, { attachment: { kind: 'cv', cvId, versionId } }, clock())
                : application,
            ),
          }
        : built
      await store.save(next)
      const cv = next.cvs.find((item) => item.id === cvId)!
      const review = reviewCv(cv, cv.versions.at(-1)!.snapshot, next.bank)
      return json({ cv_id: cvId, version_id: versionId, outline, review, review_and_download: APP_URL })
    },
  )

  server.registerTool(
    'update_cv',
    {
      title: 'Editar CV',
      description: "Changes a CV's name, target job, summary or style (template, font, size, spacing, margins, paper, skills format). Call build_cv_version afterwards to regenerate it.",
      inputSchema: z.object({
        cv_id: z.string(),
        title: z.string().optional(),
        position: z.string().optional(),
        company: z.string().optional(),
        posting: z.string().optional(),
        summary: z.string().optional(),
        template: z.enum(['classic', 'timeline', 'sidebar']).optional(),
        font: z.enum(['times', 'georgia', 'palatino', 'sans']).optional(),
        font_size: z.union([z.literal(9), z.literal(10), z.literal(11), z.literal(12), z.literal(14)]).optional(),
        line_height: z.union([z.literal(1), z.literal(1.15), z.literal(1.5), z.literal(2)]).optional(),
        margins: z.enum(['narrow', 'normal', 'wide']).optional(),
        page_size: z.enum(['letter', 'a4']).optional(),
        skills_format: z.enum(['list', 'comma']).optional(),
      }),
      annotations: { idempotentHint: true },
    },
    async ({ cv_id, template, font, font_size, line_height, margins, page_size, skills_format, ...meta }) => {
      const document = await open()
      if (!document.cvs.some((cv) => cv.id === cv_id)) throw new Error(`No existe el CV ${cv_id}.`)
      const patch = Object.fromEntries(
        Object.entries({
          ...meta,
          templateId: template,
          fontId: font,
          fontSize: font_size,
          lineHeight: line_height,
          marginId: margins,
          pageSize: page_size,
          skillsFormat: skills_format,
        }).filter(([, value]) => value !== undefined),
      )
      await store.save({ ...document, cvs: document.cvs.map((cv) => (cv.id === cv_id ? { ...cv, ...patch } : cv)) })
      return json({ updated: true, cv_id, changed: Object.keys(patch) })
    },
  )

  server.registerTool(
    'build_cv_version',
    {
      title: 'Generar versión',
      description:
        'Generates a new version of a CV from its current content (like "Generar" in the app). With pin_to_application_id, that application records this exact version as the one sent.',
      inputSchema: z.object({ cv_id: z.string(), pin_to_application_id: z.string().optional() }),
    },
    async ({ cv_id, pin_to_application_id }) => {
      const document = await open()
      if (!document.cvs.some((cv) => cv.id === cv_id)) throw new Error(`No existe el CV ${cv_id}.`)
      if (pin_to_application_id) findApplication(document, pin_to_application_id)
      const { document: built, versionId } = buildCvVersion(document, cv_id, { now: clock() })
      const next = pin_to_application_id
        ? {
            ...built,
            applications: built.applications.map((application) =>
              application.id === pin_to_application_id
                ? updateApplication(application, { attachment: { kind: 'cv', cvId: cv_id, versionId } }, clock())
                : application,
            ),
          }
        : built
      await store.save(next)
      const cv = next.cvs.find((item) => item.id === cv_id)!
      const review = reviewCv(cv, cv.versions.at(-1)!.snapshot, next.bank)
      return json({ version_id: versionId, version: cv.versions.length, review, review_and_download: APP_URL })
    },
  )

  server.registerTool(
    'delete_cv',
    {
      title: 'Eliminar CV',
      description: 'Deletes a CV and its versions. Applications that had it attached keep a dangling reference. Ask the user first.',
      inputSchema: z.object({ id: z.string() }),
      annotations: { destructiveHint: true },
    },
    async ({ id }) => {
      const document = await open()
      const cv = document.cvs.find((item) => item.id === id)
      if (!cv) throw new Error(`No existe el CV ${id}.`)
      await store.save(deleteCv(document, id))
      return json({ deleted: true, title: cv.title })
    },
  )

  // -------------------------------------------------------------------------
  // Prompts: the three everyday requests, for clients that list prompts
  // -------------------------------------------------------------------------

  const prompt = (text: string) => ({ messages: [{ role: 'user' as const, content: { type: 'text' as const, text } }] })

  server.registerPrompt(
    'actualizar-mi-info',
    { title: 'Actualizá mi info', description: 'Carga tu perfil, trabajos, estudios y experiencias con lo que el asistente sabe de vos.' },
    () => prompt('Actualizá mi info en Resume con todo lo que sabés de mí. Antes de guardar, mostrame un resumen y preguntame lo que falte (fechas, cifras). No inventes nada.'),
  )

  server.registerPrompt(
    'armar-cv',
    {
      title: 'Armar CV para un aviso',
      description: 'Analiza el aviso, chequea si ya te postulaste, crea la postulación y arma el CV.',
      argsSchema: z.object({ aviso: z.string().describe('Link del aviso o el texto pegado') }),
    },
    ({ aviso }) => prompt(`Armemos el CV para ${aviso}. Investigá la empresa, seguí cv_guidelines y revisá el review de build_cv antes de mostrármelo.`),
  )

  server.registerPrompt(
    'novedad',
    {
      title: 'Novedad de un proceso',
      description: 'Contale qué pasó con una postulación y la actualiza.',
      argsSchema: z.object({ novedad: z.string().describe('Ej: Me confirmaron de Acme, paso a la siguiente etapa, challenge el 20/3') }),
    },
    ({ novedad }) => prompt(novedad),
  )
}
