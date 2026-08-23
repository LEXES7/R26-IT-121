import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createUser,
  deleteUser,
  listUsers,
  setUserEnabled,
} from '../services/api'
import { ROLE_DESCRIPTIONS, ROLE_LABELS, ROLES, useAuth } from '../context/AuthContext'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  Skeleton,
  cx,
} from '../components/ui'

const ROLE_TONE = {
  [ROLES.ADMIN]: 'admin',
  [ROLES.RISK_MANAGER]: 'manager',
  [ROLES.ANALYST]: 'analyst',
}

const MIN_PASSWORD = 8

const EMPTY_FORM = {
  username: '',
  email: '',
  full_name: '',
  password: '',
  role: ROLES.ANALYST,
}

export default function Users() {
  const auth = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [feedback, setFeedback] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [busy, setBusy] = useState({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setUsers(await listUsers())
    } catch (err) {
      setFeedback({ tone: 'error', message: err.userMessage ?? 'Could not load users.' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const adminCount = useMemo(
    () => users.filter((u) => u.role === ROLES.ADMIN && u.enabled).length,
    [users],
  )

  const validate = () => {
    const next = {}
    if (form.username.trim().length < 3) next.username = 'At least 3 characters'
    else if (!/^[\w.-]+$/.test(form.username.trim()))
      next.username = 'Letters, digits, and . _ - only'
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim()))
      next.email = 'Enter a valid email address'
    if (!form.full_name.trim()) next.full_name = 'Required'
    if (form.password.length < MIN_PASSWORD)
      next.password = `At least ${MIN_PASSWORD} characters`
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!validate()) return

    setSubmitting(true)
    try {
      await createUser({
        username: form.username.trim(),
        email: form.email.trim(),
        full_name: form.full_name.trim(),
        password: form.password,
        role: form.role,
      })
      setFeedback({ tone: 'success', message: `Created ${form.username.trim()}.` })
      setForm(EMPTY_FORM)
      setErrors({})
      setShowForm(false)
      await load()
    } catch (err) {
      setFeedback({ tone: 'error', message: err.userMessage ?? 'Could not create the user.' })
    } finally {
      setSubmitting(false)
    }
  }

  const withBusy = async (username, fn) => {
    setBusy((b) => ({ ...b, [username]: true }))
    try {
      await fn()
      await load()
    } catch (err) {
      setFeedback({ tone: 'error', message: err.userMessage ?? 'That action failed.' })
    } finally {
      setBusy((b) => ({ ...b, [username]: false }))
    }
  }

  const handleToggle = (user) =>
    withBusy(user.username, async () => {
      await setUserEnabled(user.username, !user.enabled)
      setFeedback({
        tone: 'success',
        message: `${user.username} ${user.enabled ? 'disabled' : 'enabled'}.`,
      })
    })

  const handleDelete = (user) => {
    if (
      !window.confirm(
        `Delete ${user.username}? They will lose access immediately. This cannot be undone.`,
      )
    )
      return
    return withBusy(user.username, async () => {
      await deleteUser(user.username)
      setFeedback({ tone: 'success', message: `Deleted ${user.username}.` })
    })
  }

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }))
    if (errors[key]) setErrors((x) => ({ ...x, [key]: undefined }))
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-10 sm:px-6">
      <PageHeader
        title="Users"
        description="Who can sign in, and what each of them is allowed to do."
        action={
          <Button onClick={() => setShowForm((v) => !v)} variant={showForm ? 'secondary' : 'primary'}>
            {showForm ? 'Cancel' : '+ Add user'}
          </Button>
        }
      />

      {feedback && (
        <Alert tone={feedback.tone} onDismiss={() => setFeedback(null)}>
          {feedback.message}
        </Alert>
      )}

      {showForm && (
        <Card className="animate-slide-up p-6">
          <CardHeader
            title="Add a user"
            description="They can change this password after their first sign-in."
          />
          <form onSubmit={handleCreate} className="mt-5 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name" error={errors.full_name} htmlFor="full_name">
                <Input
                  id="full_name"
                  value={form.full_name}
                  onChange={set('full_name')}
                  placeholder="Jane Perera"
                  error={errors.full_name}
                />
              </Field>
              <Field label="Username" error={errors.username} htmlFor="username">
                <Input
                  id="username"
                  value={form.username}
                  onChange={set('username')}
                  placeholder="j.perera"
                  autoComplete="off"
                  error={errors.username}
                />
              </Field>
              <Field label="Email" error={errors.email} htmlFor="email">
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={set('email')}
                  placeholder="jane@bank.com"
                  error={errors.email}
                />
              </Field>
              <Field
                label="Temporary password"
                error={errors.password}
                hint={`Minimum ${MIN_PASSWORD} characters`}
                htmlFor="password"
              >
                <Input
                  id="password"
                  type="password"
                  value={form.password}
                  onChange={set('password')}
                  autoComplete="new-password"
                  error={errors.password}
                />
              </Field>
            </div>

            <Field label="Role" htmlFor="role" hint={ROLE_DESCRIPTIONS[form.role]}>
              <Select id="role" value={form.role} onChange={set('role')}>
                {Object.values(ROLES).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="flex gap-2 pt-1">
              <Button type="submit" loading={submitting}>
                Create user
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card className="overflow-hidden">
        {loading ? (
          <div className="space-y-3 p-6">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : users.length === 0 ? (
          <EmptyState icon="👤" title="No users yet" description="Add the first account above." />
        ) : (
          <div className="divide-y divide-white/[0.05]">
            {users.map((u) => {
              const isSelf = u.username === auth.user?.username
              const isLastAdmin = u.role === ROLES.ADMIN && u.enabled && adminCount <= 1

              return (
                <div
                  key={u.username}
                  className={cx(
                    'flex flex-wrap items-center gap-4 p-4 transition-colors hover:bg-surface',
                    !u.enabled && 'opacity-60',
                  )}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-600 to-slate-700 text-xs font-semibold text-white">
                    {(u.full_name || u.username)
                      .split(' ')
                      .map((p) => p[0])
                      .slice(0, 2)
                      .join('')
                      .toUpperCase()}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium text-white">{u.full_name}</p>
                      {isSelf && <Badge>You</Badge>}
                      {!u.enabled && <Badge tone="critical">Disabled</Badge>}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {u.username} · {u.email}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-600">
                      {u.last_login
                        ? `Last signed in ${new Date(u.last_login).toLocaleString()}`
                        : 'Never signed in'}
                    </p>
                  </div>

                  <Badge tone={ROLE_TONE[u.role]}>{ROLE_LABELS[u.role] ?? u.role}</Badge>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={busy[u.username]}
                      onClick={() => handleToggle(u)}
                      disabled={isSelf || (isLastAdmin && u.enabled)}
                      title={
                        isSelf
                          ? 'You cannot disable your own account'
                          : isLastAdmin && u.enabled
                            ? 'This is the last active administrator'
                            : undefined
                      }
                    >
                      {u.enabled ? 'Disable' : 'Enable'}
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      loading={busy[u.username]}
                      onClick={() => handleDelete(u)}
                      disabled={isSelf || isLastAdmin}
                      title={
                        isSelf
                          ? 'You cannot delete your own account'
                          : isLastAdmin
                            ? 'The last administrator cannot be deleted'
                            : undefined
                      }
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      <Card className="p-6">
        <CardHeader title="What each role can do" />
        <div className="mt-4 space-y-3">
          {Object.values(ROLES).map((r) => (
            <div key={r} className="flex items-start gap-3">
              <Badge tone={ROLE_TONE[r]} className="mt-0.5 shrink-0">
                {ROLE_LABELS[r]}
              </Badge>
              <p className="text-sm text-slate-500">{ROLE_DESCRIPTIONS[r]}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
