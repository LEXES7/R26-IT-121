import { useState, useEffect } from 'react'
import { getSettings, addRiskManager, removeRiskManager, sendTestEmail } from '../services/api'

export default function Settings() {
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [newManager, setNewManager] = useState({ name: '', email: '', role: 'Risk Manager' })
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState(null)
  const [testEmailLoading, setTestEmailLoading] = useState({})

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      setLoading(true)
      const data = await getSettings()
      setSettings(data)
    } catch (e) {
      setMessage({ type: 'error', text: 'Failed to load settings' })
    } finally {
      setLoading(false)
    }
  }

  const handleAddManager = async (e) => {
    e.preventDefault()
    if (!newManager.name || !newManager.email) {
      setMessage({ type: 'error', text: 'Name and email are required' })
      return
    }

    try {
      setSubmitting(true)
      await addRiskManager(newManager.name, newManager.email, newManager.role)
      setMessage({ type: 'success', text: `Added ${newManager.name}` })
      setNewManager({ name: '', email: '', role: 'Risk Manager' })
      loadSettings()
    } catch (e) {
      setMessage({ type: 'error', text: e.response?.data?.detail || 'Failed to add risk manager' })
    } finally {
      setSubmitting(false)
    }
  }

  const handleRemoveManager = async (email) => {
    if (!confirm(`Remove ${email}?`)) return
    try {
      await removeRiskManager(email)
      setMessage({ type: 'success', text: 'Risk manager removed' })
      loadSettings()
    } catch (e) {
      setMessage({ type: 'error', text: 'Failed to remove risk manager' })
    }
  }

  const handleSendTestEmail = async (email) => {
    try {
      setTestEmailLoading(prev => ({ ...prev, [email]: true }))
      await sendTestEmail({ name: 'Test', email })
      setMessage({ type: 'success', text: `Test email sent to ${email}` })
    } catch (e) {
      setMessage({ type: 'error', text: `Failed to send test email: ${e.response?.data?.detail || e.message}` })
    } finally {
      setTestEmailLoading(prev => ({ ...prev, [email]: false }))
    }
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-10">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 bg-white/5 rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-bold text-white">Settings</h1>
        <p className="text-slate-500 text-sm">Manage risk managers and fraud alert configuration</p>
      </div>

      {/* Messages */}
      {message && (
        <div className={`px-4 py-3 rounded-lg border text-sm ${
          message.type === 'success'
            ? 'bg-green-500/10 border-green-500/20 text-green-400'
            : 'bg-red-500/10 border-red-500/20 text-red-400'
        }`}>
          {message.text}
        </div>
      )}

      {/* Risk Managers Section */}
      <div className="rounded-2xl border border-white/[0.07] p-6" style={{ background: 'rgba(255,255,255,0.02)' }}>
        <h2 className="text-lg font-bold text-white mb-6">Risk Managers</h2>

        {/* Add New */}
        <form onSubmit={handleAddManager} className="mb-8 p-5 rounded-xl border border-white/[0.07] bg-white/[0.01]">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">Add New Risk Manager</p>
          <div className="grid sm:grid-cols-3 gap-4 mb-4">
            <input
              type="text"
              placeholder="Name"
              value={newManager.name}
              onChange={e => setNewManager({ ...newManager, name: e.target.value })}
              className="px-4 py-2 rounded-lg bg-white/[0.05] border border-white/[0.10] text-white text-sm placeholder-slate-600"
            />
            <input
              type="email"
              placeholder="Email"
              value={newManager.email}
              onChange={e => setNewManager({ ...newManager, email: e.target.value })}
              className="px-4 py-2 rounded-lg bg-white/[0.05] border border-white/[0.10] text-white text-sm placeholder-slate-600"
            />
            <select
              value={newManager.role}
              onChange={e => setNewManager({ ...newManager, role: e.target.value })}
              className="px-4 py-2 rounded-lg bg-white/[0.05] border border-white/[0.10] text-white text-sm"
            >
              <option value="Risk Manager">Risk Manager</option>
              <option value="Analyst">Analyst</option>
              <option value="Admin">Admin</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? 'Adding...' : 'Add Manager'}
          </button>
        </form>

        {/* List */}
        {settings?.risk_managers?.length === 0 ? (
          <p className="text-slate-600 text-sm py-8 text-center">No risk managers configured. Add one above.</p>
        ) : (
          <div className="space-y-3">
            {settings?.risk_managers?.map(manager => (
              <div
                key={manager.email}
                className="flex items-center justify-between gap-4 p-4 rounded-lg border border-white/[0.07] bg-white/[0.01]"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-white truncate">{manager.name}</p>
                  <p className="text-xs text-slate-500">
                    {manager.email} • {manager.role}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleSendTestEmail(manager.email)}
                    disabled={testEmailLoading[manager.email]}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-600/20 text-purple-300 hover:bg-purple-600/30 border border-purple-500/20 disabled:opacity-50"
                  >
                    {testEmailLoading[manager.email] ? '📧 Sending...' : '📧 Test'}
                  </button>
                  <button
                    onClick={() => handleRemoveManager(manager.email)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600/20 text-red-300 hover:bg-red-600/30 border border-red-500/20"
                  >
                    ✕ Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Alert Settings */}
      <div className="rounded-2xl border border-white/[0.07] p-6" style={{ background: 'rgba(255,255,255,0.02)' }}>
        <h2 className="text-lg font-bold text-white mb-6">Alert Settings</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-lg border border-white/[0.07] bg-white/[0.01]">
            <label className="text-sm text-white">
              <p className="font-medium">Critical Risk Alerts</p>
              <p className="text-xs text-slate-600 mt-1">Send alerts for CRITICAL risk transactions</p>
            </label>
            <input
              type="checkbox"
              defaultChecked={settings?.alert_settings?.include_critical_risk}
              className="w-5 h-5"
            />
          </div>
          <div className="flex items-center justify-between p-4 rounded-lg border border-white/[0.07] bg-white/[0.01]">
            <label className="text-sm text-white">
              <p className="font-medium">High Risk Alerts</p>
              <p className="text-xs text-slate-600 mt-1">Send alerts for HIGH risk transactions</p>
            </label>
            <input
              type="checkbox"
              defaultChecked={settings?.alert_settings?.include_high_risk}
              className="w-5 h-5"
            />
          </div>
          <div className="flex items-center justify-between p-4 rounded-lg border border-white/[0.07] bg-white/[0.01]">
            <label className="text-sm text-white">
              <p className="font-medium">Medium Risk Alerts</p>
              <p className="text-xs text-slate-600 mt-1">Send alerts for MEDIUM risk transactions</p>
            </label>
            <input
              type="checkbox"
              defaultChecked={settings?.alert_settings?.include_medium_risk}
              className="w-5 h-5"
            />
          </div>
        </div>
      </div>

      {/* Email Template Preview */}
      <div className="rounded-2xl border border-white/[0.07] p-6" style={{ background: 'rgba(255,255,255,0.02)' }}>
        <h2 className="text-lg font-bold text-white mb-4">Email Template</h2>
        <p className="text-sm text-slate-500 mb-4">Preview how fraud alerts will look in email:</p>
        <button
          onClick={() => window.open('/email-template/preview?classification=HIGH', '_blank')}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
        >
          👁️ Preview Email Template
        </button>
      </div>
    </div>
  )
}
