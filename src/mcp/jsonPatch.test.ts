import { describe, expect, it } from 'vitest'
import { applyPatch, PatchError } from './jsonPatch'

const doc = () => ({
  name: 'Ada',
  jobs: [
    { id: 'a', company: 'Acme', roles: [{ id: 'r1', title: 'Dev' }] },
    { id: 'b', company: 'Globex', roles: [] as { id: string; title: string }[] },
  ],
  'odd/key': 1,
})

describe('applyPatch', () => {
  it('adds, replaces and removes without touching the input', () => {
    const input = doc()
    const output = applyPatch(input, [
      { op: 'replace', path: '/name', value: 'Ada Lovelace' },
      { op: 'add', path: '/jobs/-', value: { id: 'c', company: 'Initech', roles: [] } },
      { op: 'add', path: '/jobs/0', value: { id: 'z', company: 'First', roles: [] } },
      { op: 'remove', path: '/jobs/2' },
      { op: 'add', path: '/headline', value: 'Engineer' },
    ])
    expect(output.name).toBe('Ada Lovelace')
    expect(output.jobs.map((job) => job.id)).toEqual(['z', 'a', 'c'])
    expect((output as Record<string, unknown>).headline).toBe('Engineer')
    expect(input.name).toBe('Ada')
    expect(input.jobs).toHaveLength(2)
  })

  it('addresses array elements by id', () => {
    const output = applyPatch(doc(), [
      { op: 'replace', path: '/jobs/[id=b]/company', value: 'Globex Corp' },
      { op: 'add', path: '/jobs/[id=b]/roles/-', value: { id: 'r2', title: 'Lead' } },
      { op: 'remove', path: '/jobs/[id=a]/roles/[id=r1]' },
    ])
    expect(output.jobs[1]).toEqual({ id: 'b', company: 'Globex Corp', roles: [{ id: 'r2', title: 'Lead' }] })
    expect(output.jobs[0].roles).toEqual([])
  })

  it('moves, copies and tests', () => {
    const output = applyPatch(doc(), [
      { op: 'test', path: '/jobs/[id=a]/company', value: 'Acme' },
      { op: 'copy', from: '/jobs/[id=a]/roles/0', path: '/jobs/[id=b]/roles/-' },
      { op: 'move', from: '/jobs/1', path: '/jobs/0' },
    ])
    expect(output.jobs.map((job) => job.id)).toEqual(['b', 'a'])
    expect(output.jobs[0].roles).toEqual([{ id: 'r1', title: 'Dev' }])
  })

  it('unescapes ~1 and ~0 in pointers', () => {
    expect(applyPatch(doc(), [{ op: 'replace', path: '/odd~1key', value: 2 }])['odd/key']).toBe(2)
  })

  it('fails with the operation that broke, and applies nothing', () => {
    const input = doc()
    expect(() =>
      applyPatch(input, [
        { op: 'replace', path: '/name', value: 'X' },
        { op: 'replace', path: '/jobs/[id=missing]/company', value: 'Y' },
      ]),
    ).toThrow(new PatchError('Operation 2 (replace /jobs/[id=missing]/company): no element with id "missing"'))
    expect(() => applyPatch(input, [{ op: 'replace', path: '/nope', value: 1 }])).toThrow(/does not exist/)
    expect(() => applyPatch(input, [{ op: 'remove', path: '/jobs/5' }])).toThrow(/out of range/)
    expect(() => applyPatch(input, [{ op: 'test', path: '/name', value: 'Grace' }])).toThrow(/test failed/)
    expect(input.name).toBe('Ada')
  })
})
