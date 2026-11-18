import { describe, expect, it } from 'vitest'
import { defaultApplicationStatuses } from './applications'
import { createSeedDocument } from './model'
import { parseDocument } from './parse'

describe('parseDocument', () => {
  it('keeps an empty CV list empty (deleting the last CV must stick)', () => {
    const stored = JSON.parse(JSON.stringify({ ...createSeedDocument(), cvs: [], activeCvId: '' }))
    const document = parseDocument(stored)
    expect(document.cvs).toEqual([])
    expect(document.activeCvId).toBe('')
  })

  it('upgrades documents from before multiple CVs into a single CV', () => {
    const { cvs: _cvs, activeCvId: _active, ...legacy } = JSON.parse(JSON.stringify(createSeedDocument()))
    const document = parseDocument(legacy)
    expect(document.cvs).toHaveLength(1)
    expect(document.activeCvId).toBe(document.cvs[0].id)
  })

  it('remembers the skills format', () => {
    const seed = createSeedDocument()
    const stored = JSON.parse(JSON.stringify({ ...seed, cvs: [{ ...seed.cvs[0], skillsFormat: 'comma' }] }))
    expect(parseDocument(stored).cvs[0].skillsFormat).toBe('comma')
  })

  it('gives documents without a tracker the default pipeline', () => {
    const { applications: _a, applicationStatuses: _s, ...older } = JSON.parse(JSON.stringify(createSeedDocument()))
    const document = parseDocument(older)
    expect(document.applications).toEqual([])
    expect(document.applicationStatuses).toEqual(defaultApplicationStatuses())
  })
})
