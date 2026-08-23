import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchAuditLog } from '../services/api'
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  Select,
  Skeleton,
  cx,
} from '../components/ui'

const OUTCOME_TONE = {
  success: 'low',
  failure: 'high',
  blocked: 'critical',
  denied: 'critical',
}

// Grouped so the filter reads as intent rather than as a list of raw strings.
const ACTION_GROUPS = {
  'Sign-in activity': ['auth.login', 'auth.logout'],
  'Credential changes': ['auth.password_change'],
  'User administration': ['user.create', 'user.delete', 'user.enable', 'user.disable'],
  'Configuration': ['settings.update', 'risk_manager.add', 'risk_manager.remove'],
  'Access denials': ['authz.denied'],
}

export default function AuditLog() {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [limit, setLimit] = useState(100)
  const [group, setGroup] = useState('all')
  const [outcome, setOutcome] = useState('all')
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setEntries(await fetchAuditLog(limit))
    } catch (err) {
      setError(err.userMessage ?? 'Could not load the audit log.')
    } finally {
      setLoading(false)
    }
  }, [limit])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    const actions = group === 'all' ? null : new Set(ACTION_GROUPS[group] ?? [])
    const needle = search.trim().toLowerCase()

    return entries.filter((e) => {
      if (actions && !actions.has(e.action)) return false
      if (outcome !== 'all' && e.outcome !== outcome) return false
      if (needle) {
        const haystack = [e.actor, e.action, e.target, e.detail, e.client_ip]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(needle)) return false
      }
      return true
    })
  }, [entries, group, outcome, search])

  const failureCount = useMemo(
    () => entries.filter((e) => e.outcome !== 'success').length,
    [entries],
  )

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-10 sm:px-6">
      <PageHeader
        title="Audit log"
        description="Append-only record of security-relevant activity. Entries are never modified or removed."
        action={
          <Button variant="secondary" onClick={load} loading={loading}>
            Refresh
          </Button>
        }
      />

      {error && <Alert tone="error" onDismiss={() => setError(null)}>{error}</Alert>}

      {failureCount > 0 && (
        <Alert tone="warning" title={`${failureCount} non-successful event(s) in this window`}>
          Failed sign-ins, blocked accounts and denied access attempts. Filter by
          outcome to review them.
        </Alert>
      )}

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            placeholder="Search actor, target, detail…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search audit entries"
          />
          <Select value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Filter by activity">
            <option value="all">All activity</option>
            {Object.keys(ACTION_GROUPS).map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </Select>
          <Select value={outcome} onChange={(e) => setOutcome(e.target.value)} aria-label="Filter by outcome">
            <option value="all">All outcomes</option>
            <option value="success">Success</option>
            <option value="failure">Failure</option>
            <option value="blocked">Blocked</option>
            <option value="denied">Denied</option>
          </Select>
          <Select value={limit} onChange={(e) => setLimit(Number(e.target.value))} aria-label="Number of entries">
            <option value={50}>Last 50</option>
            <option value={100}>Last 100</option>
            <option value={250}>Last 250</option>
            <option value={500}>Last 500</option>
          </Select>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="space-y-2 p-6">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="🗒"
            title={entries.length === 0 ? 'No activity recorded yet' : 'Nothing matches these filters'}
            description={
              entries.length === 0
                ? 'Events appear here as people sign in and change configuration.'
                : 'Try widening the search or clearing a filter.'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-subtle text-left">
                  {['Time', 'Actor', 'Action', 'Target', 'Outcome', 'Source'].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {filtered.map((e, i) => (
                  <tr key={i} className="transition-colors hover:bg-surface">
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                      {new Date(e.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-slate-300">{e.actor ?? '—'}</td>
                    <td className="px-4 py-3">
                      <code className="rounded bg-surface-overlay px-1.5 py-0.5 font-mono text-xs text-slate-400">
                        {e.action}
                      </code>
                      {e.detail && (
                        <p className="mt-1 max-w-xs truncate text-[11px] text-slate-600" title={e.detail}>
                          {e.detail}
                        </p>
                      )}
                    </td>
                    <td className="max-w-[12rem] truncate px-4 py-3 text-slate-400" title={e.target ?? ''}>
                      {e.target ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={OUTCOME_TONE[e.outcome] ?? 'neutral'}>{e.outcome}</Badge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-600">
                      {e.client_ip ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {!loading && filtered.length > 0 && (
        <p className={cx('text-center text-xs text-slate-600')}>
          Showing {filtered.length} of {entries.length} loaded entries.
        </p>
      )}
    </div>
  )
}
