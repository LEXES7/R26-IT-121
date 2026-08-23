import { useEffect, useState } from 'react'
import { getAssistantSettings, updateAssistantSettings } from '../services/api'
import { Alert, Card, CardHeader, Skeleton, Toggle } from './ui'

/**
 * Licensing controls for the operator assistant (Professional package).
 *
 * Admin-only, and rendered only for admins — the endpoints are guarded
 * server-side regardless. Two independent switches: a master enable for the
 * deployment, and which seat types the licence covers.
 */

const ROLES = [
  { key: 'admin', label: 'Administrators' },
  { key: 'risk_manager', label: 'Risk managers', hint: 'Professional package' },
  { key: 'analyst', label: 'Analysts', hint: 'Base package — off by default' },
]

export default function AssistantSettings() {
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(null)

  useEffect(() => {
    getAssistantSettings()
      .then(setSettings)
      .catch(() => setError('Could not load assistant settings.'))
      .finally(() => setLoading(false))
  }, [])

  async function patch(changes, key) {
    setSaving(key)
    setError(null)
    const previous = settings
    setSettings((s) => ({ ...s, ...changes })) // optimistic
    try {
      setSettings(await updateAssistantSettings(changes))
    } catch {
      setSettings(previous) // roll back rather than show a lie
      setError('Could not save that change.')
    } finally {
      setSaving(null)
    }
  }

  if (loading) return <Card><Skeleton className="h-24 w-full" /></Card>

  return (
    <Card>
      <CardHeader
        title="AI assistant"
        description="Tool-using assistant with access to live transaction data. Professional package."
      />

      {error && <Alert tone="error" className="mb-4">{error}</Alert>}

      <div className="space-y-4">
        <Toggle
          checked={Boolean(settings?.enabled)}
          onChange={(v) => patch({ enabled: v }, 'enabled')}
          disabled={saving === 'enabled'}
          label="Enable for this deployment"
          description="Master switch. When off, nobody can use the assistant regardless of package."
        />

        <div className={settings?.enabled ? '' : 'pointer-events-none opacity-50'}>
          <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">
            Included seat types
          </p>
          <div className="space-y-3">
            {ROLES.map((r) => {
              const on = settings?.allowed_roles?.includes(r.key)
              return (
                <Toggle
                  key={r.key}
                  checked={Boolean(on)}
                  disabled={saving === r.key}
                  onChange={(v) =>
                    patch(
                      {
                        allowed_roles: v
                          ? [...(settings.allowed_roles || []), r.key]
                          : (settings.allowed_roles || []).filter((x) => x !== r.key),
                      },
                      r.key,
                    )
                  }
                  label={r.label}
                  description={r.hint}
                />
              )
            })}
          </div>

          <div className="mt-4 border-t border-subtle pt-4">
            <Toggle
              checked={Boolean(settings?.allow_live_analysis)}
              disabled={saving === 'live'}
              onChange={(v) => patch({ allow_live_analysis: v }, 'live')}
              label="Allow live model calls"
              description="Lets the assistant score transactions and fetch fraud rings, which consumes upstream model calls. Turn off to restrict it to history and documentation."
            />
          </div>
        </div>
      </div>
    </Card>
  )
}
