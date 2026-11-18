import type { CSSProperties } from 'react'
import type { ApplicationStatus } from '../../../domain/applications'

function tint(status: ApplicationStatus | undefined): CSSProperties {
  return { '--status': status?.color ?? '#6e7781' } as CSSProperties
}

export function StatusPill({ status }: { status: ApplicationStatus | undefined }) {
  return (
    <span className="status-pill" style={tint(status)}>
      <span className="status-dot" aria-hidden="true" />
      {status?.name ?? 'Sin estado'}
    </span>
  )
}

/** A status pill that is also a native select, to move an application in one click. */
export function StatusSelect({
  statuses,
  value,
  onChange,
  label,
}: {
  statuses: ApplicationStatus[]
  value: string
  onChange: (statusId: string) => void
  label: string
}) {
  const current = statuses.find((status) => status.id === value)
  return (
    <span className="status-pill status-select" style={tint(current)}>
      <span className="status-dot" aria-hidden="true" />
      <select
        aria-label={label}
        value={value}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => onChange(event.target.value)}
      >
        {statuses.map((status) => (
          <option key={status.id} value={status.id}>
            {status.name}
          </option>
        ))}
      </select>
      <svg className="status-caret" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        <path d="M2.5 4 5 6.5 7.5 4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
}

export function StatusDot({ status }: { status: ApplicationStatus | undefined }) {
  return <span className="status-dot" style={tint(status)} aria-hidden="true" />
}
