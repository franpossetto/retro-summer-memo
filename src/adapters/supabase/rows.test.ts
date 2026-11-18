import { describe, expect, it } from 'vitest'
import { createApplication } from '../../domain/applications'
import { sampleDocument, settled } from '../../test/sample'
import { canonical, diffTables, fromTables, mergeTables, normalizeRows, tablesEqual, toTables } from './rows'

describe('document ↔ rows', () => {
  it('round-trips the whole document', () => {
    const document = sampleDocument()
    expect(settled(fromTables(toTables(document)))).toEqual(settled(document))
  })

  it('does not store canvas-only state', () => {
    const document = sampleDocument()
    const selected = { ...document, nodes: document.nodes.map((node) => ({ ...node, selected: true })) }
    expect(tablesEqual(toTables(selected), toTables(document))).toBe(true)
  })

  it('keeps the open CV and its canvas selection when the graph did not change', () => {
    const document = sampleDocument()
    const local = {
      ...document,
      activeCvId: 'cv-2',
      nodes: document.cvs[1].nodes.map((node) => ({ ...node, selected: true })),
      edges: document.cvs[1].edges,
    }
    const rebuilt = fromTables(toTables(local), local)
    expect(rebuilt.activeCvId).toBe('cv-2')
    expect(rebuilt.nodes).toBe(local.nodes)
  })

  it('normalizes timestamps the way toTables writes them', () => {
    const [row] = normalizeRows('applications', [{ id: 'a', created_at: '2026-03-01T10:00:00+00:00', updated_at: null }])
    expect(row).toEqual({ id: 'a', created_at: '2026-03-01T10:00:00.000Z', updated_at: null })
  })
})

describe('diffTables', () => {
  it('writes nothing when nothing changed', () => {
    const document = sampleDocument()
    expect(diffTables(toTables(document), toTables(structuredClone(document)))).toEqual([])
  })

  it('writes only the rows that changed', () => {
    const document = sampleDocument()
    const renamed = { ...document, cvs: document.cvs.map((cv) => (cv.id === 'cv-2' ? { ...cv, title: 'Platform CV' } : cv)) }
    const ops = diffTables(toTables(document), toTables(renamed))
    expect(ops).toHaveLength(1)
    expect(ops[0].table).toBe('cvs')
    expect(ops[0].upserts.map((row) => [row.id, row.title])).toEqual([['cv-2', 'Platform CV']])
    expect(ops[0].deletes).toEqual([])
  })

  it('deletes an application together with its history', () => {
    const document = sampleDocument()
    const [acme] = document.applications
    const ops = diffTables(toTables(document), toTables({ ...document, applications: [acme] }))
    const deleted = Object.fromEntries(ops.map((op) => [op.table, op.deletes.length]))
    expect(deleted).toEqual({ applications: 1, application_events: 1 })
  })
})

describe('mergeTables', () => {
  it('keeps local edits and takes remote additions', () => {
    const base = sampleDocument()
    const local = { ...base, profile: { ...base.profile, name: 'Edited locally' } }
    const added = createApplication({ company: 'Initech', title: 'SRE' }, base.applicationStatuses, new Date('2026-06-01T00:00:00.000Z'))
    const remote = { ...base, applications: [...base.applications, added] }

    const merged = fromTables(mergeTables(toTables(base), toTables(local), toTables(remote)), local)
    expect(merged.profile.name).toBe('Edited locally')
    expect(merged.applications.map((application) => application.company)).toEqual(['Acme', 'Globex', 'Initech'])
  })

  it('applies remote deletions unless the row was edited locally', () => {
    const base = sampleDocument()
    const [acme, globex] = base.applications
    const remote = { ...base, applications: [] }

    const untouched = fromTables(mergeTables(toTables(base), toTables(base), toTables(remote)), base)
    expect(untouched.applications).toEqual([])

    const edited = { ...base, applications: [acme, { ...globex, title: 'Staff Frontend Dev' }] }
    const kept = fromTables(mergeTables(toTables(base), toTables(edited), toTables(remote)), edited)
    expect(kept.applications.map((application) => application.title)).toEqual(['Staff Frontend Dev'])
  })
})

describe('canonical', () => {
  it('ignores key order and undefined values', () => {
    expect(canonical({ b: 1, a: { d: undefined, c: [2, { y: 1, x: 0 }] } })).toBe(canonical({ a: { c: [2, { x: 0, y: 1 }] }, b: 1 }))
  })
})
