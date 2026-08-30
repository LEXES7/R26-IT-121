import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  fetchCurrentUser,
  getStoredUser,
  getToken,
  login as apiLogin,
  logout as apiLogout,
  onUnauthorized,
  setSession,
} from '../services/api'

/**
 * Authentication state for the whole app.
 *
 * The stored user is trusted only for first paint, to avoid a flash of the
 * sign-in screen on reload. It is immediately re-validated against /auth/me,
 * because localStorage is client-controlled and a stale or edited record must
 * never decide what the UI shows. Every permission the UI grants is also
 * enforced server-side — hiding a button is a usability choice, not a
 * security control.
 */

const AuthContext = createContext(null)

export const ROLES = {
  ADMIN: 'admin',
  RISK_MANAGER: 'risk_manager',
  ANALYST: 'analyst',
}

export const ROLE_LABELS = {
  [ROLES.ADMIN]: 'Administrator',
  [ROLES.RISK_MANAGER]: 'Risk Manager',
  [ROLES.ANALYST]: 'Analyst',
}

export const ROLE_DESCRIPTIONS = {
  [ROLES.ADMIN]: 'Full access including system configuration',
  [ROLES.RISK_MANAGER]: 'Transactions, monitoring, alerts and recipients',
  [ROLES.ANALYST]: 'Read-only access to transactions and reports',
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => (getToken() ? getStoredUser() : null))
  const [initialising, setInitialising] = useState(true)

  // Re-validate the cached session on mount.
  useEffect(() => {
    let cancelled = false

    async function validate() {
      if (!getToken()) {
        setInitialising(false)
        return
      }
      try {
        const fresh = await fetchCurrentUser()
        if (!cancelled) setUser(fresh)
      } catch {
        // A 401 already cleared the session via the interceptor. Any other
        // failure (backend down) also means we cannot trust the cached user.
        if (!cancelled) setUser(null)
      } finally {
        if (!cancelled) setInitialising(false)
      }
    }

    validate()
    return () => {
      cancelled = true
    }
  }, [])

  // The API layer tells us when a token was rejected mid-session.
  useEffect(() => onUnauthorized(() => setUser(null)), [])

  const signIn = useCallback(async (username, password) => {
    const data = await apiLogin(username, password)
    setSession(data.access_token, data.user)
    setUser(data.user)
    return data.user
  }, [])

  const signOut = useCallback(async () => {
    try {
      await apiLogout()
    } catch {
      // Logging out is best-effort; the token is stateless and discarding it
      // locally is what actually ends the session.
    }
    setSession(null)
    setUser(null)
  }, [])

  const value = useMemo(() => {
    const role = user?.role ?? null
    return {
      user,
      role,
      initialising,
      isAuthenticated: Boolean(user),
      signIn,
      signOut,
      setUser,

      // Capability checks, named for what they permit rather than for a role,
      // so a future role change touches this file only.
      //
      // The console is two products sharing a shell. An administrator runs the
      // system — models, health, configuration, and whether the pipeline is
      // screening at all — and deliberately does not see case data: on a real
      // deployment that is the client's IT department, and financial-crime
      // cases are not theirs to read. Everyone else works the cases and can
      // watch the pipeline but not touch its controls.
      isAdmin: role === ROLES.ADMIN,
      canConfigureSystem: role === ROLES.ADMIN,
      canManageUsers: role === ROLES.ADMIN,
      canViewAuditLog: role === ROLES.ADMIN,
      canManageAlerts: role === ROLES.ADMIN || role === ROLES.RISK_MANAGER,

      // Starting, pausing and stopping fraud screening. Mirrored by
      // require_admin on the monitor routes — the button being hidden is a
      // courtesy, the server guard is the control.
      canControlPipeline: role === ROLES.ADMIN,

      // Case data and the tools that work it.
      canViewCases: role === ROLES.RISK_MANAGER || role === ROLES.ANALYST,
      // An analyst reads; a risk manager decides. Confirming fraud, dismissing
      // a case and submitting batches all change the record.
      canDecideCases: role === ROLES.RISK_MANAGER,
      canRunAnalysis: role === ROLES.RISK_MANAGER || role === ROLES.ANALYST,
    }
  }, [user, initialising, signIn, signOut])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
