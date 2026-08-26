import { useCallback, useEffect, useState } from 'react'
import { getPackage } from '../services/api'

/**
 * The licensed package and which features it unlocks.
 *
 * Fetched once and shared through `<Locked>`, so a page never decides
 * entitlement for itself — the server is the authority and this is only a
 * cache of its answer. Gating in the UI is a courtesy that avoids showing a
 * control that would fail; every endpoint enforces the same rule server-side.
 */
export function usePackage() {
  const [state, setState] = useState({
    loading: true,
    package: null,
    label: null,
    features: {},
    upsells: {},
    error: null,
  })

  const refresh = useCallback(async () => {
    try {
      const data = await getPackage()
      setState({ loading: false, error: null, ...data })
    } catch (e) {
      // Fail open: a licence lookup that errors must not black out the app.
      // The server still refuses anything genuinely locked.
      setState((s) => ({ ...s, loading: false, error: 'Could not read the licence.' }))
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const has = useCallback(
    (feature) => state.features?.[feature] !== false,
    [state.features],
  )

  return { ...state, has, refresh }
}
