import { useEffect, useMemo, useState } from 'react'
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  ConnectionLineType,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Connection,
  type NodeProps,
  type OnEdgesChange,
  type OnNodesChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { filterExperiencesBank, type Experience } from '../experiences'
import {
  isRoleNode,
  personalRoleOptions,
  roleDataFromPersonal,
  roleHasExperience,
  type BulletNode,
  type Job,
  type PersonalRoleOption,
  type ResumeEdge,
  type ResumeNode,
  type RoleData,
  type RoleGraph,
  type RoleNode,
} from '../model'

type RoleGraphsProps = {
  graphs: RoleGraph[]
  bank: Experience[]
  jobs: Job[]
  onChange: (graphs: RoleGraph[]) => void
}

const nodeTypes = {
  role: RoleNodeView,
  bullet: BulletNodeView,
}

export function RoleGraphs({ graphs, bank, jobs, onChange }: RoleGraphsProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const selected = graphs.find((graph) => graph.id === selectedId) ?? graphs[0] ?? null

  function patch(id: string, update: (graph: RoleGraph) => RoleGraph) {
    onChange(graphs.map((graph) => (graph.id === id ? update(graph) : graph)))
  }

  function addFromPersonal(option: PersonalRoleOption) {
    const id = crypto.randomUUID()
    const roleId = crypto.randomUUID()
    const graph: RoleGraph = {
      id,
      nodes: [{
        id: roleId,
        type: 'role',
        position: { x: 48, y: 48 },
        data: roleDataFromPersonal(option),
        selected: true,
      }],
      edges: [],
    }
    onChange([...graphs, graph])
    setSelectedId(id)
    setPicking(false)
  }

  function removeGraph(id: string) {
    onChange(graphs.filter((graph) => graph.id !== id))
    if (selected?.id === id) setSelectedId(null)
  }

  return (
    <>
      <div className="role-studio">
        <div className="role-list">
          {graphs.map((graph) => {
            const role = graph.nodes.find(isRoleNode)
            const name = role?.data.title.trim() || 'Untitled role'
            const company = role?.data.company.trim() || 'No company'
            const current = graph.id === selected?.id
            return (
              <div key={graph.id} className={current ? 'role-row is-current' : 'role-row'}>
                <button type="button" aria-current={current ? 'true' : undefined} onClick={() => setSelectedId(graph.id)}>
                  <span className="role-row-title">{name}</span>
                  <span className="role-row-company">{company}</span>
                </button>
                <button type="button" className="row-remove is-visible" aria-label={`Delete ${name}`} onClick={() => removeGraph(graph.id)}>
                  ×
                </button>
              </div>
            )
          })}
        </div>
        {selected ? (
          <RoleEditor key={selected.id} bank={bank} graph={selected} onPatch={(update) => patch(selected.id, update)} />
        ) : (
          <p className="role-empty">Build a role graph from Personal jobs, then drop it into a CV.</p>
        )}
      </div>
      <button type="button" className="button personal-add" onClick={() => setPicking(true)}>
        New role
      </button>
      {picking ? (
        <PersonalRolePicker
          jobs={jobs}
          onClose={() => setPicking(false)}
          onPick={addFromPersonal}
        />
      ) : null}
    </>
  )
}

function PersonalRolePicker({
  jobs,
  onPick,
  onClose,
}: {
  jobs: Job[]
  onPick: (option: PersonalRoleOption) => void
  onClose: () => void
}) {
  const options = personalRoleOptions(jobs)
  const grouped = useMemo(() => {
    const map = new Map<string, PersonalRoleOption[]>()
    for (const option of options) {
      const list = map.get(option.company) ?? []
      list.push(option)
      map.set(option.company, list)
    }
    return [...map.entries()]
  }, [options])

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
          <h2>New role</h2>
          <button type="button" className="view-close" aria-label="Close" onClick={onClose}>×</button>
        </div>
        {options.length === 0 ? (
          <>
            <p className="role-choice-empty">
              Roles come from Personal → Jobs. Add a company and at least one title there first.
            </p>
            <div className="composer-actions">
              <button type="button" className="button" onClick={onClose}>Close</button>
            </div>
          </>
        ) : (
          <ul className="personal-role-pick">
            {grouped.map(([company, roles]) => (
              <li key={company}>
                <p className="personal-role-company">{company}</p>
                <ul>
                  {roles.map((option) => {
                    const dates = [option.start.trim(), option.end.trim()].filter(Boolean).join(' – ')
                    return (
                      <li key={option.key}>
                        <button type="button" onClick={() => onPick(option)}>
                          <strong>{option.title}</strong>
                          {dates ? <span>{dates}</span> : null}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function RoleEditor({
  bank,
  graph,
  onPatch,
}: {
  bank: Experience[]
  graph: RoleGraph
  onPatch: (update: (graph: RoleGraph) => RoleGraph) => void
}) {
  const role = graph.nodes.find(isRoleNode)
  const bullet = graph.nodes.find((node): node is BulletNode => node.type === 'bullet' && node.selected === true)

  const onNodesChange: OnNodesChange<ResumeNode> = (changes) => {
    const safe = changes.filter((change) => {
      if (change.type !== 'remove') return true
      return graph.nodes.find((node) => node.id === change.id)?.type !== 'role'
    })
    onPatch((current) => ({ ...current, nodes: applyNodeChanges(safe, current.nodes) }))
  }

  const onEdgesChange: OnEdgesChange<ResumeEdge> = (changes) => {
    onPatch((current) => ({ ...current, edges: applyEdgeChanges(changes, current.edges) }))
  }

  function onConnect(connection: Connection) {
    if (!connection.source || !connection.target) return
    onPatch((current) => {
      const source = current.nodes.find((node) => node.id === connection.source)
      const target = current.nodes.find((node) => node.id === connection.target)
      if (source?.type !== 'role' || target?.type !== 'bullet') return current
      if (roleHasExperience(current.nodes, current.edges, source.id, target.data.text, target.id)) return current
      const withoutTarget = current.edges.filter((edge) => edge.target !== connection.target)
      return {
        ...current,
        edges: addEdge({ ...connection, id: `e-${connection.source}-${connection.target}` }, withoutTarget),
      }
    })
  }

  function addExperience(preset: Experience) {
    onPatch((current) => {
      const source = current.nodes.find(isRoleNode)
      if (!source) return current
      if (roleHasExperience(current.nodes, current.edges, source.id, preset.text)) return current
      const id = crypto.randomUUID()
      const count = current.edges.filter((edge) => edge.source === source.id).length
      const node: BulletNode = {
        id,
        type: 'bullet',
        position: { x: source.position.x + 352, y: source.position.y + count * 150 },
        data: { text: preset.text, ability: '', skills: [...preset.skills] },
        selected: true,
      }
      return {
        ...current,
        nodes: [...current.nodes.map((item) => ({ ...item, selected: false })), node],
        edges: addEdge(
          { id: `e-${source.id}-${id}`, source: source.id, target: id, sourceHandle: 'out', targetHandle: 'in' },
          current.edges,
        ),
      }
    })
  }

  function updateRole(patch: Partial<RoleData>) {
    if (!role) return
    onPatch((current) => ({
      ...current,
      nodes: current.nodes.map((node) => (node.id === role.id && node.type === 'role' ? { ...node, data: { ...node.data, ...patch } } : node)),
    }))
  }

  function updateBullet(text: string) {
    if (!bullet) return
    onPatch((current) => ({
      ...current,
      nodes: current.nodes.map((node) => (node.id === bullet.id && node.type === 'bullet' ? { ...node, data: { ...node.data, text } } : node)),
    }))
  }

  return (
    <ReactFlowProvider>
      <div className="role-stage">
        {role ? (
          <div className="role-fields">
            <label>
              Title
              <input aria-label="Role title" value={role.data.title} placeholder="Software Engineer" onChange={(event) => updateRole({ title: event.target.value })} />
            </label>
            <label>
              Company
              <input aria-label="Company" value={role.data.company} placeholder="Required company" onChange={(event) => updateRole({ company: event.target.value })} />
            </label>
            <label>
              Location
              <input aria-label="Work location" value={role.data.location} placeholder="City, Country" onChange={(event) => updateRole({ location: event.target.value })} />
            </label>
            <label>
              Start
              <input aria-label="Start" value={role.data.start} placeholder="2022" onChange={(event) => updateRole({ start: event.target.value })} />
            </label>
            <label>
              End
              <input aria-label="End" value={role.data.end} placeholder="2024" onChange={(event) => updateRole({ end: event.target.value })} />
            </label>
          </div>
        ) : null}
        {bullet ? (
          <label className="role-sentence">
            Sentence
            <textarea aria-label="Experience sentence" value={bullet.data.text} onChange={(event) => updateBullet(event.target.value)} />
          </label>
        ) : null}
        <div className="role-canvas">
          <ReactFlow
            nodes={graph.nodes}
            edges={graph.edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            isValidConnection={(connection) => {
              const source = graph.nodes.find((node) => node.id === connection.source)
              const target = graph.nodes.find((node) => node.id === connection.target)
              if (!source || source.type !== 'role' || !target || target.type !== 'bullet') return false
              return !roleHasExperience(graph.nodes, graph.edges, source.id, target.data.text, target.id)
            }}
            connectionLineType={ConnectionLineType.Bezier}
            connectionRadius={28}
            deleteKeyCode={['Backspace', 'Delete']}
            colorMode="light"
            fitView
            fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
            minZoom={0.45}
            maxZoom={1.25}
          >
            <Background gap={16} size={1} color="#d0d7de" />
          </ReactFlow>
        </div>
      </div>
      <RoleCatalog bank={bank} nodes={graph.nodes} edges={graph.edges} onAdd={addExperience} />
    </ReactFlowProvider>
  )
}

function RoleCatalog({
  bank,
  nodes,
  edges,
  onAdd,
}: {
  bank: Experience[]
  nodes: ResumeNode[]
  edges: ResumeEdge[]
  onAdd: (preset: Experience) => void
}) {
  const [query, setQuery] = useState('')
  const role = nodes.find(isRoleNode)
  const presets = filterExperiencesBank(query, bank)

  return (
    <aside className="catalog">
      <label className="catalog-search">
        <span className="sr-only">Search experiences</span>
        <input value={query} placeholder="Experience or skill" onChange={(event) => setQuery(event.target.value)} />
      </label>
      {presets.length === 0 ? (
        <p className="catalog-empty">No matches.</p>
      ) : (
        <ul className="catalog-list">
          {presets.map((preset) => {
            const used = role ? roleHasExperience(nodes, edges, role.id, preset.text) : false
            return (
              <li key={preset.id}>
                <button type="button" className="preset-item" disabled={used} onClick={() => onAdd(preset)}>
                  <span className="preset-category">{preset.category}</span>
                  <span className="preset-text">{preset.text}</span>
                  <span className="preset-skills">{preset.skills.join(' · ')}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </aside>
  )
}

function RoleNodeView({ data, selected }: NodeProps<RoleNode>) {
  return (
    <div className={selected ? 'flow-node is-selected' : 'flow-node'}>
      <div className="node-kicker">Role</div>
      <div className="node-title">{data.title.trim() || 'Untitled role'}</div>
      <div className="node-meta">{data.company.trim() || 'Company required'}</div>
      <Handle type="source" position={Position.Right} id="out" />
    </div>
  )
}

function BulletNodeView({ data, selected }: NodeProps<BulletNode>) {
  return (
    <div className={selected ? 'flow-node is-selected' : 'flow-node'}>
      <Handle type="target" position={Position.Left} id="in" />
      <div className="node-kicker">Experience</div>
      <div className="node-title">{data.text.trim() || 'Untitled experience'}</div>
    </div>
  )
}
