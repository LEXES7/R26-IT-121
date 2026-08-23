import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Card, Spinner } from './ui'

/**
 * Gates a route on authentication and, optionally, a capability.
 *
 * `capability` names a boolean from AuthContext (canManageUsers, …) rather
 * than a role, so permission changes happen in one place.
 *
 * An unauthenticated visitor is redirected to sign-in with their intended
 * destination preserved. An authenticated user who lacks the capability is
 * shown a refusal rather than redirected — silently bouncing them somewhere
 * else reads as a broken link.
 */
export default function ProtectedRoute({ capability, children }) {
  const auth = useAuth()
  const location = useLocation()

  if (auth.initialising) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex items-center gap-3 text-slate-500">
          <Spinner className="h-5 w-5" />
          <span className="text-sm">Restoring session…</span>
        </div>
      </div>
    )
  }

  if (!auth.isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }

  if (capability && !auth[capability]) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24">
        <Card className="p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-subtle bg-surface text-2xl">
            🔒
          </div>
          <h1 className="text-lg font-semibold text-white">Access restricted</h1>
          <p className="mt-2 text-sm text-slate-500">
            Your role does not have access to this page. Contact an administrator
            if you believe you should.
          </p>
        </Card>
      </div>
    )
  }

  return children
}
