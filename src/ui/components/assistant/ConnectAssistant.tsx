import { useEffect, useState } from 'react'
import type { ConnectedApp } from '../../../ports/auth'
import { formatDateTime } from '../../format'
import { PromptHint } from './PromptHint'
import { projectInstructions, prompts } from './prompts'

/** How to connect ChatGPT, Claude, Gemini… to Resume (the MCP), and the ones already connected. */
export function ConnectAssistant({
  mcpUrl,
  apps,
  onDisconnect,
  onClose,
}: {
  mcpUrl: string
  apps: ConnectedApp[] | null
  onDisconnect: (clientId: string) => Promise<void>
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(mcpUrl)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  async function disconnect(clientId: string) {
    setBusy(clientId)
    try {
      await onDisconnect(clientId)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="composer-backdrop" onClick={onClose}>
      <div
        className="cv-draft composer composer-wide assistant-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="assistant-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="composer-head">
          <h2 id="assistant-title">Conectá tu asistente</h2>
          <button type="button" className="view-close" aria-label="Cerrar" onClick={onClose}>
            ×
          </button>
        </div>
        <p className="assistant-lede">
          Resume se maneja hablándole a tu asistente: le pedís las cosas y las hace acá (perfil, experiencias, CVs, postulaciones).
          Agregalo como conector MCP con esta URL; la primera vez te pide entrar y autorizarlo.
        </p>

        <div className="assistant-url">
          <input readOnly aria-label="URL del conector" value={mcpUrl} onFocus={(event) => event.target.select()} />
          <button type="button" className="button primary" onClick={() => void copyUrl()}>
            {copied ? 'Copiada' : 'Copiar URL'}
          </button>
        </div>

        <ul className="assistant-steps">
          <li>
            <strong>ChatGPT:</strong> en la configuración, sección de conectores (con el modo desarrollador activo), creá uno nuevo con
            esta URL.
          </li>
          <li>
            <strong>Claude:</strong> Configuración → Conectores → Agregar conector personalizado, con esta URL. Queda también en la app
            del celular.
          </li>
          <li>
            <strong>Gemini y otros:</strong> cualquier asistente que acepte servidores MCP remotos se conecta con la misma URL.
          </li>
        </ul>

        <h3 className="assistant-subtitle">Para que arranque solo</h3>
        <p className="form-hint">
          Armá un proyecto para tu búsqueda (en Claude o ChatGPT) y pegá esto en sus instrucciones. Así cada chat empieza mirando Resume, sin que
          se lo pidas, y entiende solo un link de un aviso o un “mañana tengo call con RRHH”.
        </p>
        <div className="assistant-prompts">
          <PromptHint label="" prompt={projectInstructions} block />
        </div>

        <h3 className="assistant-subtitle">Después, probá con</h3>
        <div className="assistant-prompts">
          <PromptHint label="" prompt={prompts.start} />
          <PromptHint label="" prompt={prompts.analyze} />
          <PromptHint label="" prompt={prompts.news('Acme', 'Challenge técnico')} />
        </div>

        <h3 className="assistant-subtitle">Conectados</h3>
        {apps === null ? (
          <p className="form-hint">Cargando…</p>
        ) : apps.length === 0 ? (
          <p className="form-hint">Todavía no conectaste ninguno.</p>
        ) : (
          <ul className="assistant-apps">
            {apps.map((app) => (
              <li key={app.clientId}>
                <span className="assistant-app-name">{app.name}</span>
                <span className="form-hint">desde {formatDateTime(app.grantedAt)}</span>
                <button type="button" className="button" disabled={busy === app.clientId} onClick={() => void disconnect(app.clientId)}>
                  {busy === app.clientId ? 'Desconectando…' : 'Desconectar'}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="composer-actions">
          <button type="button" className="button primary" onClick={onClose}>
            Listo
          </button>
        </div>
      </div>
    </div>
  )
}

/** First screen of an empty account: connect an assistant and ask it to load everything. */
export function Onboarding({ connected, onConnect }: { connected: boolean; onConnect: () => void }) {
  return (
    <section className="onboarding" aria-label="Primeros pasos">
      <h2>Arrancá en dos pasos</h2>
      <ol>
        <li className={connected ? 'is-done' : undefined}>
          <span>Conectá tu asistente (ChatGPT, Claude, Gemini…).</span>
          {connected ? (
            <span className="onboarding-done">Conectado</span>
          ) : (
            <button type="button" className="button primary" onClick={onConnect}>
              Conectar
            </button>
          )}
        </li>
        <li>
          <span>Pedile que arme tu cuenta: te pide CVs viejos o tu LinkedIn y te va preguntando lo que falta.</span>
          <PromptHint label="" prompt={prompts.start} />
        </li>
      </ol>
    </section>
  )
}
