import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import {
  Background,
  ConnectionLineType,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useNodeConnections,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
  type OnConnectEnd,
  type OnEdgesChange,
  type OnNodesChange,
  type XYPosition,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  knownSkills,
  nextPosition,
  personalRoleOptions,
  roleDataFromPersonal,
  roleHasExperience,
  type BulletData,
  type BulletNode,
  type CatalogSection,
  type EducationData,
  type EducationEntry,
  type EducationNode,
  type ExperienceSectionNode,
  type Job,
  type PersonNode,
  type PersonalRoleOption,
  type Profile,
  type ProfileField,
  type ResumeEdge,
  type ResumeNode,
  type RoleData,
  type RoleGraph,
  type RoleNode,
  type SectionNode,
  type SkillsData,
  type SkillsNode,
  type KnowledgeAnswer,
} from '../../domain/model'
import { filterExperiencesBank, type Experience } from '../../domain/experiences'
import { SourceTable } from './SourceTable'
import type { FlowNode } from '../flow'

const HideContext = createContext<(id: string) => void>(() => {})

type DockEdge = 'left' | 'right' | 'top' | 'bottom'
type GraphPanelId = 'catalog' | 'inspector' | 'skills' | 'experience'
type DockStacks = Record<DockEdge, GraphPanelId[]>
type DropTarget = { edge: DockEdge; index: number }

type PanelDragUI = {
  id: GraphPanelId
  target: DropTarget | null
}

export type GraphPanelsOpen = Record<GraphPanelId, boolean>

const graphLayoutKey = 'resume.graphLayout.v2'
const dockEdges: DockEdge[] = ['left', 'right', 'top', 'bottom']
const panelIds: GraphPanelId[] = ['catalog', 'inspector', 'skills', 'experience']
const dragThreshold = 6
const edgeProximity = 110

function emptyStacks(): DockStacks {
  return { left: [], right: [], top: [], bottom: [] }
}

function isDockEdge(value: unknown): value is DockEdge {
  return value === 'left' || value === 'right' || value === 'top' || value === 'bottom'
}

function isPanelId(value: unknown): value is GraphPanelId {
  return value === 'catalog' || value === 'inspector' || value === 'skills' || value === 'experience'
}

function normalizeStacks(stacks: DockStacks): DockStacks {
  const next = emptyStacks()
  const seen = new Set<GraphPanelId>()
  for (const edge of dockEdges) {
    for (const id of stacks[edge]) {
      if (!isPanelId(id) || seen.has(id)) continue
      seen.add(id)
      next[edge].push(id)
    }
  }
  for (const id of panelIds) {
    if (!seen.has(id)) next.left.push(id)
  }
  return next
}

export function loadGraphPanelsOpen(): GraphPanelsOpen {
  const fallback: GraphPanelsOpen = { catalog: true, inspector: true, skills: false, experience: false }
  try {
    const raw = JSON.parse(localStorage.getItem(graphLayoutKey) ?? localStorage.getItem('resume.graphLayout.v1') ?? '')
    if (!raw?.open || typeof raw.open !== 'object') return fallback
    return {
      catalog: raw.open.catalog !== false,
      inspector: raw.open.inspector !== false,
      skills: raw.open.skills === true,
      experience: raw.open.experience === true,
    }
  } catch {
    return fallback
  }
}

function loadGraphStacks(): DockStacks {
  const fallback: DockStacks = { left: ['catalog', 'skills', 'experience'], right: ['inspector'], top: [], bottom: [] }
  try {
    const raw = JSON.parse(localStorage.getItem(graphLayoutKey) ?? localStorage.getItem('resume.graphLayout.v1') ?? '')
    if (!raw || typeof raw !== 'object') return fallback
    if (raw.stacks && typeof raw.stacks === 'object') {
      const stacks = emptyStacks()
      for (const edge of dockEdges) {
        const list = raw.stacks[edge]
        stacks[edge] = Array.isArray(list) ? list.filter(isPanelId) : []
      }
      return normalizeStacks(stacks)
    }
    if (raw.dock && typeof raw.dock === 'object') {
      const stacks = emptyStacks()
      for (const id of panelIds) {
        const edge = isDockEdge(raw.dock[id]) ? raw.dock[id] : id === 'catalog' ? 'left' : 'right'
        stacks[edge].push(id)
      }
      return normalizeStacks(stacks)
    }
    return fallback
  } catch {
    return fallback
  }
}

function movePanel(stacks: DockStacks, id: GraphPanelId, target: DropTarget): DockStacks {
  const next = emptyStacks()
  for (const edge of dockEdges) {
    next[edge] = stacks[edge].filter((item) => item !== id)
  }
  const list = [...next[target.edge]]
  const index = Math.max(0, Math.min(target.index, list.length))
  list.splice(index, 0, id)
  next[target.edge] = list
  return next
}

function sameDrop(a: DropTarget | null, b: DropTarget | null) {
  if (!a || !b) return a === b
  return a.edge === b.edge && a.index === b.index
}

function pointInRect(x: number, y: number, rect: DOMRect) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
}

function insertIndexFromPoint(
  x: number,
  y: number,
  rect: DOMRect,
  edge: DockEdge,
  count: number,
) {
  if (count <= 0) return 0
  const vertical = edge === 'left' || edge === 'right'
  const ratio = vertical
    ? (y - rect.top) / Math.max(rect.height, 1)
    : (x - rect.left) / Math.max(rect.width, 1)
  return Math.max(0, Math.min(count, Math.round(ratio * count)))
}

function nearestEdge(x: number, y: number, rect: DOMRect): { edge: DockEdge; distance: number } | null {
  const distances: Record<DockEdge, number> = {
    left: x - rect.left,
    right: rect.right - x,
    top: y - rect.top,
    bottom: rect.bottom - y,
  }
  let best: { edge: DockEdge; distance: number } | null = null
  for (const edge of dockEdges) {
    const distance = distances[edge]
    if (distance < 0 || distance > edgeProximity) continue
    if (!best || distance < best.distance) best = { edge, distance }
  }
  return best
}

export type GraphCanvasProps = {
  nodes: ResumeNode[]
  edges: ResumeEdge[]
  onNodesChange: OnNodesChange<ResumeNode>
  onEdgesChange: OnEdgesChange<ResumeEdge>
  onConnect: (connection: Connection) => void
  sections: CatalogSection[]
  enabledSections: string[]
  onToggleSection: (sectionId: string) => void
  onBuild: () => void
  roleGraphs: RoleGraph[]
  bank: Experience[]
  jobs: Job[]
  onAddRole: (data: RoleData, position?: XYPosition) => void
  onUseRoleGraph: (id: string, position: XYPosition) => void
  onAddSkillName: (skill: string, position?: XYPosition) => void
  knowledge: KnowledgeAnswer[]
  onAddExperience: (preset: Experience, position?: XYPosition, sourceId?: string) => void
  onArrange: () => void
  onCleanGraph: () => void
  onUpdateRole: (id: string, patch: Partial<RoleData>) => void
  onUpdateBullet: (id: string, patch: Partial<BulletData>) => void
  onUpdatePerson: (id: string, patch: Partial<Profile>) => void
  onUpdateSkills: (id: string, patch: Partial<SkillsData>) => void
  onUpdateEducation: (id: string, patch: Partial<EducationData>) => void
  onDeleteNode: (id: string) => void
  onDeleteEdge: (id: string) => void
  onToggleHidden: (id: string) => void
  onSelectNode: (id: string) => void
  onClearSelection: () => void
  presentation: 'graph' | 'table'
  fitToken: number
  panelsOpen: GraphPanelsOpen
  onPanelsOpenChange: (open: GraphPanelsOpen) => void
}

const BankContext = createContext<Experience[]>([])

const RolePickContext = createContext<{
  jobs: Job[]
  onPick: (nodeId: string, option: PersonalRoleOption) => void
}>({ jobs: [], onPick: () => {} })

type NodeEditApi = {
  editingId: string | null
  endEdit: () => void
  onBuild: () => void
  onUpdateRole: (id: string, patch: Partial<RoleData>) => void
  onUpdateBullet: (id: string, patch: Partial<BulletData>) => void
  onUpdatePerson: (id: string, patch: Partial<Profile>) => void
  onUpdateSkills: (id: string, patch: Partial<SkillsData>) => void
  onUpdateEducation: (id: string, patch: Partial<EducationData>) => void
}

const NodeEditContext = createContext<NodeEditApi>({
  editingId: null,
  endEdit: () => {},
  onBuild: () => {},
  onUpdateRole: () => {},
  onUpdateBullet: () => {},
  onUpdatePerson: () => {},
  onUpdateSkills: () => {},
  onUpdateEducation: () => {},
})

function isEditableNode(node: ResumeNode) {
  if (node.type === 'role') return !node.data.pending
  return node.type === 'person' || node.type === 'bullet' || node.type === 'education'
}

type ContextMenu = {
  x: number
  y: number
  flow: XYPosition
  target: { kind: 'pane' } | { kind: 'role' | 'bullet' | 'person' | 'education'; id: string } | { kind: 'edge'; id: string } | { kind: 'connect'; sourceId: string }
}

const SectionsContext = createContext<CatalogSection[]>([])

type PromptNode = Node<{ kind: 'role' | 'experience'; roleId?: string; arriving?: boolean }, 'prompt'>

const nodeTypes = {
  person: PersonNodeView,
  role: RoleNodeView,
  bullet: BulletNodeView,
  skills: SkillsNodeView,
  experience: ExperienceSectionNodeView,
  education: EducationNodeView,
  section: SectionNodeView,
  prompt: PromptNodeView,
}

export function GraphCanvas(props: GraphCanvasProps) {
  return (
    <BankContext.Provider value={props.bank}>
      <ReactFlowProvider>
        <GraphEditor {...props} />
      </ReactFlowProvider>
    </BankContext.Provider>
  )
}

function GraphEditor({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  sections,
  enabledSections,
  onToggleSection,
  onBuild,
  roleGraphs,
  jobs,
  onAddRole,
  onUseRoleGraph,
  onAddSkillName,
  knowledge,
  onAddExperience,
  onArrange,
  onCleanGraph,
  onUpdateRole,
  onUpdateBullet,
  onUpdatePerson,
  onUpdateSkills,
  onUpdateEducation,
  onDeleteNode,
  onDeleteEdge,
  onToggleHidden,
  onSelectNode,
  onClearSelection,
  presentation,
  fitToken,
  panelsOpen,
  onPanelsOpenChange,
}: GraphCanvasProps) {
  const { fitView, getNodes, screenToFlowPosition, setCenter } = useReactFlow()
  const [menu, setMenu] = useState<ContextMenu | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [roleDraft, setRoleDraft] = useState<XYPosition | null>(null)
  const [roleChoice, setRoleChoice] = useState<XYPosition | null>(null)
  const [skillDraft, setSkillDraft] = useState<XYPosition | null>(null)
  const [skillSearchNode, setSkillSearchNode] = useState<string | null>(null)
  const [catalogTab, setCatalogTab] = useState<'role' | 'experience'>('experience')
  const [hoverRoleId, setHoverRoleId] = useState<string | null>(null)
  const promptTimer = useRef<number | null>(null)
  const [panelStacks, setPanelStacks] = useState<DockStacks>(loadGraphStacks)
  const [panelDrag, setPanelDrag] = useState<PanelDragUI | null>(null)
  const panelStacksRef = useRef(panelStacks)
  const panelsOpenRef = useRef(panelsOpen)
  const panelDragRef = useRef<PanelDragUI | null>(null)
  const graphBodyRef = useRef<HTMLDivElement>(null)
  const ghostRef = useRef<HTMLDivElement>(null)
  const dockRefs = useRef<Partial<Record<DockEdge, HTMLDivElement | null>>>({})
  const hintRefs = useRef<Partial<Record<DockEdge, HTMLDivElement | null>>>({})
  const dragSessionRef = useRef<{
    id: GraphPanelId
    pointerId: number
    startX: number
    startY: number
    active: boolean
  } | null>(null)
  const setPanelStacksRef = useRef(setPanelStacks)
  setPanelStacksRef.current = setPanelStacks
  const person = nodes.find((node) => node.type === 'person')
  const hasRole = nodes.some((node) => node.type === 'role')
  const openRoleIds = useMemo(
    () =>
      new Set(
        nodes
          .filter((node) => node.type === 'role' && !node.data.pending && !edges.some((edge) => edge.source === node.id))
          .map((node) => node.id),
      ),
    [nodes, edges],
  )
  const hoverRole = hoverRoleId && openRoleIds.has(hoverRoleId)
    ? nodes.find((node) => node.id === hoverRoleId && node.type === 'role')
    : undefined
  const skills = useMemo(() => knownSkills(nodes, roleGraphs), [nodes, roleGraphs])
  const toggleableSections = useMemo(
    () => sections.filter((section) => section.active || enabledSections.includes(section.id)),
    [sections, enabledSections],
  )
  const knownIds = useMemo(
    () => new Set(knowledge.filter((answer) => answer.level > 0).map((answer) => answer.id)),
    [knowledge],
  )

  const seenNodes = useRef<Set<string> | null>(null)
  const pendingFocus = useRef<Set<string>>(new Set())

  useEffect(() => {
    panelStacksRef.current = panelStacks
  }, [panelStacks])

  useEffect(() => {
    panelsOpenRef.current = panelsOpen
  }, [panelsOpen])

  useEffect(() => {
    localStorage.setItem(graphLayoutKey, JSON.stringify({ open: panelsOpen, stacks: panelStacks }))
  }, [panelsOpen, panelStacks])

  useEffect(() => {
    if (presentation !== 'graph' || fitToken === 0) return
    const timer = window.setTimeout(() => {
      void fitView({ padding: 0.16, maxZoom: 1, minZoom: 0.45, duration: 160 })
    }, 50)
    return () => window.clearTimeout(timer)
  }, [fitToken, fitView, presentation])

  useEffect(() => {
    const ids = new Set(nodes.map((node) => node.id))
    const previous = seenNodes.current
    seenNodes.current = ids
    if (previous && presentation === 'graph') {
      const kept = [...previous].filter((id) => ids.has(id)).length
      if (kept > 0) {
        for (const node of nodes) {
          if (!previous.has(node.id)) pendingFocus.current.add(node.id)
        }
      }
    }
    if (pendingFocus.current.size === 0 || presentation !== 'graph') return
    const focusIds = new Set(pendingFocus.current)
    const timer = window.setTimeout(() => {
      for (const id of focusIds) pendingFocus.current.delete(id)
      const added = getNodes().filter((node) => focusIds.has(node.id))
      if (added.length === 0) return
      const left = Math.min(...added.map((node) => node.position.x))
      const top = Math.min(...added.map((node) => node.position.y))
      const right = Math.max(...added.map((node) => node.position.x + (node.measured?.width ?? 220)))
      const bottom = Math.max(...added.map((node) => node.position.y + (node.measured?.height ?? 72)))
      void setCenter((left + right) / 2, (top + bottom) / 2, { zoom: 1.1, duration: 240 })
    }, 80)
    return () => window.clearTimeout(timer)
  }, [nodes, getNodes, presentation, setCenter])

  useEffect(() => {
    if (!menu) return
    function close() {
      setMenu(null)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menu])

  useEffect(() => {
    return () => {
      if (promptTimer.current !== null) window.clearTimeout(promptTimer.current)
    }
  }, [])

  // First work experience: stay visible under personal. Later: right-click / catalog.
  const rolePromptAnchor = !hasRole ? person : undefined

  const flowNodes = useMemo(() => {
    const prompts: PromptNode[] = []
    if (rolePromptAnchor) {
      prompts.push({
        id: 'prompt-role',
        type: 'prompt',
        position: {
          x: rolePromptAnchor.position.x,
          y: rolePromptAnchor.position.y + 160,
        },
        data: { kind: 'role' },
        draggable: false,
        selectable: false,
        connectable: false,
        className: 'nopan',
      })
    }
    if (hoverRole) {
      prompts.push({
        id: 'prompt-experience',
        type: 'prompt',
        position: { x: hoverRole.position.x + 280, y: hoverRole.position.y },
        data: { kind: 'experience', roleId: hoverRole.id },
        draggable: false,
        selectable: false,
        connectable: false,
        className: 'nopan',
      })
    }
    return prompts.length > 0 ? [...nodes, ...prompts] : nodes
  }, [hoverRole, nodes, rolePromptAnchor])

  const flowEdges = useMemo(() => {
    const real = edges.map((edge) => ({
      ...edge,
      type: 'default' as const,
      style: { stroke: '#1f2328', strokeWidth: 1.75 },
    }))
    if (!hoverRole) return real
    return [
      ...real,
      {
        id: 'prompt-link',
        source: hoverRole.id,
        target: 'prompt-experience',
        sourceHandle: 'out',
        targetHandle: 'in',
        type: 'default' as const,
        animated: true,
        style: { stroke: '#8b949e', strokeWidth: 1.5 },
      },
    ]
  }, [edges, hoverRole])

  function holdExperiencePrompt(roleId: string) {
    if (promptTimer.current !== null) window.clearTimeout(promptTimer.current)
    setHoverRoleId(roleId)
  }

  function releaseExperiencePrompt() {
    if (promptTimer.current !== null) window.clearTimeout(promptTimer.current)
    promptTimer.current = window.setTimeout(() => setHoverRoleId(null), 220)
  }

  function rolePromptPosition(): XYPosition {
    if (person) return { x: person.position.x, y: person.position.y + 160 }
    return nextPosition(nodes, 'role')
  }

  function openRoleChoice() {
    setRoleChoice(rolePromptPosition())
  }

  function addEmptyExperience(roleId: string) {
    const spot = placeBesideRole(nodes, edges, roleId)
    onAddExperience(
      { id: `custom-${crypto.randomUUID()}`, category: 'Custom', text: '', skills: [], aliases: [] },
      spot ?? undefined,
      roleId,
    )
    onPanelsOpenChange({ ...panelsOpenRef.current, inspector: true })
    setHoverRoleId(null)
  }

  const selectedNodes = nodes.filter((node) => node.selected)
  const selectedNode = selectedNodes.length === 1 ? selectedNodes[0] : null

  function endEdit() {
    setEditingId(null)
  }

  function beginEdit(node: ResumeNode | Node) {
    if (node.type === 'prompt') return
    const resume = nodes.find((item) => item.id === node.id)
    if (!resume || !isEditableNode(resume)) return
    setMenu(null)
    setEditingId(resume.id)
    onSelectNode(resume.id)
  }

  useEffect(() => {
    if (!editingId) return
    if (!nodes.some((node) => node.id === editingId)) setEditingId(null)
  }, [editingId, nodes])

  useEffect(() => {
    if (!editingId) return
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setEditingId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editingId])

  const nodeEdit = useMemo<NodeEditApi>(
    () => ({
      editingId,
      endEdit,
      onBuild,
      onUpdateRole,
      onUpdateBullet,
      onUpdatePerson,
      onUpdateSkills,
      onUpdateEducation,
    }),
    [editingId, onBuild, onUpdateRole, onUpdateBullet, onUpdatePerson, onUpdateSkills, onUpdateEducation],
  )

  const onConnectEnd: OnConnectEnd = (event, state) => {
    if (!state.fromNode || state.toNode || state.isValid) return
    if (state.fromNode.type !== 'role') return
    const point = clientPoint(event)
    if (!point) return
    const flow = screenToFlowPosition(point)
    setMenu({
      x: point.x,
      y: point.y,
      flow: { x: flow.x, y: flow.y - 28 },
      target: { kind: 'connect', sourceId: state.fromNode.id },
    })
  }

  function openMenu(event: { preventDefault: () => void; clientX: number; clientY: number }, target: ContextMenu['target']) {
    event.preventDefault()
    setMenu({
      x: event.clientX,
      y: event.clientY,
      flow: screenToFlowPosition({ x: event.clientX, y: event.clientY }),
      target,
    })
  }

  function togglePanel(id: GraphPanelId) {
    onPanelsOpenChange({ ...panelsOpen, [id]: !panelsOpen[id] })
  }

  function openStack(edge: DockEdge, dragging: GraphPanelId) {
    const stacks = panelStacksRef.current
    const open = panelsOpenRef.current
    return stacks[edge].filter((id) => id !== dragging && open[id])
  }

  function hitTestDrop(clientX: number, clientY: number, dragging: GraphPanelId): DropTarget | null {
    const body = graphBodyRef.current
    if (!body) return null
    const bodyRect = body.getBoundingClientRect()
    if (!pointInRect(clientX, clientY, bodyRect)) return null

    for (const edge of dockEdges) {
      const el = dockRefs.current[edge]
      if (!el) continue
      const rect = el.getBoundingClientRect()
      if (!pointInRect(clientX, clientY, rect)) continue
      const others = openStack(edge, dragging)
      return { edge, index: insertIndexFromPoint(clientX, clientY, rect, edge, others.length) }
    }

    const near = nearestEdge(clientX, clientY, bodyRect)
    if (!near) return null
    const others = openStack(near.edge, dragging)
    return { edge: near.edge, index: others.length }
  }

  function placeGhost(clientX: number, clientY: number) {
    const ghost = ghostRef.current
    if (!ghost) return
    ghost.style.transform = `translate3d(${clientX}px, ${clientY}px, 0) translate(-50%, -120%)`
  }

  function paintDropTarget(target: DropTarget | null) {
    for (const edge of dockEdges) {
      const hot = target?.edge === edge
      hintRefs.current[edge]?.classList.toggle('is-hot', hot)
      dockRefs.current[edge]?.classList.toggle('is-hot', hot)
    }
  }

  const dockHelpersRef = useRef({
    hitTestDrop,
    placeGhost,
    paintDropTarget,
    setPanelDrag,
  })
  dockHelpersRef.current = { hitTestDrop, placeGhost, paintDropTarget, setPanelDrag }

  const panelPointerMove = useRef((event: PointerEvent) => {
    const session = dragSessionRef.current
    if (!session || event.pointerId !== session.pointerId) return
    const helpers = dockHelpersRef.current
    helpers.placeGhost(event.clientX, event.clientY)
    if (!session.active) {
      const dx = event.clientX - session.startX
      const dy = event.clientY - session.startY
      if (dx * dx + dy * dy < dragThreshold * dragThreshold) return
      session.active = true
      document.body.classList.add('is-panel-docking')
      ghostRef.current?.classList.add('is-visible')
      const target = helpers.hitTestDrop(event.clientX, event.clientY, session.id)
      panelDragRef.current = { id: session.id, target }
      helpers.paintDropTarget(target)
      helpers.setPanelDrag({ id: session.id, target })
      return
    }
    const target = helpers.hitTestDrop(event.clientX, event.clientY, session.id)
    const current = panelDragRef.current
    if (current && sameDrop(current.target, target)) return
    panelDragRef.current = { id: session.id, target }
    helpers.paintDropTarget(target)
    helpers.setPanelDrag({ id: session.id, target })
  }).current

  const panelPointerUp = useRef((event: PointerEvent) => {
    const session = dragSessionRef.current
    if (!session || event.pointerId !== session.pointerId) return
    window.removeEventListener('pointermove', panelPointerMove)
    window.removeEventListener('pointerup', panelPointerUp)
    window.removeEventListener('pointercancel', panelPointerUp)
    document.body.classList.remove('is-panel-docking')
    ghostRef.current?.classList.remove('is-visible')
    const helpers = dockHelpersRef.current
    helpers.paintDropTarget(null)
    const active = session.active
    const target = active
      ? helpers.hitTestDrop(event.clientX, event.clientY, session.id) ?? panelDragRef.current?.target ?? null
      : null
    dragSessionRef.current = null
    if (active && target) {
      setPanelStacksRef.current((stacks) => movePanel(stacks, session.id, target))
    }
    panelDragRef.current = null
    helpers.setPanelDrag(null)
  }).current

  useEffect(() => () => {
    window.removeEventListener('pointermove', panelPointerMove)
    window.removeEventListener('pointerup', panelPointerUp)
    window.removeEventListener('pointercancel', panelPointerUp)
    document.body.classList.remove('is-panel-docking')
  }, [panelPointerMove, panelPointerUp])

  function beginPanelDrag(id: GraphPanelId, event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0) return
    const target = event.target
    if (target instanceof Element && target.closest('.view-tab-actions, button, a, input, textarea')) return
    event.preventDefault()
    window.removeEventListener('pointermove', panelPointerMove)
    window.removeEventListener('pointerup', panelPointerUp)
    window.removeEventListener('pointercancel', panelPointerUp)
    dragSessionRef.current = {
      id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
    }
    dockHelpersRef.current.placeGhost(event.clientX, event.clientY)
    window.addEventListener('pointermove', panelPointerMove)
    window.addEventListener('pointerup', panelPointerUp)
    window.addEventListener('pointercancel', panelPointerUp)
  }

  function renderPanel(id: GraphPanelId) {
    const dragging = panelDrag?.id === id
    return (
      <section
        key={id}
        className={dragging ? `graph-panel is-${id} is-dragging` : `graph-panel is-${id}`}
        aria-label={panelTitle(id, selectedNode, sections)}
      >
        <div className="view-tab is-draggable" onPointerDown={(event) => beginPanelDrag(id, event)}>
          <span className="view-grab">{panelTitle(id, selectedNode, sections)}</span>
          <div className="view-tab-actions">
            {id === 'inspector' && selectedNode && selectedNode.type !== 'bullet' ? (
              <IconButton label="Delete" onClick={() => onDeleteNode(selectedNode.id)}>
                <TrashIcon />
              </IconButton>
            ) : null}
            <button
              type="button"
              className="view-close"
              aria-label={`Close ${panelTitle(id, selectedNode, sections)}`}
              onClick={() => togglePanel(id)}
            >
              ×
            </button>
          </div>
        </div>
        {id === 'catalog' ? (
          <ExperienceCatalog
            nodes={nodes}
            edges={edges}
            knownIds={knownIds}
            roleGraphs={roleGraphs}
            onAddExperience={onAddExperience}
            onUseRoleGraph={onUseRoleGraph}
            tab={catalogTab}
            onTab={setCatalogTab}
          />
        ) : id === 'inspector' ? (
          <InspectorBody
            selectedNode={selectedNode}
            onUpdatePerson={onUpdatePerson}
            onUpdateRole={onUpdateRole}
            onUpdateBullet={onUpdateBullet}
            onUpdateEducation={onUpdateEducation}
          />
        ) : id === 'skills' ? (
          <SkillsPanel nodes={nodes} onSelect={onSelectNode} />
        ) : (
          <WorkExperiencePanel nodes={nodes} edges={edges} onSelect={onSelectNode} />
        )}
      </section>
    )
  }

  function dockInsertMarker(edge: DockEdge, stack: GraphPanelId[]) {
    if (!panelDrag?.target || panelDrag.target.edge !== edge) return null
    const others = stack.filter((id) => id !== panelDrag.id)
    const index = Math.max(0, Math.min(panelDrag.target.index, others.length))
    const vertical = edge === 'left' || edge === 'right'
    const ratio = others.length === 0 ? 0 : index / others.length
    const style = vertical
      ? { top: `${ratio * 100}%` }
      : { left: `${ratio * 100}%` }
    return <div className={vertical ? 'dock-insert is-vertical' : 'dock-insert is-horizontal'} style={style} />
  }

  function dockSlot(edge: DockEdge) {
    const stack = panelStacks[edge].filter((id) => panelsOpen[id])
    const hot = panelDrag?.target?.edge === edge
    const emptyHot = hot && stack.length === 0
    if (stack.length === 0 && !emptyHot) return null
    const stacked = stack.filter((id) => id !== panelDrag?.id).length + (hot ? 1 : 0) > 1
    return (
      <div
        ref={(node) => {
          dockRefs.current[edge] = node
        }}
        className={[
          'graph-dock',
          `is-${edge}`,
          stacked ? 'is-stacked' : '',
          hot ? 'is-hot' : '',
          emptyHot ? 'is-empty-hot' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {stack.map((id) => renderPanel(id))}
        {dockInsertMarker(edge, stack)}
      </div>
    )
  }

  function addPendingRole(position: XYPosition) {
    onAddRole({ title: '', company: '', location: '', start: '', end: '', pending: true }, position)
  }

  const rolePick = useMemo(
    () => ({
      jobs,
      onPick: (nodeId: string, option: PersonalRoleOption) => {
        onUpdateRole(nodeId, { ...roleDataFromPersonal(option), pending: false })
      },
    }),
    [jobs, onUpdateRole],
  )

  const canvas = presentation === 'table' ? (
    <SourceTable nodes={nodes} edges={edges} sections={sections} onSelect={onSelectNode} onToggleHidden={onToggleHidden} />
  ) : (
    <SectionsContext.Provider value={sections}>
      <HideContext.Provider value={onToggleHidden}>
        <RolePickContext.Provider value={rolePick}>
          <NodeEditContext.Provider value={nodeEdit}>
            <div className="graph-canvas">
              <ReactFlow
                nodes={flowNodes}
                edges={flowEdges}
                onNodesChange={(changes) => {
                  const next = changes.filter((change) => !isPromptChange(change))
                  if (next.length > 0) onNodesChange(next as NodeChange<ResumeNode>[])
                }}
                onEdgesChange={(changes) => {
                  const next = changes.filter((change) => {
                    if (change.type === 'add') return !change.item.id.startsWith('prompt-')
                    return !('id' in change && typeof change.id === 'string' && change.id.startsWith('prompt-'))
                  })
                  if (next.length > 0) onEdgesChange(next)
                }}
                onConnect={onConnect}
                onNodeClick={(_, node) => {
                  if (node.id !== editingId) endEdit()
                  if (node.id === 'prompt-role') {
                    openRoleChoice()
                    return
                  }
                  if (node.id === 'prompt-experience' && node.type === 'prompt' && node.data.roleId) {
                    addEmptyExperience(node.data.roleId)
                  }
                }}
                onNodeDoubleClick={(event, node) => {
                  event.preventDefault()
                  event.stopPropagation()
                  beginEdit(node)
                  if (node.type === 'skills' || node.type === 'bullet') setSkillSearchNode(node.id)
                }}
                onNodeMouseEnter={(_, node) => {
                  if (node.type === 'role' && openRoleIds.has(node.id)) holdExperiencePrompt(node.id)
                  if (node.id === 'prompt-experience' && hoverRoleId) holdExperiencePrompt(hoverRoleId)
                }}
                onNodeMouseLeave={(_, node) => {
                  if (node.type === 'role' || node.id === 'prompt-experience') releaseExperiencePrompt()
                }}
                onConnectEnd={onConnectEnd}
                onPaneClick={() => {
                  setMenu(null)
                  endEdit()
                  onClearSelection()
                }}
                onPaneContextMenu={(event) => openMenu(event, { kind: 'pane' })}
                onNodeContextMenu={(event, node) => {
                  if (node.type === 'prompt') {
                    event.preventDefault()
                    return
                  }
                  if (node.type !== 'role' && node.type !== 'bullet' && node.type !== 'person' && node.type !== 'education') return
                  endEdit()
                  openMenu(event, { kind: node.type, id: node.id })
                }}
                onEdgeContextMenu={(event, edge) => openMenu(event, { kind: 'edge', id: edge.id })}
                nodeTypes={nodeTypes}
                isValidConnection={(connection) => isRoleToBullet(nodes, edges, connection)}
                connectionLineType={ConnectionLineType.Bezier}
                connectionRadius={28}
                deleteKeyCode={['Backspace', 'Delete']}
                zoomOnDoubleClick={false}
                colorMode="light"
                onInit={() => {
                  void fitView({ padding: 0.16, maxZoom: 1, minZoom: 0.45 })
                }}
                minZoom={0.45}
                maxZoom={1.25}
              >
                <Background gap={16} size={1} color="#d0d7de" />
                <Controls showInteractive={false} position="bottom-left" />
              </ReactFlow>
              {menu ? (
                <ContextMenu
                  menu={menu}
                  nodes={nodes}
                  edges={edges}
                  onAddExperience={onAddExperience}
                  onNewRole={(position) => setRoleDraft(position)}
                  onExistingRole={addPendingRole}
                  knownIds={knownIds}
                  sections={toggleableSections}
                  enabledSections={enabledSections}
                  onToggleSection={onToggleSection}
                  panelsOpen={panelsOpen}
                  onToggleGraphPanel={togglePanel}
                  onArrange={onArrange}
                  onCleanGraph={onCleanGraph}
                  onDeleteNode={onDeleteNode}
                  onDeleteEdge={onDeleteEdge}
                  onClose={() => setMenu(null)}
                />
              ) : null}
            </div>
          </NodeEditContext.Provider>
        </RolePickContext.Provider>
      </HideContext.Provider>
    </SectionsContext.Provider>
  )

  return (
    <div className="graph-shell">
      <div ref={graphBodyRef} className={panelDrag ? 'graph-body is-docking' : 'graph-body'}>
        {dockSlot('top')}
        <div className="graph-band">
          {dockSlot('left')}
          <div className="graph-main">{canvas}</div>
          {dockSlot('right')}
        </div>
        {dockSlot('bottom')}
        <div className="dock-edge-hints" aria-hidden="true">
          {dockEdges.map((edge) => (
            <div
              key={edge}
              ref={(node) => {
                hintRefs.current[edge] = node
              }}
              className={`dock-edge-hint is-${edge}`}
            />
          ))}
        </div>
        <div ref={ghostRef} className="graph-panel-ghost" aria-hidden="true">
          {panelDrag ? panelTitle(panelDrag.id, selectedNode, sections) : ''}
        </div>
        {roleChoice ? (
          <RoleChoiceDialog
            onClose={() => setRoleChoice(null)}
            onNew={() => {
              setRoleDraft(roleChoice)
              setRoleChoice(null)
            }}
            onExisting={() => {
              addPendingRole(roleChoice)
              setRoleChoice(null)
            }}
          />
        ) : null}
        {roleDraft ? (
          <RoleDialog
            onClose={() => setRoleDraft(null)}
            onCreate={(data) => {
              onAddRole(data, roleDraft)
              setRoleDraft(null)
            }}
          />
        ) : null}
        {skillDraft ? (
          <SkillDialog
            skills={skills}
            onClose={() => setSkillDraft(null)}
            onPick={(skill) => {
              onAddSkillName(skill, skillDraft)
              setSkillDraft(null)
            }}
          />
        ) : null}
        {skillSearchNode ? (
          <SkillDialog
            skills={skills}
            onClose={() => setSkillSearchNode(null)}
            onPick={(skill) => {
              const node = nodes.find((item) => item.id === skillSearchNode)
              if (node && (node.type === 'skills' || node.type === 'bullet') && !node.data.skills.some((item) => item.toLocaleLowerCase() === skill.toLocaleLowerCase())) {
                if (node.type === 'skills') onUpdateSkills(node.id, { skills: [...node.data.skills, skill] })
                else onUpdateBullet(node.id, { skills: [...node.data.skills, skill] })
              }
              setSkillSearchNode(null)
            }}
          />
        ) : null}
      </div>
    </div>
  )
}

function InspectorBody({
  selectedNode,
  onUpdatePerson,
  onUpdateRole,
  onUpdateBullet,
  onUpdateEducation,
}: {
  selectedNode: ResumeNode | null
  onUpdatePerson: (id: string, patch: Partial<Profile>) => void
  onUpdateRole: (id: string, patch: Partial<RoleData>) => void
  onUpdateBullet: (id: string, patch: Partial<BulletData>) => void
  onUpdateEducation: (id: string, patch: Partial<EducationData>) => void
}) {
  if (!selectedNode) {
    return <p className="inspector-empty">Select a node to edit its properties.</p>
  }
  if (selectedNode.type === 'person') return <PersonInspector node={selectedNode} onUpdate={onUpdatePerson} />
  if (selectedNode.type === 'role') return <RoleInspector node={selectedNode} onUpdate={onUpdateRole} />
  if (selectedNode.type === 'bullet') return <BulletInspector node={selectedNode} onUpdate={onUpdateBullet} />
  if (selectedNode.type === 'education') return <EducationInspector node={selectedNode} onUpdate={onUpdateEducation} />
  return (
    <p className="inspector-empty">
      Pick a skill from the list. Drag a work experience port out and release to place one.
    </p>
  )
}

function panelTitle(id: GraphPanelId, selectedNode: ResumeNode | null, sections: CatalogSection[]) {
  if (id === 'catalog') return 'Catalog'
  if (id === 'skills') return 'Skills'
  if (id === 'experience') return 'Work Experience'
  return selectedNode ? inspectorTitle(selectedNode, sections) : 'Properties'
}

function byGraphPosition<T extends { id: string; position: XYPosition }>(a: T, b: T) {
  if (a.position.y !== b.position.y) return a.position.y - b.position.y
  if (a.position.x !== b.position.x) return a.position.x - b.position.x
  return a.id.localeCompare(b.id)
}

function SkillsPanel({ nodes, onSelect }: { nodes: ResumeNode[]; onSelect: (id: string) => void }) {
  const entries = new Map<string, { name: string; nodeId: string; text: string }>()
  for (const node of nodes) {
    if (node.type !== 'bullet') continue
    for (const skill of node.data.skills) {
      const name = skill.trim()
      const key = name.toLocaleLowerCase()
      if (!key || entries.has(key)) continue
      entries.set(key, { name, nodeId: node.id, text: node.data.text.trim() })
    }
  }
  const list = [...entries.values()].sort((left, right) => left.name.localeCompare(right.name))
  if (list.length === 0) return <p className="inspector-empty">No skills added yet.</p>
  return (
    <div className="graph-section-list">
      {list.map((entry) => (
        <button key={entry.name} type="button" className="graph-section-item" onClick={() => onSelect(entry.nodeId)}>
          <strong>{entry.name}</strong>
          {entry.text ? <span>{entry.text}</span> : null}
        </button>
      ))}
    </div>
  )
}

function WorkExperiencePanel({
  nodes,
  edges,
  onSelect,
}: {
  nodes: ResumeNode[]
  edges: ResumeEdge[]
  onSelect: (id: string) => void
}) {
  const roles = nodes.filter((node): node is RoleNode => node.type === 'role' && !node.data.pending).sort(byGraphPosition)
  if (roles.length === 0) return <p className="inspector-empty">No work experience added yet.</p>
  return (
    <div className="graph-section-list">
      {roles.map((role) => {
        const bullets = edges
          .filter((edge) => edge.source === role.id)
          .map((edge) => nodes.find((node): node is BulletNode => node.id === edge.target && node.type === 'bullet'))
          .filter((node): node is BulletNode => Boolean(node))
          .sort(byGraphPosition)
        return (
          <section key={role.id} className="graph-section-group">
            <button type="button" className="graph-section-item is-role" onClick={() => onSelect(role.id)}>
              <strong>{role.data.title.trim() || 'Untitled role'}</strong>
              {role.data.company.trim() ? <span>{role.data.company.trim()}</span> : null}
            </button>
            {bullets.map((bullet) => (
              <button key={bullet.id} type="button" className="graph-section-item is-bullet" onClick={() => onSelect(bullet.id)}>
                <span>{bullet.data.text.trim() || 'Empty experience'}</span>
              </button>
            ))}
          </section>
        )
      })}
    </div>
  )
}

function ContextMenu({
  menu,
  nodes,
  edges,
  onAddExperience,
  onNewRole,
  onExistingRole,
  knownIds,
  sections,
  enabledSections,
  onToggleSection,
  panelsOpen,
  onToggleGraphPanel,
  onArrange,
  onCleanGraph,
  onDeleteNode,
  onDeleteEdge,
  onClose,
}: {
  menu: ContextMenu
  nodes: ResumeNode[]
  edges: ResumeEdge[]
  onAddExperience: (preset: Experience, position?: XYPosition, sourceId?: string) => void
  onNewRole: (position: XYPosition) => void
  onExistingRole: (position: XYPosition) => void
  knownIds: Set<string>
  sections: CatalogSection[]
  enabledSections: string[]
  onToggleSection: (id: string) => void
  panelsOpen: GraphPanelsOpen
  onToggleGraphPanel: (panel: GraphPanelId) => void
  onArrange: () => void
  onCleanGraph: () => void
  onDeleteNode: (id: string) => void
  onDeleteEdge: (id: string) => void
  onClose: () => void
}) {
  const target = menu.target
  const roleTarget = target.kind === 'role'
    ? nodes.find((node): node is RoleNode => node.id === target.id && node.type === 'role')
    : null
  const showPresets = (target.kind === 'role' && roleTarget && !roleTarget.data.pending) || target.kind === 'connect'
  const roleActions = target.kind === 'pane'
  const compact = target.kind === 'pane' || target.kind === 'edge' || target.kind === 'bullet' || target.kind === 'person' || target.kind === 'education'
  const left = Math.min(menu.x, window.innerWidth - (compact ? 200 : 320) - 12)
  const top = Math.min(menu.y, window.innerHeight - (showPresets ? 280 : roleActions ? 470 : 120))

  function run(action: () => void) {
    action()
    onClose()
  }

  function place(preset: Experience) {
    if (target.kind === 'role') {
      const spot = placeBesideRole(nodes, edges, target.id)
      if (spot) onAddExperience(preset, spot, target.id)
      return
    }
    if (target.kind === 'connect') {
      onAddExperience(preset, menu.flow, target.sourceId)
      return
    }
    onAddExperience(preset, menu.flow)
  }

  return (
    <div
      className={compact ? 'context-menu is-compact' : 'context-menu'}
      style={{ left, top }}
      role="menu"
      onPointerDown={(event) => event.stopPropagation()}
    >
      {roleActions ? (
        <>
          <div className="context-menu-label">Show in CV</div>
          {sections.map((section) => (
            <button
              key={section.id}
              type="button"
              role="menuitemcheckbox"
              aria-checked={enabledSections.includes(section.id)}
              className="context-menu-item"
              onClick={() => run(() => onToggleSection(section.id))}
            >
              <SectionViewIcon active={enabledSections.includes(section.id)} />
              {section.name.trim() || 'Section'}
            </button>
          ))}
          <div className="context-menu-label">Side panels</div>
          {(['skills', 'experience'] as const).map((panel) => (
            <button
              key={panel}
              type="button"
              role="menuitemcheckbox"
              aria-checked={panelsOpen[panel]}
              className="context-menu-item"
              onClick={() => run(() => onToggleGraphPanel(panel))}
            >
              <SectionViewIcon active={panelsOpen[panel]} />
              {panel === 'skills' ? 'Skills' : 'Work Experience'}
            </button>
          ))}
          <button type="button" role="menuitem" className="context-menu-item" onClick={() => run(() => onNewRole(menu.flow))}>
            <RolePlusIcon />
            New work experience
          </button>
          <button type="button" role="menuitem" className="context-menu-item" onClick={() => run(() => onExistingRole(menu.flow))}>
            <RoleSelectIcon />
            Existing work experience
          </button>
          <button type="button" role="menuitem" className="context-menu-item" onClick={() => run(onArrange)}>
            <GraphViewIcon />
            Arrange graph
          </button>
          <button type="button" role="menuitem" className="context-menu-item" onClick={() => run(onCleanGraph)}>
            <TrashIcon />
            Clean graph
          </button>
        </>
      ) : null}
      {showPresets ? (
        <div className="context-experience">
          <div className="context-menu-label">
            <PlusIcon />
            Add skill
          </div>
          <PresetList knownIds={knownIds} onPick={(preset) => run(() => place(preset))} />
        </div>
      ) : null}
      {target.kind === 'role' || target.kind === 'bullet' || target.kind === 'person' || target.kind === 'education' ? (
        <button type="button" role="menuitem" onClick={() => run(() => onDeleteNode(target.id))}>
          Delete
        </button>
      ) : null}
      {target.kind === 'edge' ? (
        <button type="button" role="menuitem" onClick={() => run(() => onDeleteEdge(target.id))}>
          Disconnect
        </button>
      ) : null}
    </div>
  )
}

function GraphViewIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="4" cy="4" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="12" cy="4" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="8" cy="12" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="m5.3 5 1.8 5.5M10.7 5 8.8 10.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}

function SectionViewIcon({ active }: { active: boolean }) {
  return (
    <svg className={active ? 'section-state-icon is-active' : 'section-state-icon'} width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.4" />
      {active ? <path d="m5 8 2 2 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /> : null}
    </svg>
  )
}

function PresetList({ knownIds, onPick }: { knownIds: Set<string>; onPick: (preset: Experience) => void }) {
  const bank = useContext(BankContext)
  const [query, setQuery] = useState('')
  const presets = filterExperiencesBank(query, bank)

  return (
    <div className="preset-choices">
      <label className="catalog-search">
        <span className="sr-only">Search experiences</span>
        <input
          value={query}
          placeholder="Skill or metadata"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => event.stopPropagation()}
        />
      </label>
      {presets.length === 0 ? (
        <p className="catalog-empty">No matches.</p>
      ) : (
        presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            role="menuitem"
            className={knownIds.has(preset.id) ? 'preset-item is-known' : 'preset-item'}
            onClick={() => onPick(preset)}
          >
            <PresetBody preset={preset} />
          </button>
        ))
      )}
    </div>
  )
}

function ExperienceCatalog({
  nodes,
  edges,
  knownIds,
  roleGraphs,
  onAddExperience,
  onUseRoleGraph,
  tab,
  onTab,
}: {
  nodes: ResumeNode[]
  edges: ResumeEdge[]
  knownIds: Set<string>
  roleGraphs: RoleGraph[]
  onAddExperience: (preset: Experience, position?: XYPosition, sourceId?: string) => void
  onUseRoleGraph: (id: string, position: XYPosition) => void
  tab: 'role' | 'experience'
  onTab: (tab: 'role' | 'experience') => void
}) {
  const bank = useContext(BankContext)
  const selectedRole = nodes.find((node) => node.selected && node.type === 'role')
  const [query, setQuery] = useState('')
  const presets = filterExperiencesBank(query, bank)

  return (
    <aside className="catalog">
      <div className="catalog-switch" role="tablist" aria-label="Work Experience / Skill">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'role'}
          className={tab === 'role' ? 'catalog-tab is-on' : 'catalog-tab'}
          onClick={() => onTab('role')}
        >
          Work Experience
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'experience'}
          className={tab === 'experience' ? 'catalog-tab is-on' : 'catalog-tab'}
          onClick={() => onTab('experience')}
        >
          Skill
        </button>
      </div>
      {tab === 'role' ? (
        roleGraphs.length === 0 ? (
          <p className="catalog-empty">No work experiences.</p>
        ) : (
          <ul className="catalog-list">
            {roleGraphs.map((graph) => {
              const role = graph.nodes.find((node) => node.type === 'role')
              const title = role?.type === 'role' ? role.data.title.trim() || 'Untitled role' : 'Untitled role'
              const company = role?.type === 'role' ? role.data.company.trim() : ''
              return (
                <li key={graph.id}>
                  <button
                    type="button"
                    className="preset-item"
                    onClick={() => onUseRoleGraph(graph.id, nextPosition(nodes, 'role'))}
                  >
                    <span className="preset-text">{title}</span>
                    {company ? <span className="preset-skills">{company}</span> : null}
                  </button>
                </li>
              )
            })}
          </ul>
        )
      ) : null}
      {tab === 'experience' ? (
        <>
          <label className="catalog-search">
            <span className="sr-only">Search experiences</span>
            <input
              value={query}
              placeholder="Skill or metadata"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => event.stopPropagation()}
            />
          </label>
          {presets.length === 0 ? (
            <p className="catalog-empty">No matches.</p>
          ) : (
            <ul className="catalog-list">
              {presets.map((preset) => (
                <li key={preset.id}>
                  <button
                    type="button"
                    className={knownIds.has(preset.id) ? 'preset-item is-known' : 'preset-item'}
                    onClick={() => {
                      if (selectedRole) {
                        const spot = placeBesideRole(nodes, edges, selectedRole.id)
                        if (spot) onAddExperience(preset, spot, selectedRole.id)
                        return
                      }
                      onAddExperience(preset)
                    }}
                  >
                    <PresetBody preset={preset} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </aside>
  )
}

function PresetBody({ preset }: { preset: Experience }) {
  return (
    <>
      <span className="preset-category">{preset.category}</span>
      <span className="preset-text">{preset.text}</span>
      <span className="preset-skills">{preset.skills.join(' · ')}</span>
    </>
  )
}

function placeBesideRole(nodes: ResumeNode[], edges: ResumeEdge[], roleId: string) {
  const role = nodes.find((node) => node.id === roleId)
  if (!role) return null
  const count = edges.filter((edge) => edge.source === role.id).length
  return { x: role.position.x + 352, y: role.position.y + count * 150 }
}

function PromptNodeView({ data }: NodeProps<PromptNode>) {
  const role = data.kind === 'role'
  const arriving = data.kind === 'experience'
  return (
    <div className={arriving ? 'flow-node is-prompt is-arriving' : 'flow-node is-prompt'}>
      {arriving ? <Handle className="prompt-handle" type="target" position={Position.Left} id="in" /> : null}
      <div className="node-kicker">{role ? 'Work Experience' : 'Skill'}</div>
      <div className="node-title">{role ? 'Add work experience?' : 'Add new skill?'}</div>
    </div>
  )
}

function isPromptChange(change: NodeChange): boolean {
  return 'id' in change && change.id.startsWith('prompt-')
}

function PersonNodeView({ id, data, selected }: NodeProps<FlowNode<PersonNode>>) {
  const { editingId, onUpdatePerson } = useContext(NodeEditContext)
  const editing = editingId === id
  const fields = data.fields.filter((field) => field.value.trim())
  return (
    <div className={nodeClass(selected, false, true, data.hidden, editing)}>
      <div className="node-kicker-row">
        <div className="node-kicker">Info Personal</div>
        <HideControl id={id} hidden={data.hidden} />
      </div>
      {editing ? (
        <NodePorts>
          <NodePort label="Name">
            <input
              value={data.name}
              onChange={(event) => onUpdatePerson(id, { name: event.target.value })}
            />
          </NodePort>
          {data.fields.map((field) => (
            <NodePort key={field.id} label={field.label || 'Field'}>
              <input
                value={field.value}
                onChange={(event) =>
                  onUpdatePerson(id, { fields: replaceField(data.fields, field.id, { value: event.target.value }) })
                }
              />
            </NodePort>
          ))}
        </NodePorts>
      ) : (
        <>
          <div className="personal-node-rows">
            <div className="personal-node-row is-name">
              <span className="personal-node-label">Nombre</span>
              <span className="personal-node-value">{data.name.trim() || 'Sin nombre'}</span>
            </div>
            {fields.length > 0 ? fields.map((field) => (
              <div className="personal-node-row" key={field.id}>
                <span className="personal-node-label">{field.label || 'Dato'}</span>
                <span className="personal-node-value">{field.value}</span>
              </div>
            )) : (
              <div className="personal-node-row">
                <span className="personal-node-value is-empty">Agregá email, teléfono o links</span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function SkillsNodeView({ id, data, selected }: NodeProps<FlowNode<SkillsNode>>) {
  const { editingId, onUpdateSkills } = useContext(NodeEditContext)
  const editing = editingId === id
  return (
    <div className={`${nodeClass(selected, false, false, data.hidden, editing)} is-skills`}>
      <div className="node-kicker-row">
        <div className="node-kicker">Skills</div>
        <HideControl id={id} hidden={data.hidden} />
      </div>
      {editing ? (
        <NodePorts>
          <NodePort label="Skills" stack>
            <SkillField bare skills={data.skills} onChange={(skills) => onUpdateSkills(id, { skills })} />
          </NodePort>
        </NodePorts>
      ) : data.skills.length > 0 ? (
        <div className="node-skills">
          {data.skills.map((skill) => (
            <span key={skill} className="skill-pill">
              {skill}
            </span>
          ))}
        </div>
      ) : (
        <div className="node-meta">Add skills</div>
      )}
    </div>
  )
}

function ExperienceSectionNodeView({ selected }: NodeProps<FlowNode<ExperienceSectionNode>>) {
  return (
    <div className={`${nodeClass(selected)} is-skills`}>
      <div className="node-kicker">Experience</div>
      <div className="node-meta">Section</div>
      <Handle type="source" position={Position.Right} id="out" />
    </div>
  )
}

function SectionNodeView({ data, selected }: NodeProps<FlowNode<SectionNode>>) {
  const sections = useContext(SectionsContext)
  const name = sections.find((section) => section.id === data.sectionId)?.name.trim() || 'Section'
  return (
    <div className={`${nodeClass(selected)} is-skills`}>
      <div className="node-kicker">Section</div>
      <div className="node-title">{name}</div>
    </div>
  )
}

function EducationNodeView({ id, data, selected }: NodeProps<FlowNode<EducationNode>>) {
  const { editingId, onUpdateEducation } = useContext(NodeEditContext)
  const editing = editingId === id
  const entries = data.entries.filter((entry) =>
    [entry.school, entry.degree, entry.start, entry.end].some((value) => value.trim()),
  )

  function update(entryId: string, patch: Partial<EducationEntry>) {
    onUpdateEducation(id, {
      entries: data.entries.map((entry) => (entry.id === entryId ? { ...entry, ...patch } : entry)),
    })
  }

  return (
    <div className={`${nodeClass(selected, false, false, false, editing)} is-education`}>
      <div className="node-kicker">Education</div>
      {editing ? (
        <NodePorts>
          {data.entries.map((entry, index) => (
            <div key={entry.id} className="node-port-group">
              <div className="node-port-group-head">
                <span>Entry {index + 1}</span>
                <button
                  type="button"
                  className="node-port-remove"
                  aria-label="Remove entry"
                  onClick={() => onUpdateEducation(id, { entries: data.entries.filter((item) => item.id !== entry.id) })}
                >
                  ×
                </button>
              </div>
              <NodePort label="School">
                <input value={entry.school} onChange={(event) => update(entry.id, { school: event.target.value })} />
              </NodePort>
              <NodePort label="Degree">
                <input value={entry.degree} onChange={(event) => update(entry.id, { degree: event.target.value })} />
              </NodePort>
              <NodePort label="Start">
                <input value={entry.start} onChange={(event) => update(entry.id, { start: event.target.value })} />
              </NodePort>
              <NodePort label="End">
                <input value={entry.end} onChange={(event) => update(entry.id, { end: event.target.value })} />
              </NodePort>
            </div>
          ))}
          <button
            type="button"
            className="node-port-add"
            onClick={() =>
              onUpdateEducation(id, {
                entries: [...data.entries, { id: crypto.randomUUID(), school: '', degree: '', start: '', end: '' }],
              })
            }
          >
            Add entry
          </button>
        </NodePorts>
      ) : entries.length > 0 ? (
        <div className="education-node-entries">
          {entries.map((entry) => (
            <div key={entry.id} className="education-node-entry">
              {entry.school.trim() ? (
                <div className="education-node-school">{entry.school.trim()}</div>
              ) : null}
              {entry.degree.trim() ? (
                <div className="education-node-degree">{entry.degree.trim()}</div>
              ) : null}
              {[entry.start, entry.end].some((value) => value.trim()) ? (
                <div className="education-node-dates">
                  {[entry.start.trim(), entry.end.trim()].filter(Boolean).join(' – ')}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="node-meta">Agregá institución, título o fechas</div>
      )}
    </div>
  )
}

function RoleNodeView({ id, data, selected }: NodeProps<FlowNode<RoleNode>>) {
  const { jobs, onPick } = useContext(RolePickContext)
  const { editingId, onUpdateRole } = useContext(NodeEditContext)
  const editing = editingId === id
  const options = useMemo(() => personalRoleOptions(jobs), [jobs])
  const grouped = useMemo(() => {
    const map = new Map<string, PersonalRoleOption[]>()
    for (const option of options) {
      const list = map.get(option.company) ?? []
      list.push(option)
      map.set(option.company, list)
    }
    return [...map.entries()]
  }, [options])

  if (data.pending) {
    return (
      <div className={`${nodeClass(selected, true, false, false, false, true)} is-role`}>
        <div className="node-kicker">Work Experience</div>
        <label className="role-pick">
          <span className="sr-only">Existing work experience</span>
          <select
            className="nodrag nopan"
            defaultValue=""
            onChange={(event) => {
              const option = options.find((item) => item.key === event.target.value)
              if (option) onPick(id, option)
            }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <option value="" disabled>
              {options.length === 0 ? 'No roles in Personal' : 'Select work experience…'}
            </option>
            {grouped.map(([company, roles]) => (
              <optgroup key={company} label={company}>
                {roles.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.title}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <Handle type="source" position={Position.Right} id="out" />
      </div>
    )
  }

  const dates = [data.start, data.end].filter(Boolean).join(' – ')
  return (
      <div className={`${nodeClass(selected, false, false, false, editing)} is-role`}>
      <div className="node-kicker">Work Experience</div>
      {editing ? (
        <NodePorts>
          <NodePort label="Title">
            <input value={data.title} onChange={(event) => onUpdateRole(id, { title: event.target.value })} />
          </NodePort>
          <NodePort label="Company">
            <input
              value={data.company}
              placeholder="Required"
              onChange={(event) => onUpdateRole(id, { company: event.target.value })}
            />
          </NodePort>
          <NodePort label="Location">
            <input value={data.location} onChange={(event) => onUpdateRole(id, { location: event.target.value })} />
          </NodePort>
          <NodePort label="Start">
            <input value={data.start} onChange={(event) => onUpdateRole(id, { start: event.target.value })} />
          </NodePort>
          <NodePort label="End">
            <input value={data.end} onChange={(event) => onUpdateRole(id, { end: event.target.value })} />
          </NodePort>
        </NodePorts>
      ) : (
        <>
          <div className="node-title">{data.title.trim() || 'Untitled'}</div>
          <div className="node-meta">{data.company.trim() || 'Company'}</div>
          {dates ? <div className="node-meta">{dates}</div> : null}
        </>
      )}
      <Handle type="source" position={Position.Right} id="out" />
    </div>
  )
}

function BulletNodeView({ id, data, selected }: NodeProps<FlowNode<BulletNode>>) {
  const connections = useNodeConnections({ handleType: 'target' })
  const { editingId, onUpdateBullet } = useContext(NodeEditContext)
  const editing = editingId === id
  const linked = connections.length > 0
  const idle = !data.hidden && (!linked || !data.text.trim())
  return (
    <div className={`${nodeClass(selected, !linked, false, data.hidden, editing, idle)} is-skills`}>
      <Handle type="target" position={Position.Left} id="in" />
      <div className="node-kicker-row">
        <div className="node-kicker">{linked ? (idle ? 'Skill · Empty' : 'Skill') : 'Skill · Not linked'}</div>
        <HideControl id={id} hidden={data.hidden} />
      </div>
      {editing ? (
        <NodePorts>
          <NodePort label="Sentence" stack>
            <textarea
              value={data.text}
              rows={4}
              onChange={(event) => onUpdateBullet(id, { text: event.target.value })}
            />
          </NodePort>
          <NodePort label="Metadata" stack>
            <SkillField bare skills={data.skills} onChange={(skills) => onUpdateBullet(id, { skills })} />
          </NodePort>
        </NodePorts>
      ) : (
        <>
          <div className="node-sentence">{data.text.trim() || 'Empty skill'}</div>
          {data.ability.trim() ? <div className="node-ability">{data.ability}</div> : null}
          {data.skills.length > 0 ? (
            <div className="node-skills">
              {data.skills.map((skill) => (
                <span key={skill} className="skill-pill">
                  {skill}
                </span>
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}

function NodePorts({ children }: { children: ReactNode }) {
  const { endEdit, onBuild } = useContext(NodeEditContext)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current?.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea')
    if (!el) return
    el.focus()
    if (el instanceof HTMLInputElement) el.select()
  }, [])

  return (
    <div
      ref={ref}
      className="node-ports nodrag nopan"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        event.stopPropagation()
        endEdit()
      }}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      {children}
      <div className="node-ports-actions">
        <button
          type="button"
          className="node-build"
          onClick={(event) => {
            event.stopPropagation()
            onBuild()
            endEdit()
          }}
        >
          Build
        </button>
      </div>
    </div>
  )
}

function NodePort({
  label,
  children,
  stack = false,
}: {
  label: string
  children: ReactNode
  stack?: boolean
}) {
  return (
    <div className={stack ? 'node-port is-stack' : 'node-port'}>
      <span className="node-port-name">{label}</span>
      <div className="node-port-value">{children}</div>
    </div>
  )
}

function inspectorTitle(node: ResumeNode, _sections: CatalogSection[]) {
  if (node.type === 'person') return 'Info Personal'
  if (node.type === 'role') return 'Work Experience'
  if (node.type === 'bullet') return 'Skill'
  if (node.type === 'education') return 'Education'
  return 'Details'
}

function PersonInspector({
  node,
  onUpdate,
}: {
  node: PersonNode
  onUpdate: (id: string, patch: Partial<Profile>) => void
}) {
  return (
    <>
      <Field label="Name" value={node.data.name} onChange={(name) => onUpdate(node.id, { name })} />
      {node.data.fields.map((field) => (
        <Field
          key={field.id}
          label={field.label || 'Field'}
          value={field.value}
          onChange={(value) => onUpdate(node.id, { fields: replaceField(node.data.fields, field.id, { value }) })}
        />
      ))}
    </>
  )
}

function RoleInspector({
  node,
  onUpdate,
}: {
  node: RoleNode
  onUpdate: (id: string, patch: Partial<RoleData>) => void
}) {
  return (
    <>
      <Field label="Title" value={node.data.title} onChange={(title) => onUpdate(node.id, { title })} />
      <Field label="Company" value={node.data.company} onChange={(company) => onUpdate(node.id, { company })} placeholder="Required" />
      <div className="field-pair">
        <Field label="Start" value={node.data.start} onChange={(start) => onUpdate(node.id, { start })} />
        <Field label="End" value={node.data.end} onChange={(end) => onUpdate(node.id, { end })} />
      </div>
    </>
  )
}

function EducationInspector({
  node,
  onUpdate,
}: {
  node: EducationNode
  onUpdate: (id: string, patch: Partial<EducationData>) => void
}) {
  function update(entryId: string, patch: Partial<EducationEntry>) {
    onUpdate(node.id, {
      entries: node.data.entries.map((entry) => (entry.id === entryId ? { ...entry, ...patch } : entry)),
    })
  }

  return (
    <>
      {node.data.entries.map((entry, index) => (
        <div key={entry.id} className="education-entry">
          <div className="inspector-head">
            <span>Entry {index + 1}</span>
            <IconButton
              label="Remove"
              onClick={() => onUpdate(node.id, { entries: node.data.entries.filter((item) => item.id !== entry.id) })}
            >
              <TrashIcon />
            </IconButton>
          </div>
          <Field label="School" value={entry.school} onChange={(school) => update(entry.id, { school })} />
          <Field label="Degree" value={entry.degree} onChange={(degree) => update(entry.id, { degree })} />
          <div className="field-pair">
            <Field label="Start" value={entry.start} onChange={(start) => update(entry.id, { start })} />
            <Field label="End" value={entry.end} onChange={(end) => update(entry.id, { end })} />
          </div>
        </div>
      ))}
      <div className="inspector-add">
        <IconButton
          label="Add entry"
          onClick={() => onUpdate(node.id, {
            entries: [...node.data.entries, { id: crypto.randomUUID(), school: '', degree: '', start: '', end: '' }],
          })}
        >
          <PlusIcon />
        </IconButton>
      </div>
    </>
  )
}

function BulletInspector({
  node,
  onUpdate,
}: {
  node: BulletNode
  onUpdate: (id: string, patch: Partial<BulletData>) => void
}) {
  return (
    <>
      <label className="field">
        <span>Sentence</span>
        <textarea value={node.data.text} onChange={(event) => onUpdate(node.id, { text: event.target.value })} />
      </label>
      <SkillField skills={node.data.skills} onChange={(skills) => onUpdate(node.id, { skills })} />
    </>
  )
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button type="button" className="icon-button" aria-label={label} data-tip={label} onClick={onClick}>
      {children}
    </button>
  )
}

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
      <path d="M3 4.5h9M6 4.5V3.2h3v1.3M4.2 4.5l.5 8h5.6l.5-8" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
      <path d="M7.5 3.2v8.6M3.2 7.5h8.6" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

function RolePlusIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
      <path
        d="M3.2 5.2h8.6v6.4H3.2V5.2Zm2-2.2h4.6v2.2H5.2V3Zm2.3 5.2v3.2M5.9 9.8h3.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function RoleSelectIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
      <path
        d="M3 4.2h9M3 7.5h9M3 10.8h6.2M11.2 9.6l1.6 1.6 1.6-1.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function replaceField(fields: ProfileField[], id: string, patch: Partial<ProfileField>) {
  return fields.map((field) => (field.id === id ? { ...field, ...patch } : field))
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

function SkillField({
  skills,
  onChange,
  bare = false,
}: {
  skills: string[]
  onChange: (skills: string[]) => void
  bare?: boolean
}) {
  const [draft, setDraft] = useState('')

  function commit() {
    const additions = draft.split(',').map((skill) => skill.trim()).filter(Boolean)
    if (additions.length === 0) return

    const seen = new Set(skills.map((skill) => skill.toLocaleLowerCase()))
    const next = [...skills]
    for (const skill of additions) {
      const key = skill.toLocaleLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      next.push(skill)
    }
    onChange(next)
    setDraft('')
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return
    event.preventDefault()
    commit()
  }

  return (
    <div className={bare ? 'field is-skills is-bare' : 'field is-skills'}>
      {bare ? null : <span>Metadata</span>}
      {skills.length > 0 ? (
        <div className="chips">
          {skills.map((skill) => (
            <button
              key={skill}
              type="button"
              className="chip"
              aria-label={`Remove ${skill}`}
              onClick={() => onChange(skills.filter((item) => item !== skill))}
            >
              {skill}
              <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      ) : null}
      <input
        value={draft}
        placeholder="Add skills separated by commas and press Enter"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
      />
    </div>
  )
}

function isRoleToBullet(nodes: ResumeNode[], edges: ResumeEdge[], connection: Connection | Edge) {
  const source = nodes.find((node) => node.id === connection.source)
  const target = nodes.find((node) => node.id === connection.target)
  if (source?.type !== 'role' || target?.type !== 'bullet') return false
  return !roleHasExperience(nodes, edges, source.id, target.data.text, target.id)
}

function HideControl({ id, hidden }: { id: string; hidden?: boolean }) {
  const toggle = useContext(HideContext)
  return (
    <button
      type="button"
      className="node-hide nodrag nopan"
      aria-pressed={hidden === true}
      aria-label={hidden ? 'Show in build' : 'Hide from build'}
      data-tip={hidden ? 'Show in build' : 'Hide from build'}
      onClick={(event) => {
        event.stopPropagation()
        toggle(id)
      }}
    >
      <EyeIcon hidden={hidden === true} />
    </button>
  )
}

function EyeIcon({ hidden }: { hidden: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M1.5 7s2-3.5 5.5-3.5S12.5 7 12.5 7s-2 3.5-5.5 3.5S1.5 7 1.5 7z" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="7" cy="7" r="1.4" fill="none" stroke="currentColor" strokeWidth="1.2" />
      {hidden ? <path d="M2.5 11.5 11.5 2.5" fill="none" stroke="currentColor" strokeWidth="1.2" /> : null}
    </svg>
  )
}

function nodeClass(
  selected: boolean,
  unlinked = false,
  person = false,
  hidden = false,
  editing = false,
  idle = false,
) {
  const names = ['flow-node']
  if (person) names.push('is-person')
  if (unlinked) names.push('is-unlinked')
  if (idle) names.push('is-idle')
  if (hidden) names.push('is-hidden')
  if (selected) names.push('is-selected')
  if (editing) names.push('is-editing')
  return names.join(' ')
}

function RoleChoiceDialog({
  onNew,
  onExisting,
  onClose,
}: {
  onNew: () => void
  onExisting: () => void
  onClose: () => void
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="composer-backdrop" onMouseDown={onClose}>
      <div className="composer cv-draft role-choice" onMouseDown={(event) => event.stopPropagation()}>
        <div className="composer-head">
          <h2>Add a role</h2>
          <button type="button" className="view-close" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <div className="role-choice-actions">
          <button type="button" onClick={onNew}>
            <strong>New work experience</strong>
            <span>Create one in a popup</span>
          </button>
          <button type="button" onClick={onExisting}>
            <strong>Existing work experience</strong>
            <span>Place a node and pick from Personal</span>
          </button>
        </div>
      </div>
    </div>
  )
}

function RoleDialog({
  onCreate,
  onClose,
}: {
  onCreate: (data: RoleData) => void
  onClose: () => void
}) {
  const [title, setTitle] = useState('')
  const [company, setCompany] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const canSave = title.trim().length > 0 && company.trim().length > 0

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="composer-backdrop" onMouseDown={onClose}>
      <div className="composer cv-draft" onMouseDown={(event) => event.stopPropagation()}>
        <div className="composer-head">
          <h2>New work experience</h2>
          <button type="button" className="view-close" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <form
          className="role-draft-form"
          onSubmit={(event) => {
            event.preventDefault()
            if (!canSave) return
            onCreate({
              title: title.trim(),
              company: company.trim(),
              location: '',
              start: start.trim(),
              end: end.trim(),
            })
          }}
        >
          <Field label="Title" value={title} onChange={setTitle} placeholder="Software Engineer" />
          <Field label="Company" value={company} onChange={setCompany} placeholder="Required" />
          <div className="field-pair">
            <Field label="Start" value={start} onChange={setStart} placeholder="2022" />
            <Field label="End" value={end} onChange={setEnd} placeholder="Present" />
          </div>
          <div className="composer-actions">
            <button type="button" className="button" onClick={onClose}>Cancel</button>
            <button type="submit" className="button primary" disabled={!canSave}>Add</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function SkillDialog({ skills, onPick, onClose }: { skills: string[]; onPick: (skill: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  const matches = skills.filter((skill) => terms.every((term) => skill.toLocaleLowerCase().includes(term)))

  return (
    <div className="composer-backdrop" onMouseDown={onClose}>
      <div className="composer cv-draft skill-dialog" onMouseDown={(event) => event.stopPropagation()}>
        <div className="composer-head">
          <h2>Add skill</h2>
          <button type="button" className="view-close" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <label className="field">
          <span className="sr-only">Search skills</span>
          <input value={query} placeholder="Skill" onChange={(event) => setQuery(event.target.value)} />
        </label>
        {matches.length === 0 ? (
          <p className="catalog-empty">No matches.</p>
        ) : (
          <ul className="skill-choices">
            {matches.map((skill) => (
              <li key={skill}>
                <button type="button" onClick={() => onPick(skill)}>{skill}</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function clientPoint(event: MouseEvent | TouchEvent) {
  if ('changedTouches' in event && event.changedTouches.length > 0) {
    const touch = event.changedTouches[0]
    return { x: touch.clientX, y: touch.clientY }
  }
  if ('clientX' in event) return { x: event.clientX, y: event.clientY }
  return null
}
