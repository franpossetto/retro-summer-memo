import type { SupabaseClient } from '@supabase/supabase-js'
import type { OAuthConsent } from '../../ports/auth'

/** Consent screen backend for Supabase Auth's OAuth 2.1 server (used by MCP clients like Claude). */
export function createSupabaseConsent(client: SupabaseClient): OAuthConsent {
  return {
    async details(authorizationId) {
      const { data, error } = await client.auth.oauth.getAuthorizationDetails(authorizationId)
      if (error) throw error
      if (!('authorization_id' in data)) return { kind: 'done', redirectUrl: data.redirect_url }
      return {
        kind: 'ask',
        request: {
          id: data.authorization_id,
          clientName: data.client.name,
          clientUri: data.client.uri,
          redirectUri: data.redirect_uri,
          scopes: data.scope.split(' ').filter(Boolean),
        },
      }
    },
    async approve(authorizationId) {
      const { data, error } = await client.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
      if (error) throw error
      return data.redirect_url
    },
    async deny(authorizationId) {
      const { data, error } = await client.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true })
      if (error) throw error
      return data.redirect_url
    },
    async connectedApps() {
      const { data, error } = await client.auth.oauth.listGrants()
      if (error) throw error
      return (data ?? [])
        .map((grant) => ({ clientId: grant.client.id, name: grant.client.name || 'App', grantedAt: grant.granted_at }))
        .sort((left, right) => right.grantedAt.localeCompare(left.grantedAt))
    },
    async disconnect(clientId) {
      const { error } = await client.auth.oauth.revokeGrant({ clientId })
      if (error) throw error
    },
  }
}
