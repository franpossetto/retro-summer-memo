import { useEffect, useState, type ReactNode } from 'react'
import { readStoredDocument } from '../adapters/local'
import { openDocument, type OpenedDocument } from '../app/openDocument'
import { createBackend, type Backend } from '../backend'
import type { Session } from '../ports/auth'
import type { DocumentStore } from '../ports/documentStore'
import App, { type AssistantAccess } from './App'
import { LogoMark } from './components/brand/Brand'
import { Landing } from './components/landing/Landing'
import { ConsentScreen } from './Consent'
import { consentRequestId } from './consentRoute'
import { SignInCard } from './SignIn'

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
    // An assistant asking for access gets the plain sign-in; everyone else, the home page.
    if (consentId) {
      return (
        <SignInCard
          auth={backend.auth}
          devMailbox={backend.devMailbox}
          lede="Para conectar tu asistente con Resume, primero entrá a tu cuenta."
        />
      )
    }
    return <Landing auth={backend.auth} devMailbox={backend.devMailbox} />
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
      assistant={{ mcpUrl: backend.mcpUrl, access: backend.consent }}
    />
  )
}

type GateState = { status: 'loading' } | { status: 'ready'; opened: OpenedDocument } | { status: 'error'; message: string }

function DocumentGate({
  store,
  importFromBrowser = false,
  account,
  assistant,
}: {
  store: DocumentStore
  importFromBrowser?: boolean
  account?: { email: string; onSignOut: () => void }
  assistant?: AssistantAccess
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
  return <App initialDocument={state.opened.document} store={store} account={account} notice={notice} assistant={assistant} />
}

function Splash({ text, children }: { text: string; children?: ReactNode }) {
  return (
    <div className="signin">
      <div className="signin-card">
        <LogoMark size={28} />
        <p>{text}</p>
        {children ? <div className="signin-actions">{children}</div> : null}
      </div>
    </div>
  )
}
