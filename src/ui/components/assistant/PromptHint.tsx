import { useState } from 'react'

/** A ready-to-paste request for the user's assistant (ChatGPT, Claude…), copied with one click. */
export function PromptHint({
  prompt,
  label = 'Pedíselo a tu asistente',
  onConnect,
}: {
  prompt: string
  label?: string
  /** Shown when no assistant is connected yet. */
  onConnect?: () => void
}) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="prompt-hint">
      {label ? <span className="prompt-hint-label">{label}</span> : null}
      <button type="button" className="prompt-chip" title="Copiar" onClick={() => void copy()}>
        <span className="prompt-text">“{prompt}”</span>
        <span className="prompt-copy">{copied ? 'Copiado' : 'Copiar'}</span>
      </button>
      {onConnect ? (
        <button type="button" className="link-button" onClick={onConnect}>
          Conectá tu asistente
        </button>
      ) : null}
    </div>
  )
}
