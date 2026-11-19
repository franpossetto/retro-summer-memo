import { useState, type FormEvent } from 'react'
import type { Application, ApplicationStatus } from '../../../domain/applications'
import {
  companyNoteKinds,
  isBlankCompany,
  noteKindLabel,
  readNoteDate,
  websiteHost,
  websiteUrl,
  type Company,
  type CompanyInput,
  type CompanyNote,
  type CompanyNoteInput,
} from '../../../domain/companies'
import type { Extra } from '../../../domain/extra'
import { formatDay, formatPartialDate } from '../../format'
import { StatusPill } from '../applications/StatusPill'
import { PromptHint } from '../assistant/PromptHint'
import { prompts } from '../assistant/prompts'
import { ExtraFields } from '../ExtraFields'
import { CompanyLogo } from './CompanyLogo'

type CompanyPanelProps = {
  /** The company name as the application has it (the company may not be saved yet). */
  name: string
  company: Company | undefined
  /** The user's applications to this company. */
  applications: Application[]
  currentApplicationId: string
  statuses: ApplicationStatus[]
  /** Each returns an error message, or null when it was saved. */
  onSave: (input: CompanyInput) => string | null
  onSaveNote: (input: CompanyNoteInput) => string | null
  onDeleteNote: (noteId: string) => void
  onDelete: () => void
  onOpenApplication: (id: string) => void
  assistant?: { connected: boolean; onConnect: () => void }
}

/** Everything known about the company of an application: who they are and what is going on there. */
export function CompanyPanel({
  name,
  company,
  applications,
  currentApplicationId,
  statuses,
  onSave,
  onSaveNote,
  onDeleteNote,
  onDelete,
  onOpenApplication,
  assistant,
}: CompanyPanelProps) {
  const [editing, setEditing] = useState(false)
  const [noteForm, setNoteForm] = useState<{ note?: CompanyNote } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const shownName = company?.name || name || 'Sin empresa'
  const blank = !company || isBlankCompany(company)
  const host = websiteHost(company?.website ?? '')
  const others = applications.filter((application) => application.id !== currentApplicationId)
  const statusById = new Map(statuses.map((status) => [status.id, status]))

  function saveExtra(next: Extra | undefined) {
    const patch: Extra = { ...(next ?? {}) }
    for (const key of Object.keys(company?.extra ?? {})) if (!(key in patch)) patch[key] = null
    onSave({ id: company?.id, name: company ? undefined : name, extra: patch })
  }

  return (
    <section className="company" aria-label={`Empresa: ${shownName}`}>
      <header className="company-head">
        <CompanyLogo name={shownName} company={company} size={48} />
        <div className="company-titles">
          <h2>{shownName}</h2>
          {host ? (
            <a href={websiteUrl(company?.website ?? '')} target="_blank" rel="noreferrer">
              {host} ↗
            </a>
          ) : (
            <span className="muted">La empresa</span>
          )}
        </div>
        {!editing ? (
          <button type="button" className="button company-edit" onClick={() => setEditing(true)}>
            {blank ? 'Completar' : 'Editar'}
          </button>
        ) : null}
      </header>

      {editing ? (
        <CompanyForm
          company={company}
          name={shownName}
          onCancel={() => setEditing(false)}
          onSave={(input) => {
            const error = onSave(input)
            if (!error) setEditing(false)
            return error
          }}
        />
      ) : blank ? (
        <div className="company-empty">
          <p>
            Todavía no guardaste nada de {shownName}. Tu asistente puede investigarla y dejar acá a qué se dedica, su misión y visión, y las novedades
            con su fuente.
          </p>
          {assistant ? (
            <PromptHint prompt={prompts.research(shownName)} onConnect={assistant.connected ? undefined : assistant.onConnect} />
          ) : null}
        </div>
      ) : (
        <div className="company-about">
          {company?.about ? <p className="company-text">{company.about}</p> : null}
          {company?.mission ? (
            <div className="company-statement">
              <h3>Misión</h3>
              <p>{company.mission}</p>
            </div>
          ) : null}
          {company?.vision ? (
            <div className="company-statement">
              <h3>Visión</h3>
              <p>{company.vision}</p>
            </div>
          ) : null}
          {company && company.values.length > 0 ? (
            <div className="company-statement">
              <h3>Valores</h3>
              <ul className="company-values">
                {company.values.map((value) => (
                  <li key={value}>{value}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}

      <div className="company-block">
        <h3>Datos</h3>
        <ExtraFields
          key={company?.id ?? 'new'}
          value={company?.extra}
          empty="Industria, tamaño, sede, fundada, stack, rating en Glassdoor…"
          onChange={saveExtra}
        />
      </div>

      <div className="company-block">
        <div className="company-block-head">
          <h3>Lo que sabemos</h3>
          {company?.notes.length ? <span className="filter-count">{company.notes.length}</span> : null}
          {!noteForm ? (
            <button type="button" className="link-button" onClick={() => setNoteForm({})}>
              + Agregar
            </button>
          ) : null}
        </div>
        {noteForm && !noteForm.note ? (
          <NoteForm
            onCancel={() => setNoteForm(null)}
            onSave={(input) => {
              const error = onSaveNote(input)
              if (!error) setNoteForm(null)
              return error
            }}
          />
        ) : null}
        {company?.notes.length ? (
          <ol className="company-notes">
            {company.notes.map((note) =>
              noteForm?.note?.id === note.id ? (
                <li key={note.id}>
                  <NoteForm
                    note={note}
                    onCancel={() => setNoteForm(null)}
                    onSave={(input) => {
                      const error = onSaveNote({ ...input, id: note.id })
                      if (!error) setNoteForm(null)
                      return error
                    }}
                  />
                </li>
              ) : (
                <li key={note.id} className="company-note">
                  <div className="company-note-meta">
                    <span className={`note-kind is-${note.kind}`}>{noteKindLabel(note.kind)}</span>
                    {note.date ? <time dateTime={note.date}>{formatPartialDate(note.date)}</time> : null}
                    <span className="company-note-actions">
                      <button type="button" className="link-button" onClick={() => setNoteForm({ note })}>
                        Editar
                      </button>
                      <button type="button" className="view-close" aria-label="Borrar" title="Borrar" onClick={() => onDeleteNote(note.id)}>
                        ×
                      </button>
                    </span>
                  </div>
                  <p className="tracker-note">{note.text}</p>
                  {note.source ? <Source value={note.source} /> : null}
                </li>
              ),
            )}
          </ol>
        ) : !noteForm ? (
          <p className="form-hint">
            Novedades, despidos, contrataciones, otros puestos que publicaron, cómo son sus entrevistas según otros, sueldos… con fecha y fuente.
          </p>
        ) : null}
      </div>

      {others.length > 0 ? (
        <div className="company-block">
          <h3>Otras postulaciones a {shownName}</h3>
          <ul className="company-applications">
            {others.map((application) => (
              <li key={application.id}>
                <button type="button" className="company-application" onClick={() => onOpenApplication(application.id)}>
                  <span>{application.title || 'Sin puesto'}</span>
                  <StatusPill status={statusById.get(application.statusId)} />
                  <time>{formatDay(application.appliedOn || application.createdAt)}</time>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!blank && assistant ? (
        <PromptHint prompt={prompts.prepare(shownName)} onConnect={assistant.connected ? undefined : assistant.onConnect} />
      ) : null}

      {company && !blank ? (
        <div className="company-foot">
          {confirmDelete ? (
            <span className="confirm-inline">
              ¿Borrar todo lo guardado de {shownName}? Las postulaciones quedan.
              <button
                type="button"
                className="button danger"
                onClick={() => {
                  setConfirmDelete(false)
                  onDelete()
                }}
              >
                Borrar
              </button>
              <button type="button" className="button" onClick={() => setConfirmDelete(false)}>
                No
              </button>
            </span>
          ) : (
            <button type="button" className="link-button" onClick={() => setConfirmDelete(true)}>
              Borrar info de la empresa
            </button>
          )}
        </div>
      ) : null}
    </section>
  )
}

function Source({ value }: { value: string }) {
  if (/^https?:\/\//i.test(value)) {
    return (
      <a className="company-note-source" href={value} target="_blank" rel="noreferrer">
        {websiteHost(value) || 'Fuente'} ↗
      </a>
    )
  }
  return <span className="company-note-source">Fuente: {value}</span>
}

function CompanyForm({
  company,
  name,
  onSave,
  onCancel,
}: {
  company: Company | undefined
  name: string
  onSave: (input: CompanyInput) => string | null
  onCancel: () => void
}) {
  const [values, setValues] = useState({
    name: company?.name || name,
    website: company?.website ?? '',
    logo: company?.logo ?? '',
    about: company?.about ?? '',
    mission: company?.mission ?? '',
    vision: company?.vision ?? '',
    values: (company?.values ?? []).join(', '),
  })
  const [error, setError] = useState('')
  const set = (key: keyof typeof values) => (event: { target: { value: string } }) => setValues((current) => ({ ...current, [key]: event.target.value }))

  function submit(event: FormEvent) {
    event.preventDefault()
    const result = onSave({
      id: company?.id,
      name: values.name,
      website: values.website,
      logo: values.logo,
      about: values.about,
      mission: values.mission,
      vision: values.vision,
      values: values.values.split(',').map((value) => value.trim()).filter(Boolean),
    })
    setError(result ?? '')
  }

  return (
    <form className="company-form" onSubmit={submit}>
      <label className="field">
        <span>Nombre</span>
        <input required value={values.name} onChange={set('name')} />
      </label>
      <div className="company-form-row">
        <label className="field">
          <span>Web</span>
          <input value={values.website} placeholder="empresa.com" onChange={set('website')} />
        </label>
        <label className="field">
          <span>Logo (URL de imagen)</span>
          <input value={values.logo} placeholder="Opcional" title="Si no hay, se usa el ícono de la web o las iniciales" onChange={set('logo')} />
        </label>
      </div>
      <label className="field">
        <span>A qué se dedica</span>
        <textarea rows={3} value={values.about} placeholder="Producto, clientes, etapa, tamaño…" onChange={set('about')} />
      </label>
      <label className="field">
        <span>Misión</span>
        <textarea rows={2} value={values.mission} onChange={set('mission')} />
      </label>
      <label className="field">
        <span>Visión</span>
        <textarea rows={2} value={values.vision} onChange={set('vision')} />
      </label>
      <label className="field">
        <span>Valores</span>
        <input value={values.values} placeholder="Ownership, Velocidad, Transparencia" onChange={set('values')} />
      </label>
      {error ? (
        <p className="signin-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="debrief-form-actions">
        <button type="button" className="button" onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className="button primary" disabled={!values.name.trim()}>
          Guardar
        </button>
      </div>
    </form>
  )
}

function NoteForm({ note, onSave, onCancel }: { note?: CompanyNote; onSave: (input: CompanyNoteInput) => string | null; onCancel: () => void }) {
  const known = companyNoteKinds.some((item) => item.kind === note?.kind)
  const [kind, setKind] = useState(note?.kind ?? 'news')
  const [date, setDate] = useState(note?.date ?? '')
  const [text, setText] = useState(note?.text ?? '')
  const [source, setSource] = useState(note?.source ?? '')
  const [error, setError] = useState('')
  const hint = companyNoteKinds.find((item) => item.kind === kind)?.hint

  function submit(event: FormEvent) {
    event.preventDefault()
    if (date.trim() && !readNoteDate(date)) {
      setError('Fecha: usá 2026-03-14, 2026-03 o 2026.')
      return
    }
    setError(onSave({ kind, date: date.trim(), text, source }) ?? '')
  }

  return (
    <form className="note-form" onSubmit={submit}>
      <div className="company-form-row">
        <label className="field">
          <span>Tipo</span>
          <select value={kind} onChange={(event) => setKind(event.target.value)}>
            {companyNoteKinds.map((item) => (
              <option key={item.kind} value={item.kind}>
                {item.label}
              </option>
            ))}
            {note && !known ? <option value={note.kind}>{noteKindLabel(note.kind)}</option> : null}
          </select>
        </label>
        <label className="field">
          <span>Cuándo</span>
          <input value={date} placeholder="2026-03 (opcional)" onChange={(event) => setDate(event.target.value)} />
        </label>
      </div>
      <label className="field">
        <span>Qué</span>
        <textarea rows={3} required value={text} placeholder={hint} autoFocus onChange={(event) => setText(event.target.value)} />
      </label>
      <label className="field">
        <span>Fuente</span>
        <input value={source} placeholder="Link, o quién te lo contó" onChange={(event) => setSource(event.target.value)} />
      </label>
      {error ? (
        <p className="signin-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="debrief-form-actions">
        <button type="button" className="button" onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className="button primary" disabled={!text.trim()}>
          Guardar
        </button>
      </div>
    </form>
  )
}
