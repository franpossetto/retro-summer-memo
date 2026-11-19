import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { sectionsView } from '../../../../domain/content'
import { LONG_ACHIEVEMENT, hasResult, hasWeakOpening } from '../../../../domain/cvReview'
import { addBullet, addRole, moveBullet, moveRole, removeNode, removeRole, toggleSectionEntry, type CvGraph } from '../../../../domain/cvEditing'
import { writeProfile } from '../../../../domain/documentOps'
import { DEFAULT_BODY_ORDER, orderSections } from '../../../../domain/fonts'
import {
  PROFILE_SECTIONS,
  emptyEducationEntry,
  personalRoleOptions,
  roleDataFromPersonal,
  type BulletData,
  type BulletNode,
  type EducationEntry,
  type ProfileField,
  type RoleData,
} from '../../../../domain/model'
import { PromptHint } from '../../assistant/PromptHint'
import { fieldId, type EditorApi } from '../editorApi'
import { ChevronIcon, DownIcon, EyeIcon, PlusIcon, SparkIcon, TrashIcon, UpIcon } from '../icons'

/** A textarea that grows with its text. */
function AutoTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${element.scrollHeight}px`
  }, [props.value])
  return <textarea ref={ref} rows={1} {...props} />
}

/** Skills as comma-separated text, saved when leaving the field. */
function SkillsField({ skills, onChange, onFocus }: { skills: string[]; onChange: (skills: string[]) => void; onFocus: () => void }) {
  const joined = skills.join(', ')
  const [text, setText] = useState(joined)
  const [editing, setEditing] = useState(false)
  const shown = editing ? text : joined
  function commit() {
    setEditing(false)
    const next = [...new Set(text.split(',').map((skill) => skill.trim()).filter(Boolean))]
    if (next.join(', ') !== joined) onChange(next)
  }
  return (
    <input
      className="cv-skills-input"
      aria-label="Skills de este logro"
      placeholder="Skills: Node.js, Kafka…"
      value={shown}
      onFocus={() => {
        setText(joined)
        setEditing(true)
        onFocus()
      }}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
      }}
    />
  )
}

function IconButton({ label, onClick, disabled, children, tone }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode; tone?: 'danger' }) {
  return (
    <button type="button" className={tone ? `cv-icon-button is-${tone}` : 'cv-icon-button'} aria-label={label} title={label} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  )
}

function Card({ id, title, count, children, action }: { id: string; title: string; count?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="cv-card" id={fieldId(id)}>
      <div className="cv-card-head">
        <h3>{title}</h3>
        {count ? <span className="cv-card-count">{count}</span> : null}
        {action}
      </div>
      {children}
    </section>
  )
}

const patchRole = (id: string, patch: Partial<RoleData>) => (graph: CvGraph): CvGraph => ({
  ...graph,
  nodes: graph.nodes.map((node) => (node.id === id && node.type === 'role' ? { ...node, data: { ...node.data, ...patch } } : node)),
})

const patchBullet = (id: string, patch: Partial<BulletData>) => (graph: CvGraph): CvGraph => ({
  ...graph,
  nodes: graph.nodes.map((node) => (node.id === id && node.type === 'bullet' ? { ...node, data: { ...node.data, ...patch } } : node)),
})

const setEducation = (update: (entries: EducationEntry[]) => EducationEntry[]) => (graph: CvGraph): CvGraph => ({
  ...graph,
  nodes: graph.nodes.map((node) => (node.type === 'education' ? { ...node, data: { ...node.data, entries: update(node.data.entries) } } : node)),
})

const key = (title: string, company: string) => `${title.trim().toLowerCase()}|${company.trim().toLowerCase()}`

/** Everything the CV says, in the order it prints, editable in place. */
export function ContentPanel({ api, revealToken }: { api: EditorApi; revealToken: number }) {
  const { doc, cv, outline, focusRef, focus, setGraph } = api
  const [openRoles, setOpenRoles] = useState<Set<string>>(() => new Set(outline.roles.slice(0, 1).map((role) => role.node.id)))
  const [bankFor, setBankFor] = useState<string | null>(null)
  const [addingRole, setAddingRole] = useState(false)
  const enabled = new Set(cv.enabledSections)
  const views = useMemo(() => sectionsView(doc), [doc])
  const roleOfBullet = useMemo(() => {
    const owners = new Map<string, string>()
    for (const role of outline.roles) for (const bullet of role.bullets) owners.set(bullet.id, role.node.id)
    return owners
  }, [outline])

  // Something picked on the page: open the role that holds it, then (once it is on screen) bring
  // its field into view and put the cursor there.
  const pendingReveal = useRef<string | null>(null)
  useEffect(() => {
    if (!focusRef || revealToken === 0) return
    const [kind, id] = focusRef.split(':')
    const roleId = kind === 'role' ? id : kind === 'bullet' ? roleOfBullet.get(id) : undefined
    pendingReveal.current = focusRef
    if (roleId) setOpenRoles((current) => (current.has(roleId) ? current : new Set(current).add(roleId)))
    // Only when asked to reveal (a click on the page), not on every focus change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealToken])
  useEffect(() => {
    const ref = pendingReveal.current
    if (!ref) return
    const element = document.getElementById(fieldId(ref))
    if (!element) return
    pendingReveal.current = null
    element.scrollIntoView({ block: 'center', behavior: 'smooth' })
    const input = element.matches('input, textarea') ? element : element.querySelector<HTMLElement>('textarea, input')
    input?.focus({ preventScroll: true })
  })

  function toggleRole(id: string) {
    setOpenRoles((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function writeNewBullet(roleId: string) {
    const id = crypto.randomUUID()
    setGraph((graph) => addBullet(graph, roleId, { text: '', skills: [] }, id).graph)
    setOpenRoles((current) => new Set(current).add(roleId))
    requestAnimationFrame(() => focus(`bullet:${id}`, { reveal: true }))
  }

  const profile = doc.profile
  const updateProfile = (patch: Partial<typeof profile>) => api.setDoc((current) => writeProfile(current, { ...current.profile, ...patch }))
  const updateField = (id: string, patch: Partial<ProfileField>) => updateProfile({ fields: profile.fields.map((field) => (field.id === id ? { ...field, ...patch } : field)) })

  const onCv = new Set(outline.roles.map((role) => key(role.node.data.title, role.node.data.company)))
  const roleOptions = personalRoleOptions(profile.jobs).filter((option) => !onCv.has(key(option.title, option.company)))
  const experienceEntries = views.find((view) => view.id === 'experience')?.entries ?? []
  const otherSections = doc.sections.filter((section) => !PROFILE_SECTIONS.includes(section.id))
  const bodyOrder = orderSections([...DEFAULT_BODY_ORDER, ...otherSections.map((section) => section.id)], cv.sectionOrder).filter((id) => enabled.has(id))
  const hidden = [...DEFAULT_BODY_ORDER, ...otherSections.map((section) => section.id)].filter((id) => !enabled.has(id))
  const sectionName = (id: string) => doc.sections.find((section) => section.id === id)?.name.trim() || id
  const summaryLength = cv.summary.trim().length

  function experienceCard() {
    return (
      <Card
        key="experience"
        id="section:experience"
        title={sectionName('experience')}
        count={`${outline.roles.length} ${outline.roles.length === 1 ? 'rol' : 'roles'}`}
      >
        <div className="cv-roles">
          {outline.roles.map((role, index) => {
            const { node, bullets } = role
            const open = openRoles.has(node.id)
            const shown = bullets.filter((bullet) => !bullet.data.hidden).length
            const dates = [node.data.start, node.data.end].filter((part) => part.trim()).join(' – ')
            const entry = experienceEntries.find((item) => key(item.title, item.subtitle) === key(node.data.title, node.data.company))
            return (
              <div key={node.id} className={open ? 'cv-role is-open' : 'cv-role'} id={fieldId(`role:${node.id}`)}>
                <div className="cv-role-head">
                  <button type="button" className="cv-role-toggle" aria-expanded={open} onClick={() => toggleRole(node.id)}>
                    <span className="cv-role-titles">
                      <strong>{node.data.title.trim() || 'Rol sin título'}</strong>
                      <span>{[node.data.company.trim(), dates].filter(Boolean).join(' · ') || 'Completá empresa y fechas'}</span>
                    </span>
                  </button>
                  <span className="cv-role-tools">
                    <IconButton label="Subir rol" disabled={index === 0} onClick={() => setGraph((graph) => moveRole(graph, node.id, -1))}>
                      <UpIcon size={15} />
                    </IconButton>
                    <IconButton label="Bajar rol" disabled={index === outline.roles.length - 1} onClick={() => setGraph((graph) => moveRole(graph, node.id, 1))}>
                      <DownIcon size={15} />
                    </IconButton>
                    <IconButton label="Quitar rol de este CV" tone="danger" onClick={() => setGraph((graph) => removeRole(graph, node.id))}>
                      <TrashIcon size={15} />
                    </IconButton>
                  </span>
                  <button type="button" className="cv-role-chevron" aria-label={open ? 'Cerrar' : 'Abrir'} onClick={() => toggleRole(node.id)}>
                    <span className="cv-role-count" title="Logros visibles">
                      {shown}
                    </span>
                    <ChevronIcon size={18} />
                  </button>
                </div>
                {open ? (
                  <div className="cv-role-body">
                    <div className="cv-grid">
                      <label className="cv-field is-wide">
                        <span>Puesto</span>
                        <input value={node.data.title} onFocus={() => focus(`role:${node.id}`)} onChange={(event) => setGraph(patchRole(node.id, { title: event.target.value }))} />
                      </label>
                      <label className="cv-field is-wide">
                        <span>Empresa</span>
                        <input value={node.data.company} onFocus={() => focus(`role:${node.id}`)} onChange={(event) => setGraph(patchRole(node.id, { company: event.target.value }))} />
                      </label>
                      <label className="cv-field is-wide">
                        <span>Lugar</span>
                        <input value={node.data.location} placeholder="Madrid · Remoto" onFocus={() => focus(`role:${node.id}`)} onChange={(event) => setGraph(patchRole(node.id, { location: event.target.value }))} />
                      </label>
                      <label className="cv-field">
                        <span>Desde</span>
                        <input value={node.data.start} placeholder="2021" onFocus={() => focus(`role:${node.id}`)} onChange={(event) => setGraph(patchRole(node.id, { start: event.target.value }))} />
                      </label>
                      <label className="cv-field">
                        <span>Hasta</span>
                        <input value={node.data.end} placeholder="Actualidad" onFocus={() => focus(`role:${node.id}`)} onChange={(event) => setGraph(patchRole(node.id, { end: event.target.value }))} />
                      </label>
                    </div>

                    <ol className="cv-bullets">
                      {bullets.map((bullet, position) => (
                        <BulletRow
                          key={bullet.id}
                          bullet={bullet}
                          index={position}
                          last={position === bullets.length - 1}
                          focused={focusRef === `bullet:${bullet.id}`}
                          onFocus={() => focus(`bullet:${bullet.id}`)}
                          onChange={(patch) => setGraph(patchBullet(bullet.id, patch))}
                          onMove={(delta) => setGraph((graph) => moveBullet(graph, node.id, bullet.id, delta))}
                          onDelete={() => setGraph((graph) => removeNode(graph, bullet.id))}
                        />
                      ))}
                    </ol>
                    {bullets.length === 0 ? <p className="cv-empty">Sin logros todavía. Los roles recientes necesitan 3 a 5.</p> : null}

                    <div className="cv-role-actions">
                      <button type="button" className="cv-chip-button" onClick={() => writeNewBullet(node.id)}>
                        <PlusIcon size={15} /> Escribir logro
                      </button>
                      <button type="button" className={bankFor === node.id ? 'cv-chip-button is-on' : 'cv-chip-button'} onClick={() => setBankFor(bankFor === node.id ? null : node.id)}>
                        <SparkIcon size={15} /> Desde tu banco
                      </button>
                    </div>
                    {bankFor === node.id ? (
                      <BankPicker
                        api={api}
                        entryId={entry?.id}
                        taken={new Set(bullets.map((bullet) => bullet.data.text.trim().toLowerCase()))}
                        onPick={(item) => setGraph((graph) => addBullet(graph, node.id, { text: item.text, skills: item.skills }).graph)}
                      />
                    ) : null}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
        {addingRole ? (
          <div className="cv-picker">
            <p className="cv-picker-title">Sumá un rol de tu perfil</p>
            {roleOptions.length === 0 ? <p className="cv-empty">Todos tus roles ya están en este CV.</p> : null}
            {roleOptions.map((option) => (
              <button
                key={option.key}
                type="button"
                className="cv-picker-item"
                onClick={() => {
                  const id = crypto.randomUUID()
                  setGraph((graph) => addRole(graph, roleDataFromPersonal(option), id).graph)
                  setOpenRoles((current) => new Set(current).add(id))
                  setAddingRole(false)
                }}
              >
                <strong>{option.title}</strong>
                <span>{[option.company, [option.start, option.end].filter(Boolean).join(' – ')].filter(Boolean).join(' · ')}</span>
              </button>
            ))}
            <div className="cv-picker-foot">
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  const id = crypto.randomUUID()
                  setGraph((graph) => addRole(graph, { title: '', company: '', location: '', start: '', end: '' }, id).graph)
                  setOpenRoles((current) => new Set(current).add(id))
                  setAddingRole(false)
                }}
              >
                Rol en blanco
              </button>
              <button type="button" className="link-button" onClick={() => setAddingRole(false)}>
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="cv-add" onClick={() => setAddingRole(true)}>
            <PlusIcon size={16} /> Agregar rol
          </button>
        )}
      </Card>
    )
  }

  function educationCard() {
    const entries = outline.education?.data.entries ?? []
    const missing = profile.education.filter((study) => !entries.some((entry) => entry.id === study.id) && (study.school.trim() || study.degree.trim()))
    return (
      <Card key="education" id="section:education" title={sectionName('education')} count={entries.length > 0 ? String(entries.length) : undefined}>
        <div className="cv-studies">
          {entries.map((entry) => (
            <div key={entry.id} className="cv-study" id={fieldId(`edu:${entry.id}`)}>
              <div className="cv-grid">
                <label className="cv-field is-wide">
                  <span>Título</span>
                  <input value={entry.degree} onFocus={() => focus(`edu:${entry.id}`)} onChange={(event) => setGraph(setEducation((list) => list.map((item) => (item.id === entry.id ? { ...item, degree: event.target.value } : item))))} />
                </label>
                <label className="cv-field is-wide">
                  <span>Institución</span>
                  <input value={entry.school} onFocus={() => focus(`edu:${entry.id}`)} onChange={(event) => setGraph(setEducation((list) => list.map((item) => (item.id === entry.id ? { ...item, school: event.target.value } : item))))} />
                </label>
                <label className="cv-field">
                  <span>Desde</span>
                  <input value={entry.start} onFocus={() => focus(`edu:${entry.id}`)} onChange={(event) => setGraph(setEducation((list) => list.map((item) => (item.id === entry.id ? { ...item, start: event.target.value } : item))))} />
                </label>
                <label className="cv-field">
                  <span>Hasta</span>
                  <input value={entry.end} onFocus={() => focus(`edu:${entry.id}`)} onChange={(event) => setGraph(setEducation((list) => list.map((item) => (item.id === entry.id ? { ...item, end: event.target.value } : item))))} />
                </label>
              </div>
              <IconButton label="Quitar de este CV" tone="danger" onClick={() => setGraph(setEducation((list) => list.filter((item) => item.id !== entry.id)))}>
                <TrashIcon size={16} />
              </IconButton>
            </div>
          ))}
        </div>
        <div className="cv-role-actions">
          {missing.map((study) => (
            <button key={study.id} type="button" className="cv-chip-button" onClick={() => setGraph(setEducation((list) => [...list, { ...study }]))}>
              <PlusIcon size={15} /> {study.degree.trim() || study.school.trim()}
            </button>
          ))}
          <button type="button" className="cv-chip-button" onClick={() => setGraph(setEducation((list) => [...list, emptyEducationEntry()]))}>
            <PlusIcon size={15} /> Estudio en blanco
          </button>
        </div>
      </Card>
    )
  }

  function skillsCard() {
    const skills = api.draft.skills ?? []
    return (
      <Card
        key="skills"
        id="section:skills"
        title={sectionName('skills')}
        count={String(skills.length)}
        action={
          <div className="cv-segment is-small" role="group" aria-label="Formato de skills">
            <button type="button" className={(cv.skillsFormat ?? 'list') === 'comma' ? 'is-current' : undefined} onClick={() => api.patchCv({ skillsFormat: 'comma' })}>
              Comas
            </button>
            <button type="button" className={(cv.skillsFormat ?? 'list') === 'list' ? 'is-current' : undefined} onClick={() => api.patchCv({ skillsFormat: 'list' })}>
              Lista
            </button>
          </div>
        }
      >
        {skills.length > 0 ? (
          <ul className="cv-skill-chips">
            {skills.map((skill) => (
              <li key={skill}>{skill}</li>
            ))}
          </ul>
        ) : null}
        <p className="cv-note">Salen de los skills de cada logro: así cada skill está respaldada por algo que hiciste. Editalas en cada logro.</p>
      </Card>
    )
  }

  function sectionCard(id: string) {
    const view = views.find((item) => item.id === id)
    const entries = view?.entries ?? []
    const node = outline.sections.find((item) => item.data.sectionId === id)
    const chosen = node?.data.entryIds ? new Set(node.data.entryIds) : null
    const all = entries.map((entry) => entry.id)
    return (
      <Card key={id} id={`section:${id}`} title={sectionName(id)} count={entries.length > 0 ? `${chosen ? entries.filter((entry) => chosen.has(entry.id)).length : entries.length}/${entries.length}` : undefined}>
        {entries.length === 0 ? <p className="cv-empty">Esta sección no tiene entradas todavía.</p> : null}
        <ul className="cv-entries">
          {entries.map((entry) => {
            const on = !chosen || chosen.has(entry.id)
            const dates = [entry.start, entry.end].filter((part) => part.trim()).join(' – ')
            return (
              <li key={entry.id} id={fieldId(`entry:${entry.id}`)}>
                <label className={on ? 'cv-entry is-on' : 'cv-entry'}>
                  <input type="checkbox" checked={on} onChange={() => setGraph((graph) => toggleSectionEntry(graph, id, entry.id, all))} onFocus={() => focus(`entry:${entry.id}`)} />
                  <span>
                    <strong>{entry.title || 'Sin título'}</strong>
                    <small>{[entry.subtitle, dates].filter(Boolean).join(' · ')}</small>
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
        <p className="cv-note">Elegí qué mostrar en este CV. El texto de cada entrada se edita en Biblioteca y vale para todos tus CVs.</p>
      </Card>
    )
  }

  const review = api.review
  return (
    <div className="cv-content">
      {review ? (
        <div className="cv-review" role="status">
          <span>
            <strong>{review.title}</strong>
            <small>
              {review.index + 1} de {review.refs.length}
            </small>
          </span>
          <button type="button" className="cv-icon-button" aria-label="Anterior" onClick={() => api.stepReview(-1)} disabled={review.refs.length < 2}>
            <UpIcon size={15} />
          </button>
          <button type="button" className="cv-icon-button" aria-label="Siguiente" onClick={() => api.stepReview(1)} disabled={review.refs.length < 2}>
            <DownIcon size={15} />
          </button>
          <button type="button" className="link-button" onClick={api.endReview}>
            Listo
          </button>
        </div>
      ) : null}
      {enabled.has('personal') ? (
        <Card id="header" title="Encabezado">
          <label className="cv-field">
            <span>Nombre</span>
            <input className="cv-input-strong" value={profile.name} placeholder="Tu nombre" onFocus={() => focus('header')} onChange={(event) => updateProfile({ name: event.target.value })} />
          </label>
          <div className="cv-contact">
            {profile.fields.map((field) => (
              <div key={field.id} className="cv-contact-row">
                <input className="cv-contact-label" aria-label="Dato" value={field.label} placeholder="Dato" onFocus={() => focus('header')} onChange={(event) => updateField(field.id, { label: event.target.value })} />
                <input aria-label={field.label || 'Valor'} value={field.value} placeholder="Valor" onFocus={() => focus('header')} onChange={(event) => updateField(field.id, { value: event.target.value })} />
                <IconButton label={`Quitar ${field.label}`} onClick={() => updateProfile({ fields: profile.fields.filter((item) => item.id !== field.id) })}>
                  <TrashIcon size={15} />
                </IconButton>
              </div>
            ))}
          </div>
          <button type="button" className="cv-add is-small" onClick={() => updateProfile({ fields: [...profile.fields, { id: crypto.randomUUID(), label: '', value: '', kind: 'text' }] })}>
            <PlusIcon size={15} /> Dato de contacto
          </button>
          <p className="cv-note">Tus datos personales son los mismos en todos tus CVs.</p>

          <label className="cv-field cv-summary" id={fieldId('summary')}>
            <span>Resumen</span>
            <AutoTextarea
              value={cv.summary}
              placeholder="Backend engineer con 8 años en pagos. Lidero equipos y diseño plataformas confiables: bajé un 40% la latencia de…"
              onFocus={() => focus('summary')}
              onChange={(event) => api.patchCv({ summary: event.target.value })}
            />
          </label>
          <div className="cv-meter" aria-label={`${summaryLength} caracteres`}>
            <div className="cv-meter-track">
              <span className="cv-meter-ideal" />
              <span className={summaryLength > 600 || (summaryLength > 0 && summaryLength < 120) ? 'cv-meter-value is-off' : 'cv-meter-value'} style={{ width: `${Math.min(100, (summaryLength / 700) * 100)}%` }} />
            </div>
            <span>{summaryLength} caracteres · ideal 2 a 4 líneas</span>
          </div>
        </Card>
      ) : null}

      {bodyOrder.map((id) =>
        id === 'experience' ? experienceCard() : id === 'education' ? educationCard() : id === 'skills' ? skillsCard() : sectionCard(id),
      )}

      {hidden.length > 0 ? (
        <p className="cv-hidden-sections">
          Ocultas en este CV: {hidden.map(sectionName).join(', ')}.{' '}
          <button type="button" className="link-button" onClick={() => api.openPanel('sections')}>
            Mostrarlas
          </button>
        </p>
      ) : null}

      {outline.loose.length > 0 ? (
        <p className="cv-note">
          {outline.loose.length} {outline.loose.length === 1 ? 'logro suelto' : 'logros sueltos'} en el grafo, sin rol: no se imprimen.
        </p>
      ) : null}

      {api.assistant ? (
        <PromptHint
          prompt={`Mejorá los logros de mi CV "${cv.title.trim() || 'Sin título'}": resultados medibles y verbos de acción, sin inventar`}
          onConnect={api.assistant.connected ? undefined : api.assistant.onConnect}
        />
      ) : null}
    </div>
  )
}

function BulletRow({
  bullet,
  index,
  last,
  focused,
  onFocus,
  onChange,
  onMove,
  onDelete,
}: {
  bullet: BulletNode
  index: number
  last: boolean
  focused: boolean
  onFocus: () => void
  onChange: (patch: Partial<BulletData>) => void
  onMove: (delta: -1 | 1) => void
  onDelete: () => void
}) {
  const text = bullet.data.text
  const flags = text.trim()
    ? [
        !hasResult(text) ? 'Sin número' : '',
        hasWeakOpening(text) ? 'Verbo débil' : '',
        text.length > LONG_ACHIEVEMENT ? 'Largo' : '',
      ].filter(Boolean)
    : []
  const className = ['cv-bullet', bullet.data.hidden ? 'is-hidden' : '', focused ? 'is-focused' : ''].filter(Boolean).join(' ')
  return (
    <li className={className} id={fieldId(`bullet:${bullet.id}`)}>
      <span className="cv-bullet-index">{index + 1}</span>
      <div className="cv-bullet-main">
        <AutoTextarea aria-label={`Logro ${index + 1}`} value={text} placeholder="Verbo + qué hiciste + resultado medible" onFocus={onFocus} onChange={(event) => onChange({ text: event.target.value })} />
        <div className="cv-bullet-meta">
          {bullet.data.hidden ? <span className="cv-flag is-muted">Oculto</span> : null}
          {flags.map((flag) => (
            <span key={flag} className="cv-flag">
              {flag}
            </span>
          ))}
          <SkillsField skills={bullet.data.skills} onFocus={onFocus} onChange={(skills) => onChange({ skills })} />
        </div>
      </div>
      <div className="cv-bullet-tools">
        <IconButton label="Subir" disabled={index === 0} onClick={() => onMove(-1)}>
          <UpIcon size={15} />
        </IconButton>
        <IconButton label="Bajar" disabled={last} onClick={() => onMove(1)}>
          <DownIcon size={15} />
        </IconButton>
        <IconButton label={bullet.data.hidden ? 'Mostrar en el CV' : 'Ocultar del CV'} onClick={() => onChange({ hidden: bullet.data.hidden ? undefined : true })}>
          <EyeIcon size={15} off={!bullet.data.hidden} />
        </IconButton>
        <IconButton label="Borrar logro" tone="danger" onClick={onDelete}>
          <TrashIcon size={15} />
        </IconButton>
      </div>
    </li>
  )
}

/** Achievements from the experience bank: the ones from this role first. */
function BankPicker({ api, entryId, taken, onPick }: { api: EditorApi; entryId?: string; taken: Set<string>; onPick: (item: { text: string; skills: string[] }) => void }) {
  const [query, setQuery] = useState('')
  const words = query.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\s+/).filter(Boolean)
  const items = api.doc.bank
    .filter((item) => item.text.trim() && !taken.has(item.text.trim().toLowerCase()))
    .filter((item) => {
      const haystack = [item.text, ...item.skills].join(' ').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      return words.every((word) => haystack.includes(word))
    })
    .sort((left, right) => Number(right.entryId === entryId && Boolean(entryId)) - Number(left.entryId === entryId && Boolean(entryId)))
    .slice(0, 30)
  return (
    <div className="cv-picker">
      <input className="cv-picker-search" autoFocus placeholder="Buscar en tu banco de logros…" value={query} onChange={(event) => setQuery(event.target.value)} />
      {items.length === 0 ? <p className="cv-empty">{api.doc.bank.length === 0 ? 'Tu banco está vacío: pedile a tu asistente que cargue tu experiencia.' : 'No hay más logros que coincidan.'}</p> : null}
      {items.map((item) => (
        <button key={item.id} type="button" className="cv-picker-item" onClick={() => onPick(item)}>
          <span className="cv-picker-text">{item.text}</span>
          <span>
            {item.entryId === entryId && entryId ? <em>De este rol · </em> : null}
            {item.skills.join(' · ')}
          </span>
        </button>
      ))}
    </div>
  )
}
