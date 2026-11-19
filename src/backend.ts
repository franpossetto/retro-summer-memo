/**
 * Composition root: the only place that knows which adapters back the app.
 * With Supabase configured (VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY) data lives there,
 * per signed-in user; otherwise it stays in this browser.
 */
import { createClient } from '@supabase/supabase-js'
import { createLocalStore } from './adapters/local'
import { createSupabaseAuth } from './adapters/supabase/auth'
import { createSupabaseConsent } from './adapters/supabase/oauthConsent'
import { createSupabaseStore } from './adapters/supabase/store'
import type { AuthGateway, OAuthConsent, Session } from './ports/auth'
import type { DocumentStore } from './ports/documentStore'

export type Backend =
  | { kind: 'local'; store: DocumentStore }
  | {
      kind: 'supabase'
      auth: AuthGateway
      /** Consent screen and connected apps for assistants using the MCP. */
      consent: OAuthConsent
      /** Where assistants connect (the MCP Edge Function). */
      mcpUrl: string
      storeFor(session: Session): DocumentStore
      /** Local inbox for sign-in emails while developing against `supabase start`. */
      devMailbox: string
    }

export function createBackend(env: ImportMetaEnv = import.meta.env): Backend {
  const url = env.VITE_SUPABASE_URL
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) return { kind: 'local', store: createLocalStore() }

  const client = createClient(url, key)
  return {
    kind: 'supabase',
    auth: createSupabaseAuth(client, {
      url,
      key,
      // Back to the same page (e.g. /oauth/consent?authorization_id=…), without any hash.
      redirectTo: () => window.location.origin + window.location.pathname + window.location.search,
    }),
    consent: createSupabaseConsent(client),
    // The app's own domain when it forwards /mcp (production); the function's URL otherwise.
    mcpUrl: env.VITE_MCP_URL || `${url.replace(/\/+$/, '')}/functions/v1/mcp`,
    storeFor: (session) => createSupabaseStore(client, session.userId),
    devMailbox: env.VITE_DEV_MAILBOX_URL ?? '',
  }
}
