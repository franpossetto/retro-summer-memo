import { useId, useState, type FormEvent } from 'react'
import { emptyDebrief, type ApplicationEvent, type Debrief, type DebriefInput } from '../../../domain/applications'
import { formatDay, todayYmd } from '../../format'

const ratingLabels: Record<number, string> = { 1: 'Mal', 2: 'Flojo', 3: 'Normal', 4: 'Bien', 5: 'Excelente' }

/** The parts of a debrief, in the order they are told. */
const parts: { key: Exclude<keyof Debrief, 'rating' | 'people'>; label: string; placeholder: string; tone?: string }[] = [
  { key: 'asked', label: 'Me preguntaron o pidieron', placeholder: 'Por qué me quiero ir\nExpectativa salarial\nUn caso de diseño de sistemas' },
  { key: 'said', label: 'Qué dije', placeholder: 'Que busco más ownership\nPedí 90k' },
  { key: 'unsaid', label: 'Qué no dije', placeholder: 'Que tengo otra oferta\nMe olvidé de contar la migración', tone: 'unsaid' },
  { key: 'liked', label: 'Qué les gustó', placeholder: 'Que lideré el equipo de pagos', tone: 'liked' },
  { key: 'concerns', label: 'Qué no les cerró', placeholder: 'Poca experiencia con Go', tone: 'concerns' },
]

function Rating({ value }: { value: number }) {
  return (
    <span className="debrief-rating" aria-label={`${value} de 5: ${ratingLabels[value]}`}>
      {[1, 2, 3, 4, 5].map((step) => (
        <span key={step} className={step <= value ? 'is-on' : undefined} aria-hidden="true" />
      ))}
      <span>{ratingLabels[value]}</span>
    </span>
  )
}

/** How a step went, as the user told it. */
export function DebriefCard({ event, onEdit, onDelete }: { event: ApplicationEvent; onEdit: () => void; onDelete: () => void }) {
  const debrief = event.debrief ?? emptyDebrief()
  const shown = parts.filter((part) => debrief[part.key].length > 0)
  return (
    <article className="debrief">
      <header className="debrief-head">
        <span className="debrief-title">Cómo fue</span>
        {debrief.rating !== null ? <Rating value={debrief.rating} /> : null}
        {debrief.people.length > 0 ? <span className="debrief-people">con {debrief.people.join(', ')}</span> : null}
        <time dateTime={event.at}>{formatDay(event.at)}</time>
        <span className="debrief-actions">
          <button type="button" className="link-button" onClick={onEdit}>
            Editar
          </button>
          <button type="button" className="view-close" aria-label="Borrar bitácora" title="Borrar" onClick={onDelete}>
            ×
          </button>
        </span>
      </header>
      {event.text ? <p className="debrief-text">{event.text}</p> : null}
      {shown.length > 0 ? (
        <div className="debrief-grid">
          {shown.map((part) => (
            <div key={part.key} className={part.tone ? `debrief-part is-${part.tone}` : 'debrief-part'}>
              <h4>{part.label}</h4>
              <ul>
                {debrief[part.key].map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </article>
  )
}

const lines = (text: string) => text.split('\n').map((line) => line.trim()).filter(Boolean)

/** Telling (or retelling) how a step went. Lists are one item per line. */
export function DebriefForm({
  event,
  stageName,
  defaultDay,
  onSave,
  onCancel,
}: {
  /** The debrief being edited; a new one when missing. */
  event?: ApplicationEvent
  stageName: string
  /** Day a new one happened (`yyyy-mm-dd`); today when missing. */
  defaultDay?: string
  onSave: (input: DebriefInput) => void
  onCancel: () => void
}) {
  const ratingId = useId()
  const initial = event?.debrief ?? emptyDebrief()
  const toldOn = event ? todayYmd(new Date(event.at)) : ''
  const [day, setDay] = useState(toldOn || defaultDay || todayYmd())
  const [text, setText] = useState(event?.text ?? '')
  const [rating, setRating] = useState<number | null>(initial.rating)
  const [people, setPeople] = useState(initial.people.join(', '))
  const [lists, setLists] = useState<Record<string, string>>(() =>
    Object.fromEntries(parts.map((part) => [part.key, initial[part.key].join('\n')])),
  )

  function submit(submitEvent: FormEvent) {
    submitEvent.preventDefault()
    const input: DebriefInput = {
      id: event?.id,
      text,
      rating,
      people: people.split(',').map((person) => person.trim()).filter(Boolean),
      ...Object.fromEntries(parts.map((part) => [part.key, lines(lists[part.key] ?? '')])),
    }
    // Keep the moment it was told unless the day changed. Today is now; another day is its
    // midday, so it shows as that day anywhere (midday UTC today could still be ahead: scheduled).
    if (!event || day !== toldOn) {
      input.at = day === todayYmd() ? new Date().toISOString() : /^\d{4}-\d{2}-\d{2}$/.test(day) ? `${day}T12:00:00.000Z` : undefined
    }
    onSave(input)
  }

  return (
    <form className="debrief-form" onSubmit={submit} aria-label={`Cómo fue ${stageName}`}>
      <div className="debrief-form-row">
        <label className="field">
          <span>Fecha</span>
          <input type="date" value={day} onChange={(change) => setDay(change.target.value)} />
        </label>
        <div className="field">
          <span id={ratingId}>Cómo te fue</span>
          <div className="rating-picker" role="radiogroup" aria-labelledby={ratingId}>
            {[1, 2, 3, 4, 5].map((step) => (
              <button
                key={step}
                type="button"
                role="radio"
                aria-checked={rating === step}
                className={rating !== null && step <= rating ? 'is-on' : undefined}
                title={ratingLabels[step]}
                onClick={() => setRating(rating === step ? null : step)}
              >
                <span aria-hidden="true" />
                <span className="sr-only">{ratingLabels[step]}</span>
              </button>
            ))}
            <span className="rating-picker-label">{rating ? ratingLabels[rating] : 'Sin puntuar'}</span>
          </div>
        </div>
        <label className="field debrief-people-field">
          <span>Con quién</span>
          <input value={people} placeholder="Laura (RRHH), el CTO" onChange={(change) => setPeople(change.target.value)} />
        </label>
      </div>
      <label className="field">
        <span>Cómo fue</span>
        <textarea rows={2} value={text} placeholder="Charla de 40 minutos, buena onda. Me contaron del equipo y del próximo paso…" onChange={(change) => setText(change.target.value)} />
      </label>
      <div className="debrief-form-grid">
        {parts.map((part) => (
          <label key={part.key} className={part.tone ? `field is-${part.tone}` : 'field'}>
            <span>{part.label}</span>
            <textarea
              rows={3}
              value={lists[part.key]}
              placeholder={part.placeholder}
              onChange={(change) => setLists((current) => ({ ...current, [part.key]: change.target.value }))}
            />
          </label>
        ))}
      </div>
      <p className="form-hint">Una cosa por línea.</p>
      <div className="debrief-form-actions">
        <button type="button" className="button" onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className="button primary">
          Guardar
        </button>
      </div>
    </form>
  )
}
