import { describe, expect, it } from 'vitest'
import { sampleDocument } from '../test/sample'
import {
  addBullet,
  addRole,
  cvOutline,
  ensureSectionNode,
  moveBullet,
  moveInOrder,
  moveRole,
  removeNode,
  removeRole,
  toggleCvSection,
  toggleSectionEntry,
  withEnabledSectionNodes,
  type CvGraph,
} from './cvEditing'
import { buildResume, personalGraph, emptyProfile } from './model'

function graph(): CvGraph {
  let current: CvGraph = personalGraph({ ...emptyProfile(), name: 'Ana' })
  const lead = addRole(current, { title: 'Tech Lead', company: 'Northwind', location: '', start: '2023', end: 'Actualidad' }, 'lead')
  current = lead.graph
  const senior = addRole(current, { title: 'Senior', company: 'Northwind', location: '', start: '2021', end: '2023' }, 'senior')
  current = senior.graph
  current = addBullet(current, 'lead', { text: 'Lideré 7 personas', skills: ['Leadership'] }, 'b1').graph
  current = addBullet(current, 'lead', { text: 'Bajé 38% el costo', skills: ['AWS'] }, 'b2').graph
  current = addBullet(current, 'senior', { text: 'Diseñé la API', skills: ['REST'] }, 'b3').graph
  return current
}

const titles = (current: CvGraph) => buildResume(current.nodes, current.edges, '').roles.map((role) => [role.title, role.bullets.map((bullet) => bullet.text)])

describe('cv editing', () => {
  it('lists roles with their achievements in CV order, the same order the CV prints', () => {
    const current = graph()
    const outline = cvOutline(current)
    expect(outline.person?.data.name).toBe('Ana')
    expect(outline.roles.map((role) => [role.node.id, role.bullets.map((bullet) => bullet.id)])).toEqual([['lead', ['b1', 'b2']], ['senior', ['b3']]])
    expect(titles(current)).toEqual([['Tech Lead', ['Lideré 7 personas', 'Bajé 38% el costo']], ['Senior', ['Diseñé la API']]])
  })

  it('moves roles and achievements', () => {
    const roles = moveRole(graph(), 'senior', -1)
    expect(titles(roles)).toEqual([['Senior', ['Diseñé la API']], ['Tech Lead', ['Lideré 7 personas', 'Bajé 38% el costo']]])
    expect(moveRole(roles, 'senior', -1)).toBe(roles)
    const bullets = moveBullet(graph(), 'lead', 'b2', -1)
    expect(titles(bullets)[0]).toEqual(['Tech Lead', ['Bajé 38% el costo', 'Lideré 7 personas']])
    expect(moveBullet(bullets, 'lead', 'b1', 1)).toBe(bullets)
  })

  it('removes a role with its own achievements, and single nodes', () => {
    const withoutLead = removeRole(graph(), 'lead')
    expect(cvOutline(withoutLead).roles.map((role) => role.node.id)).toEqual(['senior'])
    expect(withoutLead.nodes.some((node) => node.id === 'b1' || node.id === 'b2')).toBe(false)
    const withoutBullet = removeNode(graph(), 'b1')
    expect(cvOutline(withoutBullet).roles[0].bullets.map((bullet) => bullet.id)).toEqual(['b2'])
    expect(withoutBullet.edges.some((edge) => edge.target === 'b1')).toBe(false)
  })

  it('shows and hides the entries of a section, creating its node when needed', () => {
    const base = graph()
    expect(ensureSectionNode(ensureSectionNode(base, 'projects', 's1'), 'projects', 's2').nodes.filter((node) => node.type === 'section')).toHaveLength(1)
    const hidden = toggleSectionEntry(base, 'projects', 'p2', ['p1', 'p2', 'p3'])
    const section = cvOutline(hidden).sections[0]
    expect(section.data).toEqual({ sectionId: 'projects', entryIds: ['p1', 'p3'] })
    const shown = toggleSectionEntry(hidden, 'projects', 'p2', ['p1', 'p2', 'p3'])
    expect(cvOutline(shown).sections[0].data.entryIds).toEqual(['p1', 'p2', 'p3'])
  })

  it('reorders section ids', () => {
    expect(moveInOrder(['experience', 'education', 'skills'], 'skills', -1)).toEqual(['experience', 'skills', 'education'])
    expect(moveInOrder(['experience'], 'experience', -1)).toEqual(['experience'])
  })

  it('turns sections on and off on the open CV, adding what they need to print', () => {
    const document = sampleDocument()
    const withEducation = toggleCvSection({ ...document, nodes: document.nodes.filter((node) => node.type !== 'education') }, 'education')
    const education = withEducation.nodes.find((node) => node.type === 'education')
    expect(education?.data).toEqual({ entries: document.profile.education })
    expect(withEducation.cvs.find((cv) => cv.id === document.activeCvId)?.enabledSections).toContain('education')
    const withoutSkills = toggleCvSection(document, 'skills')
    expect(withoutSkills.cvs.find((cv) => cv.id === document.activeCvId)?.enabledSections).not.toContain('skills')
  })

  it('brings back the nodes of enabled sections that lost them', () => {
    const document = sampleDocument()
    const enabled = { ...document, cvs: document.cvs.map((cv) => (cv.id === document.activeCvId ? { ...cv, enabledSections: [...cv.enabledSections, 'projects'] } : cv)) }
    const lost = { ...enabled, nodes: enabled.nodes.filter((node) => node.type !== 'section') }
    const repaired = withEnabledSectionNodes(lost)
    expect(repaired.nodes.filter((node) => node.type === 'section').map((node) => node.data)).toEqual([{ sectionId: 'projects' }])
    expect(withEnabledSectionNodes(repaired)).toBe(repaired)
    const blocks = buildResume(repaired.nodes, repaired.edges, '', { sections: repaired.sections, bank: repaired.bank }).blocks
    expect(blocks?.map((block) => block.id)).toEqual(['projects'])
  })
})

