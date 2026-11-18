import { createApplication, defaultApplicationStatuses, moveApplication, type ApplicationStatus } from '../domain/applications'
import {
  buildResume,
  createSeedDocument,
  type BulletNode,
  type Cv,
  type ResumeDocument,
  type ResumeEdge,
  type ResumeNode,
  type RoleNode,
} from '../domain/model'

/** A document exercising every stored shape: two CVs, versions, knowledge, applications with history. */
export function sampleDocument(): ResumeDocument {
  const seed = createSeedDocument()
  const profile = {
    ...seed.profile,
    name: 'Ada Lovelace',
    fields: seed.profile.fields.map((field) => (field.id === 'email' ? { ...field, value: 'ada@example.com' } : field)),
  }
  const person = { ...seed.nodes[0], data: profile } as ResumeNode
  const role: RoleNode = {
    id: 'role-1',
    type: 'role',
    position: { x: 48, y: 280 },
    data: { title: 'Engineer', company: 'Analytical Engines', location: 'London', start: '1842', end: '1843' },
  }
  const bullet: BulletNode = {
    id: 'bullet-1',
    type: 'bullet',
    position: { x: 400.5, y: 280.25 },
    data: { text: 'Wrote the first program', ability: '', skills: ['Algorithms'] },
  }
  const nodes: ResumeNode[] = [person, role, bullet]
  const edges: ResumeEdge[] = [{ id: 'e-role-1-bullet-1', source: 'role-1', target: 'bullet-1' }]

  const seedCv = seed.cvs[0]
  const mainCv: Cv = {
    ...seedCv,
    title: 'Main CV',
    skillsFormat: 'comma',
    enabledSections: ['personal', 'experience', 'skills'],
    nodes,
    edges,
    versions: [
      ...seedCv.versions,
      { id: 'v-1', createdAt: '2026-01-02T03:04:05.000Z', snapshot: buildResume(nodes, edges, 'Poetical science.') },
    ],
  }
  const backendCv: Cv = {
    id: 'cv-2',
    title: 'Backend CV',
    position: 'Backend Engineer',
    company: 'Acme',
    posting: 'We build engines.',
    summary: '',
    templateId: 'sidebar',
    fontId: 'sans',
    fontSize: 11,
    lineHeight: 1.5,
    marginId: 'narrow',
    pageSize: 'a4',
    enabledSections: ['personal'],
    versions: [],
    nodes: [person],
    edges: [],
  }

  const statuses: ApplicationStatus[] = [
    ...defaultApplicationStatuses(),
    { id: 'take-home', name: 'Take home', color: '#123456', kind: 'active' },
  ]
  const acme = moveApplication(
    createApplication(
      {
        company: 'Acme',
        title: 'Backend Engineer',
        url: 'https://www.linkedin.com/jobs/view/4012345678/?refId=abc',
        posting: 'We need engines.',
        attachment: { kind: 'cv', cvId: 'seed-cv', versionId: 'v-1' },
        note: 'Referral from Babbage',
      },
      statuses,
      new Date('2026-03-01T10:00:00.000Z'),
    ),
    'hr-call',
    'Call on Monday',
    new Date('2026-03-05T10:00:00.000Z'),
  )
  const globex = createApplication({ company: 'Globex', title: 'Frontend Dev' }, statuses, new Date('2026-04-01T10:00:00.000Z'))

  return {
    ...seed,
    profile,
    nodes,
    edges,
    cvs: [mainCv, backendCv],
    activeCvId: mainCv.id,
    knowledge: [
      { id: 'rest-api', level: 2 },
      { id: 'sql', level: 0 },
    ],
    applications: [acme, globex],
    applicationStatuses: statuses,
  }
}

/**
 * What a store must give back: the document as stored, ignoring UI-only state (selection) and
 * the staleness of the open CV's copy of its graph.
 */
export function settled(document: ResumeDocument): unknown {
  const nodes = (list: ResumeNode[]) => list.map(({ selected: _selected, ...node }) => node)
  const edges = (list: ResumeEdge[]) => list.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target }))
  return JSON.parse(
    JSON.stringify({
      ...document,
      knowledge: [...document.knowledge].sort((left, right) => left.id.localeCompare(right.id)),
      nodes: nodes(document.nodes),
      edges: edges(document.edges),
      cvs: document.cvs.map((cv) => {
        const live = cv.id === document.activeCvId
        return { ...cv, nodes: nodes(live ? document.nodes : cv.nodes), edges: edges(live ? document.edges : cv.edges) }
      }),
    }),
  )
}
