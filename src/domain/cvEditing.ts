/**
 * Editing a CV as a document (roles, their achievements, sections) instead of as a graph. The CV
 * is still its graph underneath (what build_cv and the canvas use); these functions change it the
 * way the canvas would and keep it tidy. Pure functions only.
 */
import {
  arrangeNodes,
  isBulletNode,
  isEducationNode,
  isPersonNode,
  isRoleNode,
  isSectionNode,
  type BulletData,
  type BulletNode,
  type EducationNode,
  type PersonNode,
  type ResumeEdge,
  type ResumeNode,
  type RoleData,
  type ResumeDocument,
  type RoleNode,
  type SectionNode,
  PROFILE_SECTIONS,
} from './model'

export type CvGraph = { nodes: ResumeNode[]; edges: ResumeEdge[] }

export type OutlineRole = { node: RoleNode; bullets: BulletNode[] }

export type CvOutline = {
  person?: PersonNode
  /** In CV order, each with its achievements in order (hidden ones included). */
  roles: OutlineRole[]
  /** Achievements on the graph that belong to no role: they do not print. */
  loose: BulletNode[]
  education?: EducationNode
  /** Other sections (projects, certifications…), in CV order. */
  sections: SectionNode[]
}

function byPosition(left: { id: string; position: { x: number; y: number } }, right: { id: string; position: { x: number; y: number } }) {
  return left.position.y - right.position.y || left.position.x - right.position.x || left.id.localeCompare(right.id)
}

/** The CV's content in reading order, as the editor lists it. */
export function cvOutline({ nodes, edges }: CvGraph): CvOutline {
  const bulletById = new Map(nodes.filter(isBulletNode).map((node) => [node.id, node]))
  const placed = new Set<string>()
  const roles = nodes
    .filter((node): node is RoleNode => isRoleNode(node) && !node.data.pending)
    .sort(byPosition)
    .map((node) => {
      const bullets: BulletNode[] = []
      for (const edge of edges) {
        if (edge.source !== node.id) continue
        const bullet = bulletById.get(edge.target)
        if (!bullet || placed.has(bullet.id)) continue
        placed.add(bullet.id)
        bullets.push(bullet)
      }
      return { node, bullets: bullets.sort(byPosition) }
    })
  return {
    person: nodes.find(isPersonNode),
    roles,
    loose: [...bulletById.values()].filter((bullet) => !placed.has(bullet.id)).sort(byPosition),
    education: nodes.find(isEducationNode),
    sections: nodes.filter(isSectionNode).sort(byPosition),
  }
}

/** Moves a role up (-1) or down (+1) in the CV, keeping its achievements. */
export function moveRole(graph: CvGraph, roleId: string, delta: -1 | 1): CvGraph {
  const order = cvOutline(graph).roles.map((role) => role.node.id)
  const index = order.indexOf(roleId)
  const target = index + delta
  if (index < 0 || target < 0 || target >= order.length) return graph
  ;[order[index], order[target]] = [order[target], order[index]]
  const rank = new Map(order.map((id, position) => [id, position]))
  // Roles take their new order; arrangeNodes then lays every role and achievement out tidily.
  const nodes = graph.nodes.map((node) => (rank.has(node.id) ? { ...node, position: { x: node.position.x, y: -100_000 + (rank.get(node.id) ?? 0) } } : node))
  return { nodes: arrangeNodes(nodes, graph.edges), edges: graph.edges }
}

/** Moves an achievement up (-1) or down (+1) within its role. */
export function moveBullet(graph: CvGraph, roleId: string, bulletId: string, delta: -1 | 1): CvGraph {
  const role = cvOutline(graph).roles.find((item) => item.node.id === roleId)
  if (!role) return graph
  const index = role.bullets.findIndex((bullet) => bullet.id === bulletId)
  const other = role.bullets[index + delta]
  if (index < 0 || !other) return graph
  const mine = role.bullets[index]
  return {
    nodes: graph.nodes.map((node) =>
      node.id === mine.id ? { ...node, position: other.position } : node.id === other.id ? { ...node, position: mine.position } : node,
    ),
    edges: graph.edges,
  }
}

/** Adds an achievement at the end of a role. */
export function addBullet(graph: CvGraph, roleId: string, data: Pick<BulletData, 'text' | 'skills'>, id: string = crypto.randomUUID()): { graph: CvGraph; bulletId: string } {
  const role = cvOutline(graph).roles.find((item) => item.node.id === roleId)
  if (!role) return { graph, bulletId: '' }
  const last = role.bullets.at(-1)?.position ?? role.node.position
  const node: BulletNode = {
    id,
    type: 'bullet',
    position: { x: last.x + (role.bullets.length === 0 ? 352 : 0), y: last.y + 1 },
    data: { text: data.text, ability: '', skills: [...data.skills] },
  }
  const edge: ResumeEdge = { id: `e-${roleId}-${id}`, source: roleId, target: id, sourceHandle: 'out', targetHandle: 'in' }
  const nodes = [...graph.nodes, node]
  const edges = [...graph.edges, edge]
  return { graph: { nodes: arrangeNodes(nodes, edges), edges }, bulletId: id }
}

/** Adds a role at the end of the experience. */
export function addRole(graph: CvGraph, data: RoleData, id: string = crypto.randomUUID()): { graph: CvGraph; roleId: string } {
  const bottom = Math.max(0, ...graph.nodes.filter(isRoleNode).map((node) => node.position.y)) + 1
  const node: RoleNode = { id, type: 'role', position: { x: 48, y: bottom }, data }
  const nodes = [...graph.nodes, node]
  return { graph: { nodes: arrangeNodes(nodes, graph.edges), edges: graph.edges }, roleId: id }
}

/** Removes a role and the achievements that only it showed. */
export function removeRole(graph: CvGraph, roleId: string): CvGraph {
  const ownBullets = new Set(
    graph.edges
      .filter((edge) => edge.source === roleId)
      .map((edge) => edge.target)
      .filter((bulletId) => !graph.edges.some((edge) => edge.target === bulletId && edge.source !== roleId)),
  )
  const removed = new Set([roleId, ...ownBullets])
  const nodes = graph.nodes.filter((node) => !removed.has(node.id))
  const edges = graph.edges.filter((edge) => !removed.has(edge.source) && !removed.has(edge.target))
  return { nodes: arrangeNodes(nodes, edges), edges }
}

/** Removes any node (an achievement…) with its connections. */
export function removeNode(graph: CvGraph, nodeId: string): CvGraph {
  return {
    nodes: graph.nodes.filter((node) => node.id !== nodeId),
    edges: graph.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
  }
}

/** The section's node, created (showing all its entries) when the CV has none yet. */
export function ensureSectionNode(graph: CvGraph, sectionId: string, id: string = crypto.randomUUID()): CvGraph {
  if (graph.nodes.some((node) => isSectionNode(node) && node.data.sectionId === sectionId)) return graph
  const bottom = Math.max(0, ...graph.nodes.map((node) => node.position.y)) + 120
  const node: SectionNode = { id, type: 'section', position: { x: 48, y: bottom }, data: { sectionId } }
  return { nodes: [...graph.nodes, node], edges: graph.edges }
}

/**
 * Shows or hides one entry of a section on this CV. `all` is every entry the section has: a
 * section node without a list shows them all, so the first exclusion lists the rest.
 */
export function toggleSectionEntry(graph: CvGraph, sectionId: string, entryId: string, all: string[]): CvGraph {
  const withNode = ensureSectionNode(graph, sectionId)
  return {
    nodes: withNode.nodes.map((node) => {
      if (!isSectionNode(node) || node.data.sectionId !== sectionId) return node
      const shown = node.data.entryIds ?? all
      const entryIds = shown.includes(entryId) ? shown.filter((id) => id !== entryId) : all.filter((id) => id === entryId || shown.includes(id))
      return { ...node, data: { ...node.data, entryIds } }
    }),
    edges: withNode.edges,
  }
}

/** Moves a body section up (-1) or down (+1) in an order of section ids. */
export function moveInOrder(order: string[], id: string, delta: -1 | 1): string[] {
  const index = order.indexOf(id)
  const target = index + delta
  if (index < 0 || target < 0 || target >= order.length) return order
  const next = [...order]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

/**
 * Shows or hides a section on the open CV. Turning one on adds what it needs to print: the
 * header (person), the education list, or the section's node (all its entries).
 */
export function toggleCvSection(document: ResumeDocument, sectionId: string): ResumeDocument {
  const cv = document.cvs.find((item) => item.id === document.activeCvId)
  if (!cv) return document
  const turningOn = !cv.enabledSections.includes(sectionId)
  let graph: CvGraph = { nodes: document.nodes, edges: document.edges }
  if (turningOn && sectionId === 'personal' && !graph.nodes.some(isPersonNode)) {
    graph = { ...graph, nodes: [...graph.nodes, { id: crypto.randomUUID(), type: 'person', position: { x: 48, y: 48 }, data: { ...document.profile } }] }
  }
  if (turningOn && sectionId === 'education' && !graph.nodes.some(isEducationNode)) {
    graph = { ...graph, nodes: [...graph.nodes, { id: crypto.randomUUID(), type: 'education', position: { x: 400, y: 48 }, data: { entries: document.profile.education.map((entry) => ({ ...entry })) } }] }
  }
  if (turningOn && !PROFILE_SECTIONS.includes(sectionId)) graph = ensureSectionNode(graph, sectionId)
  return {
    ...document,
    nodes: graph.nodes,
    edges: graph.edges,
    cvs: document.cvs.map((item) =>
      item.id === cv.id
        ? { ...item, enabledSections: turningOn ? [...item.enabledSections, sectionId] : item.enabledSections.filter((id) => id !== sectionId) }
        : item,
    ),
  }
}

/**
 * The open CV with a node for every section it shows. CVs saved before section nodes were kept
 * lost them, so their projects, certifications… stopped printing; this brings them back, each
 * showing all its entries.
 */
export function withEnabledSectionNodes(document: ResumeDocument): ResumeDocument {
  const cv = document.cvs.find((item) => item.id === document.activeCvId)
  if (!cv) return document
  let graph: CvGraph = { nodes: document.nodes, edges: document.edges }
  for (const id of cv.enabledSections) {
    if (!PROFILE_SECTIONS.includes(id) && document.sections.some((section) => section.id === id)) graph = ensureSectionNode(graph, id)
  }
  return graph.nodes === document.nodes ? document : { ...document, nodes: graph.nodes }
}
