import { useEffect, useState } from 'react'
import { Brand } from './components/brand/Brand'
import type { AuthorizationRequest, OAuthConsent } from '../ports/auth'

type State =
  | { status: 'loading' }
  | { status: 'ask'; request: AuthorizationRequest }
  | { status: 'sending'; message: string }
  /** Decided: the way back to the client. Not followed automatically, see BackToClient. */
  | { status: 'back'; redirectUrl: string; approved: boolean; already: boolean }
  | { status: 'error'; message: string }

function hostOf(uri: string) {
  try {
    return new URL(uri).host
  } catch {
    return uri
  }
}

/** "¿Autorizás a Claude?": approve or deny an app connecting through OAuth (the MCP). */
export function ConsentScreen({ consent, authorizationId, email }: { consent: OAuthConsent; authorizationId: string; email: string }) {
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    let active = true
    consent.details(authorizationId).then(
      (result) => {
        if (!active) return
        if (result.kind === 'done') {
          setState({ status: 'back', redirectUrl: result.redirectUrl, approved: true, already: true })
        } else {
          setState({ status: 'ask', request: result.request })
        }
      },
      (error: unknown) => {
        if (active) setState({ status: 'error', message: error instanceof Error ? error.message : String(error) })
      },
    )
    return () => {
      active = false
    }
  }, [consent, authorizationId])

  async function decide(approve: boolean) {
    setState({ status: 'sending', message: approve ? 'Autorizando…' : 'Cancelando…' })
    try {
      const url = approve ? await consent.approve(authorizationId) : await consent.deny(authorizationId)
      setState({ status: 'back', redirectUrl: url, approved: approve, already: false })
    } catch (error) {
      setState({ status: 'error', message: error instanceof Error ? error.message : String(error) })
    }
  }

  return (
    <div className="signin">
      <div className="signin-card consent-card">
        <Brand size={28} className="signin-brand" />
        {state.status === 'loading' ? <p>Cargando el pedido de acceso…</p> : null}
        {state.status === 'sending' ? <p>{state.message}</p> : null}
        {state.status === 'back' ? <BackToClient {...state} /> : null}
        {state.status === 'error' ? (
          <>
            <h1>No se pudo completar</h1>
            <p className="signin-error" role="alert">
              {state.message}
            </p>
            <p className="signin-hint">El pedido vence a los pocos minutos: volvé a conectar desde la app que lo inició.</p>
          </>
        ) : null}
        {state.status === 'ask' ? (
          <>
            <h1>Conectar {state.request.clientName || 'una app'}</h1>
            <p>
              <strong>{state.request.clientName || 'Esta app'}</strong> quiere acceder a tu cuenta (<strong>{email}</strong>) para:
            </p>
            <ul className="consent-list">
              <li>Ver, crear, editar y borrar tu perfil, tus secciones y experiencias y tus CVs.</li>
              <li>Ver, crear, editar y borrar tus postulaciones y sus estados.</li>
            </ul>
            <dl className="consent-meta">
              <dt>Vuelve a</dt>
              <dd>{hostOf(state.request.redirectUri)}</dd>
              {state.request.clientUri ? (
                <>
                  <dt>Sitio</dt>
                  <dd>{hostOf(state.request.clientUri)}</dd>
                </>
              ) : null}
              {state.request.scopes.length > 0 ? (
                <>
                  <dt>Permisos</dt>
                  <dd>{state.request.scopes.join(', ')}</dd>
                </>
              ) : null}
            </dl>
            <p className="signin-hint">Autorizá solo si lo estás conectando vos ahora mismo.</p>
            <div className="signin-actions">
              <button type="button" className="button" onClick={() => void decide(false)}>
                Cancelar
              </button>
              <button type="button" className="button primary" onClick={() => void decide(true)}>
                Permitir
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}

/**
 * The way back to the app that asked (ChatGPT, Claude…), carrying the authorization code.
 * Shown instead of redirecting right away: the app may be open in another browser or Chrome
 * profile than this one, and the code only works there. It is single-use and short-lived.
 */
function BackToClient({ redirectUrl, approved, already }: { redirectUrl: string; approved: boolean; already: boolean }) {
  const [copied, setCopied] = useState(false)
  const host = hostOf(redirectUrl)

  async function copy() {
    try {
      await navigator.clipboard.writeText(redirectUrl)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <>
      <h1>{!approved ? 'Cancelado' : already ? 'Ya estaba autorizado' : 'Autorizado'}</h1>
      <p>{approved ? `Volvé a ${host} para terminar de conectar.` : `Volvé a ${host}: no va a tener acceso.`}</p>
      <div className="signin-actions">
        <a className="button primary" href={redirectUrl}>
          Volver a {host}
        </a>
        <button type="button" className="button" onClick={() => void copy()}>
          {copied ? 'Link copiado' : 'Copiar link de vuelta'}
        </button>
      </div>
      {approved ? (
        <>
          <p className="signin-hint">
            ¿Lo tenés abierto en otro navegador o en otro perfil de Chrome? Copiá el link y abrilo ahí. Sirve una sola vez y vence en
            unos minutos.
          </p>
          <input className="consent-link" readOnly aria-label="Link de vuelta" value={redirectUrl} onFocus={(event) => event.target.select()} />
        </>
      ) : null}
    </>
  )
}
