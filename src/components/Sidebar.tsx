type SidebarProps = {
  section: 'projects' | 'personal' | 'experience' | 'library' | 'workspace'
  onProjects: () => void
  onPersonal: () => void
  onExperience: () => void
  onLibrary: () => void
}

export function Sidebar({ section, onProjects, onPersonal, onExperience, onLibrary }: SidebarProps) {
  return (
    <nav className="sidebar" aria-label="Sections">
      <button
        type="button"
        className="sidebar-item"
        aria-label="Projects"
        title="Projects"
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
        aria-label="Experience"
        title="Experience"
        aria-current={section === 'experience' ? 'page' : undefined}
        onClick={onExperience}
      >
        <ExperienceIcon />
      </button>
      <button
        type="button"
        className="sidebar-item"
        aria-label="Library"
        title="Library"
        aria-current={section === 'library' ? 'page' : undefined}
        onClick={onLibrary}
      >
        <LibraryIcon />
      </button>
    </nav>
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
