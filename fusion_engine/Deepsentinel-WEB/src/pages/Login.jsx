import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Alert, Button, Card, Field, Input } from '../components/ui'

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const { signIn } = useAuth()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!username.trim() || !password) {
      setError('Enter both a username and a password.')
      return
    }

    setLoading(true)
    setError(null)
    try {
      await signIn(username.trim(), password)
      // Return the user to wherever they were headed before being redirected.
      navigate(location.state?.from ?? '/', { replace: true })
    } catch (err) {
      setError(err.userMessage ?? 'Sign-in failed.')
      setPassword('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="mb-8 text-center">
          <div className="mb-4 flex items-center justify-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 text-lg font-bold text-white shadow-lg shadow-blue-500/30">
              DS
            </div>
            <span className="text-2xl font-bold text-white">
              Deep<span className="text-blue-400">Sentinel</span>
            </span>
          </div>
          <p className="text-sm text-slate-500">Multi-modal AI fraud detection</p>
        </div>

        <Card className="p-7">
          <h1 className="text-lg font-semibold text-white">Sign in</h1>
          <p className="mt-1 text-sm text-slate-500">
            Use the credentials issued by your administrator.
          </p>

          {error && (
            <Alert tone="error" className="mt-5" onDismiss={() => setError(null)}>
              {error}
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <Field label="Username" htmlFor="username">
              <Input
                id="username"
                name="username"
                autoComplete="username"
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="your.username"
                error={Boolean(error)}
              />
            </Field>

            <Field label="Password" htmlFor="password">
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                error={Boolean(error)}
              />
            </Field>

            <Button type="submit" loading={loading} className="w-full" size="lg">
              {loading ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </Card>

        <p className="mt-6 text-center text-[11px] leading-relaxed text-slate-700">
          Accounts are created by an administrator.
          <br />
          Repeated failed attempts will temporarily lock the account.
        </p>
      </div>
    </div>
  )
}
