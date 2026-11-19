import { formatDateTime, relativeTime } from '../../../format'
import type { EditorApi } from '../editorApi'

/** Fixed copies of the CV: what was sent where, and the draft against the last one. */
export function VersionsPanel({ api, dirty }: { api: EditorApi; dirty: boolean }) {
  const { cv, doc, selectedVersionId, selectVersion } = api
  const latest = cv.versions.at(-1)
  const sent = (versionId: string) =>
    doc.applications.filter(
      (application) =>
        application.attachment?.kind === 'cv' &&
        application.attachment.cvId === cv.id &&
        (application.attachment.versionId === versionId || (application.attachment.versionId === '' && versionId === latest?.id)),
    )

  return (
    <div className="cv-versions">
      <div className={selectedVersionId ? 'cv-version is-draft' : 'cv-version is-draft is-current'}>
        <span className="cv-version-dot" aria-hidden="true" />
        <div className="cv-version-main">
          <strong>Borrador</strong>
          <small>
            {!latest ? 'Todavía no guardaste ninguna versión.' : dirty ? `Tiene cambios desde la versión ${cv.versions.length}.` : `Igual a la versión ${cv.versions.length}.`}
          </small>
        </div>
        {selectedVersionId ? (
          <button type="button" className="button" onClick={() => selectVersion(null)}>
            Ver
          </button>
        ) : (
          <button type="button" className="button primary" disabled={!dirty} onClick={api.saveVersion}>
            Guardar versión
          </button>
        )}
      </div>

      <ol className="cv-version-list">
        {[...cv.versions].reverse().map((version) => {
          const number = cv.versions.indexOf(version) + 1
          const showing = version.id === selectedVersionId
          const applications = sent(version.id)
          return (
            <li key={version.id} className={showing ? 'cv-version is-current' : 'cv-version'}>
              <span className="cv-version-dot" aria-hidden="true" />
              <div className="cv-version-main">
                <strong>Versión {number}</strong>
                <small title={formatDateTime(version.createdAt)}>
                  {formatDateTime(version.createdAt)} · {relativeTime(version.createdAt)}
                </small>
                {applications.length > 0 ? (
                  <span className="cv-version-sent">
                    {applications.map((application) => (
                      <span key={application.id}>Mandada a {application.company}</span>
                    ))}
                  </span>
                ) : null}
              </div>
              <button type="button" className={showing ? 'button is-on' : 'button'} onClick={() => selectVersion(showing ? null : version.id)}>
                {showing ? 'Viendo' : 'Ver'}
              </button>
            </li>
          )
        })}
      </ol>

      <p className="cv-note">
        Cada versión queda fija: es exactamente lo que mandaste. Al cargar una postulación, elegí la versión que enviaste y siempre vas a saber qué recibieron.
      </p>
    </div>
  )
}
