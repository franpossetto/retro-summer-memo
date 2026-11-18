import type { SaveStatus } from '../useDocumentSync'

type SidebarProps = {
  section: 'applications' | 'projects' | 'personal' | 'experience' | 'library' | 'workspace'
  onApplications: () => void
  onProjects: () => void
  onPersonal: () => void
  onExperience: () => void
  onLibrary: () => void
  save: SaveStatus
  onRetrySave: () => void
  account?: { email: string; onSignOut: () => void }
}

export function Sidebar({ section, onApplications, onProjects, onPersonal, onExperience, onLibrary, save, onRetrySave, account }: SidebarProps) {
  return (
    <nav className="sidebar" aria-label="Secciones">
      <button
        type="button"
        className="sidebar-item"
        aria-label="Postulaciones"
        title="Postulaciones"
        aria-current={section === 'applications' ? 'page' : undefined}
        onClick={onApplications}
      >
        <ApplicationsIcon />
      </button>
      <button
        type="button"
        className="sidebar-item"
        aria-label="Proyectos"
        title="Proyectos"
        aria-current={section === 'projects' ? 'page' : undefined}
        onClick={onProjects}
      >
        <ProjectsIcon />
      </button>
      <button
        type="button"
        className="sidebar-item"
        aria-label="Personal"
        title="Personal"
        aria-current={section === 'personal' ? 'page' : undefined}
        onClick={onPersonal}
      >
        <PersonalIcon />
      </button>
      <button
        type="button"
        className="sidebar-item"
        aria-label="Experiencia"
        title="Experiencia"
        aria-current={section === 'experience' ? 'page' : undefined}
        onClick={onExperience}
      >
        <ExperienceIcon />
      </button>
      <button
        type="button"
        className="sidebar-item"
        aria-label="Biblioteca"
        title="Biblioteca"
        aria-current={section === 'library' ? 'page' : undefined}
        onClick={onLibrary}
      >
        <LibraryIcon />
      </button>
      <div className="sidebar-foot">
        <SaveIndicator save={save} onRetry={onRetrySave} />
        {account ? (
          <button
            type="button"
            className="sidebar-item"
            aria-label={`Cerrar sesión (${account.email})`}
            title={`Cerrar sesión (${account.email})`}
            onClick={account.onSignOut}
          >
            <SignOutIcon />
          </button>
        ) : null}
      </div>
    </nav>
  )
}

function SaveIndicator({ save, onRetry }: { save: SaveStatus; onRetry: () => void }) {
  if (save.state === 'error') {
    return (
      <button
        type="button"
        className="save-indicator is-error"
        title={`No se pudo guardar: ${save.message}. Click para reintentar.`}
        aria-label="No se pudo guardar. Reintentar"
        onClick={onRetry}
      >
        <span className="save-dot" aria-hidden="true" />
      </button>
    )
  }
  const label = save.state === 'saving' ? 'Guardando…' : 'Guardado'
  return (
    <span className={`save-indicator is-${save.state}`} role="status" title={label} aria-label={label}>
      <span className="save-dot" aria-hidden="true" />
    </span>
  )
}

function ApplicationsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <rect x="1.75" y="5" width="14.5" height="10.5" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6.5 5V3.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V5M1.75 9.5h14.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

function ProjectsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <rect x="1.5" y="1.5" width="6" height="6" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="10.5" y="1.5" width="6" height="6" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="1.5" y="10.5" width="6" height="6" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="10.5" y="10.5" width="6" height="6" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function LibraryIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <rect x="2" y="2.5" width="14" height="13" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 6.5h8M5 9.5h8M5 12.5h5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function ExperienceIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <rect x="3" y="2.5" width="12" height="3.5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="3" y="7.25" width="12" height="3.5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="3" y="12" width="12" height="3.5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function PersonalIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <circle cx="9" cy="5.5" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3.5 15.5c.6-2.8 2.8-4.2 5.5-4.2s4.9 1.4 5.5 4.2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function SignOutIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path d="M7 3H3.5v12H7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11 5.5 14.5 9 11 12.5M14.5 9H7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
