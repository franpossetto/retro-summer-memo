import { useMemo, useState } from 'react'
import {
  addApplicationNote,
  findDuplicates,
  moveApplication,
  removeApplicationNote,
  updateApplication,
  type Application,
  type ApplicationStatus,
} from '../../../domain/applications'
import type { Cv } from '../../../domain/model'
import { formatDateTime, formatDay, relativeTime } from '../../format'
import { CvAttachmentPicker } from './CvAttachmentPicker'
import { resolveVersion } from './cvs'
import { DuplicateAlert } from './DuplicateAlert'
import { StatusDot, StatusPill } from './StatusPill'

type ApplicationDetailProps = {
  application: Application
  applications: Application[]
  statuses: ApplicationStatus[]
  cvs: Cv[]
  onChange: (next: Application) => void
  onDelete: () => void
  onEdit: () => void
  onClose: () => void
  onSelect: (applicationId: string) => void
  onOpenCv: (cvId: string, versionId: string) => void
  onBuildCv: () => void
}

export function ApplicationDetail({
  application,
  applications,
  statuses,
  cvs,
  onChange,
  onDelete,
  onEdit,
  onClose,
  onSelect,
  onOpenCv,
  onBuildCv,
}: ApplicationDetailProps) {
  /** Status picked in the step form; null follows wherever the application is now. */
  const [picked, setPicked] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const statusById = useMemo(() => new Map(statuses.map((status) => [status.id, status])), [statuses])
  const related = useMemo(() => findDuplicates(applications, application, application.id), [applications, application])

  const current = statusById.get(application.statusId)
  const index = statuses.findIndex((status) => status.id === application.statusId)
  const next = current?.kind === 'active' ? statuses.slice(index + 1).find((status) => status.kind !== 'withdrawn') : undefined
  const target = picked ?? application.statusId
  const moving = target !== application.statusId
  const canSubmit = moving || note.trim() !== ''

  function submitStep() {
    if (!canSubmit) return
    onChange(moving ? moveApplication(application, target, note) : addApplicationNote(application, note))
    setPicked(null)
    setNote('')
  }

  function moveTo(statusId: string) {
    onChange(moveApplication(application, statusId, note))
    setPicked(null)
    setNote('')
  }


  const attachment = application.attachment
  const attachedCv = attachment?.kind === 'cv' ? cvs.find((cv) => cv.id === attachment.cvId) : undefined
  const attachedVersionId = attachment?.kind === 'cv' ? attachment.versionId : ''
  const appliedOn = application.appliedOn || application.createdAt.slice(0, 10)
  const history = [...application.events].reverse()

  return (
    <aside className="tracker-detail" aria-label={`Postulación a ${application.company}`}>
      <div className="tracker-detail-head">
        <div>
          <h2>{application.company || 'Sin empresa'}</h2>
          <p className="tracker-detail-title">{application.title || 'Sin puesto'}</p>
        </div>
        <button type="button" className="view-close" aria-label="Cerrar" onClick={onClose}>
          ×
        </button>
      </div>

      <p className="tracker-detail-meta">
        <StatusPill status={current} />
        <span>
          Postulado el {formatDay(appliedOn)} ({relativeTime(appliedOn)})
        </span>
        {application.location ? <span>{application.location}</span> : null}
        {application.url ? (
          <a href={application.url} target="_blank" rel="noreferrer">
            Ver aviso ↗
          </a>
        ) : null}
      </p>

      <section className="tracker-section">
        <h3>Próximo paso</h3>
        {next ? (
          <button type="button" className="button next-step" onClick={() => moveTo(next.id)}>
            <StatusDot status={next} /> Pasar a {next.name} →
          </button>
        ) : null}
        <div className="step-form">
          <select aria-label="Estado" value={target} onChange={(event) => setPicked(event.target.value)}>
            {statuses.map((status) => (
              <option key={status.id} value={status.id}>
                {status.id === application.statusId ? `${status.name} (actual)` : status.name}
              </option>
            ))}
          </select>
          <textarea
            aria-label="Nota"
            value={note}
            rows={2}
            placeholder={moving ? 'Nota para este paso (opcional): fecha de la call, quién te contactó…' : 'Agregá una nota a este paso…'}
            onChange={(event) => setNote(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) submitStep()
            }}
          />
          <button type="button" className="button primary" disabled={!canSubmit} onClick={submitStep}>
            {moving ? `Mover a ${statusById.get(target)?.name ?? ''}` : 'Agregar nota'}
          </button>
        </div>
      </section>

      <section className="tracker-section">
        <h3>CV enviado</h3>
        <CvAttachmentPicker
          cvs={cvs}
          value={application.attachment}
          onChange={(attachment) => onChange(updateApplication(application, { attachment }))}
        />
        <div className="tracker-cv-actions">
          {attachedCv ? (
            <button type="button" className="button" onClick={() => onOpenCv(attachedCv.id, resolveVersion(attachedCv, attachedVersionId)?.id ?? '')}>
              Abrir CV
            </button>
          ) : null}
          {!attachment ? (
            <button type="button" className="button" onClick={onBuildCv}>
              Armar CV para esta postulación
            </button>
          ) : null}
        </div>
        {attachedCv && attachedVersionId === '' ? (
          <p className="form-hint">Cuando lo mandes, fijá la versión enviada para saber exactamente qué recibieron.</p>
        ) : null}
      </section>

      <DuplicateAlert matches={related} statuses={statuses} onOpen={onSelect} related />

      <section className="tracker-section">
        <h3>Historial</h3>
        <ol className="tracker-history">
          {history.map((event) => (
            <li key={event.id} className={`is-${event.kind}`}>
              <StatusDot status={statusById.get(event.statusId)} />
              <div>
                {event.kind === 'status' ? (
                  <span>
                    Pasó a <strong>{statusById.get(event.statusId)?.name ?? 'un estado borrado'}</strong>
                  </span>
                ) : (
                  <p className="tracker-note">{event.text}</p>
                )}
                <time dateTime={event.at}>{formatDateTime(event.at)}</time>
              </div>
              {event.kind === 'note' ? (
                <button type="button" className="view-close" aria-label="Borrar nota" title="Borrar nota" onClick={() => onChange(removeApplicationNote(application, event.id))}>
                  ×
                </button>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      {application.posting.trim() ? (
        <details className="tracker-section tracker-posting">
          <summary>Aviso</summary>
          <div>{application.posting}</div>
        </details>
      ) : null}

      <div className="tracker-detail-foot">
        <button type="button" className="button" onClick={onEdit}>
          Editar datos
        </button>
        {confirmDelete ? (
          <span className="confirm-inline">
            ¿Eliminar esta postulación?
            <button type="button" className="button danger" onClick={onDelete}>
              Eliminar
            </button>
            <button type="button" className="button" onClick={() => setConfirmDelete(false)}>
              No
            </button>
          </span>
        ) : (
          <button type="button" className="button" onClick={() => setConfirmDelete(true)}>
            Eliminar
          </button>
        )}
      </div>
    </aside>
  )
}
