import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  getMonitorRuntime, getMonitorState, listCases, startMonitor,
} from '../services/api'
import { useAuth } from '../context/AuthContext'
import { Badge, Button, Card, CardHeader, SectionLabel, cx } from '../components/ui'

/**
 * What an operator sees on signing in.
 *
 * The question this page answers is "is the system working, and does anything
 * need me" — in that order. Everything here is read from live endpoints; there
 * is no placeholder state, and a number that cannot be determined is shown as
 * unavailable rather than as zero. A dashboard that renders a confident zero
 * when it simply could not reach a service is worse than one that says so.
 */

// The platform is inconsistent about this word: the monitor's runtime keys the
// behavioural detector as "behavioural" (British) while the analyze response
// uses "behavioral_score" (American). Accept both rather than silently showing
// a running detector as offline — which is exactly what happened here first.
const MODELS = [
  { keys: ['graph'], label: 'Relational' },
  { keys: ['behavioural', 'behavioral'], label: 'Behavioural' },
  { keys: ['temporal'], label: 'Temporal' },
]

const pick = (obj, keys) => keys.map((k) => obj?.[k]).find((v) => v !== undefined)
const SEVERITY_TONE = { CRITICAL: 'critical', HIGH: 'high', MEDIUM: 'medium', LOW: 'low' }

const ago = (seconds) => {
  if (typeof seconds !== 'number') return null
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h ? `${h}h ${m}m` : `${m}m`
}

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [state, setState] = useState(null)
  const [runtime, setRuntime] = useState(null)
  const [open, setOpen] = useState(null)
  const [recent, setRecent] = useState([])
  const [starting, setStarting] = useState(false)

  const refresh = useCallback(async () => {
    // Settled, not all: one unreachable service must not blank the page.
    const [s, r, o, all] = await Promise.allSettled([
      getMonitorState(), getMonitorRuntime(),
      listCases({ review_status: 'open', limit: 100 }),
      listCases({ limit: 6 }),
    ])
    if (s.status === 'fulfilled') setState(s.value)
    if (r.status === 'fulfilled') setRuntime(r.value)
    if (o.status === 'fulfilled') setOpen(o.value.cases?.length ?? 0)
    if (all.status === 'fulfilled') setRecent(all.value.cases ?? [])
  }, [])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 5000)
    return () => clearInterval(t)
  }, [refresh])

  const counters = state?.counters ?? {}
  const queue = state?.queue ?? {}
  const running = state?.running
  const detectors = runtime?.detectors ?? {}
  const liveCount = Object.values(detectors).filter((d) => d?.reachable).length

  const bySeverity = recent.reduce((acc, c) => {
    acc[c.classification] = (acc[c.classification] || 0) + 1
    return acc
  }, {})

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-8 sm:px-6">
      {/* ── greeting + the one action that matters ── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-100">
            {user?.full_name?.split(' ')[0] || user?.username || 'Welcome'}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {running
              ? 'Monitoring is running.'
              : 'Monitoring is stopped — nothing is being screened.'}
          </p>
        </div>
        {!running && (
          <Button
            loading={starting}
            onClick={async () => {
              setStarting(true)
              try { await startMonitor() } catch { /* surfaced by refresh */ }
              finally { setStarting(false); refresh() }
            }}
          >
            Start monitoring
          </Button>
        )}
      </div>

      {/* ── the four numbers ── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          value={counters.screened ?? '—'}
          label="screened"
          sub={state?.source === 'queue'
            ? 'from the ingestion queue'
            : state?.source === 'sample'
              ? 'replaying samples — queue empty'
              : null}
          tone={state?.source === 'sample' ? 'warn' : undefined}
        />
        <Metric value={counters.escalated ?? '—'} label="escalated"
                sub="passed the watch threshold" />
        <Metric value={counters.alerts ?? '—'} label="alerts" accent
                sub="severity warranted a notification" />
        <Metric
          value={open ?? '—'}
          label="awaiting review"
          sub={open ? 'needs a decision' : 'nothing waiting'}
          onClick={() => navigate('/cases')}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        {/* ── recent cases ── */}
        <Card className="p-5">
          <CardHeader
            title="Latest cases"
            description="What the models have caught most recently."
            action={<Link to="/cases" className="text-xs font-medium text-accent-400 hover:text-accent-300">All cases →</Link>}
          />
          {recent.length === 0 ? (
            <div className="mt-5 rounded-xl border border-dashed border-subtle p-6 text-center">
              <p className="text-xs text-slate-500">
                No cases recorded yet.
                {!running && ' Start monitoring, or upload a file with the Query Runner.'}
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-1.5">
              {recent.map((c) => (
                <button
                  key={c.case_ref}
                  onClick={() => navigate(`/cases/${c.case_ref}`)}
                  className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-subtle bg-surface-raised px-3 py-2.5 text-left transition-colors hover:border-strong"
                >
                  <Badge tone={SEVERITY_TONE[c.classification] ?? 'low'}>
                    {c.classification}
                  </Badge>
                  <span className="font-mono text-sm text-slate-200">
                    {typeof c.fused_score === 'number' ? c.fused_score.toFixed(3) : '—'}
                  </span>
                  {c.graph_pattern && (
                    <span className="text-[11px] text-slate-400">{c.graph_pattern}</span>
                  )}
                  <span className="text-[11px] text-slate-600">
                    {c.modalities_used}/3
                  </span>
                  <span className="ml-auto font-mono text-[10px] text-slate-600">
                    {c.case_ref.slice(-4)}
                  </span>
                </button>
              ))}
            </div>
          )}

          {Object.keys(bySeverity).length > 0 && (
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-subtle pt-3">
              {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].filter((k) => bySeverity[k]).map((k) => (
                <span key={k} className="text-[11px] text-slate-500">
                  {k.toLowerCase()} <b className="text-slate-300">{bySeverity[k]}</b>
                </span>
              ))}
            </div>
          )}
        </Card>

        <div className="space-y-5">
          {/* ── detector health ── */}
          <Card className="p-5">
            <CardHeader
              title="Detectors"
              action={<Badge tone={liveCount === 3 ? 'low' : 'medium'}>{liveCount}/3</Badge>}
            />
            <div className="mt-4 space-y-2.5">
              {MODELS.map(({ keys, label }) => {
                const d = pick(detectors, keys)
                const up = Boolean(d?.reachable)
                return (
                  <div key={label} className="flex items-center gap-2.5">
                    <span className={cx('h-2 w-2 shrink-0 rounded-full',
                      up ? 'bg-risk-low' : 'bg-slate-600')} />
                    <span className="text-xs text-slate-300">{label}</span>
                    <span className="ml-auto text-[10px] text-slate-500">
                      {up ? (ago(d.service_uptime_seconds) ?? 'up') : 'not deployed'}
                    </span>
                  </div>
                )
              })}
            </div>
            {liveCount > 0 && liveCount < 3 && (
              <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
                With fewer than three, fusion applies an uncertainty penalty —
                confidences are deliberately conservative.
              </p>
            )}
          </Card>

          {/* ── ingestion queue ── */}
          <Card className="p-5">
            <CardHeader title="Ingestion queue" />
            {queue.available ? (
              <>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <QueueStat value={queue.pending} label="pending" />
                  <QueueStat value={queue.screened} label="screened" />
                </div>
                {queue.pending === 0 && (
                  <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
                    Nothing waiting. Upload a file with the Query Runner to feed
                    the monitor real transactions.
                  </p>
                )}
              </>
            ) : (
              <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
                Not connected. The monitor is falling back to sample transactions —
                point this service and the Query Runner at the same database.
              </p>
            )}
          </Card>

          {/* ── shortcuts ── */}
          <Card className="p-5">
            <SectionLabel>Go to</SectionLabel>
            <div className="mt-3 space-y-1.5">
              {[
                ['/monitor', 'Live monitor'],
                ['/analyzer', 'Analyse a transaction'],
                ['/cases', 'Review the queue'],
                ['/thresholds', 'Tune the threshold'],
                ['/batch', 'Upload a batch'],
              ].map(([to, label]) => (
                <Link key={to} to={to}
                      className="block rounded-lg px-2.5 py-1.5 text-xs text-slate-400 transition-colors hover:bg-surface-raised hover:text-slate-200">
                  {label}
                </Link>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

function Metric({ value, label, sub, accent, tone, onClick }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      onClick={onClick}
      className={cx(
        'rounded-xl border border-subtle bg-surface p-4 text-left',
        onClick && 'transition-colors hover:border-strong',
      )}
    >
      <p className={cx('font-mono text-2xl font-semibold',
        accent ? 'text-accent-400' : 'text-slate-100')}>
        {value}
      </p>
      <p className="mt-0.5 text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      {sub && (
        <p className={cx('mt-1 text-[10px] leading-tight',
          tone === 'warn' ? 'text-risk-medium' : 'text-slate-600')}>
          {sub}
        </p>
      )}
    </Tag>
  )
}

function QueueStat({ value, label }) {
  return (
    <div>
      <p className="font-mono text-lg font-semibold text-slate-200">{value ?? '—'}</p>
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
    </div>
  )
}
