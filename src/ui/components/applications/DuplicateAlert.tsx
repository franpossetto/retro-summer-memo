import type { ApplicationStatus, DuplicateMatch, DuplicateReason } from '../../../domain/applications'
import { formatDay, relativeTime } from '../../format'
import { StatusPill } from './StatusPill'

const headline: Record<DuplicateReason, (company: string) => string> = {
  'same-posting': () => 'Ya te postulaste a este mismo aviso',
  'same-role': (company) => `Ya te postulaste a un puesto parecido en ${company}`,
  'same-company': (company) => `Ya te postulaste en ${company}`,
}

/** "Did I already apply?" — earlier applications that look like the one being entered. */
export function DuplicateAlert({
  matches,
  statuses,
  onOpen,
  related = false,
}: {
  matches: DuplicateMatch[]
  statuses: ApplicationStatus[]
  onOpen?: (applicationId: string) => void
  /** Listed next to an application (not a warning while entering a new one). */
  related?: boolean
}) {
  if (matches.length === 0) return null
  const top = matches[0]
  const statusById = new Map(statuses.map((status) => [status.id, status]))
  return (
    <div className={related ? 'duplicate-alert is-related' : `duplicate-alert is-${top.reason}`} role={related ? undefined : 'alert'}>
      <strong>{related ? 'Otras postulaciones parecidas' : headline[top.reason](top.application.company)}</strong>
      <ul>
        {matches.slice(0, 5).map(({ application, reason }) => {
          const on = application.appliedOn || application.createdAt
          return (
            <li key={application.id}>
              <span className="duplicate-what">
                {application.title || 'Sin puesto'} · {application.company}
                {reason === 'same-posting' ? <em> (mismo aviso)</em> : null}
              </span>
              <span className="duplicate-when" title={formatDay(on)}>
                {formatDay(on)} · {relativeTime(on)}
              </span>
              <StatusPill status={statusById.get(application.statusId)} />
              {onOpen ? (
                <button type="button" className="link-button" onClick={() => onOpen(application.id)}>
                  Ver
                </button>
              ) : null}
            </li>
          )
        })}
      </ul>
      {matches.length > 5 ? <p className="duplicate-more">y {matches.length - 5} más</p> : null}
    </div>
  )
}
