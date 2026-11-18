import { useEffect, useState } from 'react'
import {
  addStatus,
  removeStatus,
  statusKinds,
  type Application,
  type ApplicationStatus,
  type ApplicationStatusKind,
} from '../../../domain/applications'

type StatusEditorProps = {
  statuses: ApplicationStatus[]
  applications: Application[]
  onChange: (statuses: ApplicationStatus[], applications: Application[]) => void
  onClose: () => void
}

/** Create, rename, recolor, reorder and delete the pipeline steps. Changes apply as you go. */
export function StatusEditor({ statuses, applications, onChange, onClose }: StatusEditorProps) {
  const [removing, setRemoving] = useState<{ id: string; fallbackId: string } | null>(null)
  const [newName, setNewName] = useState('')

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const counts = new Map<string, number>()
  for (const application of applications) counts.set(application.statusId, (counts.get(application.statusId) ?? 0) + 1)

  function patch(id: string, change: Partial<ApplicationStatus>) {
    onChange(statuses.map((status) => (status.id === id ? { ...status, ...change } : status)), applications)
  }

  function move(index: number, delta: number) {
    const next = [...statuses]
    const [item] = next.splice(index, 1)
    next.splice(index + delta, 0, item)
    onChange(next, applications)
  }

  function add() {
    const result = addStatus(statuses, newName)
    onChange(result.statuses, applications)
    setNewName('')
  }

  function startRemove(index: number) {
    const id = statuses[index].id
    const fallback = statuses[index - 1] ?? statuses[index + 1]
    if (!fallback) return
    if ((counts.get(id) ?? 0) === 0) {
      onChange(statuses.filter((status) => status.id !== id), applications)
      return
    }
    setRemoving({ id, fallbackId: fallback.id })
  }

  function confirmRemove() {
    if (!removing) return
    const result = removeStatus(statuses, applications, removing.id, removing.fallbackId)
    onChange(result.statuses, result.applications)
    setRemoving(null)
  }

  return (
    <div className="composer-backdrop" onClick={onClose}>
      <div
        className="cv-draft composer composer-wide status-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="status-editor-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="composer-head">
          <h2 id="status-editor-title">Estados</h2>
          <button type="button" className="view-close" aria-label="Cerrar" onClick={onClose}>
            ×
          </button>
        </div>
        <p className="form-hint">
          Los pasos de tu proceso, en orden. Las postulaciones nuevas arrancan en el primero “en proceso”. El tipo le dice a los
          filtros si la postulación sigue abierta.
        </p>

        <ol className="status-rows">
          {statuses.map((status, index) => (
            <li key={status.id}>
              <div className="status-row">
                <input
                  type="color"
                  aria-label={`Color de ${status.name}`}
                  value={status.color}
                  onChange={(event) => patch(status.id, { color: event.target.value })}
                />
                <input
                  className="status-name"
                  aria-label="Nombre"
                  value={status.name}
                  onChange={(event) => patch(status.id, { name: event.target.value })}
                  onBlur={(event) => {
                    if (!event.target.value.trim()) patch(status.id, { name: 'Estado' })
                  }}
                />
                <select
                  aria-label={`Tipo de ${status.name}`}
                  value={status.kind}
                  onChange={(event) => patch(status.id, { kind: event.target.value as ApplicationStatusKind })}
                >
                  {statusKinds.map((item) => (
                    <option key={item.kind} value={item.kind}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <span className="status-count" title="Postulaciones en este estado">
                  {counts.get(status.id) ?? 0}
                </span>
                <button type="button" className="icon-button" aria-label="Subir" title="Subir" disabled={index === 0} onClick={() => move(index, -1)}>
                  ↑
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Bajar"
                  title="Bajar"
                  disabled={index === statuses.length - 1}
                  onClick={() => move(index, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Eliminar ${status.name}`}
                  title="Eliminar"
                  disabled={statuses.length === 1}
                  onClick={() => startRemove(index)}
                >
                  ×
                </button>
              </div>
              {removing?.id === status.id ? (
                <div className="status-remove">
                  {counts.get(status.id)} {counts.get(status.id) === 1 ? 'postulación pasa' : 'postulaciones pasan'} a
                  <select
                    aria-label="Mover a"
                    value={removing.fallbackId}
                    onChange={(event) => setRemoving({ ...removing, fallbackId: event.target.value })}
                  >
                    {statuses
                      .filter((item) => item.id !== status.id)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                  </select>
                  <button type="button" className="button danger" onClick={confirmRemove}>
                    Eliminar estado
                  </button>
                  <button type="button" className="button" onClick={() => setRemoving(null)}>
                    Cancelar
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ol>

        <form
          className="status-add"
          onSubmit={(event) => {
            event.preventDefault()
            add()
          }}
        >
          <input aria-label="Nuevo estado" value={newName} placeholder="Nuevo estado, ej. Call con el CTO" onChange={(event) => setNewName(event.target.value)} />
          <button type="submit" className="button">
            Agregar
          </button>
        </form>

        <div className="composer-actions">
          <button type="button" className="button primary" onClick={onClose}>
            Listo
          </button>
        </div>
      </div>
    </div>
  )
}
