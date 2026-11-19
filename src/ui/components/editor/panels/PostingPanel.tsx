import { companyOf } from '../../../../domain/companies'
import { StatusPill } from '../../applications/StatusPill'
import { PromptHint } from '../../assistant/PromptHint'
import { CompanyLogo } from '../../companies/CompanyLogo'
import type { EditorApi } from '../editorApi'

/** The job this CV targets: what the analysis compares it with, and where it was sent. */
export function PostingPanel({ api }: { api: EditorApi }) {
  const { cv, doc, analysis, patchCv } = api
  const statusById = new Map(doc.applicationStatuses.map((status) => [status.id, status]))
  const sentTo = doc.applications.filter((application) => application.attachment?.kind === 'cv' && application.attachment.cvId === cv.id)
  const keywords = analysis.metrics.keywords
  return (
    <div className="cv-posting">
      <div className="cv-grid">
        <label className="cv-field is-wide">
          <span>Puesto</span>
          <input value={cv.position} placeholder="Staff Backend Engineer" onChange={(event) => patchCv({ position: event.target.value })} />
        </label>
        <label className="cv-field is-wide">
          <span>Empresa</span>
          <input value={cv.company} placeholder="Globex" onChange={(event) => patchCv({ company: event.target.value })} />
        </label>
      </div>
      <label className="cv-field">
        <span>Aviso</span>
        <textarea className="cv-posting-text" value={cv.posting} placeholder="Pegá el texto completo del aviso: requisitos, tecnologías, responsabilidades…" onChange={(event) => patchCv({ posting: event.target.value })} />
      </label>

      {keywords ? (
        <button type="button" className="cv-callout" onClick={() => api.openPanel('analysis')}>
          <strong>
            {keywords.total === 0 ? 'Sin términos técnicos reconocibles' : `Tu CV muestra ${keywords.covered} de ${keywords.total} términos que pide`}
          </strong>
          <span>Ver el detalle en Análisis →</span>
        </button>
      ) : null}

      {sentTo.length > 0 ? (
        <section className="cv-posting-sent">
          <h3>Mandado a</h3>
          <ul>
            {sentTo.map((application) => {
              const attachment = application.attachment?.kind === 'cv' ? application.attachment : null
              const index = attachment ? cv.versions.findIndex((version) => version.id === attachment.versionId) : -1
              return (
                <li key={application.id}>
                  <CompanyLogo name={application.company} company={companyOf(doc.companies, application)} size={28} />
                  <span>
                    <strong>{application.company}</strong>
                    <small>
                      {application.title} · {index >= 0 ? `versión ${index + 1}` : 'última versión'}
                    </small>
                  </span>
                  <StatusPill status={statusById.get(application.statusId)} />
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      {api.assistant ? (
        <PromptHint
          prompt={`Ajustá mi CV "${cv.title.trim() || 'Sin título'}" al aviso${cv.company.trim() ? ` de ${cv.company.trim()}` : ''}: elegí los logros que más pegan y reescribí el resumen`}
          onConnect={api.assistant.connected ? undefined : api.assistant.onConnect}
        />
      ) : null}
    </div>
  )
}
