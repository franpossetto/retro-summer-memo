import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import {
  EXAMPLE_POSTING,
  experienceLevels,
  matchExperiencesToPosting,
  type Experience,
} from '../../domain/experiences'
import {
  emptyEducationEntry,
  emptyJob,
  emptyJobRole,
  type Cv,
  type EducationEntry,
  type Job,
  type JobRole,
  type KnowledgeAnswer,
  type Profile,
  type ProfileField,
} from '../../domain/model'
import { defaultFont, fonts, type FontId } from '../../domain/fonts'
import {
  applyLinkedInImport,
  linkedInImportSummary,
  parseLinkedInPaste,
} from '../../domain/linkedinImport'
import { templates, type TemplateId } from '../../domain/templates'

export type CvDraft = {
  title: string
  position: string
  company: string
  posting: string
  templateId: TemplateId
  fontId: FontId
  experienceIds: string[]
}

type HomeProps = {
  cvs: Cv[]
  profile: Profile
  bank: Experience[]
  knowledge: KnowledgeAnswer[]
  section: 'projects' | 'personal'
  composerOpen: boolean
  onComposerOpenChange: (open: boolean) => void
  onProfile: (patch: Partial<Profile>) => void
  onOpen: (id: string) => void
  onCreate: (draft: CvDraft) => void
  onDelete: (id: string) => void
}

type WizardStep = 'posting' | 'pick' | 'style'
type ProjectsView = 'cards' | 'list'

const projectsViewKey = 'resume.projectsView.v1'

function loadProjectsView(): ProjectsView {
  try {
    const raw = localStorage.getItem(projectsViewKey)
    if (raw === 'list' || raw === 'cards') return raw
  } catch {
    /* ignore */
  }
  return 'cards'
}

export function Home({
  cvs,
  profile,
  bank,
  knowledge,
  section,
  composerOpen,
  onComposerOpenChange,
  onProfile,
  onOpen,
  onCreate,
  onDelete,
}: HomeProps) {
  const [step, setStep] = useState<WizardStep>('posting')
  const [title, setTitle] = useState('Software Engineer')
  const [position, setPosition] = useState('Software Engineer')
  const [company, setCompany] = useState('Platform')
  const [posting, setPosting] = useState(EXAMPLE_POSTING)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [templateId, setTemplateId] = useState<TemplateId>('classic')
  const [fontId, setFontId] = useState<FontId>('times')
  const [menuId, setMenuId] = useState<string | null>(null)
  const [draftId, setDraftId] = useState<string | null>(null)
  const [projectsView, setProjectsView] = useState<ProjectsView>(loadProjectsView)
  const [linkedinOpen, setLinkedinOpen] = useState(false)
  const [linkedinPaste, setLinkedinPaste] = useState('')
  const [linkedinError, setLinkedinError] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)
  const draftRef = useRef<HTMLInputElement>(null)
  const linkedinRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    localStorage.setItem(projectsViewKey, projectsView)
  }, [projectsView])

  const levelById = useMemo(() => new Map(knowledge.map((answer) => [answer.id, answer.level])), [knowledge])
  const masterItems = useMemo(
    () => bank.filter((item) => (levelById.get(item.id) ?? 0) > 0),
    [bank, levelById],
  )
  const ranked = useMemo(() => matchExperiencesToPosting(posting, masterItems.length > 0 ? masterItems : bank), [posting, masterItems, bank])
  const linkedinPreview = useMemo(
    () => (linkedinPaste.trim() ? parseLinkedInPaste(linkedinPaste) : null),
    [linkedinPaste],
  )

  useEffect(() => {
    if (!menuId) return
    function onPointer(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuId(null)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuId(null)
    }
    window.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [menuId])

  useEffect(() => {
    if (!draftId) return
    draftRef.current?.focus()
  }, [draftId, profile.fields])

  useEffect(() => {
    if (!composerOpen) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onComposerOpenChange(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [composerOpen, onComposerOpenChange])

  useEffect(() => {
    if (!linkedinOpen) return
    linkedinRef.current?.focus()
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setLinkedinOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [linkedinOpen])

  function openLinkedInImport() {
    setLinkedinPaste('')
    setLinkedinError('')
    setLinkedinOpen(true)
  }

  function importFromLinkedIn() {
    const imported = parseLinkedInPaste(linkedinPaste)
    const hasWork = imported.jobs.length > 0 || imported.education.length > 0
    const hasIdentity = imported.name.trim() !== '' || imported.location.trim() !== '' || imported.linkedInUrl !== ''
    if (!hasWork && !hasIdentity) {
      setLinkedinError('Paste your LinkedIn profile text (Experience + Education), optionally with the profile link.')
      return
    }
    if (!hasWork) {
      onProfile(applyLinkedInImport(profile, imported))
      setLinkedinError(
        'Saved the link/name. LinkedIn blocks reading the page from here — copy Experience + Education from your profile (or More → Save to PDF → paste the text) and import again.',
      )
      return
    }
    onProfile(applyLinkedInImport(profile, imported))
    setLinkedinOpen(false)
  }

  useEffect(() => {
    if (!composerOpen) return
    setStep('posting')
    setTitle('Software Engineer')
    setPosition('Software Engineer')
    setCompany('Platform')
    setPosting(EXAMPLE_POSTING)
    setTemplateId('classic')
    setFontId('times')
    const suggested = matchExperiencesToPosting(
      EXAMPLE_POSTING,
      masterItems.length > 0 ? masterItems : bank,
    )
      .filter((row) => row.score > 0)
      .slice(0, 8)
      .map((row) => row.item.id)
    setSelected(new Set(suggested))
  }, [composerOpen, bank, masterItems])

  function create() {
    onCreate({
      title,
      position,
      company,
      posting,
      templateId,
      fontId,
      experienceIds: [...selected],
    })
  }

  function toggleExperience(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function useExample() {
    setPosting(EXAMPLE_POSTING)
    setTitle('Software Engineer')
    setPosition('Software Engineer')
    setCompany('Platform')
  }

  function patchField(id: string, patch: Partial<Pick<ProfileField, 'label' | 'value'>>) {
    onProfile({
      fields: profile.fields.map((field) => (field.id === id ? { ...field, ...patch } : field)),
    })
  }

  function addField() {
    const id = crypto.randomUUID()
    setDraftId(id)
    onProfile({
      fields: [...profile.fields, { id, label: '', value: '', kind: 'text' }],
    })
  }

  function patchEducation(id: string, patch: Partial<Omit<EducationEntry, 'id'>>) {
    onProfile({
      education: profile.education.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    })
  }

  function addEducation() {
    onProfile({ education: [...profile.education, emptyEducationEntry()] })
  }

  function removeEducation(id: string) {
    onProfile({ education: profile.education.filter((entry) => entry.id !== id) })
  }

  function patchJob(id: string, patch: Partial<Pick<Job, 'company'>>) {
    onProfile({
      jobs: profile.jobs.map((job) => (job.id === id ? { ...job, ...patch } : job)),
    })
  }

  function addJob() {
    onProfile({ jobs: [...profile.jobs, emptyJob()] })
  }

  function removeJob(id: string) {
    onProfile({ jobs: profile.jobs.filter((job) => job.id !== id) })
  }

  function patchJobRole(jobId: string, roleId: string, patch: Partial<Omit<JobRole, 'id'>>) {
    onProfile({
      jobs: profile.jobs.map((job) => (
        job.id === jobId
          ? { ...job, roles: job.roles.map((role) => (role.id === roleId ? { ...role, ...patch } : role)) }
          : job
      )),
    })
  }

  function addJobRole(jobId: string) {
    onProfile({
      jobs: profile.jobs.map((job) => (
        job.id === jobId ? { ...job, roles: [...job.roles, emptyJobRole()] } : job
      )),
    })
  }

  function removeJobRole(jobId: string, roleId: string) {
    onProfile({
      jobs: profile.jobs.map((job) => {
        if (job.id !== jobId) return job
        const roles = job.roles.filter((role) => role.id !== roleId)
        return { ...job, roles: roles.length > 0 ? roles : [emptyJobRole()] }
      }),
    })
  }

  return (
    <div className="home">
      {section === 'personal' ? (
        <>
          <div className="home-head">
            <h1>Personal</h1>
            <button type="button" className="button" onClick={openLinkedInImport}>
              Add from LinkedIn
            </button>
          </div>
          <label className="field personal-name">
            <span>Name</span>
            <input value={profile.name} onChange={(event) => onProfile({ name: event.target.value })} />
          </label>
          <div className="personal-sheet">
            <table className="source-table personal-table">
              <thead>
                <tr>
                  <th className="col-index" />
                  <th>Label</th>
                  <th>Value</th>
                  <th className="col-remove" />
                </tr>
              </thead>
              <tbody>
                {profile.fields.map((field, index) => (
                  <tr key={field.id}>
                    <td className="col-index">{index + 1}</td>
                    <td>
                      <input
                        ref={field.id === draftId ? draftRef : undefined}
                        aria-label={`Label ${index + 1}`}
                        value={field.label}
                        placeholder={field.kind === 'link' ? 'GitHub profile' : 'Label'}
                        onChange={(event) => patchField(field.id, { label: event.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={field.label || `Value ${index + 1}`}
                        type={fieldInputType(field.kind)}
                        value={field.value}
                        placeholder={field.kind === 'link' ? 'https://' : ''}
                        onChange={(event) => patchField(field.id, { value: event.target.value })}
                      />
                    </td>
                    <td className="col-remove">
                      <button
                        type="button"
                        className="row-remove"
                        aria-label={`Delete ${field.label || 'field'}`}
                        onClick={() => onProfile({ fields: profile.fields.filter((item) => item.id !== field.id) })}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className="button personal-add" onClick={addField}>
            New field
          </button>

          <h2 className="personal-section-title">Education</h2>
          <div className="personal-sheet">
            <table className="source-table personal-table personal-education-table">
              <thead>
                <tr>
                  <th className="col-index" />
                  <th>School</th>
                  <th>Degree</th>
                  <th>Start</th>
                  <th>End</th>
                  <th className="col-remove" />
                </tr>
              </thead>
              <tbody>
                {profile.education.length === 0 ? (
                  <tr>
                    <td className="col-index" />
                    <td colSpan={5} className="personal-empty-cell">
                      Schools and degrees for your resume.
                    </td>
                  </tr>
                ) : (
                  profile.education.map((entry, index) => (
                    <tr key={entry.id}>
                      <td className="col-index">{index + 1}</td>
                      <td>
                        <input
                          aria-label={`School ${index + 1}`}
                          value={entry.school}
                          placeholder="University"
                          onChange={(event) => patchEducation(entry.id, { school: event.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`Degree ${index + 1}`}
                          value={entry.degree}
                          placeholder="B.S. Computer Science"
                          onChange={(event) => patchEducation(entry.id, { degree: event.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`Education start ${index + 1}`}
                          value={entry.start}
                          placeholder="2016"
                          onChange={(event) => patchEducation(entry.id, { start: event.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`Education end ${index + 1}`}
                          value={entry.end}
                          placeholder="2020"
                          onChange={(event) => patchEducation(entry.id, { end: event.target.value })}
                        />
                      </td>
                      <td className="col-remove">
                        <button
                          type="button"
                          className="row-remove"
                          aria-label={`Delete education ${index + 1}`}
                          onClick={() => removeEducation(entry.id)}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <button type="button" className="button personal-add" onClick={addEducation}>
            Add education
          </button>

          <h2 className="personal-section-title">Jobs</h2>
          <p className="personal-section-lede">
            Add a location and another role under a company when you get promoted.
          </p>
          {profile.jobs.length === 0 ? (
            <div className="personal-sheet personal-job">
              <p className="personal-empty">No jobs yet.</p>
            </div>
          ) : (
            profile.jobs.map((job, jobIndex) => (
              <div key={job.id} className="personal-sheet personal-job">
                <div className="personal-job-head">
                  <label className="field personal-job-company">
                    <span>Company</span>
                    <input
                      aria-label={`Company ${jobIndex + 1}`}
                      value={job.company}
                      placeholder="Acme"
                      onChange={(event) => patchJob(job.id, { company: event.target.value })}
                    />
                  </label>
                  <button
                    type="button"
                    className="row-remove personal-job-remove"
                    aria-label={`Delete company ${job.company || jobIndex + 1}`}
                    onClick={() => removeJob(job.id)}
                  >
                    ×
                  </button>
                </div>
                <table className="source-table personal-table personal-roles-table">
                  <thead>
                    <tr>
                      <th className="col-index" />
                      <th>Role</th>
                      <th>Location</th>
                      <th>Start</th>
                      <th>End</th>
                      <th className="col-remove" />
                    </tr>
                  </thead>
                  <tbody>
                    {job.roles.map((role, roleIndex) => (
                      <tr key={role.id}>
                        <td className="col-index">{roleIndex + 1}</td>
                        <td>
                          <input
                            aria-label={`${job.company || 'Company'} role ${roleIndex + 1}`}
                            value={role.title}
                            placeholder={roleIndex === 0 ? 'Software Engineer' : 'Senior Software Engineer'}
                            onChange={(event) => patchJobRole(job.id, role.id, { title: event.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            aria-label={`${job.company || 'Company'} role ${roleIndex + 1} location`}
                            value={role.location}
                            placeholder="City, Country"
                            onChange={(event) => patchJobRole(job.id, role.id, { location: event.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            aria-label={`Role start ${roleIndex + 1}`}
                            value={role.start}
                            placeholder="2021"
                            onChange={(event) => patchJobRole(job.id, role.id, { start: event.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            aria-label={`Role end ${roleIndex + 1}`}
                            value={role.end}
                            placeholder={roleIndex === job.roles.length - 1 ? 'Present' : '2023'}
                            onChange={(event) => patchJobRole(job.id, role.id, { end: event.target.value })}
                          />
                        </td>
                        <td className="col-remove">
                          <button
                            type="button"
                            className="row-remove"
                            aria-label={`Delete role ${role.title || roleIndex + 1}`}
                            onClick={() => removeJobRole(job.id, role.id)}
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button type="button" className="button personal-add-role" onClick={() => addJobRole(job.id)}>
                  Add role
                </button>
              </div>
            ))
          )}
          <button type="button" className="button personal-add" onClick={addJob}>
            Add company
          </button>
        </>
      ) : (
      <>
      <div className="home-head">
        <h1>Projects</h1>
        <div className="segment projects-view-toggle" role="group" aria-label="Projects view">
          <button
            type="button"
            className={projectsView === 'cards' ? 'is-current' : undefined}
            aria-pressed={projectsView === 'cards'}
            onClick={() => setProjectsView('cards')}
          >
            Cards
          </button>
          <button
            type="button"
            className={projectsView === 'list' ? 'is-current' : undefined}
            aria-pressed={projectsView === 'list'}
            onClick={() => setProjectsView('list')}
          >
            List
          </button>
        </div>
        <button type="button" className="button primary" onClick={() => onComposerOpenChange(true)}>
          New from posting
        </button>
      </div>
      {cvs.length === 0 ? (
        <p className="home-empty">Your projects will show up here.</p>
      ) : projectsView === 'cards' ? (
        <ul className="project-grid">
          {cvs.map((cv) => {
            const row = projectRow(cv)
            const open = menuId === cv.id
            return (
              <li key={cv.id}>
                <button type="button" className="project-card is-dense" onClick={() => onOpen(cv.id)}>
                  <span className="project-card-top">
                    <span className="project-title">{row.name}</span>
                    <MatchBadge score={row.match} />
                  </span>
                  <span className="project-target">{row.target}</span>
                  <span className="project-meta">{row.when}</span>
                </button>
                <ProjectMenu
                  name={row.name}
                  open={open}
                  menuRef={open ? menuRef : undefined}
                  onToggle={() => setMenuId(open ? null : cv.id)}
                  onView={() => { setMenuId(null); onOpen(cv.id) }}
                  onDelete={() => { setMenuId(null); onDelete(cv.id) }}
                />
              </li>
            )
          })}
        </ul>
      ) : (
        <ul className="project-list">
          {cvs.map((cv) => {
            const row = projectRow(cv)
            const open = menuId === cv.id
            return (
              <li key={cv.id} className="project-list-item">
                <button type="button" className="project-list-main" onClick={() => onOpen(cv.id)}>
                  <span className="project-title">{row.name}</span>
                  <span className="project-target">{row.target}</span>
                  <MatchBadge score={row.match} />
                  <span className="project-meta">{row.when}</span>
                </button>
                <ProjectMenu
                  name={row.name}
                  open={open}
                  menuRef={open ? menuRef : undefined}
                  onToggle={() => setMenuId(open ? null : cv.id)}
                  onView={() => { setMenuId(null); onOpen(cv.id) }}
                  onDelete={() => { setMenuId(null); onDelete(cv.id) }}
                />
              </li>
            )
          })}
        </ul>
      )}
      </>
      )}
      {linkedinOpen ? (
        <div className="composer-backdrop" onClick={() => setLinkedinOpen(false)}>
          <div
            className="cv-draft composer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="linkedin-import-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="composer-head">
              <h2 id="linkedin-import-title">Add from LinkedIn</h2>
              <button type="button" className="view-close" aria-label="Close" onClick={() => setLinkedinOpen(false)}>
                ×
              </button>
            </div>
            <p className="personal-section-lede linkedin-import-lede">
              LinkedIn blocks reading a profile from a link alone. Fastest path: open your profile → copy Experience and Education
              (or More → Save to PDF → select all → copy) and paste below. You can include the profile URL too.
            </p>
            <label className="field">
              <span>Paste</span>
              <textarea
                ref={linkedinRef}
                className="linkedin-import-paste"
                value={linkedinPaste}
                placeholder={'https://www.linkedin.com/in/you\n\nExperience\nAcme\nFull-time · 4 yrs\nSenior Engineer\nJan 2023 - Present\nEngineer\nJan 2021 - Jan 2023\n\nEducation\nState University\nB.S. Computer Science\n2016 - 2020'}
                onChange={(event) => {
                  setLinkedinPaste(event.target.value)
                  setLinkedinError('')
                }}
              />
            </label>
            {linkedinPreview && linkedInImportSummary(linkedinPreview) ? (
              <p className="linkedin-import-preview" role="status">
                Will import: {linkedInImportSummary(linkedinPreview)}
              </p>
            ) : null}
            {linkedinError ? <p className="linkedin-import-error" role="alert">{linkedinError}</p> : null}
            <div className="composer-actions">
              <button type="button" className="button" onClick={() => setLinkedinOpen(false)}>
                Cancel
              </button>
              <button type="button" className="button primary" onClick={importFromLinkedIn}>
                Import
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {composerOpen ? (
        <div className="composer-backdrop" onClick={() => onComposerOpenChange(false)}>
          <div
            className="cv-draft composer composer-wide"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-project-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="composer-head">
              <h2 id="new-project-title">New CV</h2>
              <button type="button" className="view-close" aria-label="Close" onClick={() => onComposerOpenChange(false)}>
                ×
              </button>
            </div>

            <ol className="wizard-steps" aria-label="Steps">
              <li className={step === 'posting' ? 'is-current' : undefined}>Posting</li>
              <li className={step === 'pick' ? 'is-current' : undefined}>Experiences</li>
              <li className={step === 'style' ? 'is-current' : undefined}>Style</li>
            </ol>

            {step === 'posting' ? (
              <>
                <div className="wizard-meta-row">
                  <label className="field">
                    <span>Title</span>
                    <input value={title} placeholder="Software Engineer" onChange={(event) => setTitle(event.target.value)} />
                  </label>
                  <label className="field">
                    <span>Position</span>
                    <input value={position} placeholder="Software Engineer" onChange={(event) => setPosition(event.target.value)} />
                  </label>
                  <label className="field">
                    <span>Company</span>
                    <input value={company} placeholder="Acme" onChange={(event) => setCompany(event.target.value)} />
                  </label>
                </div>
                <div className="wizard-posting-head">
                  <span className="menu-label">Job posting</span>
                  <button type="button" className="button" onClick={useExample}>
                    Use example
                  </button>
                </div>
                <label className="field">
                  <span className="sr-only">Job posting</span>
                  <textarea
                    className="wizard-posting"
                    value={posting}
                    placeholder="Paste one or more job postings…"
                    onChange={(event) => setPosting(event.target.value)}
                  />
                </label>
                <div className="composer-actions">
                  <button type="button" className="button" onClick={() => onComposerOpenChange(false)}>
                    Cancel
                  </button>
                  <button type="button" className="button primary" onClick={() => setStep('pick')}>
                    Next
                  </button>
                </div>
              </>
            ) : null}

            {step === 'pick' ? (
              <>
                <p className="knowledge-lede">
                  Mark experiences from your master to seed this CV.
                  {masterItems.length === 0 ? ' No test answers yet — showing the full bank.' : null}
                </p>
                <ul className="wizard-pick-list">
                  {ranked.map(({ item, score }) => (
                    <li key={item.id}>
                      <label className={selected.has(item.id) ? 'wizard-pick is-on' : 'wizard-pick'}>
                        <input
                          type="checkbox"
                          checked={selected.has(item.id)}
                          onChange={() => toggleExperience(item.id)}
                        />
                        <span className="wizard-pick-body">
                          <span className="wizard-pick-text">{item.text}</span>
                          <span className="wizard-pick-meta">
                            {item.category}
                            {item.skills.length > 0 ? ` · ${item.skills.join(', ')}` : ''}
                            {score > 0 ? ` · match ${score}` : ''}
                            {levelLabel(levelById.get(item.id))}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                <div className="composer-actions">
                  <button type="button" className="button" onClick={() => setStep('posting')}>
                    Back
                  </button>
                  <button type="button" className="button primary" onClick={() => setStep('style')}>
                    Next
                  </button>
                </div>
              </>
            ) : null}

            {step === 'style' ? (
              <>
                <p className="menu-label">Template</p>
                <div className="template-choices">
                  {templates.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      className={template.id === templateId ? 'template-choice is-current' : 'template-choice'}
                      aria-pressed={template.id === templateId}
                      onClick={() => {
                        setTemplateId(template.id)
                        setFontId(defaultFont(template.id))
                      }}
                    >
                      <TemplateMark id={template.id} />
                      <span className="template-name">{template.name}</span>
                      <span className="template-detail">{template.detail}</span>
                    </button>
                  ))}
                </div>
                <p className="menu-label">Font</p>
                <div className="font-choices">
                  {fonts.map((font) => (
                    <button
                      key={font.id}
                      type="button"
                      className={font.id === fontId ? 'font-choice is-current' : 'font-choice'}
                      style={{ fontFamily: font.family }}
                      aria-pressed={font.id === fontId}
                      onClick={() => setFontId(font.id)}
                    >
                      {font.name}
                    </button>
                  ))}
                </div>
                <p className="wizard-seed-note">
                  Creates a blank CV with {selected.size} experience{selected.size === 1 ? '' : 's'} already on the graph.
                </p>
                <div className="composer-actions">
                  <button type="button" className="button" onClick={() => setStep('pick')}>
                    Back
                  </button>
                  <button type="button" className="button primary" onClick={create}>
                    Create
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function levelLabel(level: number | undefined) {
  if (level === undefined) return ''
  const label = experienceLevels.find((choice) => choice.level === level)?.label
  return label ? ` · ${label}` : ''
}

function fieldInputType(kind: ProfileField['kind']) {
  if (kind === 'email') return 'email'
  if (kind === 'phone') return 'tel'
  return 'text'
}

function TemplateMark({ id }: { id: TemplateId }) {
  if (id === 'sidebar') {
    return (
      <span className="template-mark is-sidebar" aria-hidden="true">
        <span className="mark-rail" />
        <span className="mark-main" />
      </span>
    )
  }
  if (id === 'timeline') {
    return (
      <span className="template-mark is-timeline" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
    )
  }
  return (
    <span className={`template-mark is-${id}`} aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  )
}

function projectRow(cv: Cv) {
  const latest = cv.versions.at(-1)
  return {
    name: cv.title.trim() || 'Untitled',
    target: postingLabel(cv),
    match: mockMatchScore(cv),
    when: latest ? formatWhen(latest.createdAt) : '—',
  }
}

function postingLabel(cv: Cv) {
  const position = cv.position.trim()
  const company = cv.company.trim()
  if (position && company) return `${position} en ${company}`
  if (position) return position
  if (company) return company
  if (cv.posting.trim()) return 'Posting attached'
  return '—'
}

/** Placeholder until we score posting lines against selected skills/experiences. */
function mockMatchScore(cv: Cv): number | null {
  if (!cv.posting.trim() && !cv.position.trim() && !cv.company.trim()) return null
  let hash = 0
  for (const ch of cv.id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return 52 + (hash % 44)
}

function matchTone(score: number) {
  if (score >= 80) return 'is-high'
  if (score >= 60) return 'is-mid'
  return 'is-low'
}

function MatchBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="match-empty">—</span>
  return <span className={`match-score ${matchTone(score)}`}>{score}%</span>
}

function ProjectMenu({
  name,
  open,
  menuRef,
  onToggle,
  onView,
  onDelete,
}: {
  name: string
  open: boolean
  menuRef?: RefObject<HTMLDivElement | null>
  onToggle: () => void
  onView: () => void
  onDelete: () => void
}) {
  return (
    <div className="project-actions" ref={menuRef}>
      <button
        type="button"
        className="project-more"
        aria-label={`Actions for ${name}`}
        aria-expanded={open}
        onClick={onToggle}
      >
        ···
      </button>
      {open ? (
        <div className="project-menu" role="menu">
          <button type="button" role="menuitem" onClick={onView}>
            View
          </button>
          <button type="button" role="menuitem" onClick={onDelete}>
            Delete
          </button>
        </div>
      ) : null}
    </div>
  )
}

function formatWhen(iso: string) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
