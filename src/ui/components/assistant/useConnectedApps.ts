import { useCallback, useEffect, useState } from 'react'
import type { ConnectedApp, OAuthConsent } from '../../../ports/auth'

/**
 * Assistants the user has authorized. Refreshed when the window regains focus: connecting happens
 * in another tab (ChatGPT, Claude), so coming back is when it may have changed.
 */
export function useConnectedApps(access: OAuthConsent | undefined) {
  const [apps, setApps] = useState<ConnectedApp[] | null>(null)

  const refresh = useCallback(async () => {
    if (!access) return
    try {
      setApps(await access.connectedApps())
    } catch {
      setApps((current) => current ?? [])
    }
  }, [access])

  useEffect(() => {
    if (!access) return
    let active = true
    access.connectedApps().then(
      (list) => {
        if (active) setApps(list)
      },
      () => {
        if (active) setApps([])
      },
    )
    const onFocus = () => void refresh()
    window.addEventListener('focus', onFocus)
    return () => {
      active = false
      window.removeEventListener('focus', onFocus)
    }
  }, [access, refresh])

  async function disconnect(clientId: string) {
    if (!access) return
    await access.disconnect(clientId)
    await refresh()
  }

  return { apps, refresh, disconnect }
}
