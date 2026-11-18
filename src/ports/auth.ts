export type Session = {
  userId: string
  email: string
}

/** Sign-in for backends that keep data per user. */
export interface AuthGateway {
  /** Providers offered on the sign-in screen. */
  readonly providers: { email: boolean; google: boolean }
  current(): Promise<Session | null>
  onChange(listener: (session: Session | null) => void): () => void
  /** Sends a one-time sign-in link to `email`. */
  signInWithEmail(email: string): Promise<void>
  signInWithGoogle(): Promise<void>
  signOut(): Promise<void>
}

/** An app (e.g. Claude through the MCP) asking to act on the user's data. */
export type AuthorizationRequest = {
  id: string
  clientName: string
  clientUri: string
  /** Where the user goes back after deciding; shown so they can spot an unexpected client. */
  redirectUri: string
  scopes: string[]
}

/** Consent step of the backend's OAuth server (only backends that act as one). */
export interface OAuthConsent {
  /** `done`: the user already approved this client before; just follow `redirectUrl`. */
  details(authorizationId: string): Promise<{ kind: 'ask'; request: AuthorizationRequest } | { kind: 'done'; redirectUrl: string }>
  /** Both return where to send the browser next (back to the client, with a code or an error). */
  approve(authorizationId: string): Promise<string>
  deny(authorizationId: string): Promise<string>
}
