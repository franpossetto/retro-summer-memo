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

/** Values to start the new-CV wizard with (e.g. from a job application), instead of the example. */
export type ComposerSeed = {
  title: string
  position: string
  company: string
  posting: string
}

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
  composerSeed?: ComposerSeed | null
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
  composerSeed = null,
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
      setLinkedinError('Pegá el texto de tu perfil de LinkedIn (Experiencia + Educación) y, si querés, el link del perfil.')
      return
    }
    if (!hasWork) {
      onProfile(applyLinkedInImport(profile, imported))
      setLinkedinError(
        'Guardamos el link/nombre. LinkedIn no deja leer la página desde acá — copiá Experiencia + Educación de tu perfil (o Más → Guardar en PDF → pegá el texto) e importá de nuevo.',
      )
      return
    }
    onProfile(applyLinkedInImport(profile, imported))
    setLinkedinOpen(false)
  }

  useEffect(() => {
    if (!composerOpen) return
    const start = composerSeed ?? { title: 'Software Engineer', position: 'Software Engineer', company: 'Platform', posting: EXAMPLE_POSTING }
    setStep('posting')
    setTitle(start.title)
    setPosition(start.position)
    setCompany(start.company)
    setPosting(start.posting)
    setTemplateId('classic')
    setFontId('times')
    const suggested = matchExperiencesToPosting(
      start.posting,
      masterItems.length > 0 ? masterItems : bank,
    )
      .filter((row) => row.score > 0)
      .slice(0, 8)
      .map((row) => row.item.id)
    setSelected(new Set(suggested))
  }, [composerOpen, composerSeed, bank, masterItems])

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
              Importar de LinkedIn
            </button>
          </div>
          <label className="field personal-name">
            <span>Nombre</span>
            <input value={profile.name} onChange={(event) => onProfile({ name: event.target.value })} />
          </label>
          <div className="personal-sheet">
            <table className="source-table personal-table">
              <thead>
                <tr>
                  <th className="col-index" />
                  <th>Etiqueta</th>
                  <th>Valor</th>
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
                        aria-label={`Etiqueta ${index + 1}`}
                        value={field.label}
                        placeholder={field.kind === 'link' ? 'Perfil de GitHub' : 'Etiqueta'}
                        onChange={(event) => patchField(field.id, { label: event.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={field.label || `Valor ${index + 1}`}
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
                        aria-label={`Eliminar ${field.label || 'campo'}`}
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
            Nuevo campo
          </button>

          <h2 className="personal-section-title">Educación</h2>
          <div className="personal-sheet">
            <table className="source-table personal-table personal-education-table">
              <thead>
                <tr>
                  <th className="col-index" />
                  <th>Institución</th>
                  <th>Título</th>
                  <th>Inicio</th>
                  <th>Fin</th>
                  <th className="col-remove" />
                </tr>
              </thead>
              <tbody>
                {profile.education.length === 0 ? (
                  <tr>
                    <td className="col-index" />
                    <td colSpan={5} className="personal-empty-cell">
                      Instituciones y títulos para tu CV.
                    </td>
                  </tr>
                ) : (
                  profile.education.map((entry, index) => (
                    <tr key={entry.id}>
                      <td className="col-index">{index + 1}</td>
                      <td>
                        <input
                          aria-label={`Institución ${index + 1}`}
                          value={entry.school}
                          placeholder="Universidad"
                          onChange={(event) => patchEducation(entry.id, { school: event.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`Título ${index + 1}`}
                          value={entry.degree}
                          placeholder="B.S. Computer Science"
                          onChange={(event) => patchEducation(entry.id, { degree: event.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`Inicio de educación ${index + 1}`}
                          value={entry.start}
                          placeholder="2016"
                          onChange={(event) => patchEducation(entry.id, { start: event.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`Fin de educación ${index + 1}`}
                          value={entry.end}
                          placeholder="2020"
                          onChange={(event) => patchEducation(entry.id, { end: event.target.value })}
                        />
                      </td>
                      <td className="col-remove">
                        <button
                          type="button"
                          className="row-remove"
                          aria-label={`Eliminar educación ${index + 1}`}
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
            Agregar educación
          </button>

          <h2 className="personal-section-title">Trabajos</h2>
          <p className="personal-section-lede">
            Agregá la ubicación y, si te ascendieron, otro puesto dentro de la misma empresa.
          </p>
          {profile.jobs.length === 0 ? (
            <div className="personal-sheet personal-job">
              <p className="personal-empty">Todavía no hay trabajos.</p>
            </div>
          ) : (
            profile.jobs.map((job, jobIndex) => (
              <div key={job.id} className="personal-sheet personal-job">
                <div className="personal-job-head">
                  <label className="field personal-job-company">
                    <span>Empresa</span>
                    <input
                      aria-label={`Empresa ${jobIndex + 1}`}
                      value={job.company}
                      placeholder="Acme"
                      onChange={(event) => patchJob(job.id, { company: event.target.value })}
                    />
                  </label>
                  <button
                    type="button"
                    className="row-remove personal-job-remove"
                    aria-label={`Eliminar empresa ${job.company || jobIndex + 1}`}
                    onClick={() => removeJob(job.id)}
                  >
                    ×
                  </button>
                </div>
                <table className="source-table personal-table personal-roles-table">
                  <thead>
                    <tr>
                      <th className="col-index" />
                      <th>Puesto</th>
                      <th>Ubicación</th>
                      <th>Inicio</th>
                      <th>Fin</th>
                      <th className="col-remove" />
                    </tr>
                  </thead>
                  <tbody>
                    {job.roles.map((role, roleIndex) => (
                      <tr key={role.id}>
                        <td className="col-index">{roleIndex + 1}</td>
                        <td>
                          <input
                            aria-label={`Puesto ${roleIndex + 1} de ${job.company || 'la empresa'}`}
                            value={role.title}
                            placeholder={roleIndex === 0 ? 'Software Engineer' : 'Senior Software Engineer'}
                            onChange={(event) => patchJobRole(job.id, role.id, { title: event.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            aria-label={`Ubicación del puesto ${roleIndex + 1} de ${job.company || 'la empresa'}`}
                            value={role.location}
                            placeholder="Ciudad, País"
                            onChange={(event) => patchJobRole(job.id, role.id, { location: event.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            aria-label={`Inicio del puesto ${roleIndex + 1}`}
                            value={role.start}
                            placeholder="2021"
                            onChange={(event) => patchJobRole(job.id, role.id, { start: event.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            aria-label={`Fin del puesto ${roleIndex + 1}`}
                            value={role.end}
                            placeholder={roleIndex === job.roles.length - 1 ? 'Actualidad' : '2023'}
                            onChange={(event) => patchJobRole(job.id, role.id, { end: event.target.value })}
                          />
                        </td>
                        <td className="col-remove">
                          <button
                            type="button"
                            className="row-remove"
                            aria-label={`Eliminar puesto ${role.title || roleIndex + 1}`}
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
                  Agregar puesto
                </button>
              </div>
            ))
          )}
          <button type="button" className="button personal-add" onClick={addJob}>
            Agregar empresa
          </button>
        </>
      ) : (
      <>
      <div className="home-head">
        <h1>Proyectos</h1>
        <div className="segment projects-view-toggle" role="group" aria-label="Vista de proyectos">
          <button
            type="button"
            className={projectsView === 'cards' ? 'is-current' : undefined}
            aria-pressed={projectsView === 'cards'}
            onClick={() => setProjectsView('cards')}
          >
            Tarjetas
          </button>
          <button
            type="button"
            className={projectsView === 'list' ? 'is-current' : undefined}
            aria-pressed={projectsView === 'list'}
            onClick={() => setProjectsView('list')}
          >
            Lista
          </button>
        </div>
        <button type="button" className="button primary" onClick={() => onComposerOpenChange(true)}>
          Nuevo desde aviso
        </button>
      </div>
      {cvs.length === 0 ? (
        <p className="home-empty">Tus proyectos van a aparecer acá.</p>
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
              <h2 id="linkedin-import-title">Importar de LinkedIn</h2>
              <button type="button" className="view-close" aria-label="Cerrar" onClick={() => setLinkedinOpen(false)}>
                ×
              </button>
            </div>
            <p className="personal-section-lede linkedin-import-lede">
              LinkedIn no deja leer un perfil solo con el link. Lo más rápido: abrí tu perfil → copiá Experiencia y Educación
              (o Más → Guardar en PDF → seleccioná todo → copiá) y pegalo abajo. También podés incluir la URL del perfil.
            </p>
            <label className="field">
              <span>Pegar</span>
              <textarea
                ref={linkedinRef}
                className="linkedin-import-paste"
                value={linkedinPaste}
                placeholder={'https://www.linkedin.com/in/tu-perfil\n\nExperiencia\nAcme\nJornada completa · 4 años\nSenior Engineer\nEne 2023 - Actualidad\nEngineer\nEne 2021 - Ene 2023\n\nEducación\nUniversidad Nacional\nB.S. Computer Science\n2016 - 2020'}
                onChange={(event) => {
                  setLinkedinPaste(event.target.value)
                  setLinkedinError('')
                }}
              />
            </label>
            {linkedinPreview && linkedInImportSummary(linkedinPreview) ? (
              <p className="linkedin-import-preview" role="status">
                Se va a importar: {linkedInImportSummary(linkedinPreview)}
              </p>
            ) : null}
            {linkedinError ? <p className="linkedin-import-error" role="alert">{linkedinError}</p> : null}
            <div className="composer-actions">
              <button type="button" className="button" onClick={() => setLinkedinOpen(false)}>
                Cancelar
              </button>
              <button type="button" className="button primary" onClick={importFromLinkedIn}>
                Importar
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
              <h2 id="new-project-title">Nuevo CV</h2>
              <button type="button" className="view-close" aria-label="Cerrar" onClick={() => onComposerOpenChange(false)}>
                ×
              </button>
            </div>

            <ol className="wizard-steps" aria-label="Pasos">
              <li className={step === 'posting' ? 'is-current' : undefined}>Aviso</li>
              <li className={step === 'pick' ? 'is-current' : undefined}>Experiencias</li>
              <li className={step === 'style' ? 'is-current' : undefined}>Estilo</li>
            </ol>

            {step === 'posting' ? (
              <>
                <div className="wizard-meta-row">
                  <label className="field">
                    <span>Título</span>
                    <input value={title} placeholder="Software Engineer" onChange={(event) => setTitle(event.target.value)} />
                  </label>
                  <label className="field">
                    <span>Cargo</span>
                    <input value={position} placeholder="Software Engineer" onChange={(event) => setPosition(event.target.value)} />
                  </label>
                  <label className="field">
                    <span>Empresa</span>
                    <input value={company} placeholder="Acme" onChange={(event) => setCompany(event.target.value)} />
                  </label>
                </div>
                <div className="wizard-posting-head">
                  <span className="menu-label">Aviso</span>
                  {composerSeed ? null : (
                    <button type="button" className="button" onClick={useExample}>
                      Usar ejemplo
                    </button>
                  )}
                </div>
                <label className="field">
                  <span className="sr-only">Aviso</span>
                  <textarea
                    className="wizard-posting"
                    value={posting}
                    placeholder="Pegá uno o más avisos…"
                    onChange={(event) => setPosting(event.target.value)}
                  />
                </label>
                <div className="composer-actions">
                  <button type="button" className="button" onClick={() => onComposerOpenChange(false)}>
                    Cancelar
                  </button>
                  <button type="button" className="button primary" onClick={() => setStep('pick')}>
                    Siguiente
                  </button>
                </div>
              </>
            ) : null}

            {step === 'pick' ? (
              <>
                <p className="knowledge-lede">
                  Marcá experiencias de tu master para precargar este CV.
                  {masterItems.length === 0 ? ' Todavía no respondiste preguntas — se muestran todas las experiencias.' : null}
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
                            {score > 0 ? ` · coincidencia ${score}` : ''}
                            {levelLabel(levelById.get(item.id))}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                <div className="composer-actions">
                  <button type="button" className="button" onClick={() => setStep('posting')}>
                    Atrás
                  </button>
                  <button type="button" className="button primary" onClick={() => setStep('style')}>
                    Siguiente
                  </button>
                </div>
              </>
            ) : null}

            {step === 'style' ? (
              <>
                <p className="menu-label">Plantilla</p>
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
                <p className="menu-label">Fuente</p>
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
                  Crea un CV en blanco con {selected.size} experiencia{selected.size === 1 ? '' : 's'} ya en el grafo.
                </p>
                <div className="composer-actions">
                  <button type="button" className="button" onClick={() => setStep('pick')}>
                    Atrás
                  </button>
                  <button type="button" className="button primary" onClick={create}>
                    Crear
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
    name: cv.title.trim() || 'Sin título',
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
  if (cv.posting.trim()) return 'Aviso adjunto'
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
        aria-label={`Acciones para ${name}`}
        aria-expanded={open}
        onClick={onToggle}
      >
        ···
      </button>
      {open ? (
        <div className="project-menu" role="menu">
          <button type="button" role="menuitem" onClick={onView}>
            Ver
          </button>
          <button type="button" role="menuitem" onClick={onDelete}>
            Eliminar
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
  return date.toLocaleString('es-AR', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
