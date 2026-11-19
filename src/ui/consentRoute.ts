/** Where Supabase Auth sends the browser to approve an OAuth client (config: auth.oauth_server.authorization_url_path). */
export const CONSENT_PATH = '/oauth/consent'

/** The authorization being asked for, when the app was opened on the consent route. */
export function consentRequestId(location: Location = window.location): string | null {
  if (location.pathname.replace(/\/+$/, '') !== CONSENT_PATH) return null
  return new URLSearchParams(location.search).get('authorization_id')
}
