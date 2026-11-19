import { describe, expect, it } from 'vitest'
import { analyzeCv, gradeFor } from './cvAnalysis'
import { addBullet, addRole, type CvGraph } from './cvEditing'
import { buildResume, emptyProfile, personalGraph, type Cv } from './model'

const cv = (patch: Partial<Cv> = {}): Cv => ({
  id: 'cv',
  title: 'CV',
  position: 'Backend',
  company: 'Acme',
  posting: '',
  summary: '',
  templateId: 'classic',
  fontId: 'times',
  fontSize: 11,
  lineHeight: 1.15,
  marginId: 'normal',
  pageSize: 'a4',
  skillsFormat: 'comma',
  enabledSections: ['personal', 'experience', 'skills'],
  versions: [],
  nodes: [],
  edges: [],
  ...patch,
})

function strongGraph(): CvGraph {
  const profile = {
    ...emptyProfile(),
    name: 'Ana García',
    fields: [
      { id: 'e', label: 'Email', value: 'ana@example.com', kind: 'email' as const },
      { id: 'l', label: 'LinkedIn', value: 'linkedin.com/in/ana', kind: 'link' as const },
    ],
  }
  let graph: CvGraph = personalGraph(profile)
  graph = addRole(graph, { title: 'Tech Lead', company: 'Northwind', location: '', start: '2023', end: 'Actualidad' }, 'lead').graph
  graph = addRole(graph, { title: 'Senior', company: 'Northwind', location: '', start: '2021', end: '2023' }, 'senior').graph
  graph = addBullet(graph, 'lead', { text: 'Lideré un equipo de 7 personas con 0 incidentes críticos', skills: ['Leadership'] }, 'b1').graph
  graph = addBullet(graph, 'lead', { text: 'Reduje un 38% el costo de AWS', skills: ['AWS'] }, 'b2').graph
  graph = addBullet(graph, 'senior', { text: 'Diseñé la API de pagos que usan 120 comercios', skills: ['REST', 'Node.js'] }, 'b3').graph
  graph = addBullet(graph, 'senior', { text: 'Implementé idempotencia: 100% menos cobros duplicados', skills: ['Payments'] }, 'b4').graph
  return graph
}

const summary = 'Backend engineer con 10 años en Node.js y TypeScript, los últimos 5 en pagos de alto volumen. Lidero equipos y diseño plataformas confiables.'

describe('analyzeCv', () => {
  it('scores a strong CV high, with every check passing but the missing posting', () => {
    const graph = strongGraph()
    const snapshot = buildResume(graph.nodes, graph.edges, summary)
    const result = analyzeCv(cv(), snapshot, [])
    expect(result.checks.filter((check) => check.status !== 'pass').map((check) => check.id)).toEqual(['keywords'])
    expect(result.score).toBe(92)
    expect(result.grade).toEqual({ label: 'Excelente', tone: 'great' })
    expect(result.metrics).toMatchObject({ achievements: 4, withResults: 4, skills: 5 })
  })

  it('points at the achievements and roles to fix', () => {
    let graph = strongGraph()
    graph = addBullet(graph, 'lead', { text: 'Responsable de mantener los microservicios', skills: [] }, 'weak').graph
    const snapshot = buildResume(graph.nodes, graph.edges, '')
    const result = analyzeCv(cv({ templateId: 'sidebar', skillsFormat: 'list' }), snapshot, [])
    const byId = Object.fromEntries(result.checks.map((check) => [check.id, check]))
    expect(byId.summary.status).toBe('fail')
    expect(byId.wording).toMatchObject({ status: 'warn', refs: ['weak'] })
    expect(byId.results).toMatchObject({ status: 'pass', refs: ['weak'] })
    expect(byId.ats).toMatchObject({ status: 'warn', area: 'design' })
    expect(result.score).toBeLessThan(85)
  })

  it('compares with the posting: covered, backed by the bank, and not in the experience', () => {
    const graph = strongGraph()
    const snapshot = buildResume(graph.nodes, graph.edges, summary)
    const bank = [{ id: 'k', text: 'Kafka en producción', skills: ['Kafka'], aliases: [], category: 'Backend' }]
    const result = analyzeCv(cv({ posting: 'Buscamos Node.js, AWS, Kafka y Kubernetes.' }), snapshot, bank as never)
    expect(result.keywords).toEqual({ covered: ['Node.js', 'AWS'], backedButMissing: ['Kafka'], notInExperience: ['Kubernetes'] })
    expect(result.checks.find((check) => check.id === 'keywords')).toMatchObject({ status: 'warn', area: 'posting' })
    expect(result.metrics.keywords).toEqual({ covered: 2, total: 4 })
  })

  it('only counts what the CV shows, and uses the rendered page count when given', () => {
    const graph = strongGraph()
    const snapshot = buildResume(graph.nodes, graph.edges, summary)
    const result = analyzeCv(cv({ enabledSections: ['personal'] }), snapshot, [], { pages: 3 })
    const byId = Object.fromEntries(result.checks.map((check) => [check.id, check.status]))
    expect(byId).toMatchObject({ experience: 'fail', results: 'fail', skills: 'warn', length: 'fail' })
    expect(result.metrics.pages).toBe(3)
  })

  it('grades', () => {
    expect([90, 75, 55, 20].map((score) => gradeFor(score).tone)).toEqual(['great', 'good', 'fair', 'poor'])
  })
})
