import type { CSSProperties } from 'react'
import { DEFAULT_ACCENT, accentColors, fontSizes, fonts, lineSpacings, margins, pageSizes, spacingLabel } from '../../../../domain/fonts'
import { isSingleColumn, templates, type TemplateId } from '../../../../domain/templates'
import type { EditorApi } from '../editorApi'
import { CheckIcon } from '../icons'

/** A tiny drawing of each layout, in the CV's accent color. */
function TemplateSketch({ id }: { id: TemplateId }) {
  return (
    <span className={`cv-sketch is-${id}`} aria-hidden="true">
      <span className="cv-sketch-head">
        <i className="is-name" />
        <i className="is-contact" />
      </span>
      <span className="cv-sketch-body">
        <span className="cv-sketch-main">
          <i className="is-label" />
          <i />
          <i className="is-short" />
          <i />
          <i className="is-label" />
          <i />
          <i className="is-short" />
        </span>
        {id === 'sidebar' ? (
          <span className="cv-sketch-side">
            <i className="is-label" />
            <i />
            <i />
            <i className="is-short" />
          </span>
        ) : null}
      </span>
    </span>
  )
}

function Segment<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) {
  return (
    <div className="cv-design-row">
      <span className="cv-design-label">{label}</span>
      <div className="cv-segment" role="group" aria-label={label}>
        {options.map((option) => (
          <button key={String(option.value)} type="button" className={option.value === value ? 'is-current' : undefined} aria-pressed={option.value === value} onClick={() => onChange(option.value)}>
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Template, color, typography and spacing: how the CV looks. */
export function DesignPanel({ api }: { api: EditorApi }) {
  const { cv, patchCv } = api
  const accent = cv.accentColor ?? DEFAULT_ACCENT
  const custom = !accentColors.some((color) => color.id === accent)
  return (
    <div className="cv-design" style={{ '--sketch-accent': accent } as CSSProperties}>
      <section className="cv-design-block">
        <h3>Plantilla</h3>
        <div className="cv-templates">
          {templates.map((template) => {
            const on = template.id === cv.templateId
            return (
              <button key={template.id} type="button" className={on ? 'cv-template is-on' : 'cv-template'} aria-pressed={on} onClick={() => patchCv({ templateId: template.id })}>
                <TemplateSketch id={template.id} />
                <span className="cv-template-name">
                  {template.name}
                  {isSingleColumn(template.id) ? <em title="Una columna: los filtros automáticos (ATS) la leen en orden">ATS</em> : null}
                </span>
                <span className="cv-template-detail">{template.detail}</span>
                {on ? (
                  <span className="cv-template-check">
                    <CheckIcon size={14} />
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      </section>

      <section className="cv-design-block">
        <h3>Color</h3>
        <div className="cv-swatches" role="radiogroup" aria-label="Color de acento">
          {accentColors.map((color) => (
            <button
              key={color.id}
              type="button"
              role="radio"
              aria-checked={accent === color.id}
              aria-label={color.name}
              title={color.name}
              className={accent === color.id ? 'cv-swatch is-on' : 'cv-swatch'}
              style={{ '--swatch': color.id } as CSSProperties}
              onClick={() => patchCv({ accentColor: color.id === DEFAULT_ACCENT ? undefined : color.id })}
            />
          ))}
          <label className={custom ? 'cv-swatch is-custom is-on' : 'cv-swatch is-custom'} title="Otro color" style={{ '--swatch': custom ? accent : '#ffffff' } as CSSProperties}>
            <input type="color" aria-label="Otro color" value={accent} onChange={(event) => patchCv({ accentColor: event.target.value })} />
          </label>
        </div>
        <p className="cv-note">Tiñe el nombre, los títulos y las líneas. Elegí tonos oscuros: se imprimen bien y se leen como texto.</p>
      </section>

      <section className="cv-design-block">
        <h3>Tipografía</h3>
        <div className="cv-fonts">
          {fonts.map((font) => {
            const on = font.id === cv.fontId
            return (
              <button key={font.id} type="button" className={on ? 'cv-font is-on' : 'cv-font'} aria-pressed={on} onClick={() => patchCv({ fontId: font.id })}>
                <span className="cv-font-sample" style={{ fontFamily: font.family }}>
                  Aa
                </span>
                <span className="cv-font-name" style={{ fontFamily: font.family }}>
                  {font.name}
                </span>
                <span className="cv-font-kind">{font.kind === 'serif' ? 'Con serifa' : 'Sin serifa'}</span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="cv-design-block">
        <h3>Texto y espacios</h3>
        <Segment label="Tamaño" value={cv.fontSize} options={fontSizes.map((size) => ({ value: size, label: String(size) }))} onChange={(fontSize) => patchCv({ fontSize })} />
        <Segment label="Interlineado" value={cv.lineHeight} options={lineSpacings.map((spacing) => ({ value: spacing, label: spacingLabel(spacing) }))} onChange={(lineHeight) => patchCv({ lineHeight })} />
        <Segment label="Márgenes" value={cv.marginId} options={margins.map((margin) => ({ value: margin.id, label: margin.name }))} onChange={(marginId) => patchCv({ marginId })} />
        <Segment label="Papel" value={cv.pageSize} options={pageSizes.map((page) => ({ value: page.id, label: page.name }))} onChange={(pageSize) => patchCv({ pageSize })} />
        <Segment
          label="Skills"
          value={cv.skillsFormat ?? 'list'}
          options={[
            { value: 'comma', label: 'Separadas por comas' },
            { value: 'list', label: 'En lista' },
          ]}
          onChange={(skillsFormat) => patchCv({ skillsFormat })}
        />
      </section>
    </div>
  )
}
