import type { ApplicationAttachment } from '../../../domain/applications'
import type { Cv } from '../../../domain/model'
import { cvLabel, versionLabel } from './cvs'

/** Pick the CV (and the exact version) sent with an application. */
export function CvAttachmentPicker({
  cvs,
  value,
  onChange,
}: {
  cvs: Cv[]
  value: ApplicationAttachment | null
  onChange: (attachment: ApplicationAttachment | null) => void
}) {
  const cvId = value?.kind === 'cv' ? value.cvId : ''
  const cv = cvs.find((item) => item.id === cvId)

  return (
    <div className="cv-picker">
      <select
        aria-label="CV"
        value={cv ? cv.id : ''}
        onChange={(event) => {
          const next = cvs.find((item) => item.id === event.target.value)
          onChange(next ? { kind: 'cv', cvId: next.id, versionId: next.versions.at(-1)?.id ?? '' } : null)
        }}
      >
        <option value="">{cvs.length === 0 ? 'Todavía no tenés CVs' : 'Ninguno'}</option>
        {cvs.map((item) => (
          <option key={item.id} value={item.id}>
            {cvLabel(item)}
          </option>
        ))}
      </select>
      {cv && value?.kind === 'cv' ? (
        <select
          aria-label="Versión"
          value={cv.versions.some((version) => version.id === value.versionId) ? value.versionId : ''}
          onChange={(event) => onChange({ ...value, versionId: event.target.value })}
        >
          <option value="">Última versión (cambia si regenerás)</option>
          {[...cv.versions].reverse().map((version) => (
            <option key={version.id} value={version.id}>
              {versionLabel(cv, version)}
            </option>
          ))}
        </select>
      ) : null}
      {value?.kind === 'cv' && !cv ? <span className="form-hint">El CV adjunto ya no existe.</span> : null}
      {value?.kind === 'file' ? <span className="form-hint">Archivo: {value.name}</span> : null}
    </div>
  )
}
