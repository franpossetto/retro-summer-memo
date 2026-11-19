import { contactParts, isBulletNode, isEducationNode, isPersonNode, isRoleNode, type CatalogSection, type ResumeEdge, type ResumeNode } from '../../domain/model'

type SourceTableProps = {
  nodes: ResumeNode[]
  edges: ResumeEdge[]
  sections?: CatalogSection[]
  onSelect: (id: string) => void
  onToggleHidden: (id: string) => void
}

type Row = {
  id: string
  kind: string
  detail: string
  skills: string
  linked: string
  selected: boolean
  hidden: boolean
  canHide: boolean
}

export function SourceTable({ nodes, edges, onSelect, onToggleHidden }: SourceTableProps) {
  const rows = tableRows(nodes, edges)

  return (
    <div className="source-table-wrap">
      <table className="source-table">
        <thead>
          <tr>
            <th className="col-index" />
            <th className="col-hide" />
            <th>Tipo</th>
            <th className="col-detail">Detalle</th>
            <th>Metadatos</th>
            <th>Conectado</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id} aria-selected={row.selected} className={rowClass(row)} onClick={() => onSelect(row.id)}>
              <td className="col-index">{index + 1}</td>
              <td className="col-hide">
                {row.canHide ? (
                  <button
                    type="button"
                    className="row-hide"
                    aria-pressed={row.hidden}
                    aria-label={row.hidden ? `Mostrar ${row.kind}` : `Ocultar ${row.kind}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      onToggleHidden(row.id)
                    }}
                  >
                    <EyeIcon hidden={row.hidden} />
                  </button>
                ) : null}
              </td>
              <td>{row.kind}</td>
              <td className="col-detail" title={row.detail}>{row.detail}</td>
              <td title={row.skills}>{row.skills}</td>
              <td title={row.linked}>{row.linked}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function tableRows(nodes: ResumeNode[], edges: ResumeEdge[]): Row[] {
  const rows: Row[] = []
  const person = nodes.find(isPersonNode)
  if (person) {
    const contact = contactParts(person.data.fields)
    rows.push({
      id: person.id,
      kind: 'Personal',
      detail: person.data.name.trim() || 'Datos personales',
      skills: '',
      linked: contact.join(' · '),
      selected: person.selected === true,
      hidden: person.data.hidden === true,
      canHide: true,
    })
  }

  const roles = nodes.filter(isRoleNode).sort(byPosition)
  const bullets = nodes.filter(isBulletNode)
  const used = new Set<string>()

  for (const role of roles) {
    const dates = [role.data.start, role.data.end].filter(Boolean).join(' – ')
    const place = [role.data.company.trim(), dates].filter(Boolean).join(' · ')
    rows.push({
      id: role.id,
      kind: 'Experiencia laboral',
      detail: role.data.title.trim() || 'Sin título',
      skills: '',
      linked: place,
      selected: role.selected === true,
      hidden: false,
      canHide: false,
    })

    const children = edges.flatMap((edge) => {
      if (edge.source !== role.id) return []
      const bullet = bullets.find((node) => node.id === edge.target)
      return bullet ? [bullet] : []
    })
    children.sort(byPosition)
    for (const child of children) {
      if (used.has(child.id)) continue
      used.add(child.id)
      rows.push(experienceRow(child, role.data.title.trim() || 'Puesto sin título'))
    }
  }

  for (const bullet of bullets.filter((node) => !used.has(node.id)).sort(byPosition)) {
    rows.push(experienceRow(bullet, 'Sin conectar'))
  }

  const education = nodes.find(isEducationNode)
  if (education) {
    const studies = education.data.entries
      .map((entry) => [entry.school.trim(), entry.degree.trim()].filter(Boolean).join(', '))
      .filter(Boolean)
    rows.push({
      id: education.id,
      kind: 'Educación',
      detail: studies.join(' · ') || 'Educación',
      skills: '',
      linked: '',
      selected: education.selected === true,
      hidden: false,
      canHide: false,
    })
  }

  return rows
}

function experienceRow(node: ResumeNode & { type: 'bullet' }, linked: string): Row {
  return {
    id: node.id,
    kind: 'Skill',
    detail: node.data.text.trim() || 'Skill vacía',
    skills: node.data.skills.join(', '),
    linked,
    selected: node.selected === true,
    hidden: node.data.hidden === true,
    canHide: true,
  }
}

function rowClass(row: Row) {
  const names = []
  if (row.selected) names.push('is-selected')
  if (row.hidden) names.push('is-hidden')
  return names.join(' ') || undefined
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

function byPosition(a: ResumeNode, b: ResumeNode) {
  if (a.position.y !== b.position.y) return a.position.y - b.position.y
  if (a.position.x !== b.position.x) return a.position.x - b.position.x
  return a.id.localeCompare(b.id)
}
