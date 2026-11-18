import type { Session as SupabaseSession, SupabaseClient } from '@supabase/supabase-js'
import type { AuthGateway, Session, SocialProvider } from '../../ports/auth'

const socialProviders: SocialProvider[] = ['github', 'google']

export function createSupabaseAuth(
  client: SupabaseClient,
  /** `redirectTo` is read at sign-in time: the link must bring the user back to where they were. */
  options: { url: string; key: string; redirectTo: () => string },
): AuthGateway {
  return {
    async providers() {
      // Whatever is enabled in Supabase Auth shows up, without redeploying the app.
      try {
        const response = await fetch(`${options.url}/auth/v1/settings`, { headers: { apikey: options.key } })
        const settings = (await response.json()) as { external?: Record<string, boolean> }
        const external = settings.external ?? {}
        return { email: external.email !== false, social: socialProviders.filter((provider) => external[provider] === true) }
      } catch {
        return { email: true, social: [] }
      }
    },
    async current() {
      const { data } = await client.auth.getSession()
      return toSession(data.session)
    },
    onChange(listener) {
      const { data } = client.auth.onAuthStateChange((_event, session) => listener(toSession(session)))
      return () => data.subscription.unsubscribe()
    },
    async signInWithEmail(email) {
      const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: options.redirectTo() } })
      if (error) throw error
    },
    async signInWithProvider(provider) {
      const { error } = await client.auth.signInWithOAuth({ provider, options: { redirectTo: options.redirectTo() } })
      if (error) throw error
    },
    async signOut() {
      const { error } = await client.auth.signOut()
      if (error) throw error
    },
  }
}

function toSession(session: SupabaseSession | null): Session | null {
  return session ? { userId: session.user.id, email: session.user.email ?? '' } : null
}
