import { useEffect, useState, type FormEvent } from 'react'
import type { AuthGateway, SocialProvider } from '../ports/auth'
import { Brand } from './components/brand/Brand'

const providerLabel: Record<SocialProvider, string> = { github: 'GitHub', google: 'Google' }

function signInError(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason)
  if (/rate limit/i.test(message)) {
    return 'Supabase no deja mandar más mails de login por ahora (tiene un límite por hora). Entrá con GitHub o probá de nuevo en un rato.'
  }
  return message
}

/**
 * The ways in: the social providers enabled in Supabase Auth, then a sign-in link by email.
 * `inline` lays the email field and its button on one row (the home page).
 */
export function SignInForm({ auth, devMailbox, inline = false }: { auth: AuthGateway; devMailbox: string; inline?: boolean }) {
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

  if (sentTo) {
    return (
      <div className="signin-sent" role="status">
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
      </div>
    )
  }

  return (
    <div className={inline ? 'signin-ways is-inline' : 'signin-ways'}>
      {social.map((provider) => (
        <button
          key={provider}
          type="button"
          className={inline ? 'button primary signin-social' : 'button signin-social'}
          onClick={() => void withProvider(provider)}
        >
          {provider === 'github' ? <GitHubIcon /> : null}
          {inline ? `Empezar con ${providerLabel[provider]}` : `Continuar con ${providerLabel[provider]}`}
        </button>
      ))}
      {social.length > 0 ? <p className="signin-or">{inline ? 'o con tu email' : 'o con un link a tu email'}</p> : null}
      <form className="signin-form" onSubmit={(event) => void sendLink(event)}>
        <label className="field">
          <span className={inline ? 'sr-only' : undefined}>Email</span>
          <input
            type="email"
            autoComplete="email"
            required
            placeholder={inline ? 'tu@email.com' : undefined}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <button type="submit" className={inline ? 'button' : 'button primary'} disabled={busy || !email.trim()}>
          {busy ? 'Enviando…' : inline ? 'Mandame un link' : 'Mandarme un link'}
        </button>
      </form>
      {error ? (
        <p className="signin-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

/** Sign-in as a card: used when an assistant sends the user here to authorize it. */
export function SignInCard({ auth, devMailbox, lede }: { auth: AuthGateway; devMailbox: string; lede?: string }) {
  return (
    <div className="signin">
      <div className="signin-card">
        <Brand size={28} className="signin-brand" />
        <h1>Entrar</h1>
        {lede ? <p>{lede}</p> : null}
        <SignInForm auth={auth} devMailbox={devMailbox} />
      </div>
    </div>
  )
}

function GitHubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"
      />
    </svg>
  )
}
