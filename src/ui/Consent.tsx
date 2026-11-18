import { useEffect, useState } from 'react'
import type { AuthorizationRequest, OAuthConsent } from '../ports/auth'

type State =
  | { status: 'loading' }
  | { status: 'ask'; request: AuthorizationRequest }
  | { status: 'leaving'; message: string }
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
          setState({ status: 'leaving', message: 'Ya lo habías autorizado. Volviendo…' })
          window.location.assign(result.redirectUrl)
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
    setState({ status: 'leaving', message: approve ? 'Autorizado. Volviendo…' : 'Cancelado. Volviendo…' })
    try {
      const url = approve ? await consent.approve(authorizationId) : await consent.deny(authorizationId)
      window.location.assign(url)
    } catch (error) {
      setState({ status: 'error', message: error instanceof Error ? error.message : String(error) })
    }
  }

  return (
    <div className="signin">
      <div className="signin-card consent-card">
        {state.status === 'loading' ? <p>Cargando el pedido de acceso…</p> : null}
        {state.status === 'leaving' ? <p>{state.message}</p> : null}
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
              <li>Ver tu perfil, tus experiencias y tus CVs.</li>
              <li>Buscar, crear y actualizar tus postulaciones y sus notas.</li>
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
