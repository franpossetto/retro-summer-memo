import { describe, expect, it } from 'vitest'
import {
  deleteEntry,
  deleteExperiences,
  deleteSection,
  findSection,
  importCareer,
  saveEntry,
  saveExperience,
  saveSection,
  sectionsView,
  setLevels,
  updateProfileInfo,
} from './content'
import { buildCv } from './cvBuilder'
import { createEmptyDocument, type ResumeDocument } from './model'

/** An empty account filled the way an assistant would: entries first, then experiences linked to them. */
function filled() {
  let document: ResumeDocument = updateProfileInfo(createEmptyDocument(), {
    name: 'Guido Faranna',
    fields: [
      { label: 'email', value: 'guido@example.com' },
      { label: 'Website', value: 'https://weball.app' },
    ],
  })
  const ids: Record<string, string> = {}
  const add = (key: string, section: string, entry: Parameters<typeof saveEntry>[2]) => {
    const result = saveEntry(document, section, entry)
    document = result.document
    ids[key] = result.entryId
  }
  add('s64', 'experience', { title: 'Tech Lead', subtitle: 'S64 Capital', location: 'Madrid', start: '2025', end: 'Actualidad' })
  add('joy', 'experience', { title: 'Senior Software Engineer', subtitle: 'Joy', start: '2022', end: '2024' })
  add('joyLead', 'experience', { title: 'Technical Lead', subtitle: 'JOY', start: '2023', end: '2024' })
  add('itba', 'education', { title: 'Ingeniería en Sistemas (cursada)', subtitle: 'ITBA', start: '2012', end: '2016' })
  add('weball', 'Proyectos', { title: 'Weball', subtitle: 'Founder & Software Architect', start: '2024', end: 'Actualidad', url: 'https://weball.app' })
  add('aws', 'Certificaciones', { title: 'AWS Solutions Architect', subtitle: 'Amazon', end: '2024' })
  const experience = (key: string, text: string, entry: string, skills: string[] = []) => {
    const result = saveExperience(document, { text, entryId: ids[entry], skills, level: 2 })
    document = result.document
    ids[key] = result.experienceId
  }
  experience('latency', 'Reduje la latencia de órdenes un 40%', 's64', ['Node.js', 'Redis'])
  experience('team', 'Lideré un equipo de 6 ingenieros', 'joyLead', ['Leadership'])
  experience('leagues', 'Plataforma usada por 300 ligas', 'weball', ['React'])
  const loose = saveExperience(document, { text: 'Mentoría a juniors' })
  document = loose.document
  ids.loose = loose.experienceId
  return { document, ids }
}

describe('sections and entries', () => {
  it('shows every section with the same shape, whatever stores it', () => {
    const { document, ids } = filled()
    const view = sectionsView(document)
    const experience = view.find((section) => section.id === 'experience')!
    expect(experience).toMatchObject({ source: 'profile' })
    expect(experience.entries.map((entry) => [entry.title, entry.subtitle])).toEqual([
      ['Tech Lead', 'S64 Capital'],
      ['Senior Software Engineer', 'Joy'],
      ['Technical Lead', 'Joy'],
    ])
    expect(view.find((section) => section.id === 'education')?.entries[0]).toMatchObject({ id: ids.itba, title: 'Ingeniería en Sistemas (cursada)', subtitle: 'ITBA' })
    expect(view.find((section) => section.name === 'Certificaciones')).toMatchObject({ source: 'section', builtIn: false, entries: [{ title: 'AWS Solutions Architect' }] })
    expect(view.find((section) => section.id === 'personal')).toMatchObject({ source: 'none', entries: [] })
  })

  it('groups roles by company and keeps their place when edited', () => {
    const { document, ids } = filled()
    // "JOY" joined the existing "Joy" job (same company, any case).
    expect(document.profile.jobs.map((job) => [job.company, job.roles.length])).toEqual([
      ['S64 Capital', 1],
      ['Joy', 2],
    ])
    const renamed = saveEntry(document, 'experience', { id: ids.joy, title: 'Senior SWE' }).document
    expect(renamed.profile.jobs[1].roles.map((role) => role.title)).toEqual(['Senior SWE', 'Technical Lead'])
    // A job with a single role is renamed when its company changes.
    const company = saveEntry(document, 'experience', { id: ids.s64, subtitle: 'S64' }).document
    expect(company.profile.jobs[0]).toMatchObject({ id: document.profile.jobs[0].id, company: 'S64', roles: [{ id: ids.s64 }] })
  })

  it('creates sections on the fly and deletes entries, unlinking their experiences', () => {
    const { document, ids } = filled()
    // "Proyectos" found the built-in projects section instead of creating another one.
    expect(findSection(document, 'Proyectos')?.id).toBe('projects')
    expect(document.sections.filter((section) => !section.builtIn).map((section) => section.name)).toEqual(['Certificaciones'])
    const withoutRole = deleteEntry(document, 'experience', ids.s64)
    expect(withoutRole.profile.jobs.map((job) => job.company)).toEqual(['Joy'])
    expect(withoutRole.bank.find((item) => item.id === ids.latency)?.entryId).toBeUndefined()

    expect(() => deleteSection(document, 'education')).toThrow(/se desactiva/)
    const certifications = document.sections.find((section) => section.name === 'Certificaciones')!
    expect(deleteSection(document, certifications.id).sections.some((section) => section.id === certifications.id)).toBe(false)
    const renamed = saveSection(document, { id: 'experience', name: 'Experiencia laboral' }).document
    expect(renamed.sections.find((section) => section.id === 'experience')?.name).toBe('Experiencia laboral')
  })
})

describe('experiences', () => {
  it('links to entries that exist, sets levels, and deletes', () => {
    const { document, ids } = filled()
    expect(() => saveExperience(document, { text: 'X', entryId: 'nope' })).toThrow(/No existe la entrada/)
    const unlinked = saveExperience(document, { id: ids.latency, entryId: '' }).document
    expect(unlinked.bank.find((item) => item.id === ids.latency)).not.toHaveProperty('entryId')
    expect(document.knowledge).toContainEqual({ id: ids.latency, level: 2 })
    expect(setLevels(document, [{ id: ids.latency, level: null }]).knowledge.some((answer) => answer.id === ids.latency)).toBe(false)
    const deleted = deleteExperiences(document, [ids.latency, ids.team])
    expect(deleted.bank).toHaveLength(2)
    expect(deleted.knowledge.some((answer) => answer.id === ids.latency)).toBe(false)
  })

  it('updates contact fields by label and guesses their kind', () => {
    const { document } = filled()
    const next = updateProfileInfo(document, { fields: [{ label: 'EMAIL', value: 'g@x.io' }, { label: 'Teléfono', value: '+34 600 000 000' }], removeFields: ['website'] })
    expect(next.profile.fields.find((field) => field.label.toLowerCase() === 'email')?.value).toBe('g@x.io')
    expect(next.profile.fields.find((field) => field.label === 'Teléfono')?.kind).toBe('phone')
    expect(next.profile.fields.some((field) => field.label === 'Website')).toBe(false)
  })
})

describe('buildCv', () => {
  it('builds a CV from a selection: roles in order with their experiences, education, other sections', () => {
    const { document, ids } = filled()
    const { document: built, cvId, outline } = buildCv(document, {
      title: 'Tech Lead CV',
      position: 'Tech Lead',
      experienceIds: [ids.team, ids.latency, ids.leagues, ids.loose],
    })
    expect(outline.roles).toEqual([
      { title: 'Tech Lead', company: 'S64 Capital', dates: '2025 – Actualidad', experiences: 1 },
      { title: 'Senior Software Engineer', company: 'Joy', dates: '2022 – 2024', experiences: 0 },
      { title: 'Technical Lead', company: 'Joy', dates: '2023 – 2024', experiences: 1 },
    ])
    expect(outline.education).toBe(1)
    expect(outline.sections).toEqual([{ name: 'Personal projects', entries: 1 }])
    expect(outline.unplaced).toEqual([{ id: ids.loose, text: 'Mentoría a juniors' }])

    const cv = built.cvs.find((item) => item.id === cvId)!
    expect(built.activeCvId).toBe(cvId)
    expect(cv.enabledSections).toEqual(['personal', 'experience', 'education', 'skills', 'projects'])
    const snapshot = cv.versions.at(-1)!.snapshot
    // Skills of experiences in other sections (the project's React) reach the Skills section, listed or grouped.
    expect(snapshot.skills).toContain('React')
    expect(snapshot.skillGroups.flatMap((group) => group.skills)).toContain('React')
    expect(cv.skillsFormat).toBe('comma')
    const block = snapshot.blocks![0]
    expect(block.entries[0]).toMatchObject({ title: 'Weball', subtitle: 'Founder & Software Architect', dates: '2024 – Actualidad', bullets: ['Plataforma usada por 300 ligas'] })
  })

  it('shows sections asked for even without experiences, and rebuilds an existing CV', () => {
    const { document, ids } = filled()
    const first = buildCv(document, { title: 'A', experienceIds: [ids.latency], sectionIds: ['Certificaciones'], includeEducation: false })
    expect(first.outline.sections).toEqual([{ name: 'Certificaciones', entries: 1 }])
    expect(first.outline.education).toBe(0)

    const again = buildCv(first.document, { cvId: first.cvId, experienceIds: [ids.latency, ids.team], entryIds: [ids.s64, ids.joyLead] })
    expect(again.cvId).toBe(first.cvId)
    expect(again.outline.roles.map((role) => role.title)).toEqual(['Tech Lead', 'Technical Lead'])
    expect(again.document.cvs.find((cv) => cv.id === first.cvId)?.versions).toHaveLength(2)
  })
})

describe('importCareer', () => {
  const oldCv = {
    profile: { name: 'Guido Faranna', fields: [{ label: 'Email', value: 'guido@example.com' }, { label: 'LinkedIn', value: 'https://linkedin.com/in/guido' }] },
    entries: [
      {
        section: 'experience',
        title: 'Tech Lead',
        subtitle: 'Weball',
        start: '2022',
        end: 'Actualidad',
        experiences: [{ text: 'Reduje un 40% la latencia de órdenes con Redis', skills: ['Redis'] }, { text: 'Lideré un equipo de 6' }],
      },
      { section: 'Estudios', title: 'Ingeniería en Sistemas', subtitle: 'UTN', experiences: [] },
      { section: 'Certificaciones', title: 'AWS Solutions Architect', subtitle: 'Amazon' },
    ],
  }

  it('loads a whole old CV in one go: profile, roles, studies, new sections and achievements linked to them', () => {
    const { document, report } = importCareer(createEmptyDocument(), oldCv)
    expect(report.profile).toBe(true)
    expect(document.profile.name).toBe('Guido Faranna')
    expect(report.entries.map((entry) => [entry.section, entry.title, entry.created])).toEqual([
      ['experience', 'Tech Lead', true],
      ['education', 'Ingeniería en Sistemas', true],
      [expect.any(String), 'AWS Solutions Architect', true],
    ])
    const role = report.entries[0].entryId
    expect(document.bank.filter((item) => item.entryId === role).map((item) => item.text)).toEqual(['Reduje un 40% la latencia de órdenes con Redis', 'Lideré un equipo de 6'])
    expect(sectionsView(document).find((section) => section.name === 'Certificaciones')?.entries).toHaveLength(1)
  })

  it('merges a second CV instead of duplicating, and blank fields never erase data', () => {
    const first = importCareer(createEmptyDocument(), oldCv).document
    const { document, report } = importCareer(first, {
      entries: [
        {
          section: 'Experiencia',
          title: 'tech lead',
          subtitle: 'WEBALL',
          start: '',
          location: 'Buenos Aires',
          experiences: [{ text: 'Reduje un 40% la latencia de órdenes con Redis.' }, { text: 'Migré la app a React Native (iOS y Android)' }],
        },
      ],
    })
    expect(report.entries[0]).toMatchObject({ section: 'experience', created: false })
    const roles = sectionsView(document).find((section) => section.id === 'experience')!.entries
    expect(roles).toHaveLength(1)
    expect(roles[0]).toMatchObject({ start: '2022', end: 'Actualidad', location: 'Buenos Aires' })
    expect(report.skipped).toEqual(['Reduje un 40% la latencia de órdenes con Redis.'])
    expect(report.experiences.map((item) => item.text)).toEqual(['Migré la app a React Native (iOS y Android)'])
  })

  it('adds achievements to entries that already exist, and refuses unknown ones', () => {
    const { document, report } = importCareer(createEmptyDocument(), oldCv)
    const role = report.entries[0].entryId
    const more = importCareer(document, { experiences: [{ entryId: role, text: 'Armé el pipeline de CI/CD en GitHub Actions' }] })
    expect(more.document.bank.at(-1)).toMatchObject({ entryId: role, text: 'Armé el pipeline de CI/CD en GitHub Actions' })
    expect(() => importCareer(document, { experiences: [{ entryId: 'nope', text: 'x' }] })).toThrow(/nope/)
  })
})
