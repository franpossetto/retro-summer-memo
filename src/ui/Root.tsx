import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { readStoredDocument } from '../adapters/local'
import { openDocument, type OpenedDocument } from '../app/openDocument'
import { createBackend, type Backend } from '../backend'
import type { AuthGateway, Session, SocialProvider } from '../ports/auth'
import type { DocumentStore } from '../ports/documentStore'
import App from './App'
import { ConsentScreen } from './Consent'
import { consentRequestId } from './consentRoute'

export function Root() {
  const [backend] = useState(createBackend)
  if (backend.kind === 'local') return <DocumentGate store={backend.store} />
  return <AuthGate backend={backend} />
}

type SupabaseBackend = Extract<Backend, { kind: 'supabase' }>

function AuthGate({ backend }: { backend: SupabaseBackend }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  /** Opened by an OAuth client (Claude via the MCP) asking for access: show the consent step. */
  const [consentId] = useState(() => consentRequestId())

  useEffect(() => {
    let active = true
    backend.auth.current().then((current) => {
      if (active) setSession(current)
    })
    const unsubscribe = backend.auth.onChange((next) => setSession(next))
    return () => {
      active = false
      unsubscribe()
    }
  }, [backend])

  if (session === undefined) return <Splash text="Cargando…" />
  if (!session) {
    return (
      <SignIn
        auth={backend.auth}
        devMailbox={backend.devMailbox}
        lede={consentId ? 'Para conectar Claude con tus postulaciones, primero entrá a tu cuenta.' : undefined}
      />
    )
  }
  if (consentId) return <ConsentScreen consent={backend.consent} authorizationId={consentId} email={session.email} />
  return <SignedIn key={session.userId} backend={backend} session={session} />
}

function SignedIn({ backend, session }: { backend: SupabaseBackend; session: Session }) {
  const [store] = useState(() => backend.storeFor(session))
  return (
    <DocumentGate
      store={store}
      importFromBrowser
      account={{ email: session.email, onSignOut: () => void backend.auth.signOut() }}
    />
  )
}

type GateState = { status: 'loading' } | { status: 'ready'; opened: OpenedDocument } | { status: 'error'; message: string }

function DocumentGate({
  store,
  importFromBrowser = false,
  account,
}: {
  store: DocumentStore
  importFromBrowser?: boolean
  account?: { email: string; onSignOut: () => void }
}) {
  const [state, setState] = useState<GateState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    openDocument(store, importFromBrowser ? () => readStoredDocument() : undefined).then(
      (opened) => {
        if (active) setState({ status: 'ready', opened })
      },
      (error: unknown) => {
        if (active) setState({ status: 'error', message: error instanceof Error ? error.message : String(error) })
      },
    )
    return () => {
      active = false
    }
  }, [store, importFromBrowser, attempt])

  if (state.status === 'loading') return <Splash text="Abriendo tus datos…" />
  if (state.status === 'error') {
    return (
      <Splash text={`No se pudieron abrir tus datos (${store.label}): ${state.message}`}>
        <button
          type="button"
          className="button primary"
          onClick={() => {
            setState({ status: 'loading' })
            setAttempt((count) => count + 1)
          }}
        >
          Reintentar
        </button>
        {account ? (
          <button type="button" className="button" onClick={account.onSignOut}>
            Cerrar sesión
          </button>
        ) : null}
      </Splash>
    )
  }
  const notice =
    state.opened.created === 'imported' ? 'Importamos a tu cuenta los datos que tenías en este navegador.' : undefined
  return <App initialDocument={state.opened.document} store={store} account={account} notice={notice} />
}

const providerLabel: Record<SocialProvider, string> = { github: 'GitHub', google: 'Google' }

function signInError(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason)
  if (/rate limit/i.test(message)) {
    return 'Supabase no deja mandar más mails de login por ahora (tiene un límite por hora). Entrá con GitHub o probá de nuevo en un rato.'
  }
  return message
}

function SignIn({ auth, devMailbox, lede }: { auth: AuthGateway; devMailbox: string; lede?: string }) {
  const [email, setEmail] = useState('')
  const [sentTo, setSentTo] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [social, setSocial] = useState<SocialProvider[]>([])

  useEffect(() => {
    let active = true
    auth.providers().then((providers) => {
      if (active) setSocial(providers.social)
    })
    return () => {
      active = false
    }
  }, [auth])

  async function sendLink(event: FormEvent) {
    event.preventDefault()
    const address = email.trim()
    if (!address) return
    setBusy(true)
    setError('')
    try {
      await auth.signInWithEmail(address)
      setSentTo(address)
    } catch (reason) {
      setError(signInError(reason))
    } finally {
      setBusy(false)
    }
  }

  async function withProvider(provider: SocialProvider) {
    setError('')
    try {
      await auth.signInWithProvider(provider)
    } catch (reason) {
      setError(signInError(reason))
    }
  }

  return (
    <div className="signin">
      <div className="signin-card">
        <h1>Entrar</h1>
        {lede ? <p>{lede}</p> : null}
        {sentTo ? (
          <>
            <p>
              Te mandamos un link a <strong>{sentTo}</strong>. Abrilo desde este navegador para entrar.
            </p>
            {devMailbox ? (
              <p className="signin-hint">
                En desarrollo los mails llegan a{' '}
                <a href={devMailbox} target="_blank" rel="noreferrer">
                  Mailpit
                </a>
                .
              </p>
            ) : null}
            <button type="button" className="button" onClick={() => setSentTo('')}>
              Usar otro email
            </button>
          </>
        ) : (
          <>
            {social.map((provider) => (
              <button key={provider} type="button" className="button signin-social" onClick={() => void withProvider(provider)}>
                Continuar con {providerLabel[provider]}
              </button>
            ))}
            {social.length > 0 ? <p className="signin-or">o con un link a tu email</p> : null}
            <form className="signin-form" onSubmit={(event) => void sendLink(event)}>
              <label className="field">
                <span>Email</span>
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
              <button type="submit" className="button primary" disabled={busy || !email.trim()}>
                {busy ? 'Enviando…' : 'Mandarme un link'}
              </button>
            </form>
          </>
        )}
        {error ? (
          <p className="signin-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  )
}

function Splash({ text, children }: { text: string; children?: ReactNode }) {
  return (
    <div className="signin">
      <div className="signin-card">
        <p>{text}</p>
        {children ? <div className="signin-actions">{children}</div> : null}
      </div>
    </div>
  )
}
