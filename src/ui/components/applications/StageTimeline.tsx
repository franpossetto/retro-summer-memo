import { useState, type CSSProperties } from 'react'
import {
  addApplicationNote,
  moveApplication,
  removeApplicationNote,
  saveDebrief,
  stageVisits,
  stepsAhead,
  type Application,
  type ApplicationEvent,
  type ApplicationStatus,
} from '../../../domain/applications'
import { formatDateTime, formatDay, relativeTime, todayYmd } from '../../format'
import { PromptHint } from '../assistant/PromptHint'
import { prompts } from '../assistant/prompts'
import { DebriefCard, DebriefForm } from './Debrief'
import { eventKindLabel } from './eventKinds'

/**
 * Which form is open: telling how a step went (a new one in the visit at `visit`, or editing
 * `eventId`), or a note for the current step.
 */
type Editing = { kind: 'debrief'; visit: number } | { kind: 'debrief'; eventId: string } | { kind: 'note' } | null

type StageTimelineProps = {
  application: Application
  statuses: ApplicationStatus[]
  now: Date
  onChange: (next: Application) => void
  assistant?: { connected: boolean; onConnect: () => void }
}

/**
 * The process step by step: each step the application went through, with what happened there
 * (how it went, notes), the current one with what can be done now, and the steps still ahead.
 */
export function StageTimeline({ application, statuses, now, onChange, assistant }: StageTimelineProps) {
  const [editing, setEditing] = useState<Editing>(null)
  const [note, setNote] = useState('')
  const [moveTo, setMoveTo] = useState('')
  const statusById = new Map(statuses.map((status) => [status.id, status]))
  const visits = stageVisits(application, now)
  const ahead = stepsAhead(application, statuses, visits)
  const current = statusById.get(application.statusId)
  const next = ahead[0]

  function move(statusId: string) {
    if (!statusId || statusId === application.statusId) return
    onChange(moveApplication(application, statusId, '', new Date(), { statuses, appliedOn: todayYmd() }))
    setMoveTo('')
  }

  function addNote() {
    if (!note.trim()) return
    onChange(addApplicationNote(application, note))
    setNote('')
    setEditing(null)
  }

  function renderEvent(event: ApplicationEvent, statusName: string) {
    if (event.kind === 'debrief') {
      if (editing?.kind === 'debrief' && 'eventId' in editing && editing.eventId === event.id) {
        return (
          <DebriefForm
            key={event.id}
            event={event}
            stageName={statusName}
            onCancel={() => setEditing(null)}
            onSave={(input) => {
              onChange(saveDebrief(application, input).application)
              setEditing(null)
            }}
          />
        )
      }
      return (
        <DebriefCard
          key={event.id}
          event={event}
          onEdit={() => setEditing({ kind: 'debrief', eventId: event.id })}
          onDelete={() => onChange(removeApplicationNote(application, event.id))}
        />
      )
    }
    return (
      <div key={event.id} className="stage-note">
        <p className="tracker-note">
          {event.kind !== 'note' ? <strong>{eventKindLabel(event.kind)} </strong> : null}
          {event.text}
        </p>
        <time dateTime={event.at}>{formatDateTime(event.at)}</time>
        <button type="button" className="view-close" aria-label="Borrar nota" title="Borrar nota" onClick={() => onChange(removeApplicationNote(application, event.id))}>
          ×
        </button>
      </div>
    )
  }

  return (
    <ol className="stages">
      {visits.map((visit, index) => {
        const status = statusById.get(visit.statusId)
        const name = status?.name ?? 'Un estado borrado'
        const telling = editing?.kind === 'debrief' && 'visit' in editing && editing.visit === index
        const told = visit.events.some((event) => event.kind === 'debrief')
        // Sending the CV has nothing to tell yet: what matters there is the news that comes next.
        const highlight = visit.current && !told && index > 0
        return (
          <li
            key={`${visit.statusId}-${visit.since}-${index}`}
            className={visit.current ? 'stage is-current' : 'stage is-done'}
            style={{ '--status': status?.color ?? '#8c959f' } as CSSProperties}
          >
            <span className="stage-dot" aria-hidden="true" />
            <div className="stage-body">
              <div className="stage-head">
                <h3>{name}</h3>
                {visit.current ? <span className="stage-badge">Ahora</span> : null}
                <time dateTime={visit.since} title={formatDateTime(visit.since)}>
                  {formatDay(visit.since)} · {relativeTime(visit.since, now)}
                </time>
              </div>

              {visit.events.map((event) => renderEvent(event, name))}

              {telling ? (
                <DebriefForm
                  stageName={name}
                  defaultDay={visit.current ? undefined : todayYmd(new Date(visit.since))}
                  onCancel={() => setEditing(null)}
                  onSave={(input) => {
                    onChange(saveDebrief(application, { ...input, statusId: visit.statusId }).application)
                    setEditing(null)
                  }}
                />
              ) : null}

              {visit.current && editing?.kind === 'note' ? (
                <div className="stage-note-form">
                  <textarea
                    aria-label="Nota"
                    rows={2}
                    value={note}
                    autoFocus
                    placeholder="Quién te contactó, qué sigue, un dato que no te querés olvidar…"
                    onChange={(event) => setNote(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) addNote()
                      if (event.key === 'Escape') setEditing(null)
                    }}
                  />
                  <div className="debrief-form-actions">
                    <button type="button" className="button" onClick={() => setEditing(null)}>
                      Cancelar
                    </button>
                    <button type="button" className="button primary" disabled={!note.trim()} onClick={addNote}>
                      Agregar nota
                    </button>
                  </div>
                </div>
              ) : null}

              {!telling && !(visit.current && editing?.kind === 'note') ? (
                <div className="stage-actions">
                  <button
                    type="button"
                    className={!visit.current ? 'link-button' : highlight ? 'button primary' : 'button'}
                    onClick={() => setEditing({ kind: 'debrief', visit: index })}
                  >
                    {told ? 'Contar otra' : visit.current ? 'Contar cómo fue' : 'Contar cómo fue esta etapa'}
                  </button>
                  {visit.current ? (
                    <button type="button" className="button" onClick={() => setEditing({ kind: 'note' })}>
                      Agregar nota
                    </button>
                  ) : null}
                </div>
              ) : null}

              {visit.current ? (
                <div className="stage-move">
                  {next ? (
                    <button type="button" className="button next-step" style={{ '--status': next.color } as CSSProperties} onClick={() => move(next.id)}>
                      <span className="status-dot" aria-hidden="true" /> Pasar a {next.name} →
                    </button>
                  ) : null}
                  <select aria-label="Mover a otro estado" value={moveTo} onChange={(event) => move(event.target.value)}>
                    <option value="">{next ? 'Otro estado…' : 'Mover a…'}</option>
                    {statuses
                      .filter((status) => status.id !== application.statusId)
                      .map((status) => (
                        <option key={status.id} value={status.id}>
                          {status.name}
                        </option>
                      ))}
                  </select>
                </div>
              ) : null}

              {visit.current && assistant ? (
                <PromptHint
                  prompt={
                    current?.kind === 'considering'
                      ? prompts.apply(application.company)
                      : highlight && current?.kind === 'active'
                        ? prompts.debrief(application.company, name)
                        : prompts.news(application.company, next?.name)
                  }
                  onConnect={assistant.connected ? undefined : assistant.onConnect}
                />
              ) : null}
            </div>
          </li>
        )
      })}
      {ahead.map((status) => (
        <li key={status.id} className="stage is-ahead" style={{ '--status': status.color } as CSSProperties}>
          <span className="stage-dot" aria-hidden="true" />
          <div className="stage-body">
            <div className="stage-head">
              <h3>{status.name}</h3>
            </div>
          </div>
        </li>
      ))}
    </ol>
  )
}
