import type { EducationEntry, Job, JobRole, ProfileField } from './model'

export type LinkedInImport = {
  name: string
  linkedInUrl: string
  location: string
  education: EducationEntry[]
  jobs: Job[]
}

const LINKEDIN_URL = /https?:\/\/(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9_-]+\/?/i

const SECTION_HEADERS = /^(Experience|Experiencia|Education|Educaci[oó]n|About|Acerca de|Skills|Aptitudes|Licenses? & certifications|Licencias? y certificaciones|Projects|Proyectos|Volunteer|Voluntariado|Languages|Idiomas|Interests|Intereses|Featured|Destacado|Activity|Actividad|Accomplishments|Logros)$/i

const DATE_RANGE =
  /^((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|June|July|August|September|October|November|December|Ene|Feb|Mar|Abr|May|Jun|Jul|Ago|Sep|Sept|Oct|Nov|Dic|Enero|Febrero|Marzo|Abril|Mayo|Junio|Julio|Agosto|Septiembre|Octubre|Noviembre|Diciembre|\d{4})(?:\s+\d{4})?)\s*[–—-]\s*((?:Present|Actualidad|Hoy|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|June|July|August|September|October|November|December|Ene|Feb|Mar|Abr|May|Jun|Jul|Ago|Sep|Sept|Oct|Nov|Dic|Enero|Febrero|Marzo|Abril|Mayo|Junio|Julio|Agosto|Septiembre|Octubre|Noviembre|Diciembre|\d{4})(?:\s+\d{4})?)/i

const YEAR_RANGE = /^(\d{4})\s*[–—-]\s*(\d{4}|Present|Actualidad|Hoy)$/i

const DURATION = /^\d+\s*(?:yr|yrs|year|years|año|años|mo|mos|month|months|mes|meses)(?:\s+\d+\s*(?:mo|mos|month|months|mes|meses))?$/i

const EMPLOYMENT = /^(Full-time|Part-time|Self-employed|Freelance|Contract|Internship|Apprenticeship|Seasonal|Jornada completa|Media jornada|Aut[oó]nomo|Contrato|Pr[aá]cticas|Temporal)(?:\s*[·•|].*)?$/i

const NOISE = /^(Contact info|Show more|Show less|Ver m[aá]s|Ver menos|Follow|Following|Message|Connect|Pending|·|\d+\s*(?:followers?|connections?|seguidores?|contactos?)|Page \d+ of \d+|Contacto)$/i

/**
 * Parse pasted LinkedIn profile text (copy from the page or Save to PDF → select all).
 * A bare profile URL only fills the LinkedIn link — LinkedIn blocks remote reads from the browser.
 */
export function parseLinkedInPaste(raw: string): LinkedInImport {
  const linkedInUrl = normalizeLinkedInUrl(raw.match(LINKEDIN_URL)?.[0] ?? '')
  const text = raw.replace(LINKEDIN_URL, ' ').replace(/\r\n/g, '\n').trim()
  const lines = text
    .split('\n')
    .map((line) => cleanLine(line))
    .filter((line) => line.length > 0 && !NOISE.test(line))

  if (lines.length === 0) {
    return emptyImport(linkedInUrl)
  }

  const name = guessName(lines)
  const location = guessLocation(lines, name)
  const sections = splitSections(lines)
  const jobs = parseExperience(sections.experience)
  const education = parseEducation(sections.education)

  return { name, linkedInUrl, location, education, jobs }
}

export function applyLinkedInImport(
  current: { name: string; fields: ProfileField[]; education: EducationEntry[]; jobs: Job[] },
  imported: LinkedInImport,
): { name: string; fields: ProfileField[]; education: EducationEntry[]; jobs: Job[] } {
  const fields = [...current.fields]
  if (imported.linkedInUrl) setFieldValue(fields, 'linkedin', 'LinkedIn', imported.linkedInUrl, 'link')
  if (imported.location) setFieldValue(fields, 'location', 'Location', imported.location, 'text')

  return {
    name: imported.name.trim() || current.name,
    fields,
    education: imported.education.length > 0 ? imported.education : current.education,
    jobs: imported.jobs.length > 0 ? imported.jobs : current.jobs,
  }
}

export function linkedInImportSummary(imported: LinkedInImport) {
  const parts: string[] = []
  if (imported.name) parts.push(imported.name)
  if (imported.jobs.length) parts.push(`${imported.jobs.length} compan${imported.jobs.length === 1 ? 'y' : 'ies'}`)
  if (imported.education.length) parts.push(`${imported.education.length} education`)
  if (imported.linkedInUrl && parts.length === 0) parts.push('LinkedIn link')
  return parts.join(' · ')
}

function emptyImport(linkedInUrl: string): LinkedInImport {
  return { name: '', linkedInUrl, location: '', education: [], jobs: [] }
}

function normalizeLinkedInUrl(url: string) {
  if (!url) return ''
  const trimmed = url.trim().replace(/\/+$/, '')
  return trimmed.startsWith('http') ? trimmed : `https://${trimmed}`
}

function cleanLine(line: string) {
  return line
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/^[•·▪◦]\s*/, '')
    .trim()
}

function guessName(lines: string[]) {
  for (const line of lines.slice(0, 8)) {
    if (SECTION_HEADERS.test(line)) break
    if (DATE_RANGE.test(line) || YEAR_RANGE.test(line)) continue
    if (line.includes('linkedin.com')) continue
    if (line.length < 2 || line.length > 60) continue
    if (/[@|]/.test(line)) continue
    if (/^\d/.test(line)) continue
    // Prefer "First Last" over headlines with many words
    const words = line.split(/\s+/)
    if (words.length >= 2 && words.length <= 5 && words.every((word) => /^[\p{L}'’-]+$/u.test(word))) {
      return line
    }
  }
  return ''
}

function guessLocation(lines: string[], name: string) {
  const start = name ? lines.indexOf(name) + 1 : 0
  for (const line of lines.slice(Math.max(0, start), start + 6)) {
    if (SECTION_HEADERS.test(line)) break
    if (DATE_RANGE.test(line) || YEAR_RANGE.test(line)) continue
    if (/[@]|linkedin\.com/i.test(line)) continue
    // "City, Country" / "Buenos Aires, Argentina"
    if (/^[\p{L} .'-]+,\s*[\p{L} .'-]+$/u.test(line) && line.length < 80) return line
  }
  return ''
}

function splitSections(lines: string[]) {
  const experience: string[] = []
  const education: string[] = []
  let bucket: 'none' | 'experience' | 'education' = 'none'
  for (const line of lines) {
    if (/^(Experience|Experiencia)$/i.test(line)) {
      bucket = 'experience'
      continue
    }
    if (/^(Education|Educaci[oó]n)$/i.test(line)) {
      bucket = 'education'
      continue
    }
    if (SECTION_HEADERS.test(line)) {
      bucket = 'none'
      continue
    }
    if (bucket === 'experience') experience.push(line)
    if (bucket === 'education') education.push(line)
  }
  // If LinkedIn didn't include headers (partial paste), treat whole paste as experience first.
  if (experience.length === 0 && education.length === 0) {
    return { experience: lines, education: [] as string[] }
  }
  return { experience, education }
}

function parseExperience(lines: string[]): Job[] {
  if (lines.length === 0) return []
  const jobs: Job[] = []
  let i = 0

  while (i < lines.length) {
    const companyLine = lines[i]
    if (isDateLine(companyLine) || DURATION.test(companyLine) || EMPLOYMENT.test(companyLine)) {
      i += 1
      continue
    }

    // Multi-role company block: Company, then employment/duration, then repeated Title + dates
    const next = lines[i + 1] ?? ''
    const next2 = lines[i + 2] ?? ''
    if (
      (EMPLOYMENT.test(next) || DURATION.test(next) || looksLikeCompanyMeta(next))
      && !isDateLine(companyLine)
    ) {
      const company = stripCompanySuffix(companyLine)
      i += 1
      while (i < lines.length && (EMPLOYMENT.test(lines[i]) || DURATION.test(lines[i]) || looksLikeCompanyMeta(lines[i]))) {
        i += 1
      }
      const roles: JobRole[] = []
      while (i < lines.length && !looksLikeNewCompany(lines, i)) {
        const title = lines[i]
        if (isDateLine(title) || DURATION.test(title) || EMPLOYMENT.test(title) || SECTION_HEADERS.test(title)) {
          i += 1
          continue
        }
        const dates = findDates(lines, i + 1)
        if (!dates && roles.length > 0 && !looksLikeTitle(title)) break
        roles.push({
          id: crypto.randomUUID(),
          title: cleanTitle(title),
          location: '',
          start: dates?.start ?? '',
          end: dates?.end ?? '',
        })
        i = dates ? dates.nextIndex : i + 1
        // Skip location / description until next title-ish or company
        while (i < lines.length && shouldSkipRoleTail(lines[i], lines, i)) i += 1
      }
      if (company || roles.length > 0) {
        jobs.push({
          id: crypto.randomUUID(),
          company,
          roles: roles.length > 0 ? roles : [{ id: crypto.randomUUID(), title: '', location: '', start: '', end: '' }],
        })
      }
      continue
    }

    // Single role on one line: Title · Company  or  Title at Company
    if (companyLine.includes('·') || /\sat\s/i.test(companyLine)) {
      const { title, company } = splitTitleCompany(companyLine)
      const dates = findDates(lines, i + 1)
      jobs.push({
        id: crypto.randomUUID(),
        company,
        roles: [{ id: crypto.randomUUID(), title, location: '', start: dates?.start ?? '', end: dates?.end ?? '' }],
      })
      i = dates ? dates.nextIndex : i + 1
      while (i < lines.length && shouldSkipRoleTail(lines[i], lines, i)) i += 1
      continue
    }

    // Two-line role then dates: Title/Company (web) or Company/Title (PDF)
    if (next && !isDateLine(next) && (isDateLine(next2) || YEAR_RANGE.test(next2) || DURATION.test(next2))) {
      const ordered = orderTitleCompany(companyLine, next)
      const dates = findDates(lines, i + 2)
      const last = jobs.at(-1)
      if (last && sameCompany(last.company, ordered.company)) {
        last.roles.push({
          id: crypto.randomUUID(),
          title: ordered.title,
          location: '',
          start: dates?.start ?? '',
          end: dates?.end ?? '',
        })
      } else {
        jobs.push({
          id: crypto.randomUUID(),
          company: ordered.company,
          roles: [{ id: crypto.randomUUID(), title: ordered.title, location: '', start: dates?.start ?? '', end: dates?.end ?? '' }],
        })
      }
      i = dates ? dates.nextIndex : i + 3
      while (i < lines.length && shouldSkipRoleTail(lines[i], lines, i)) i += 1
      continue
    }

    i += 1
  }

  return mergeJobsByCompany(jobs).filter((job) => job.company.trim() || job.roles.some((role) => role.title.trim()))
}

function parseEducation(lines: string[]): EducationEntry[] {
  const entries: EducationEntry[] = []
  let i = 0
  while (i < lines.length) {
    const school = lines[i]
    if (isDateLine(school) || DURATION.test(school)) {
      i += 1
      continue
    }
    let degree = ''
    let j = i + 1
    if (j < lines.length && !isDateLine(lines[j]) && !DURATION.test(lines[j])) {
      degree = lines[j]
      j += 1
    }
    const dates = findDates(lines, j)
    entries.push({
      id: crypto.randomUUID(),
      school: school.replace(/\s*[·•].*$/, '').trim(),
      degree: degree.replace(/\s*[·•].*$/, '').trim(),
      start: dates?.start ?? '',
      end: dates?.end ?? '',
    })
    i = dates ? dates.nextIndex : j
    while (i < lines.length && shouldSkipEducationTail(lines[i])) i += 1
  }
  return entries.filter((entry) => entry.school.trim() || entry.degree.trim())
}

function findDates(lines: string[], from: number): { start: string; end: string; nextIndex: number } | null {
  for (let i = from; i < Math.min(lines.length, from + 3); i += 1) {
    const line = lines[i]
    const range = line.match(DATE_RANGE) || line.match(YEAR_RANGE)
    if (range) {
      return {
        start: normalizeDate(range[1]),
        end: normalizeDate(range[2]),
        nextIndex: i + 1,
      }
    }
    // "Jan 2020 - Present · 4 yrs 2 mos"
    const clipped = line.split(/[·•]/)[0]?.trim() ?? ''
    const clippedRange = clipped.match(DATE_RANGE) || clipped.match(YEAR_RANGE)
    if (clippedRange) {
      return {
        start: normalizeDate(clippedRange[1]),
        end: normalizeDate(clippedRange[2]),
        nextIndex: i + 1,
      }
    }
  }
  return null
}

function normalizeDate(value: string) {
  const trimmed = value.trim()
  if (/^(Present|Actualidad|Hoy)$/i.test(trimmed)) return 'Present'
  return trimmed.replace(/\s+/g, ' ')
}

function isDateLine(line: string) {
  if (DATE_RANGE.test(line) || YEAR_RANGE.test(line)) return true
  const clipped = line.split(/[·•]/)[0]?.trim() ?? ''
  return DATE_RANGE.test(clipped) || YEAR_RANGE.test(clipped)
}

function looksLikeCompanyMeta(line: string) {
  return /^(Full-time|Part-time|Self-employed|Freelance|Contract|Internship|Jornada|Media jornada|Aut[oó]nomo|Contrato|Pr[aá]cticas)/i.test(line)
    || DURATION.test(line)
    || /^\d+\s*(?:yr|yrs|year|years|año|años)/i.test(line)
}

function looksLikeNewCompany(lines: string[], index: number) {
  const line = lines[index]
  const next = lines[index + 1] ?? ''
  const next2 = lines[index + 2] ?? ''
  // Multi-role company header: Company, then employment type or total duration.
  if (EMPLOYMENT.test(next) || DURATION.test(next) || looksLikeCompanyMeta(next)) return true
  // Next employer in Company / Title / dates form (not Title / dates).
  if (
    line
    && next
    && !isDateLine(line)
    && !isDateLine(next)
    && !EMPLOYMENT.test(line)
    && !DURATION.test(line)
    && isDateLine(next2)
  ) {
    return true
  }
  return false
}

function looksLikeTitle(line: string) {
  if (isDateLine(line) || EMPLOYMENT.test(line) || DURATION.test(line)) return false
  if (line.length > 90) return false
  return true
}

function shouldSkipRoleTail(line: string, lines: string[], index: number) {
  if (isDateLine(line) || DURATION.test(line) || EMPLOYMENT.test(line)) return true
  if (looksLikeNewCompany(lines, index)) return false
  // Skip location-like and long description lines after a role
  if (line.length > 100) return true
  if (/^[\p{L} .'-]+,\s*[\p{L} .'-]+$/u.test(line)) return true
  // Next line is a date → current line is likely next title; stop skipping
  if (isDateLine(lines[index + 1] ?? '')) return false
  // Heuristic: short lines that look like titles should not be skipped
  if (looksLikeTitle(line) && isDateLine(lines[index + 1] ?? '')) return false
  // After dates, LinkedIn often dumps one description paragraph — skip one short-ish block
  return line.length > 40
}

function shouldSkipEducationTail(line: string) {
  if (isDateLine(line) || DURATION.test(line)) return true
  if (line.length > 80) return true
  return /^(Grade|Activities|Calificaci[oó]n|Actividades)/i.test(line)
}

function stripCompanySuffix(line: string) {
  return line
    .replace(/\s*[·•|]\s*(Full-time|Part-time|Self-employed|Freelance|Contract|Internship|Jornada completa|Media jornada).*$/i, '')
    .trim()
}

function cleanTitle(line: string) {
  return line.replace(/\s*[·•|]\s*(Full-time|Part-time|Self-employed|Freelance|Contract|Internship).*$/i, '').trim()
}

function splitTitleCompany(line: string) {
  const at = line.match(/^(.*?)\s+at\s+(.+)$/i)
  if (at) return { title: at[1].trim(), company: at[2].trim() }
  const parts = line.split(/\s*[·•]\s*/)
  if (parts.length >= 2) return { title: parts[0].trim(), company: parts.slice(1).join(' · ').trim() }
  return { title: line.trim(), company: '' }
}

const TITLE_HINT =
  /\b(Engineer|Developer|Manager|Director|Designer|Analyst|Consultant|Intern|Internship|Lead|Head|Officer|Founder|President|Specialist|Architect|Scientist|Product|Software|Frontend|Backend|Full[- ]?Stack|Data|DevOps|SRE|QA|Recruiter|Account|Sales|Marketing|CEO|CTO|COO|CFO)\b/i

const COMPANY_HINT =
  /\b(Inc|LLC|Ltd|Corp|Corporation|Company|Companies|Labs|Laboratory|Studio|Studios|Group|Holdings|Technologies|Technology|Systems|Solutions|Partners|Agency|University|College|S\.?A\.?|S\.?R\.?L\.?)\b/i

function orderTitleCompany(first: string, second: string) {
  const a = cleanTitle(first)
  const b = stripCompanySuffix(second)
  // Web copy: Title then "Company · Full-time"
  if (/[·•]/.test(second) || EMPLOYMENT.test(second) || looksLikeCompanyMeta(second)) {
    return { title: a, company: stripCompanySuffix(second) }
  }
  const firstTitle = TITLE_HINT.test(a)
  const secondTitle = TITLE_HINT.test(b)
  const firstCompany = COMPANY_HINT.test(a)
  const secondCompany = COMPANY_HINT.test(b)
  if (firstTitle && (secondCompany || !secondTitle)) return { title: a, company: b }
  if (secondTitle && (firstCompany || !firstTitle)) return { title: b, company: a }
  // Default: PDF-style Company / Title
  return { title: b, company: a }
}

function sameCompany(a: string, b: string) {
  return a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase()
}

function mergeJobsByCompany(jobs: Job[]): Job[] {
  const result: Job[] = []
  for (const job of jobs) {
    const prev = result.at(-1)
    if (prev && sameCompany(prev.company, job.company) && prev.company.trim()) {
      prev.roles.push(...job.roles)
    } else {
      result.push(job)
    }
  }
  return result
}

function setFieldValue(
  fields: ProfileField[],
  id: string,
  label: string,
  value: string,
  kind: ProfileField['kind'],
) {
  const existing = fields.find((field) => field.id === id || field.label.toLocaleLowerCase() === label.toLocaleLowerCase())
  if (existing) {
    if (!existing.value.trim()) existing.value = value
    return
  }
  fields.push({ id, label, value, kind })
}
