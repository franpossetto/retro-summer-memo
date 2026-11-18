import { useState, type FormEvent } from 'react'
import type { Extra } from '../../domain/extra'

/** Text for an input: strings as they are, anything else (numbers, lists, objects) as JSON. */
function display(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value)
}

/** Back from an input: JSON when the field held JSON and still parses, plain text otherwise. */
function parse(text: string, previous: unknown): unknown {
  if (typeof previous === 'string' || previous === undefined) return text
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/** Free-form fields of any entity (salary, recruiter, stack…): add, edit and remove. */
export function ExtraFields({ value, onChange, empty = 'Sin datos extra.' }: { value: Extra | undefined; onChange: (next: Extra | undefined) => void; empty?: string }) {
  const entries = Object.entries(value ?? {})
  const [key, setKey] = useState('')
  const [text, setText] = useState('')

  function save(next: Extra) {
    onChange(Object.keys(next).length > 0 ? next : undefined)
  }

  function add(event: FormEvent) {
    event.preventDefault()
    const name = key.trim()
    if (!name) return
    save({ ...(value ?? {}), [name]: text.trim() })
    setKey('')
    setText('')
  }

  function remove(name: string) {
    const next = { ...(value ?? {}) }
    delete next[name]
    save(next)
  }

  return (
    <div className="extra-fields">
      {entries.length === 0 ? <p className="form-hint">{empty}</p> : null}
      {entries.map(([name, current]) => (
        <div key={name} className="extra-row">
          <span className="extra-key" title={name}>
            {name}
          </span>
          <input
            aria-label={name}
            defaultValue={display(current)}
            onBlur={(event) => {
              if (event.target.value !== display(current)) save({ ...(value ?? {}), [name]: parse(event.target.value, current) })
            }}
          />
          <button type="button" className="icon-button" aria-label={`Quitar ${name}`} title="Quitar" onClick={() => remove(name)}>
            ×
          </button>
        </div>
      ))}
      <form className="extra-row extra-add" onSubmit={add}>
        <input aria-label="Nuevo dato" placeholder="Dato (ej. sueldo)" value={key} onChange={(event) => setKey(event.target.value)} />
        <input aria-label="Valor" placeholder="Valor" value={text} onChange={(event) => setText(event.target.value)} />
        <button type="submit" className="button" disabled={!key.trim()}>
          Agregar
        </button>
      </form>
    </div>
  )
}
