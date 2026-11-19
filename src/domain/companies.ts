/**
 * Companies the user applies to or looks into: what they do, their mission, vision and values,
 * and everything learned about them (news, layoffs, hiring, other openings, how others' interviews
 * went…). Pure functions only.
 *
 * An application belongs to the company with the same name, compared with `companyKey` (case,
 * accents, punctuation and legal suffixes ignored): "Globant S.A." and "globant" are one company.
 * No id to keep in sync, so applications created anywhere (the app, an assistant) land in the
 * right place.
 */

import { companyKey, type Application } from './applications'
import { readExtra, withExtra, type Extra } from './extra'
import type { ResumeDocument } from './model'

/** Kinds the app labels; any other string is accepted. */
export type CompanyNoteKind =
  | 'news'
  | 'hiring'
  | 'layoff'
  | 'role'
  | 'interview'
  | 'culture'
  | 'salary'
  | 'funding'
  | 'product'
  | 'review'
  | (string & {})

export type CompanyNote = {
  id: string
  kind: CompanyNoteKind
  /** When it happened: `yyyy-mm-dd`, `yyyy-mm` or `yyyy`; '' when unknown. */
  date: string
  text: string
  /** Where it comes from: a link, or who said it ("Glassdoor", "un ex empleado"). */
  source: string
  /** ISO timestamp of when it was written down. */
  addedAt: string
  extra?: Extra
}

export type Company = {
  id: string
  name: string
  /** Their site, e.g. `https://globex.com`. */
  website: string
  /** Logo image URL; '' uses the website's icon, or the initials. */
  logo: string
  /** What they do: product, customers, stage, size. */
  about: string
  mission: string
  vision: string
  values: string[]
  /** What is known about them, newest first. */
  notes: CompanyNote[]
  /** Anything else: industry, size, headquarters, founded, funding, stack, ratings… */
  extra?: Extra
}

export const companyNoteKinds: { kind: CompanyNoteKind; label: string; hint: string }[] = [
  { kind: 'news', label: 'Novedad', hint: 'Lanzamientos, cambios, prensa' },
  { kind: 'hiring', label: 'Contrataciones', hint: 'Están sumando gente, equipos que crecen' },
  { kind: 'layoff', label: 'Despidos', hint: 'Recortes, reestructuras' },
  { kind: 'role', label: 'Otro puesto', hint: 'Otros avisos: qué buscan, stack, sueldos' },
  { kind: 'interview', label: 'Proceso', hint: 'Cómo son sus entrevistas, según otros' },
  { kind: 'culture', label: 'Cultura', hint: 'Cómo se trabaja, qué dicen los empleados' },
  { kind: 'salary', label: 'Sueldos', hint: 'Rangos, beneficios' },
  { kind: 'funding', label: 'Inversión', hint: 'Rondas, resultados, adquisiciones' },
  { kind: 'product', label: 'Producto', hint: 'Qué venden, a quién, cómo les va' },
  { kind: 'review', label: 'Reseña', hint: 'Glassdoor, Blind, comentarios' },
]

export function noteKindLabel(kind: string): string {
  return companyNoteKinds.find((item) => item.kind === kind)?.label ?? (kind ? kind.charAt(0).toUpperCase() + kind.slice(1).replace(/[-_]+/g, ' ') : 'Nota')
}

// ---------------------------------------------------------------------------
// Finding
// ---------------------------------------------------------------------------

/** The company with this id, or else with this name (see `companyKey`). */
export function findCompany(companies: Company[], idOrName: string): Company | undefined {
  const byId = companies.find((company) => company.id === idOrName)
  if (byId) return byId
  const key = companyKey(idOrName)
  return key ? companies.find((company) => companyKey(company.name) === key) : undefined
}

/** The company an application belongs to, if its info was saved. */
export function companyOf(companies: Company[], application: Pick<Application, 'company'>): Company | undefined {
  const key = companyKey(application.company)
  return key ? companies.find((company) => companyKey(company.name) === key) : undefined
}

/** Applications to a company (by name), most recent first. */
export function applicationsTo(applications: Application[], name: string): Application[] {
  const key = companyKey(name)
  if (!key) return []
  return applications
    .filter((application) => companyKey(application.company) === key)
    .sort((left, right) => (right.appliedOn || right.createdAt).localeCompare(left.appliedOn || left.createdAt))
}

/** A company's info is still empty: only a name. */
export function isBlankCompany(company: Company): boolean {
  return (
    !company.website && !company.logo && !company.about && !company.mission && !company.vision &&
    company.values.length === 0 && company.notes.length === 0 && Object.keys(company.extra ?? {}).length === 0
  )
}

/** The website's host, e.g. `globex.com`, or '' when there is no usable website. */
export function websiteHost(website: string): string {
  const value = website.trim()
  if (!value) return ''
  try {
    return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** `https://…` link for a website typed without a scheme. */
export function websiteUrl(website: string): string {
  const host = websiteHost(website)
  if (!host) return ''
  return /^https?:\/\//i.test(website.trim()) ? website.trim() : `https://${website.trim()}`
}

/** Images to try for the logo, best first: the one saved, then the website's icon. */
export function logoSources(company: Pick<Company, 'logo' | 'website'>): string[] {
  const sources: string[] = []
  if (/^https?:\/\//i.test(company.logo.trim())) sources.push(company.logo.trim())
  const host = websiteHost(company.website)
  if (host) sources.push(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`)
  return sources
}

/** Up to two letters for a logo placeholder: "Globex Corp" → "GC", "acme" → "A". */
export function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean)
  return words.slice(0, 2).map((word) => word.charAt(0).toUpperCase()).join('') || '?'
}

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------

/** What company edits touch: the companies, and the applications that follow a rename. */
type CompanyData = Pick<ResumeDocument, 'companies' | 'applications'>

export type CompanyInput = {
  /** The company to change; when missing it is found by `name`, or created. */
  id?: string
  name?: string
  website?: string
  logo?: string
  about?: string
  mission?: string
  vision?: string
  values?: string[]
  /** Merged into the current extra data; a key set to null is removed. */
  extra?: Extra
}

/**
 * Creates a company or changes the fields given. Renaming it renames the applications that
 * belonged to it, so they stay together (unless the new name is only a variant of the old one).
 */
export function saveCompany<D extends CompanyData>(document: D, input: CompanyInput): { document: D; companyId: string; created: boolean } {
  const existing = input.id ? document.companies.find((company) => company.id === input.id) : input.name ? findCompany(document.companies, input.name) : undefined
  if (input.id && !existing) throw new Error(`No existe la empresa ${input.id}.`)
  const name = input.name?.trim()
  if (!existing && !name) throw new Error('Falta el nombre de la empresa.')

  const base: Company = existing ?? { id: crypto.randomUUID(), name: name ?? '', website: '', logo: '', about: '', mission: '', vision: '', values: [], notes: [] }
  const extra = input.extra ? mergeExtra(base.extra, input.extra) : base.extra
  const { extra: _extra, ...rest } = base
  const company: Company = withExtra(
    {
      ...rest,
      ...(name ? { name } : {}),
      ...(input.website !== undefined ? { website: input.website.trim() } : {}),
      ...(input.logo !== undefined ? { logo: input.logo.trim() } : {}),
      ...(input.about !== undefined ? { about: input.about.trim() } : {}),
      ...(input.mission !== undefined ? { mission: input.mission.trim() } : {}),
      ...(input.vision !== undefined ? { vision: input.vision.trim() } : {}),
      ...(input.values !== undefined ? { values: cleanValues(input.values) } : {}),
    },
    extra,
  )

  const oldKey = companyKey(base.name)
  const newKey = companyKey(company.name)
  if (existing && newKey !== oldKey) {
    const clash = document.companies.find((item) => item.id !== company.id && companyKey(item.name) === newKey)
    if (clash) throw new Error(`Ya existe la empresa ${clash.name}: usá esa o elegí otro nombre.`)
  }
  const applications =
    existing && newKey !== oldKey
      ? document.applications.map((application) =>
          companyKey(application.company) === oldKey ? { ...application, company: company.name } : application,
        )
      : document.applications
  const companies = existing ? document.companies.map((item) => (item.id === company.id ? company : item)) : [...document.companies, company]
  return { document: { ...document, companies, applications }, companyId: company.id, created: !existing }
}

/** Removes a company's info and notes. Its applications stay, with the company name. */
export function deleteCompany<D extends CompanyData>(document: D, companyId: string): D {
  return { ...document, companies: document.companies.filter((company) => company.id !== companyId) }
}

export type CompanyNoteInput = {
  /** The note to change; a new one is added when missing. */
  id?: string
  kind?: CompanyNoteKind
  date?: string
  text?: string
  source?: string
  extra?: Extra
}

/**
 * Adds something learned about a company, or changes a note (only the fields given change). The
 * company is found by id or name, and created (with that name) when there is none yet.
 */
export function saveCompanyNote<D extends CompanyData>(
  document: D,
  company: string,
  input: CompanyNoteInput,
  now: Date = new Date(),
): { document: D; companyId: string; noteId: string } {
  let next = document
  let target = findCompany(document.companies, company)
  if (!target) {
    const created = saveCompany(document, { name: company })
    next = created.document
    target = next.companies.find((item) => item.id === created.companyId)!
  }
  const existing = input.id ? target.notes.find((note) => note.id === input.id) : undefined
  if (input.id && !existing) throw new Error(`No existe la nota ${input.id} en ${target.name}.`)
  if (!existing && !input.text?.trim()) throw new Error('La nota necesita un texto.')
  const date = input.date === undefined ? existing?.date ?? '' : readNoteDate(input.date)
  if (input.date !== undefined && input.date.trim() && !date) throw new Error(`Fecha inválida "${input.date}": usá YYYY-MM-DD, YYYY-MM o YYYY.`)
  const base: CompanyNote = existing ?? { id: crypto.randomUUID(), kind: 'news', date: '', text: '', source: '', addedAt: now.toISOString() }
  const note: CompanyNote = withExtra(
    {
      id: base.id,
      kind: input.kind?.trim() || base.kind,
      date,
      text: input.text === undefined ? base.text : input.text.trim(),
      source: input.source === undefined ? base.source : input.source.trim(),
      addedAt: base.addedAt,
    },
    input.extra ? mergeExtra(base.extra, input.extra) : base.extra,
  )
  const notes = sortNotes([...target.notes.filter((item) => item.id !== note.id), note])
  const updated = { ...target, notes }
  return {
    document: { ...next, companies: next.companies.map((item) => (item.id === updated.id ? updated : item)) },
    companyId: updated.id,
    noteId: note.id,
  }
}

export function deleteCompanyNote<D extends CompanyData>(document: D, companyId: string, noteId: string): D {
  return {
    ...document,
    companies: document.companies.map((company) =>
      company.id === companyId ? { ...company, notes: company.notes.filter((note) => note.id !== noteId) } : company,
    ),
  }
}

/** Newest first: by when it happened (undated last), then by when it was written down. */
export function sortNotes(notes: CompanyNote[]): CompanyNote[] {
  return [...notes].sort(
    (left, right) =>
      (right.date ? 1 : 0) - (left.date ? 1 : 0) ||
      right.date.localeCompare(left.date) ||
      right.addedAt.localeCompare(left.addedAt) ||
      left.id.localeCompare(right.id),
  )
}

function mergeExtra(current: Extra | undefined, patch: Extra): Extra | undefined {
  const merged: Extra = { ...(current ?? {}) }
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined || value === '') delete merged[key]
    else merged[key] = value
  }
  return Object.keys(merged).length > 0 ? merged : undefined
}

function cleanValues(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  const seen = new Set<string>()
  return values.flatMap((value) => {
    const text = typeof value === 'string' ? value.trim() : ''
    if (!text || seen.has(text.toLowerCase())) return []
    seen.add(text.toLowerCase())
    return [text]
  })
}

/** `yyyy-mm-dd`, `yyyy-mm` or `yyyy`; anything else is ''. */
export function readNoteDate(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : ''
  return /^\d{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$/.test(text) ? text : ''
}

// ---------------------------------------------------------------------------
// Parsing stored data (defensive: tolerate missing or malformed fields)
// ---------------------------------------------------------------------------

const companyKeys = ['id', 'name', 'website', 'logo', 'about', 'mission', 'vision', 'values', 'notes']
const noteKeys = ['id', 'kind', 'date', 'text', 'source', 'addedAt']

export function readCompanies(value: unknown): Company[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const seenNotes = new Set<string>()
  return value.flatMap((entry): Company[] => {
    if (!isRecord(entry) || typeof entry.id !== 'string' || !entry.id || seen.has(entry.id)) return []
    seen.add(entry.id)
    const notes = (Array.isArray(entry.notes) ? entry.notes : []).flatMap((note): CompanyNote[] => {
      if (!isRecord(note) || typeof note.id !== 'string' || !note.id || seenNotes.has(note.id)) return []
      seenNotes.add(note.id)
      return [
        withExtra(
          {
            id: note.id,
            kind: readString(note.kind).trim() || 'news',
            date: readNoteDate(note.date),
            text: readString(note.text),
            source: readString(note.source),
            addedAt: readString(note.addedAt),
          },
          readExtra(note, noteKeys),
        ),
      ]
    })
    return [
      withExtra(
        {
          id: entry.id,
          name: readString(entry.name),
          website: readString(entry.website),
          logo: readString(entry.logo),
          about: readString(entry.about),
          mission: readString(entry.mission),
          vision: readString(entry.vision),
          values: cleanValues(entry.values),
          notes: sortNotes(notes),
        },
        readExtra(entry, companyKeys),
      ),
    ]
  })
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
