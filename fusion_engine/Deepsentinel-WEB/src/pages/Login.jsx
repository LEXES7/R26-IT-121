import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Alert, Button, Field, Input } from '../components/ui'
import AuthLayout from '../components/AuthLayout'

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
    <AuthLayout
      title="Sign in"
      subtitle="Access the analyzer, batch runs and the operator assistant."
      footer={
        <>
          No account?{' '}
          <Link to="/signup" className="font-medium text-accent-500 hover:text-accent-400">
            Request access
          </Link>
          {' · '}
          <Link to="/" className="hover:text-slate-300">
            Back to overview
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error && (
          <Alert tone="danger" onDismiss={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Field label="Username" htmlFor="username">
          <Input
            id="username"
            name="username"
            autoComplete="username"
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="analyst"
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
          />
        </Field>

        <Button type="submit" loading={loading} className="w-full" size="lg">
          {loading ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthLayout>
  )
}
