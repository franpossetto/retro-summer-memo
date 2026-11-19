import { useState, type FormEvent } from 'react'
import { saveSection, sectionsView } from '../../../../domain/content'
import { moveInOrder, toggleCvSection } from '../../../../domain/cvEditing'
import { DEFAULT_BODY_ORDER, orderSections } from '../../../../domain/fonts'
import { PROFILE_SECTIONS } from '../../../../domain/model'
import { fieldId, type EditorApi } from '../editorApi'
import { DownIcon, PlusIcon, UpIcon } from '../icons'

function Switch({ on, label, onChange }: { on: boolean; label: string; onChange: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={on ? 'cv-switch is-on' : 'cv-switch'} onClick={onChange}>
      <span />
    </button>
  )
}

/** A heading being renamed: shows what is typed (even empty) and saves every non-empty value. */
function NameInput({ value, onCommit, onFocus }: { value: string; onCommit: (value: string) => void; onFocus: () => void }) {
  const [text, setText] = useState<string | null>(null)
  return (
    <input
      aria-label="Título de la sección"
      value={text ?? value}
      onFocus={() => {
        setText(value)
        onFocus()
      }}
      onChange={(event) => {
        setText(event.target.value)
        if (event.target.value.trim()) onCommit(event.target.value)
      }}
      onBlur={() => setText(null)}
    />
  )
}

/** Which sections the CV shows and in what order; their headings are named here too. */
export function SectionsPanel({ api }: { api: EditorApi }) {
  const { doc, cv, outline } = api
  const [adding, setAdding] = useState('')
  const enabled = new Set(cv.enabledSections)
  const others = doc.sections.filter((section) => !PROFILE_SECTIONS.includes(section.id))
  const order = orderSections([...DEFAULT_BODY_ORDER, ...others.map((section) => section.id)], cv.sectionOrder)
  const views = sectionsView(doc)
  const name = (id: string) => doc.sections.find((section) => section.id === id)?.name ?? id
  const rename = (id: string, value: string) => api.setDoc((current) => saveSection(current, { id, name: value }).document)
  const toggle = (id: string) => api.setDoc((current) => toggleCvSection(current, id))

  function detail(id: string) {
    if (id === 'experience') return `${outline.roles.length} ${outline.roles.length === 1 ? 'rol' : 'roles'}`
    if (id === 'education') {
      const count = outline.education?.data.entries.length ?? 0
      return `${count} ${count === 1 ? 'estudio' : 'estudios'}`
    }
    if (id === 'skills') return `${api.draft.skills?.length ?? 0} skills, de tus logros`
    const count = views.find((view) => view.id === id)?.entries.length ?? 0
    return count === 0 ? 'Sin entradas' : `${count} ${count === 1 ? 'entrada' : 'entradas'}`
  }

  function add(event: FormEvent) {
    event.preventDefault()
    const title = adding.trim()
    if (!title) return
    api.setDoc((current) => {
      const created = saveSection(current, { name: title })
      return created.document.cvs.find((item) => item.id === current.activeCvId)?.enabledSections.includes(created.sectionId)
        ? created.document
        : toggleCvSection(created.document, created.sectionId)
    })
    setAdding('')
  }

  return (
    <div className="cv-sections">
      <div className={enabled.has('personal') ? 'cv-section-row is-pinned' : 'cv-section-row is-pinned is-off'}>
        <span className="cv-section-grip" aria-hidden="true">
          1
        </span>
        <div className="cv-section-main">
          <strong>Encabezado</strong>
          <small>Nombre, contacto y resumen · siempre arriba</small>
        </div>
        <Switch on={enabled.has('personal')} label="Mostrar encabezado" onChange={() => toggle('personal')} />
      </div>

      <ol className="cv-section-list">
        {order.map((id, index) => {
          const on = enabled.has(id)
          return (
            <li key={id} id={fieldId(`section:${id}`)} className={[on ? 'cv-section-row' : 'cv-section-row is-off', api.focusRef === `section:${id}` ? 'is-focused' : ''].join(' ')}>
              <span className="cv-section-order">
                <button type="button" className="cv-icon-button" aria-label={`Subir ${name(id)}`} disabled={index === 0} onClick={() => api.patchCv({ sectionOrder: moveInOrder(order, id, -1) })}>
                  <UpIcon size={15} />
                </button>
                <button type="button" className="cv-icon-button" aria-label={`Bajar ${name(id)}`} disabled={index === order.length - 1} onClick={() => api.patchCv({ sectionOrder: moveInOrder(order, id, 1) })}>
                  <DownIcon size={15} />
                </button>
              </span>
              <div className="cv-section-main">
                <NameInput value={name(id)} onFocus={() => api.focus(`section:${id}`)} onCommit={(value) => rename(id, value)} />
                <small>{detail(id)}</small>
              </div>
              <Switch on={on} label={`Mostrar ${name(id)}`} onChange={() => toggle(id)} />
            </li>
          )
        })}
      </ol>

      <form className="cv-section-add" onSubmit={add}>
        <input placeholder="Nueva sección: Certificaciones, Idiomas, Voluntariado…" value={adding} onChange={(event) => setAdding(event.target.value)} />
        <button type="submit" className="button" disabled={!adding.trim()}>
          <PlusIcon size={15} /> Agregar
        </button>
      </form>
      <p className="cv-note">El título de cada sección se imprime en el CV y es el mismo en todos tus CVs: cambialo al idioma del aviso.</p>
    </div>
  )
}
