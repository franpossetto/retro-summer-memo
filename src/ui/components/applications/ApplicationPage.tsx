import { useEffect, useMemo, useRef, useState } from 'react'
import { upcomingEvents } from '../../../domain/applicationFilters'
import {
  companyKey,
  findDuplicates,
  moveApplication,
  removeApplicationNote,
  updateApplication,
  type Application,
  type ApplicationStatus,
} from '../../../domain/applications'
import { applicationsTo, companyOf, type Company, type CompanyInput, type CompanyNoteInput } from '../../../domain/companies'
import type { Cv } from '../../../domain/model'
import { formatDateTime, formatDay, relativeTime, todayYmd } from '../../format'
import { CompanyLogo } from '../companies/CompanyLogo'
import { CompanyPanel } from '../companies/CompanyPanel'
import { ExtraFields } from '../ExtraFields'
import { CvAttachmentPicker } from './CvAttachmentPicker'
import { resolveVersion } from './cvs'
import { DuplicateAlert } from './DuplicateAlert'
import { eventKindLabel } from './eventKinds'
import { StageTimeline } from './StageTimeline'
import { StatusSelect } from './StatusPill'

export type CompanyActions = {
  /** Each returns an error message, or null when it was saved. */
  save: (input: CompanyInput) => string | null
  saveNote: (company: string, input: CompanyNoteInput) => string | null
  deleteNote: (companyId: string, noteId: string) => void
  delete: (companyId: string) => void
}

type ApplicationPageProps = {
  application: Application
  applications: Application[]
  statuses: ApplicationStatus[]
  companies: Company[]
  cvs: Cv[]
  now: Date
  onChange: (next: Application) => void
  company: CompanyActions
  onDelete: () => void
  onEdit: () => void
  onClose: () => void
  onSelect: (applicationId: string) => void
  onOpenCv: (cvId: string, versionId: string) => void
  onBuildCv: () => void
  assistant?: { connected: boolean; onConnect: () => void }
}

/**
 * One application as a page: the process step by step (how each step went, what is scheduled,
 * what comes next) next to everything known about the company.
 */
export function ApplicationPage({
  application,
  applications,
  statuses,
  companies,
  cvs,
  now,
  onChange,
  company: companyActions,
  onDelete,
  onEdit,
  onClose,
  onSelect,
  onOpenCv,
  onBuildCv,
  assistant,
}: ApplicationPageProps) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const page = useRef<HTMLDivElement>(null)
  // Applications to this same company are listed in the company panel; this catches the rest
  // (the same posting saved under another company name).
  const related = useMemo(
    () => findDuplicates(applications, application, application.id).filter((match) => companyKey(match.application.company) !== companyKey(application.company)),
    [applications, application],
  )
  const company = companyOf(companies, application)
  const toCompany = applicationsTo(applications, application.company)

  // Opening another application (e.g. from the company panel) starts at the top of the page.
  useEffect(() => {
    page.current?.closest('.home')?.scrollTo({ top: 0 })
  }, [application.id])

  const attachment = application.attachment
  const attachedCv = attachment?.kind === 'cv' ? cvs.find((cv) => cv.id === attachment.cvId) : undefined
  const attachedVersionId = attachment?.kind === 'cv' ? attachment.versionId : ''
  const appliedOn = application.appliedOn || application.createdAt
  const notYet = !application.appliedOn && statuses.find((status) => status.id === application.statusId)?.kind === 'considering'
  const upcoming = upcomingEvents(application, now)
  const companyName = application.company || 'Sin empresa'

  return (
    <div className="app-page" ref={page}>
      <button type="button" className="link-button app-page-back" onClick={onClose}>
        ← Postulaciones
      </button>

      <header className="app-page-head">
        <CompanyLogo name={company?.name || companyName} company={company} size={64} />
        <div className="app-page-titles">
          <h1>{companyName}</h1>
          <p className="app-page-role">{application.title || 'Sin puesto'}</p>
          <p className="app-page-meta">
            <span>
              {notYet ? 'Guardado' : 'Postulado'} el {formatDay(appliedOn)} ({relativeTime(appliedOn, now)}){notYet ? ' · todavía no te postulaste' : ''}
            </span>
            {application.location ? <span>{application.location}</span> : null}
            {application.url ? (
              <a href={application.url} target="_blank" rel="noreferrer">
                Ver aviso ↗
              </a>
            ) : null}
          </p>
        </div>
        <div className="app-page-actions">
          <StatusSelect
            statuses={statuses}
            value={application.statusId}
            label={`Estado de ${companyName}`}
            onChange={(statusId) => onChange(moveApplication(application, statusId, '', new Date(), { statuses, appliedOn: todayYmd() }))}
          />
          <button type="button" className="button" onClick={onEdit}>
            Editar datos
          </button>
        </div>
      </header>

      <div className="app-page-grid">
        <div className="app-page-main">
          {upcoming.length > 0 ? (
            <section className="page-card">
              <h2>Agendado</h2>
              <ul className="tracker-upcoming">
                {upcoming.map((event) => (
                  <li key={event.id}>
                    <time dateTime={event.at}>{formatDateTime(event.at)}</time>
                    <span>
                      {event.kind !== 'note' ? <strong>{eventKindLabel(event.kind)}</strong> : null} {event.text}
                    </span>
                    <button
                      type="button"
                      className="view-close"
                      aria-label="Quitar"
                      title="Quitar"
                      onClick={() => onChange(removeApplicationNote(application, event.id))}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="page-card">
            <h2>Cómo viene el proceso</h2>
            <StageTimeline key={application.id} application={application} statuses={statuses} now={now} onChange={onChange} assistant={assistant} />
          </section>

          <section className="page-card">
            <h2>CV enviado</h2>
            <CvAttachmentPicker cvs={cvs} value={application.attachment} onChange={(next) => onChange(updateApplication(application, { attachment: next }))} />
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

          <section className="page-card">
            <h2>Más datos del puesto</h2>
            <ExtraFields
              key={application.id}
              value={application.extra}
              empty="Sueldo, recruiter, modalidad, contacto… lo que quieras guardar de esta postulación."
              onChange={(extra) => onChange(updateApplication(application, { extra }))}
            />
          </section>

          {related.length > 0 ? <DuplicateAlert matches={related} statuses={statuses} onOpen={onSelect} related /> : null}

          {application.posting.trim() ? (
            <details className="page-card tracker-posting">
              <summary>Aviso</summary>
              <div>{application.posting}</div>
            </details>
          ) : null}

          <div className="app-page-foot">
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
                Eliminar postulación
              </button>
            )}
          </div>
        </div>

        <aside className="app-page-side">
          <CompanyPanel
            name={companyName}
            company={company}
            applications={toCompany}
            currentApplicationId={application.id}
            statuses={statuses}
            onSave={companyActions.save}
            onSaveNote={(input) => companyActions.saveNote(company?.id ?? companyName, input)}
            onDeleteNote={(noteId) => company && companyActions.deleteNote(company.id, noteId)}
            onDelete={() => company && companyActions.delete(company.id)}
            onOpenApplication={onSelect}
            assistant={assistant}
          />
        </aside>
      </div>
    </div>
  )
}
