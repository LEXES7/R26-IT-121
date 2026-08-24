import { useCallback, useEffect, useState } from 'react'
import {
  addRiskManager,
  emailTemplateUrl,
  getSettings,
  removeRiskManager,
  sendTestEmail,
  updateAlertSettings,
} from '../services/api'
import { useAuth } from '../context/AuthContext'
import AssistantSettings from '../components/AssistantSettings'
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
  Toggle,
} from '../components/ui'

const RISK_LEVELS = [
  {
    key: 'include_critical_risk',
    label: 'Critical risk',
    tone: 'critical',
    description: 'Highest confidence detections. Almost always worth interrupting someone.',
  },
  {
    key: 'include_high_risk',
    label: 'High risk',
    tone: 'high',
    description: 'Strong multi-modal signal. Recommended for immediate review.',
  },
  {
    key: 'include_medium_risk',
    label: 'Medium risk',
    tone: 'medium',
    description: 'Worth reviewing, but expect a higher false-positive rate.',
  },
  {
    key: 'include_low_risk',
    label: 'Low risk',
    tone: 'low',
    description: 'Very noisy. Enable only while tuning thresholds.',
  },
]

const EMPTY_MANAGER = { name: '', email: '', role: 'Risk Manager' }

export default function Settings() {
  const auth = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [feedback, setFeedback] = useState(null)
  const [form, setForm] = useState(EMPTY_MANAGER)
  const [errors, setErrors] = useState({})
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState({})
  const [savingAlerts, setSavingAlerts] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await getSettings())
    } catch (err) {
      setFeedback({ tone: 'error', message: err.userMessage ?? 'Could not load settings.' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleAdd = async (e) => {
    e.preventDefault()
    const next = {}
    if (!form.name.trim()) next.name = 'Required'
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim()))
      next.email = 'Enter a valid email address'
    setErrors(next)
    if (Object.keys(next).length) return

    setAdding(true)
    try {
      await addRiskManager(form.name.trim(), form.email.trim(), form.role)
      setFeedback({ tone: 'success', message: `${form.email.trim()} will now receive alerts.` })
      setForm(EMPTY_MANAGER)
      await load()
    } catch (err) {
      setFeedback({ tone: 'error', message: err.userMessage ?? 'Could not add the recipient.' })
    } finally {
      setAdding(false)
    }
  }

  const withBusy = async (key, fn) => {
    setBusy((b) => ({ ...b, [key]: true }))
    try {
      await fn()
    } catch (err) {
      setFeedback({ tone: 'error', message: err.userMessage ?? 'That action failed.' })
    } finally {
      setBusy((b) => ({ ...b, [key]: false }))
    }
  }

  const handleRemove = (email) => {
    if (!window.confirm(`Stop sending fraud alerts to ${email}?`)) return
    return withBusy(email, async () => {
      await removeRiskManager(email)
      setFeedback({ tone: 'success', message: `Removed ${email}.` })
      await load()
    })
  }

  const handleTest = (manager) =>
    withBusy(`test:${manager.email}`, async () => {
      await sendTestEmail(manager.name, manager.email)
      setFeedback({
        tone: 'success',
        message: `Test alert sent to ${manager.email}. Check the spam folder if it does not arrive.`,
      })
    })

  const handleToggleLevel = async (key, value) => {
    // Optimistic: the switch responds immediately, and reverts if the save fails.
    const previous = data.alert_settings
    setData((d) => ({ ...d, alert_settings: { ...d.alert_settings, [key]: value } }))
    setSavingAlerts(true)
    try {
      await updateAlertSettings({ [key]: value })
    } catch (err) {
      setData((d) => ({ ...d, alert_settings: previous }))
      setFeedback({ tone: 'error', message: err.userMessage ?? 'Could not save that change.' })
    } finally {
      setSavingAlerts(false)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-10 sm:px-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64" />
        <Skeleton className="h-80" />
      </div>
    )
  }

  const managers = data?.risk_managers ?? []
  const alerts = data?.alert_settings ?? {}
  const activeCount = managers.filter((m) => m.enabled).length

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10 sm:px-6">
      <PageHeader
        title="Settings"
        description="Who is notified when fraud is detected, and at what threshold."
      />

      {feedback && (
        <Alert tone={feedback.tone} onDismiss={() => setFeedback(null)}>
          {feedback.message}
        </Alert>
      )}

      {managers.length > 0 && activeCount === 0 && (
        <Alert tone="warning" title="No active recipients">
          Fraud alerts are being generated but nobody will receive them.
        </Alert>
      )}

      <Card className="p-6">
        <CardHeader
          title="Alert recipients"
          description="These addresses receive an email whenever a transaction meets the threshold below."
          action={<Badge>{activeCount} active</Badge>}
        />

        <form onSubmit={handleAdd} className="mt-5 rounded-xl border border-subtle bg-surface p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Name" error={errors.name}>
              <Input
                value={form.name}
                onChange={(e) => {
                  setForm((f) => ({ ...f, name: e.target.value }))
                  setErrors((x) => ({ ...x, name: undefined }))
                }}
                placeholder="Jane Perera"
                error={errors.name}
              />
            </Field>
            <Field label="Email" error={errors.email}>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => {
                  setForm((f) => ({ ...f, email: e.target.value }))
                  setErrors((x) => ({ ...x, email: undefined }))
                }}
                placeholder="jane@bank.com"
                error={errors.email}
              />
            </Field>
            <Field label="Role">
              <Select
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              >
                <option>Risk Manager</option>
                <option>Compliance Officer</option>
                <option>Fraud Analyst</option>
                <option>Operations</option>
              </Select>
            </Field>
          </div>
          <Button type="submit" loading={adding} size="sm" className="mt-4">
            Add recipient
          </Button>
        </form>

        <div className="mt-4">
          {managers.length === 0 ? (
            <EmptyState
              icon="📭"
              title="No recipients yet"
              description="Add someone above so detected fraud reaches a person."
            />
          ) : (
            <div className="space-y-2">
              {managers.map((m) => (
                <div
                  key={m.email}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-subtle bg-surface p-3.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-200">{m.name}</p>
                    <p className="truncate text-xs text-slate-500">
                      {m.email} · {m.role}
                    </p>
                  </div>
                  {!m.enabled && <Badge tone="critical">Paused</Badge>}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={busy[`test:${m.email}`]}
                      onClick={() => handleTest(m)}
                    >
                      Send test
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      loading={busy[m.email]}
                      onClick={() => handleRemove(m.email)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Card className="p-6">
        <CardHeader
          title="Alert threshold"
          description="Which risk classifications trigger an email."
          action={savingAlerts ? <Badge>Saving…</Badge> : null}
        />
        <div className="mt-5 space-y-3">
          {RISK_LEVELS.map((level) => (
            <Toggle
              key={level.key}
              checked={Boolean(alerts[level.key])}
              onChange={(v) => handleToggleLevel(level.key, v)}
              label={level.label}
              description={level.description}
            />
          ))}
        </div>
      </Card>

      <Card className="p-6">
        <CardHeader
          title="Email template"
          description="What a recipient sees when an alert fires."
        />
        <div className="mt-4 flex flex-wrap gap-2">
          {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((c) => (
            <Button
              key={c}
              variant="secondary"
              size="sm"
              onClick={() => window.open(emailTemplateUrl(c), '_blank', 'noopener')}
            >
              Preview {c.toLowerCase()}
            </Button>
          ))}
        </div>
      </Card>

      {auth.canConfigureSystem && <AssistantSettings />}

      {!auth.canConfigureSystem && (
        <Alert tone="info">
          Some system configuration is restricted to administrators and is not shown here.
        </Alert>
      )}
    </div>
  )
}
