import { describe, expect, it } from 'vitest'
import { sampleDocument } from '../test/sample'
import { createApplication, defaultApplicationStatuses } from './applications'
import {
  applicationsTo,
  companyOf,
  deleteCompany,
  deleteCompanyNote,
  findCompany,
  initials,
  isBlankCompany,
  logoSources,
  readCompanies,
  readNoteDate,
  saveCompany,
  saveCompanyNote,
  websiteHost,
} from './companies'
import { createEmptyDocument } from './model'

const now = new Date('2026-03-10T12:00:00.000Z')

describe('finding companies', () => {
  it('matches applications by name, ignoring case, accents and legal suffixes', () => {
    const document = sampleDocument()
    const acme = document.applications.find((application) => application.company === 'Acme')!
    expect(companyOf(document.companies, acme)?.id).toBe('company-acme')
    expect(findCompany(document.companies, 'ACME s.a.')?.id).toBe('company-acme')
    expect(findCompany(document.companies, 'company-initech')?.name).toBe('Initech')
    expect(findCompany(document.companies, 'Globex')).toBeUndefined()
  })

  it('lists the applications to a company, most recent first', () => {
    const statuses = defaultApplicationStatuses()
    const older = createApplication({ company: 'Globex', title: 'Frontend', appliedOn: '2025-11-02' }, statuses, now)
    const newer = createApplication({ company: 'Globex Corp', title: 'Staff' }, statuses, now)
    const other = createApplication({ company: 'Initech', title: 'Dev' }, statuses, now)
    expect(applicationsTo([older, other, newer], 'globex').map((item) => item.title)).toEqual(['Staff', 'Frontend'])
  })
})

describe('saveCompany', () => {
  it('creates a company, or finds it by name and changes only what is given', () => {
    const { document, companyId, created } = saveCompany(createEmptyDocument(), {
      name: '  Globex ',
      website: 'globex.com',
      values: ['Ownership', ' ownership', '', 'Speed'],
      extra: { industry: 'Energy' },
    })
    expect(created).toBe(true)
    expect(document.companies).toEqual([
      expect.objectContaining({ id: companyId, name: 'Globex', website: 'globex.com', values: ['Ownership', 'Speed'], extra: { industry: 'Energy' } }),
    ])

    const again = saveCompany(document, { name: 'GLOBEX', mission: 'Power everything', extra: { size: '50', industry: null } })
    expect(again.created).toBe(false)
    expect(again.companyId).toBe(companyId)
    expect(again.document.companies[0]).toMatchObject({ name: 'GLOBEX', website: 'globex.com', mission: 'Power everything', extra: { size: '50' } })
  })

  it('renames the applications of a company it renames, so they stay together', () => {
    const document = sampleDocument()
    const { document: next } = saveCompany(document, { id: 'company-acme', name: 'Acme Engines' })
    expect(next.applications.find((item) => item.id === document.applications[0].id)?.company).toBe('Acme Engines')
    expect(companyOf(next.companies, next.applications[0])?.id).toBe('company-acme')
    // A variant of the same name keeps the applications as they are.
    const variant = saveCompany(document, { id: 'company-acme', name: 'ACME S.A.' }).document
    expect(variant.applications[0].company).toBe('Acme')
  })

  it('refuses a rename onto another company and an unknown id', () => {
    const document = sampleDocument()
    expect(() => saveCompany(document, { id: 'company-acme', name: 'Initech' })).toThrow(/Ya existe la empresa Initech/)
    expect(() => saveCompany(document, { id: 'nope', name: 'X' })).toThrow(/No existe la empresa/)
    expect(() => saveCompany(document, {})).toThrow(/Falta el nombre/)
  })

  it('deletes a company and its notes, keeping the applications', () => {
    const document = sampleDocument()
    const next = deleteCompany(document, 'company-acme')
    expect(next.companies.map((company) => company.id)).toEqual(['company-initech'])
    expect(next.applications).toBe(document.applications)
  })
})

describe('company notes', () => {
  it('adds a note to a company found by name, creating the company when needed', () => {
    const { document, companyId, noteId } = saveCompanyNote(createEmptyDocument(), 'Globex', { kind: 'layoff', date: '2026-02', text: ' Cut 5% ', source: 'https://x.test' }, now)
    expect(document.companies).toHaveLength(1)
    expect(document.companies[0]).toMatchObject({ id: companyId, name: 'Globex' })
    expect(document.companies[0].notes).toEqual([
      { id: noteId, kind: 'layoff', date: '2026-02', text: 'Cut 5%', source: 'https://x.test', addedAt: now.toISOString() },
    ])
  })

  it('keeps notes newest first, undated ones last', () => {
    const notes = sampleDocument().companies[0].notes
    expect(notes.map((note) => note.id)).toEqual(['note-funding', 'note-layoff', 'note-role'])
    const { document, noteId } = saveCompanyNote(sampleDocument(), 'Acme', { kind: 'news', date: '2026-03-01', text: 'New CEO' }, now)
    expect(document.companies[0].notes[0].id).toBe(noteId)
  })

  it('changes only the fields given, and validates dates and text', () => {
    const document = sampleDocument()
    const { document: next } = saveCompanyNote(document, 'company-acme', { id: 'note-layoff', text: 'Cut 12% of staff' }, now)
    expect(next.companies[0].notes.find((note) => note.id === 'note-layoff')).toEqual({
      id: 'note-layoff',
      kind: 'layoff',
      date: '2026-01',
      text: 'Cut 12% of staff',
      source: 'https://news.example.com/acme',
      addedAt: '2026-03-02T10:00:00.000Z',
    })
    expect(() => saveCompanyNote(document, 'Acme', { text: 'x', date: 'marzo' }, now)).toThrow(/Fecha inválida/)
    expect(() => saveCompanyNote(document, 'Acme', { kind: 'news' }, now)).toThrow(/necesita un texto/)
    expect(() => saveCompanyNote(document, 'Acme', { id: 'nope', text: 'x' }, now)).toThrow(/No existe la nota/)
  })

  it('deletes a note', () => {
    const next = deleteCompanyNote(sampleDocument(), 'company-acme', 'note-role')
    expect(next.companies[0].notes.map((note) => note.id)).toEqual(['note-funding', 'note-layoff'])
  })
})

describe('helpers', () => {
  it.each([
    ['2026', '2026'],
    ['2026-03', '2026-03'],
    ['2026-03-14', '2026-03-14'],
    ['2026-13', ''],
    ['14/03/2026', ''],
    [undefined, ''],
  ])('readNoteDate(%s) → %s', (value, expected) => {
    expect(readNoteDate(value)).toBe(expected)
  })

  it('finds the logo: the saved image first, then the website icon', () => {
    expect(logoSources({ logo: '', website: '' })).toEqual([])
    expect(logoSources({ logo: 'javascript:alert(1)', website: 'https://www.globex.com/careers' })).toEqual([
      'https://www.google.com/s2/favicons?domain=globex.com&sz=128',
    ])
    expect(logoSources({ logo: 'https://cdn.test/logo.png', website: 'globex.com' })).toHaveLength(2)
    expect(websiteHost('not a host at all')).toBe('')
  })

  it('makes initials and tells blank companies apart', () => {
    expect(initials('Globex Corporation')).toBe('GC')
    expect(initials('acme')).toBe('A')
    expect(initials('')).toBe('?')
    const [acme, initech] = sampleDocument().companies
    expect(isBlankCompany(acme)).toBe(false)
    expect(isBlankCompany({ ...initech, logo: '' })).toBe(true)
  })

  it('reads stored companies defensively', () => {
    expect(readCompanies(null)).toEqual([])
    const [company] = readCompanies([
      { id: 'c1', name: 'X', values: ['a', 3], notes: [{ id: 'n1', text: 'hi', date: 'soon', stars: 4 }, { text: 'no id' }], hq: 'BA' },
      { id: 'c1', name: 'duplicate' },
    ])
    expect(company).toEqual({
      id: 'c1',
      name: 'X',
      website: '',
      logo: '',
      about: '',
      mission: '',
      vision: '',
      values: ['a'],
      notes: [{ id: 'n1', kind: 'news', date: '', text: 'hi', source: '', addedAt: '', extra: { stars: 4 } }],
      extra: { hq: 'BA' },
    })
  })
})
