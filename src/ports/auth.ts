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
