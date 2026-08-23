import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { changePassword } from '../services/api'
import { ROLE_DESCRIPTIONS, ROLE_LABELS, useAuth } from '../context/AuthContext'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  PageHeader,
} from '../components/ui'

const ROLE_TONE = { admin: 'admin', risk_manager: 'manager', analyst: 'analyst' }
const MIN_PASSWORD = 8

export default function Account() {
  const auth = useAuth()
  const navigate = useNavigate()

  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState({})
  const [feedback, setFeedback] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const validate = () => {
    const e = {}
    if (!current) e.current = 'Required'
    if (next.length < MIN_PASSWORD) e.next = `At least ${MIN_PASSWORD} characters`
    else if (next === current) e.next = 'Must differ from the current password'
    if (confirm !== next) e.confirm = 'Passwords do not match'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!validate()) return

    setSubmitting(true)
    setFeedback(null)
    try {
      await changePassword(current, next)
      setFeedback({
        tone: 'success',
        message: 'Password changed. You will be signed out in a moment.',
      })
      setCurrent('')
      setNext('')
      setConfirm('')
      // The change invalidates outstanding tokens server-side, so this session
      // is already dead. Sign out cleanly rather than letting the next request
      // fail with a confusing 401.
      setTimeout(async () => {
        await auth.signOut()
        navigate('/login', { replace: true })
      }, 1800)
    } catch (err) {
      setFeedback({ tone: 'error', message: err.userMessage ?? 'Could not change the password.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10 sm:px-6">
      <PageHeader title="Account" description="Your profile and sign-in credentials." />

      <Card className="p-6">
        <CardHeader title="Profile" />
        <dl className="mt-5 space-y-4">
          {[
            ['Full name', auth.user?.full_name],
            ['Username', auth.user?.username],
            ['Email', auth.user?.email],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 border-b border-subtle pb-3">
              <dt className="text-sm text-slate-500">{label}</dt>
              <dd className="truncate text-sm text-white">{value}</dd>
            </div>
          ))}
          <div className="flex items-start justify-between gap-4">
            <dt className="text-sm text-slate-500">Role</dt>
            <dd className="text-right">
              <Badge tone={ROLE_TONE[auth.role]}>{ROLE_LABELS[auth.role] ?? auth.role}</Badge>
              <p className="mt-1.5 max-w-xs text-xs text-slate-600">
                {ROLE_DESCRIPTIONS[auth.role]}
              </p>
            </dd>
          </div>
        </dl>
        <p className="mt-5 text-xs text-slate-600">
          Contact an administrator to change your name, email, or role.
        </p>
      </Card>

      <Card className="p-6">
        <CardHeader
          title="Change password"
          description="Signs out every device currently using this account."
        />

        {feedback && (
          <Alert tone={feedback.tone} className="mt-5" onDismiss={() => setFeedback(null)}>
            {feedback.message}
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <Field label="Current password" error={errors.current} htmlFor="current">
            <Input
              id="current"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => {
                setCurrent(e.target.value)
                setErrors((x) => ({ ...x, current: undefined }))
              }}
              error={errors.current}
            />
          </Field>

          <Field
            label="New password"
            error={errors.next}
            hint={`At least ${MIN_PASSWORD} characters`}
            htmlFor="next"
          >
            <Input
              id="next"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => {
                setNext(e.target.value)
                setErrors((x) => ({ ...x, next: undefined }))
              }}
              error={errors.next}
            />
          </Field>

          <Field label="Confirm new password" error={errors.confirm} htmlFor="confirm">
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => {
                setConfirm(e.target.value)
                setErrors((x) => ({ ...x, confirm: undefined }))
              }}
              error={errors.confirm}
            />
          </Field>

          <Button type="submit" loading={submitting}>
            Change password
          </Button>
        </form>
      </Card>
    </div>
  )
}
