import type { Session as SupabaseSession, SupabaseClient } from '@supabase/supabase-js'
import type { AuthGateway, Session } from '../../ports/auth'

export function createSupabaseAuth(
  client: SupabaseClient,
  options: { google: boolean; redirectTo: string },
): AuthGateway {
  return {
    providers: { email: true, google: options.google },
    async current() {
      const { data } = await client.auth.getSession()
      return toSession(data.session)
    },
    onChange(listener) {
      const { data } = client.auth.onAuthStateChange((_event, session) => listener(toSession(session)))
      return () => data.subscription.unsubscribe()
    },
    async signInWithEmail(email) {
      const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: options.redirectTo } })
      if (error) throw error
    },
    async signInWithGoogle() {
      const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: options.redirectTo } })
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
