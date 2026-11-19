import type { AnalysisCheck } from '../../../../domain/cvAnalysis'
import { PromptHint } from '../../assistant/PromptHint'
import type { EditorApi } from '../editorApi'
import { AlertIcon, CheckIcon, CrossCircleIcon } from '../icons'
import { ScoreRing } from '../ScoreRing'

const statusIcon = {
  pass: <CheckIcon size={16} />,
  warn: <AlertIcon size={16} />,
  fail: <CrossCircleIcon size={16} />,
}

/** The CV's score, a few numbers and what to fix, each with a way to get there. */
export function AnalysisPanel({ api }: { api: EditorApi }) {
  const { analysis, cv } = api
  const { metrics, keywords } = analysis
  const toFix = analysis.checks.filter((check) => check.status !== 'pass').sort((left, right) => (left.status === right.status ? right.weight - left.weight : left.status === 'fail' ? -1 : 1))
  const fine = analysis.checks.filter((check) => check.status === 'pass')

  function go(check: AnalysisCheck) {
    if (check.area === 'posting') api.openPanel('posting')
    else if (check.area === 'design') api.openPanel('design')
    else if (check.refs.length > 0) api.startReview(check.title, check.refs.map((id) => `${refKind(api, id)}:${id}`))
    else api.focus(check.id === 'summary' ? 'summary' : check.id === 'contact' ? 'header' : `section:${check.id === 'skills' ? 'skills' : 'experience'}`, { reveal: true })
  }

  return (
    <div className="cv-analysis">
      <div className={`cv-score is-${analysis.grade.tone}`}>
        <ScoreRing score={analysis.score} tone={analysis.grade.tone} size={92} stroke={8} />
        <div>
          <strong>{analysis.grade.label}</strong>
          <p>{toFix.length === 0 ? 'Pasa todos los chequeos. Listo para mandar.' : `${toFix.length} ${toFix.length === 1 ? 'cosa' : 'cosas'} para mejorar, de ${analysis.checks.length} chequeos.`}</p>
        </div>
      </div>

      <div className="cv-metrics">
        <Metric label="Páginas" value={String(metrics.pages).replace('.', ',')} hint="1 o 2" ok={metrics.pages <= 2} />
        <Metric label="Logros con números" value={`${metrics.withResults}/${metrics.achievements}`} hint="6 de cada 10" ok={metrics.achievements > 0 && metrics.withResults / metrics.achievements >= 0.6} />
        <Metric
          label="Palabras del aviso"
          value={metrics.keywords ? `${metrics.keywords.covered}/${metrics.keywords.total}` : '—'}
          hint={metrics.keywords ? '7 de cada 10' : 'Sin aviso'}
          ok={metrics.keywords ? metrics.keywords.total === 0 || metrics.keywords.covered / metrics.keywords.total >= 0.7 : undefined}
        />
        <Metric label="Caracteres del resumen" value={metrics.summaryLength > 0 ? `${metrics.summaryLength}` : '—'} hint="2 a 4 líneas" ok={metrics.summaryLength >= 120 && metrics.summaryLength <= 600} />
      </div>

      {toFix.length > 0 ? (
        <section className="cv-checks">
          <h3>Para mejorar</h3>
          <ul>
            {toFix.map((check) => (
              <li key={check.id} className={`cv-check is-${check.status}`}>
                <span className="cv-check-icon">{statusIcon[check.status]}</span>
                <div>
                  <strong>{check.title}</strong>
                  <p>{check.detail}</p>
                </div>
                <button type="button" className="cv-check-go" onClick={() => go(check)}>
                  {check.refs.length > 1 ? `Ver (${check.refs.length})` : 'Ver'}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {keywords ? (
        <section className="cv-keywords">
          <h3>Palabras clave del aviso</h3>
          {keywords.covered.length + keywords.backedButMissing.length + keywords.notInExperience.length === 0 ? (
            <p className="cv-note">No encontramos tecnologías ni habilidades conocidas en el aviso.</p>
          ) : null}
          <KeywordGroup tone="covered" title="En tu CV" words={keywords.covered} />
          <KeywordGroup tone="missing" title="Tenés experiencia: sumalas" words={keywords.backedButMissing} />
          <KeywordGroup tone="absent" title="No están en tu experiencia" words={keywords.notInExperience} />
          {keywords.backedButMissing.length > 0 ? <p className="cv-note">Sumá logros de tu banco que las muestren (Contenido → Desde tu banco). No agregues las que no tenés.</p> : null}
        </section>
      ) : (
        <button type="button" className="cv-callout" onClick={() => api.openPanel('posting')}>
          <strong>Pegá el aviso</strong>
          <span>Vas a ver qué palabras clave pide y cuáles muestra tu CV.</span>
        </button>
      )}

      {fine.length > 0 ? (
        <details className="cv-checks is-fine">
          <summary>
            <h3>Bien ({fine.length})</h3>
          </summary>
          <ul>
            {fine.map((check) => (
              <li key={check.id} className="cv-check is-pass">
                <span className="cv-check-icon">{statusIcon.pass}</span>
                <div>
                  <strong>{check.title}</strong>
                  <p>{check.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {api.assistant && toFix.length > 0 ? (
        <PromptHint
          prompt={`Revisá el análisis de mi CV "${cv.title.trim() || 'Sin título'}" en Resume y arreglá lo que marca, sin inventar nada`}
          onConnect={api.assistant.connected ? undefined : api.assistant.onConnect}
        />
      ) : null}
    </div>
  )
}

/** Whether an id in a check's refs is an achievement or a role of the open CV. */
function refKind(api: EditorApi, id: string) {
  return api.outline.roles.some((role) => role.node.id === id) ? 'role' : 'bullet'
}

function Metric({ label, value, hint, ok }: { label: string; value: string; hint: string; ok?: boolean }) {
  return (
    <div className={ok === undefined ? 'cv-metric' : ok ? 'cv-metric is-ok' : 'cv-metric is-off'}>
      <span className="cv-metric-value">{value}</span>
      <span className="cv-metric-label">{label}</span>
      <span className="cv-metric-hint">Ideal: {hint}</span>
    </div>
  )
}

function KeywordGroup({ tone, title, words }: { tone: 'covered' | 'missing' | 'absent'; title: string; words: string[] }) {
  if (words.length === 0) return null
  return (
    <div className={`cv-keyword-group is-${tone}`}>
      <span className="cv-keyword-title">
        {title} <em>{words.length}</em>
      </span>
      <ul>
        {words.map((word) => (
          <li key={word}>{word}</li>
        ))}
      </ul>
    </div>
  )
}
