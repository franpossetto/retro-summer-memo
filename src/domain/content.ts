/**
 * The user's content as sections → entries → experiences, with one CRUD for every section.
 *
 * Experience and Education keep their entries in the profile (roles, education) because the
 * Personal screen and the CV templates use them; every other section (projects, certifications,
 * languages, anything the user adds) keeps them in `section.entries`. Callers see the same shape.
 * Pure functions over the document.
 */
import { readExtra, type Extra } from './extra'
import type { Experience, ExperienceLevel } from './experiences'
import { writeProfile } from './documentOps'
import { PROFILE_SECTIONS, type CatalogSection, type Job, type ProfileField, type ProfileFieldKind, type ResumeDocument, type SectionEntry } from './model'

export type SectionView = {
  id: string
  name: string
  description: string
  active: boolean
  builtIn: boolean
  /** Where its entries live: the profile (experience, education), the section itself, or none (personal, skills). */
  source: 'profile' | 'section' | 'none'
  entries: SectionEntry[]
}

export type EntryInput = Partial<Omit<SectionEntry, 'id'>> & { id?: string }

const noEntries = new Set(['personal', 'skills'])

function fold(value: string) {
  return value.toLocaleLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

function slug(name: string) {
  return fold(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || crypto.randomUUID()
}

function emptyEntry(id: string): SectionEntry {
  return { id, title: '', subtitle: '', location: '', start: '', end: '', description: '', url: '' }
}

/** Every section with its entries, whatever stores them. */
export function sectionsView(document: ResumeDocument): SectionView[] {
  return document.sections.map((section) => {
    const base = { id: section.id, name: section.name, description: section.description, active: section.active, builtIn: section.builtIn }
    if (section.id === 'experience') {
      return {
        ...base,
        source: 'profile',
        entries: document.profile.jobs.flatMap((job) =>
          job.roles.map((role) => ({
            ...emptyEntry(role.id),
            title: role.title,
            subtitle: job.company,
            location: role.location,
            start: role.start,
            end: role.end,
            extra: { ...(role.extra ?? {}), jobId: job.id },
          })),
        ),
      }
    }
    if (section.id === 'education') {
      return {
        ...base,
        source: 'profile',
        entries: document.profile.education.map((entry) => ({
          ...emptyEntry(entry.id),
          title: entry.degree,
          subtitle: entry.school,
          start: entry.start,
          end: entry.end,
          ...(entry.extra ? { extra: entry.extra } : {}),
        })),
      }
    }
    return { ...base, source: noEntries.has(section.id) ? 'none' : 'section', entries: section.entries ?? [] }
  })
}

/** Other names the built-in sections go by, so "Proyectos" or "Estudios" find them. */
const builtInAliases: Record<string, string[]> = {
  personal: ['personal', 'datos personales', 'perfil', 'contacto', 'profile', 'contact'],
  experience: ['experience', 'work experience', 'experiencia', 'experiencia laboral', 'trabajos', 'empleos', 'jobs', 'roles'],
  education: ['education', 'educacion', 'estudios', 'formacion', 'formacion academica', 'studies'],
  skills: ['skills', 'habilidades', 'tecnologias', 'competencias', 'aptitudes'],
  projects: ['projects', 'personal projects', 'proyectos', 'proyectos personales', 'side projects'],
}

/** A section by id or name (ignoring case and accents); built-in ones also by their usual names. */
export function findSection(document: ResumeDocument, idOrName: string): CatalogSection | undefined {
  const wanted = fold(idOrName)
  return (
    document.sections.find((section) => section.id === idOrName || fold(section.name) === wanted) ??
    document.sections.find((section) => builtInAliases[section.id]?.includes(wanted))
  )
}

/** Creates a section, or renames / describes / (de)activates an existing one. */
export function saveSection(
  document: ResumeDocument,
  input: { id?: string; name: string; description?: string; active?: boolean },
): { document: ResumeDocument; sectionId: string } {
  const existing = input.id ? document.sections.find((section) => section.id === input.id) : findSection(document, input.name)
  if (existing) {
    const updated: CatalogSection = {
      ...existing,
      name: input.name.trim() || existing.name,
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    }
    return { document: { ...document, sections: document.sections.map((section) => (section.id === existing.id ? updated : section)) }, sectionId: existing.id }
  }
  let id = input.id || slug(input.name)
  if (document.sections.some((section) => section.id === id)) id = `${id}-${crypto.randomUUID().slice(0, 6)}`
  const section: CatalogSection = { id, name: input.name.trim() || 'Sección', description: input.description ?? '', active: input.active ?? true, builtIn: false, entries: [] }
  return { document: { ...document, sections: [...document.sections, section] }, sectionId: id }
}

/** Removes a section the user added (built-in ones can only be deactivated). Its experiences stay, unlinked. */
export function deleteSection(document: ResumeDocument, sectionId: string): ResumeDocument {
  const section = document.sections.find((item) => item.id === sectionId)
  if (!section) throw new Error(`No existe la sección ${sectionId}.`)
  if (section.builtIn) throw new Error(`"${section.name}" viene con la app: no se borra, se desactiva (active: false).`)
  const gone = new Set((section.entries ?? []).map((entry) => entry.id))
  return unlinkExperiences({ ...document, sections: document.sections.filter((item) => item.id !== sectionId) }, gone)
}

/**
 * Creates or updates an entry of a section; the section is created when it does not exist yet.
 * Experience entries are roles (subtitle = company), Education entries are studies
 * (title = degree, subtitle = school): they are written to the profile.
 */
export function saveEntry(
  document: ResumeDocument,
  sectionIdOrName: string,
  input: EntryInput,
): { document: ResumeDocument; sectionId: string; entryId: string } {
  const found = findSection(document, sectionIdOrName)
  const { document: withSection, sectionId } = found ? { document, sectionId: found.id } : saveSection(document, { name: sectionIdOrName })
  if (noEntries.has(sectionId)) throw new Error(`La sección "${sectionId}" no tiene entradas.`)
  const entryId = input.id || crypto.randomUUID()
  if (sectionId === 'experience') return { document: saveRole(withSection, entryId, input), sectionId, entryId }
  if (sectionId === 'education') return { document: saveStudy(withSection, entryId, input), sectionId, entryId }

  const section = withSection.sections.find((item) => item.id === sectionId)!
  const entries = section.entries ?? []
  const current = entries.find((entry) => entry.id === entryId) ?? emptyEntry(entryId)
  const next = { ...current, ...definedFields(input), id: entryId }
  const nextEntries = entries.some((entry) => entry.id === entryId) ? entries.map((entry) => (entry.id === entryId ? next : entry)) : [...entries, next]
  return {
    // Adding content to a section means using it: turn it on.
    document: { ...withSection, sections: withSection.sections.map((item) => (item.id === sectionId ? { ...item, entries: nextEntries, active: true } : item)) },
    sectionId,
    entryId,
  }
}

/** Removes an entry of any section. Experiences linked to it stay in the bank, unlinked. */
export function deleteEntry(document: ResumeDocument, sectionIdOrName: string, entryId: string): ResumeDocument {
  const section = findSection(document, sectionIdOrName)
  if (!section) throw new Error(`No existe la sección ${sectionIdOrName}.`)
  let next: ResumeDocument
  if (section.id === 'experience') {
    const jobs = document.profile.jobs
      .map((job) => ({ ...job, roles: job.roles.filter((role) => role.id !== entryId) }))
      .filter((job) => job.roles.length > 0)
    next = writeProfile(document, { ...document.profile, jobs })
  } else if (section.id === 'education') {
    next = writeProfile(document, { ...document.profile, education: document.profile.education.filter((entry) => entry.id !== entryId) })
  } else {
    next = {
      ...document,
      sections: document.sections.map((item) => (item.id === section.id ? { ...item, entries: (item.entries ?? []).filter((entry) => entry.id !== entryId) } : item)),
    }
  }
  return unlinkExperiences(next, new Set([entryId]))
}

function saveRole(document: ResumeDocument, roleId: string, input: EntryInput): ResumeDocument {
  const jobs: Job[] = document.profile.jobs.map((job) => ({ ...job, roles: [...job.roles] }))
  const owner = jobs.find((job) => job.roles.some((role) => role.id === roleId))
  const role = owner?.roles.find((item) => item.id === roleId) ?? { id: roleId, title: '', location: '', start: '', end: '' }
  const updated = {
    ...role,
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.location !== undefined ? { location: input.location } : {}),
    ...(input.start !== undefined ? { start: input.start } : {}),
    ...(input.end !== undefined ? { end: input.end } : {}),
    ...(input.extra ? { extra: { ...(role.extra ?? {}), ...withoutJobId(input.extra) } } : {}),
  }
  const company = (input.subtitle ?? owner?.company ?? '').trim()
  // The role lives in the job of its company: the same job (and place) when the company did not change.
  const otherJob = jobs.find((job) => job !== owner && fold(job.company) === fold(company))
  // A job with just this role is renamed rather than replaced, unless that company already has a job.
  const sameJob = owner && (input.subtitle === undefined || fold(owner.company) === fold(company) || (owner.roles.length === 1 && !otherJob))
  if (owner && sameJob) {
    owner.roles = owner.roles.map((item) => (item.id === roleId ? updated : item))
    if (input.subtitle !== undefined) owner.company = company
  } else {
    if (owner) owner.roles = owner.roles.filter((item) => item.id !== roleId)
    const target = jobs.find((job) => fold(job.company) === fold(company))
    if (target) target.roles.push(updated)
    else jobs.push({ id: crypto.randomUUID(), company, roles: [updated] })
  }
  return writeProfile(document, { ...document.profile, jobs: jobs.filter((job) => job.roles.length > 0) })
}

function saveStudy(document: ResumeDocument, id: string, input: EntryInput): ResumeDocument {
  const education = document.profile.education
  const current = education.find((entry) => entry.id === id) ?? { id, school: '', degree: '', start: '', end: '' }
  const next = {
    ...current,
    ...(input.title !== undefined ? { degree: input.title } : {}),
    ...(input.subtitle !== undefined ? { school: input.subtitle } : {}),
    ...(input.start !== undefined ? { start: input.start } : {}),
    ...(input.end !== undefined ? { end: input.end } : {}),
    ...(input.extra ? { extra: { ...(current.extra ?? {}), ...input.extra } } : {}),
  }
  const list = education.some((entry) => entry.id === id) ? education.map((entry) => (entry.id === id ? next : entry)) : [...education, next]
  return writeProfile(document, { ...document.profile, education: list })
}

function withoutJobId(extra: Extra): Extra {
  const { jobId: _jobId, ...rest } = extra
  return rest
}

function definedFields(input: EntryInput): Partial<SectionEntry> {
  const { id: _id, ...fields } = input
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) as Partial<SectionEntry>
}

function unlinkExperiences(document: ResumeDocument, entryIds: Set<string>): ResumeDocument {
  if (!document.bank.some((item) => item.entryId && entryIds.has(item.entryId))) return document
  return {
    ...document,
    bank: document.bank.map((item) => {
      if (!item.entryId || !entryIds.has(item.entryId)) return item
      const { entryId: _entryId, ...rest } = item
      return rest
    }),
  }
}

// ---------------------------------------------------------------------------
// Experiences (the bank) and levels
// ---------------------------------------------------------------------------

export type ExperienceInput = {
  id?: string
  text?: string
  category?: string
  skills?: string[]
  /** Entry where it happened (a role, a project…); '' unlinks it. */
  entryId?: string
  level?: ExperienceLevel | null
  extra?: Extra
}

/** Creates or updates an experience, and its level when given. */
export function saveExperience(document: ResumeDocument, input: ExperienceInput): { document: ResumeDocument; experienceId: string } {
  const id = input.id || crypto.randomUUID()
  const current = document.bank.find((item) => item.id === id)
  if (!current && !input.text?.trim()) throw new Error('Una experiencia nueva necesita texto.')
  if (input.entryId && !sectionsView(document).some((section) => section.entries.some((entry) => entry.id === input.entryId))) {
    throw new Error(`No existe la entrada ${input.entryId}: creala primero con save_entry o usá list_sections.`)
  }
  const base: Experience = current ?? { id, category: 'Custom', text: '', skills: [], aliases: [] }
  let next: Experience = {
    ...base,
    ...(input.text !== undefined ? { text: input.text.trim() } : {}),
    ...(input.category !== undefined ? { category: input.category.trim() || 'Custom' } : {}),
    ...(input.skills !== undefined ? { skills: input.skills.map((skill) => skill.trim()).filter(Boolean) } : {}),
    ...(input.extra ? { extra: { ...(base.extra ?? {}), ...input.extra } } : {}),
  }
  if (input.entryId !== undefined) {
    const { entryId: _entryId, ...rest } = next
    next = input.entryId ? { ...rest, entryId: input.entryId } : rest
  }
  const bank = current ? document.bank.map((item) => (item.id === id ? next : item)) : [...document.bank, next]
  const withBank = { ...document, bank }
  return { document: input.level === undefined ? withBank : setLevels(withBank, [{ id, level: input.level }]), experienceId: id }
}

/** Deletes experiences (and their levels). */
export function deleteExperiences(document: ResumeDocument, ids: string[]): ResumeDocument {
  const gone = new Set(ids)
  return { ...document, bank: document.bank.filter((item) => !gone.has(item.id)), knowledge: document.knowledge.filter((answer) => !gone.has(answer.id)) }
}

/** Sets (or clears, with null) how well the user knows each experience. */
export function setLevels(document: ResumeDocument, levels: { id: string; level: ExperienceLevel | null }[]): ResumeDocument {
  const map = new Map(document.knowledge.map((answer) => [answer.id, answer.level]))
  for (const { id, level } of levels) {
    if (level === null) map.delete(id)
    else map.set(id, level)
  }
  return { ...document, knowledge: [...map.entries()].map(([id, level]) => ({ id, level })) }
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

/** Name, contact fields (matched by label) and any extra profile data. */
export function updateProfileInfo(
  document: ResumeDocument,
  input: { name?: string; fields?: { label: string; value: string; kind?: ProfileFieldKind }[]; removeFields?: string[]; extra?: Extra },
): ResumeDocument {
  const profile = document.profile
  const removed = new Set((input.removeFields ?? []).map(fold))
  let fields: ProfileField[] = profile.fields.filter((field) => !removed.has(fold(field.label)))
  for (const field of input.fields ?? []) {
    const existing = fields.find((item) => fold(item.label) === fold(field.label))
    if (existing) {
      fields = fields.map((item) => (item === existing ? { ...item, value: field.value, ...(field.kind ? { kind: field.kind } : {}) } : item))
    } else {
      fields = [...fields, { id: crypto.randomUUID(), label: field.label.trim(), value: field.value, kind: field.kind ?? guessKind(field.value) }]
    }
  }
  const extra = input.extra ? readExtra({ extra: { ...(profile.extra ?? {}), ...input.extra } }, []) : profile.extra
  return writeProfile(document, {
    ...profile,
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    fields,
    ...(extra ? { extra } : {}),
  })
}

function guessKind(value: string): ProfileFieldKind {
  if (/^\S+@\S+\.\S+$/.test(value)) return 'email'
  if (/^https?:\/\//i.test(value) || /^[\w-]+\.[a-z]{2,}(\/|$)/i.test(value)) return 'link'
  if (/^[+\d][\d\s()-]{6,}$/.test(value)) return 'phone'
  return 'text'
}

export { PROFILE_SECTIONS }
