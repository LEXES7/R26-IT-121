import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  getMonitorRuntime, getMonitorState, listCases, startMonitor,
} from '../services/api'
import { useAuth } from '../context/AuthContext'
import NetworkGraph from '../components/NetworkGraph'
import { Badge, Button, Card, cx } from '../components/ui'

/**
 * What an operator sees on signing in.
 *
 * Answers, in order: is the system running, has anything caught fire, and does
 * anything need me. Every figure is read from a live endpoint — a value that
 * cannot be determined renders as an em dash, never as a confident zero, since
 * "nothing happened" and "we could not reach the service" must not look alike.
 *
 * The charts are drawn from the same case records the tables show, bucketed
 * client-side. No separate metrics pipeline, so a chart can never disagree with
 * the list beneath it.
 */

const MODELS = [
  { keys: ['graph'], label: 'Relational', hint: 'network structure' },
  { keys: ['behavioural', 'behavioral'], label: 'Behavioural', hint: 'account behaviour' },
  { keys: ['temporal'], label: 'Temporal', hint: 'timing and sequence' },
]
const pick = (o, keys) => keys.map((k) => o?.[k]).find((v) => v !== undefined)

const SEV = {
  CRITICAL: { tone: 'critical', hex: '#ef4444' },
  HIGH:     { tone: 'high',     hex: '#f97316' },
  MEDIUM:   { tone: 'medium',   hex: '#eab308' },
  LOW:      { tone: 'low',      hex: '#22c55e' },
}
const ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']

const uptime = (s) => {
  if (typeof s !== 'number') return null
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60)
  return h ? `${h}h ${m}m` : `${m}m`
}

/** Counts a number up on mount. Movement draws the eye to what changed. */
function useCountUp(target, ms = 700) {
  const [n, setN] = useState(0)
  const prev = useRef(0)
  useEffect(() => {
    if (typeof target !== 'number') return
    const from = prev.current
    const start = performance.now()
    let raf
    const tick = (t) => {
      const p = Math.min((t - start) / ms, 1)
      // ease-out, so it decelerates into the final value
      setN(Math.round(from + (target - from) * (1 - (1 - p) ** 3)))
      if (p < 1) raf = requestAnimationFrame(tick)
      else prev.current = target
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return typeof target === 'number' ? n : target
}

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [state, setState] = useState(null)
  const [runtime, setRuntime] = useState(null)
  const [cases, setCases] = useState([])
  const [openCount, setOpenCount] = useState(null)
  const [starting, setStarting] = useState(false)

  const refresh = useCallback(async () => {
    const [s, r, all, open] = await Promise.allSettled([
      getMonitorState(), getMonitorRuntime(),
      listCases({ limit: 60 }), listCases({ review_status: 'open', limit: 200 }),
    ])
    if (s.status === 'fulfilled') setState(s.value)
    if (r.status === 'fulfilled') setRuntime(r.value)
    if (all.status === 'fulfilled') setCases(all.value.cases ?? [])
    if (open.status === 'fulfilled') setOpenCount(open.value.cases?.length ?? 0)
  }, [])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 5000)
    return () => clearInterval(t)
  }, [refresh])

  const counters = state?.counters ?? {}
  const queue = state?.queue ?? {}
  const running = Boolean(state?.running)
  const detectors = runtime?.detectors ?? {}
  const liveCount = MODELS.filter(({ keys }) => pick(detectors, keys)?.reachable).length

  const bySeverity = useMemo(() => {
    const acc = {}
    cases.forEach((c) => { acc[c.classification] = (acc[c.classification] || 0) + 1 })
    return acc
  }, [cases])

  // Hourly buckets over the last 12 hours, from the same records the list shows.
  const activity = useMemo(() => {
    const now = Date.now()
    const buckets = Array.from({ length: 12 }, () => ({ total: 0, critical: 0 }))
    cases.forEach((c) => {
      const t = Date.parse(c.detected_at)
      if (Number.isNaN(t)) return
      const hoursAgo = Math.floor((now - t) / 3_600_000)
      if (hoursAgo < 0 || hoursAgo > 11) return
      const b = buckets[11 - hoursAgo]
      b.total += 1
      if (c.classification === 'CRITICAL' || c.classification === 'HIGH') b.critical += 1
    })
    return buckets
  }, [cases])

  // The case worth looking at.
  //
  // Severity leads, but among equally severe cases the one with more network to
  // show wins: this panel exists to make structure visible, and a two-account
  // graph has none however high it scored. Ranking purely by score featured a
  // single edge while a seven-account ring sat unused.
  const featured = useMemo(() => {
    const withGraph = cases.filter((c) => (c.graph_evidence?.nodes?.length ?? 0) >= 2)
    if (!withGraph.length) return null
    const severity = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }
    const rank = (c) =>
      (severity[c.classification] ?? 0) * 1000
      + Math.min(c.graph_evidence.nodes.length, 40) * 10
      + (c.fused_score ?? 0)
    return [...withGraph].sort((a, b) => rank(b) - rank(a))[0]
  }, [cases])

  const firstName = (user?.full_name || user?.username || '')
    .replace(/\bDeepSentinel\b/i, '').trim().split(' ')[0] || user?.username || 'there'

  return (
    <div className="mx-auto max-w-[80rem] space-y-4 px-4 py-6 sm:px-6">

      {/* ── status strip ───────────────────────────────────────────── */}
      <Card className={cx(
        'relative overflow-hidden p-5 sm:p-6',
        running ? 'border-accent-500/25' : 'border-risk-medium/25',
      )}>
        <div
          aria-hidden="true"
          className={cx(
            'pointer-events-none absolute inset-0 opacity-[0.07]',
            running ? 'bg-gradient-to-r from-accent-500 via-transparent to-transparent'
                    : 'bg-gradient-to-r from-risk-medium via-transparent to-transparent',
          )}
        />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <span className="relative flex h-3 w-3">
              {running && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-400 opacity-75" />
              )}
              <span className={cx('relative inline-flex h-3 w-3 rounded-full',
                running ? 'bg-accent-400' : 'bg-risk-medium')} />
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-100">
                {running ? 'Monitoring live' : 'Monitoring stopped'}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {running
                  ? (state?.source === 'queue'
                      ? 'Screening ingested transactions'
                      : 'Ingestion queue empty — replaying samples')
                  : 'Nothing is being screened right now'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="hidden sm:block">
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Detectors</p>
              <p className={cx('font-mono text-lg font-semibold',
                liveCount === 3 ? 'text-risk-low' : 'text-risk-medium')}>
                {liveCount}<span className="text-slate-600">/3</span>
              </p>
            </div>
            <div className="hidden sm:block">
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Queue</p>
              <p className="font-mono text-lg font-semibold text-slate-200">
                {queue.available ? (queue.pending ?? 0) : '—'}
              </p>
            </div>
            {running ? (
              <Link to="/monitor">
                <Button size="sm" variant="secondary">Open monitor</Button>
              </Link>
            ) : (
              <Button size="sm" loading={starting} onClick={async () => {
                setStarting(true)
                try { await startMonitor() } finally { setStarting(false); refresh() }
              }}>
                Start monitoring
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* ── headline metrics ───────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric value={counters.screened} label="Screened" spark={activity.map((b) => b.total)} />
        <Metric value={counters.escalated} label="Escalated" hint="passed the watch threshold" />
        <Metric value={counters.alerts} label="Alerts" accent hint="warranted a notification" />
        <Metric
          value={openCount} label="Awaiting review"
          hint={openCount ? 'needs a decision' : 'nothing waiting'}
          urgent={Boolean(openCount)}
          onClick={() => navigate('/cases')}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_19rem]">
        <div className="space-y-4">

          {/* ── activity ── */}
          <Card className="p-5">
            <div className="flex items-baseline justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-100">Detections over 12 hours</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Every case recorded, by the hour it was detected.
                </p>
              </div>
              <span className="text-[11px] text-slate-500">
                <span className="mr-1 inline-block h-2 w-2 rounded-full bg-risk-critical align-middle" />
                critical or high
              </span>
            </div>
            <ActivityChart buckets={activity} />
          </Card>

          {/* ── the case worth seeing ── */}
          {featured ? (
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2.5 px-1">
                <Badge tone={SEV[featured.classification]?.tone ?? 'low'}>
                  {featured.classification}
                </Badge>
                <span className="font-mono text-sm font-semibold text-slate-200">
                  {featured.fused_score?.toFixed(3)}
                </span>
                <span className="text-xs text-slate-400">
                  highest-scoring case with a network
                </span>
                <Link to={`/cases/${featured.case_ref}`}
                      className="ml-auto text-xs font-medium text-accent-400 hover:text-accent-300">
                  Open case →
                </Link>
              </div>
              <NetworkGraph evidence={featured.graph_evidence} height={320} />
            </div>
          ) : (
            <Card className="p-8 text-center">
              <p className="text-sm text-slate-300">No network to show yet.</p>
              <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-500">
                Once a transaction escalates, the accounts around it are drawn here.
                Start monitoring, or upload a file with the Query Runner.
              </p>
            </Card>
          )}
        </div>

        {/* ── right rail ── */}
        <div className="space-y-4">

          {/* severity mix */}
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-100">Severity mix</h2>
            <p className="mt-0.5 text-xs text-slate-500">Last {cases.length} cases.</p>
            {cases.length === 0 ? (
              <p className="mt-4 text-xs text-slate-600">Nothing recorded yet.</p>
            ) : (
              <>
                <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-surface-overlay">
                  {ORDER.filter((k) => bySeverity[k]).map((k) => (
                    <div
                      key={k}
                      title={`${k}: ${bySeverity[k]}`}
                      style={{
                        width: `${(bySeverity[k] / cases.length) * 100}%`,
                        background: SEV[k].hex,
                      }}
                    />
                  ))}
                </div>
                <div className="mt-3 space-y-1.5">
                  {ORDER.filter((k) => bySeverity[k]).map((k) => (
                    <div key={k} className="flex items-center gap-2 text-[11px]">
                      <span className="h-2 w-2 rounded-full" style={{ background: SEV[k].hex }} />
                      <span className="text-slate-400">{k.toLowerCase()}</span>
                      <span className="ml-auto font-mono text-slate-200">{bySeverity[k]}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>

          {/* detectors */}
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-100">Detectors</h2>
              <Badge tone={liveCount === 3 ? 'low' : 'medium'}>{liveCount}/3</Badge>
            </div>
            <div className="mt-4 space-y-3">
              {MODELS.map(({ keys, label, hint }) => {
                const d = pick(detectors, keys)
                const up = Boolean(d?.reachable)
                return (
                  <div key={label} className="flex items-center gap-2.5">
                    <span className={cx('h-1.5 w-1.5 shrink-0 rounded-full',
                      up ? 'bg-risk-low' : 'bg-slate-700')} />
                    <div className="min-w-0">
                      <p className={cx('text-xs', up ? 'text-slate-200' : 'text-slate-500')}>
                        {label}
                      </p>
                      <p className="text-[10px] text-slate-600">{hint}</p>
                    </div>
                    <span className="ml-auto shrink-0 text-[10px] text-slate-500">
                      {up ? (uptime(d.service_uptime_seconds) ?? 'up') : 'not deployed'}
                    </span>
                  </div>
                )
              })}
            </div>
            {liveCount > 0 && liveCount < 3 && (
              <p className="mt-3 border-t border-subtle pt-2.5 text-[10px] leading-relaxed text-slate-500">
                Below three, fusion applies an uncertainty penalty — confidences
                are deliberately conservative.
              </p>
            )}
          </Card>

          {/* recent */}
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-100">Latest</h2>
              <Link to="/cases" className="text-[11px] font-medium text-accent-400 hover:text-accent-300">
                All →
              </Link>
            </div>
            {cases.length === 0 ? (
              <p className="mt-3 text-xs text-slate-600">Nothing yet.</p>
            ) : (
              <div className="mt-3 space-y-1">
                {cases.slice(0, 6).map((c) => (
                  <button
                    key={c.case_ref}
                    onClick={() => navigate(`/cases/${c.case_ref}`)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-raised"
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ background: SEV[c.classification]?.hex ?? '#64748b' }} />
                    <span className="font-mono text-[11px] text-slate-300">
                      {typeof c.fused_score === 'number' ? c.fused_score.toFixed(3) : '—'}
                    </span>
                    <span className="truncate text-[10px] text-slate-500">
                      {c.graph_pattern ?? c.typology_name ?? ''}
                    </span>
                    <span className="ml-auto shrink-0 font-mono text-[9px] text-slate-600">
                      {c.case_ref.slice(-4)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

/* ── pieces ───────────────────────────────────────────────────────── */

function Metric({ value, label, hint, spark, accent, urgent, onClick }) {
  const shown = useCountUp(typeof value === 'number' ? value : null)
  const Tag = onClick ? 'button' : 'div'
  const max = spark ? Math.max(...spark, 1) : 1

  return (
    <Tag
      onClick={onClick}
      className={cx(
        'group relative overflow-hidden rounded-xl border border-subtle bg-surface p-4 text-left transition-all',
        onClick && 'hover:border-strong',
        urgent && 'border-risk-medium/30',
      )}
    >
      <p className={cx(
        'font-mono text-3xl font-semibold leading-none tabular-nums',
        accent ? 'text-accent-400' : urgent ? 'text-risk-medium' : 'text-slate-100',
      )}>
        {typeof value === 'number' ? shown : '—'}
      </p>
      <p className="mt-2 text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      {hint && <p className="mt-0.5 text-[10px] leading-tight text-slate-600">{hint}</p>}

      {spark && spark.some((v) => v > 0) && (
        <svg viewBox="0 0 100 20" preserveAspectRatio="none"
             className="mt-2.5 h-5 w-full opacity-60" aria-hidden="true">
          <polyline
            fill="none" stroke="currentColor" strokeWidth="1.5"
            className="text-accent-500"
            points={spark.map((v, i) =>
              `${(i / (spark.length - 1)) * 100},${20 - (v / max) * 18}`).join(' ')}
          />
        </svg>
      )}
    </Tag>
  )
}

/** Hourly bars. Bucketed from the case list, so it cannot disagree with it. */
function ActivityChart({ buckets }) {
  const max = Math.max(...buckets.map((b) => b.total), 1)
  const empty = buckets.every((b) => b.total === 0)

  return (
    <>
      {/* h-full on the column matters: a percentage height only resolves against
          a parent with a definite height, and without it every bar collapses to
          nothing — which looked exactly like "no detections". */}
      <div className="mt-5 flex h-32 items-stretch gap-1.5">
        {buckets.map((b, i) => (
          <div key={i} className="group relative flex h-full flex-1 flex-col justify-end gap-px">
            {b.total > 0 ? (
              <>
                {b.critical > 0 && (
                  <div className="rounded-t bg-risk-critical transition-all"
                       style={{ height: `${(b.critical / max) * 100}%` }} />
                )}
                <div className={cx('bg-modality-graph/60 transition-all',
                  b.critical > 0 ? '' : 'rounded-t')}
                     style={{ height: `${((b.total - b.critical) / max) * 100}%` }} />
              </>
            ) : (
              <div className="h-[3px] rounded-full bg-surface-overlay" />
            )}
            <span className="pointer-events-none absolute -top-5 left-1/2 -translate-x-1/2 rounded bg-surface-overlay px-1.5 py-0.5 font-mono text-[9px] text-slate-300 opacity-0 transition-opacity group-hover:opacity-100">
              {b.total}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-slate-600">
        <span>12h ago</span>
        {empty && <span className="text-slate-500">No detections in this window</span>}
        <span>now</span>
      </div>
    </>
  )
}
