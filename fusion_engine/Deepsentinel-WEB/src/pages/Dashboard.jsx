import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  getMonitorRuntime, getMonitorState, listCases, startMonitor,
} from '../services/api'
import { useAuth } from '../context/AuthContext'
import NetworkGraph from '../components/NetworkGraph'
import { cx } from '../components/ui'

/**
 * The operator's home.
 *
 * Three questions in order: is it running, what did it catch, does anything
 * need me. The layout is deliberately asymmetric — one dominant statement, a
 * dense ledger beneath, a quiet rail beside. Equal-weight cards in a grid give
 * a reader nowhere to look first, which is the problem this replaces.
 *
 * Every figure is read from a live endpoint. A value that cannot be determined
 * renders as an em dash, never as zero: "nothing happened" and "we could not
 * reach the service" must never look the same.
 */

const MODELS = [
  { keys: ['graph'], label: 'Relational', hint: 'network structure' },
  { keys: ['behavioural', 'behavioral'], label: 'Behavioural', hint: 'account behaviour' },
  { keys: ['temporal'], label: 'Temporal', hint: 'timing and sequence' },
]
const pick = (o, keys) => keys.map((k) => o?.[k]).find((v) => v !== undefined)

const SEV = {
  CRITICAL: { hex: '#ef4444', label: 'Critical' },
  HIGH:     { hex: '#f97316', label: 'High' },
  MEDIUM:   { hex: '#eab308', label: 'Medium' },
  LOW:      { hex: '#22c55e', label: 'Low' },
}
const ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']

const uptime = (s) => {
  if (typeof s !== 'number') return null
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60)
  return h ? `${h}h ${m}m` : `${m}m`
}
const since = (iso) => {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const m = Math.round((Date.now() - t) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`
}

/** Eases a figure to its new value. Movement marks what changed. */
function useCountUp(target, ms = 650) {
  const [n, setN] = useState(0)
  const prev = useRef(0)
  useEffect(() => {
    if (typeof target !== 'number') return
    const from = prev.current
    const t0 = performance.now()
    let raf
    const tick = (t) => {
      // Clamp both ends. Cubing an unclamped negative progress overshoots
      // wildly — a counter briefly rendered -25479 on the way to 9.
      const p = Math.max(0, Math.min((t - t0) / ms, 1))
      const v = from + (target - from) * (1 - (1 - p) ** 3)
      // And never display outside the interval being travelled, whatever the
      // easing does.
      setN(Math.round(Math.min(Math.max(v, Math.min(from, target)), Math.max(from, target))))
      if (p < 1) raf = requestAnimationFrame(tick)
      else { prev.current = target; setN(target) }
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

  const c = state?.counters ?? {}
  const queue = state?.queue ?? {}
  const running = Boolean(state?.running)
  const detectors = runtime?.detectors ?? {}
  // `ready`, not `reachable`: a detector that replies to a health probe but
  // has no weights cannot score, and counting it here overstates the system.
  const liveCount = MODELS.filter(({ keys }) => pick(detectors, keys)?.ready).length

  const bySeverity = useMemo(() => {
    const acc = {}
    cases.forEach((x) => { acc[x.classification] = (acc[x.classification] || 0) + 1 })
    return acc
  }, [cases])

  const activity = useMemo(() => {
    const now = Date.now()
    const b = Array.from({ length: 24 }, () => ({ total: 0, hot: 0 }))
    cases.forEach((x) => {
      const t = Date.parse(x.detected_at)
      if (Number.isNaN(t)) return
      const h = Math.floor((now - t) / 3_600_000)
      if (h < 0 || h > 23) return
      b[23 - h].total += 1
      if (x.classification === 'CRITICAL' || x.classification === 'HIGH') b[23 - h].hot += 1
    })
    return b
  }, [cases])

  // Severity leads; among equals, the one with more network to show wins.
  const featured = useMemo(() => {
    const g = cases.filter((x) => (x.graph_evidence?.nodes?.length ?? 0) >= 2)
    if (!g.length) return null
    const rank = (x) =>
      ({ CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }[x.classification] ?? 0) * 1000
      + Math.min(x.graph_evidence.nodes.length, 40) * 10 + (x.fused_score ?? 0)
    return [...g].sort((a, b2) => rank(b2) - rank(a))[0]
  }, [cases])

  const name = (user?.full_name || user?.username || '')
    .replace(/deepsentinel/i, '').trim().split(' ')[0]

  return (
    <div className="mx-auto max-w-[88rem] px-5 pb-16 pt-8 sm:px-8">

      {/* ═══ the statement ═══════════════════════════════════════════ */}
      <header className="hair-b pb-7">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0">
            <p className="eyebrow text-slate-500">
              {name ? `${name} · ` : ''}Fraud operations
            </p>
            <h1 className="display mt-3 text-[2.75rem] text-slate-100 sm:text-[3.5rem]">
              {openCount ? (
                <>
                  {openCount} case{openCount === 1 ? '' : 's'}{' '}
                  <span className="display-italic text-risk-medium">need your review.</span>
                </>
              ) : running ? (
                <>All clear. <span className="display-italic text-slate-500">Nothing is waiting.</span></>
              ) : (
                <>Screening is <span className="display-italic text-slate-500">turned off.</span></>
              )}
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-400">
              {openCount
                ? `The models flagged these transactions. Open one to see why it
                   was flagged, then confirm it as fraud or dismiss it.`
                : running
                  ? `Every transaction is being checked as it arrives. Anything
                     suspicious will appear here.`
                  : 'Start the monitor and transactions will be checked as they arrive.'}
            </p>

            {/* One obvious next step. The dashboard used to state the situation
                and leave the reader to work out what to do about it. */}
            <div className="mt-5 flex flex-wrap items-center gap-4">
              {openCount ? (
                <button
                  onClick={() => navigate('/cases')}
                  className="rounded-lg bg-accent-500 px-4 py-2 text-sm font-medium text-[#04231f] transition-colors hover:bg-accent-400"
                >
                  Start reviewing &rarr;
                </button>
              ) : null}
              {featured && (
                <Link
                  to={`/cases/${featured.case_ref}`}
                  className="hair border-b pb-1 text-sm text-slate-300 transition-colors hover:text-slate-100"
                >
                  See the strongest case &rarr;
                </Link>
              )}
            </div>
          </div>

          {/* live state, typographic rather than a badge */}
          <div className="flex items-end gap-8">
            <div>
              <p className="eyebrow text-slate-500">Status</p>
              <p className="mt-2 flex items-center gap-2 text-sm font-medium text-slate-200">
                <span className="relative flex h-2 w-2">
                  {running && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-400 opacity-70" />}
                  <span className={cx('relative h-2 w-2 rounded-full',
                    running ? 'bg-accent-400' : 'bg-risk-medium')} />
                </span>
                {running ? 'Live' : 'Stopped'}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                {running
                  ? (state?.source === 'queue' ? 'ingested traffic' : 'sample replay')
                  : 'idle'}
              </p>
            </div>
            {running ? (
              <Link to="/monitor"
                    className="hair border-b pb-1 text-sm text-slate-300 transition-colors hover:text-slate-100">
                Open monitor →
              </Link>
            ) : (
              <button
                onClick={async () => {
                  setStarting(true)
                  try { await startMonitor() } finally { setStarting(false); refresh() }
                }}
                disabled={starting}
                className="rounded-lg bg-accent-500 px-4 py-2 text-sm font-medium text-[#04231f] transition-colors hover:bg-accent-400 disabled:opacity-50"
              >
                {starting ? 'Starting…' : 'Start monitoring'}
              </button>
            )}
          </div>
        </div>

        {/* the ledger — dense, no boxes */}
        {/* Plain words, and a line under each saying what it counts. The old
            labels — screened, escalated, alerts — are the pipeline's vocabulary,
            not the reader's, and none of them said which number mattered. */}
        <dl className="mt-7 grid grid-cols-2 gap-y-6 sm:grid-cols-3 lg:grid-cols-6">
          <Figure value={openCount} label="Waiting for you" note="cases to review"
                  urgent={Boolean(openCount)} onClick={() => navigate('/cases')} />
          <Figure value={c.alerts} label="Alerts sent" note="someone was emailed" accent />
          <Figure value={c.screened} label="Checked" note="transactions seen" />
          <Figure value={c.escalated} label="Looked at closely" note="worth a second look" />
          <Figure value={queue.available ? queue.pending : null} label="Still to check"
                  note="waiting in the queue" />
          <Figure value={liveCount} suffix="/3" label="Models online"
                  note={liveCount < 3 ? 'one is not running' : 'all running'}
                  urgent={liveCount < 3} />
        </dl>
      </header>

      {/* ═══ the floor ═══════════════════════════════════════════════ */}
      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_17.5rem]">
        <div className="min-w-0 space-y-8">

          {featured ? (
            <section>
              <div className="hair-b flex flex-wrap items-baseline gap-3 pb-2.5">
                <h2 className="text-sm font-semibold text-slate-100">Most serious case right now</h2>
                <span className="numeric text-[11px]" style={{ color: SEV[featured.classification]?.hex }}>
                  {featured.fused_score?.toFixed(3)}
                </span>
                <span className="numeric text-[11px] text-slate-600">{featured.case_ref}</span>
                <Link to={`/cases/${featured.case_ref}`}
                      className="ml-auto text-xs text-accent-400 transition-colors hover:text-accent-300">
                  Full case →
                </Link>
              </div>
              <div className="mt-4">
                <NetworkGraph evidence={featured.graph_evidence} height={400} />
              </div>
            </section>
          ) : (
            <section className="hair rounded-xl border border-dashed px-8 py-16 text-center">
              <p className="display text-2xl text-slate-300">No network to show.</p>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-500">
                When a transaction escalates, the accounts around it are drawn here.
                Ingest a file with the Query Runner, or start the monitor.
              </p>
            </section>
          )}

          <section>
            <div className="hair-b flex items-baseline justify-between pb-2.5">
              <h2 className="text-sm font-semibold text-slate-100">What was caught, last 24 hours</h2>
              <span className="text-[11px] text-slate-500">
                <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-risk-critical align-middle" />
                critical or high
              </span>
            </div>
            <Activity buckets={activity} />
          </section>

          <section>
            <div className="hair-b flex items-baseline justify-between pb-2.5">
              <h2 className="text-sm font-semibold text-slate-100">Latest flagged transactions</h2>
              <Link to="/cases" className="text-xs text-accent-400 hover:text-accent-300">
                All cases →
              </Link>
            </div>
            {cases.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">Nothing recorded yet.</p>
            ) : (
              <>
                {/* The columns were unlabelled, so "0.885 · Critical · 2/3"
                    was four unexplained numbers in a row. */}
                <div className="flex items-center gap-4 pb-1.5 pt-3 text-[10px] text-slate-600">
                  <span className="w-[3px] shrink-0" />
                  <span className="w-14 shrink-0">score</span>
                  <span className="w-20 shrink-0">how serious</span>
                  <span className="min-w-0 flex-1">pattern found</span>
                  <span className="hidden w-12 shrink-0 sm:block">models</span>
                  <span className="w-16 shrink-0 text-right">when</span>
                </div>
              <div className="rows">
                {cases.slice(0, 9).map((x) => (
                  <button
                    key={x.case_ref}
                    onClick={() => navigate(`/cases/${x.case_ref}`)}
                    className="flex w-full items-center gap-4 py-2.5 text-left transition-colors hover:bg-surface-raised"
                  >
                    <span className="h-6 w-[3px] shrink-0 rounded-full"
                          style={{ background: SEV[x.classification]?.hex ?? '#64748b' }} />
                    <span className="numeric w-14 shrink-0 text-sm text-slate-200">
                      {typeof x.fused_score === 'number' ? x.fused_score.toFixed(3) : '—'}
                    </span>
                    <span className="w-20 shrink-0 text-xs text-slate-400">
                      {SEV[x.classification]?.label ?? x.classification}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs text-slate-500">
                      {(x.graph_pattern ?? x.typology_name ?? '—').toLowerCase().replace(/_/g, ' ')}
                    </span>
                    <span className="numeric hidden w-12 shrink-0 text-[11px] text-slate-600 sm:block">
                      {x.modalities_used}/3
                    </span>
                    <span className="w-16 shrink-0 text-right text-[11px] text-slate-600">
                      {since(x.detected_at)}
                    </span>
                  </button>
                ))}
              </div>
              </>
            )}
          </section>
        </div>

        {/* ═══ the rail ═══════════════════════════════════════════════ */}
        <aside className="space-y-7 lg:hair-l lg:pl-7">

          <Rail title="Severity" note={`last ${cases.length}`}>
            {cases.length === 0 ? (
              <p className="mt-2 text-xs text-slate-600">—</p>
            ) : (
              <>
                <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-surface-overlay">
                  {ORDER.filter((k) => bySeverity[k]).map((k) => (
                    <div key={k} title={`${k}: ${bySeverity[k]}`}
                         style={{ width: `${(bySeverity[k] / cases.length) * 100}%`,
                                  background: SEV[k].hex }} />
                  ))}
                </div>
                <div className="rows mt-3">
                  {ORDER.filter((k) => bySeverity[k]).map((k) => (
                    <div key={k} className="flex items-center gap-2 py-1.5 text-[11px]">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: SEV[k].hex }} />
                      <span className="text-slate-400">{SEV[k].label}</span>
                      <span className="numeric ml-auto text-slate-200">{bySeverity[k]}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Rail>

          <Rail title="Models" note={`${liveCount}/3 running`}>
            <div className="rows mt-2">
              {MODELS.map(({ keys, label, hint }) => {
                const d = pick(detectors, keys)
                const up = Boolean(d?.ready)
                const halfUp = Boolean(d?.reachable) && !up
                return (
                  <div key={label} className="flex items-baseline gap-2.5 py-2">
                    <span className={cx('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                      up ? 'bg-risk-low' : halfUp ? 'bg-risk-medium' : 'bg-slate-700')} />
                    <div className="min-w-0">
                      <p className={cx('text-xs', up ? 'text-slate-200' : 'text-slate-500')}>{label}</p>
                      <p className="text-[10px] text-slate-600">{hint}</p>
                    </div>
                    <span className={cx('numeric ml-auto shrink-0 text-[10px]',
                      halfUp ? 'text-risk-medium' : 'text-slate-500')}>
                      {up ? (uptime(d.service_uptime_seconds) ?? 'up')
                          : halfUp ? 'no model' : 'offline'}
                    </span>
                  </div>
                )
              })}
            </div>
            {liveCount > 0 && liveCount < 3 && (
              <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
                With a model missing, scores are deliberately kept low rather
                than pretending the missing one agreed.
              </p>
            )}
          </Rail>

          <Rail title="Incoming" note={queue.available ? 'connected' : 'not connected'}>
            {queue.available ? (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <p className="numeric text-xl text-slate-100">{queue.pending ?? 0}</p>
                  <p className="eyebrow mt-1 text-slate-600">pending</p>
                </div>
                <div>
                  <p className="numeric text-xl text-slate-400">{queue.screened ?? 0}</p>
                  <p className="eyebrow mt-1 text-slate-600">screened</p>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                Point this service and the Query Runner at the same database to
                screen real arrivals.
              </p>
            )}
          </Rail>

          <Rail title="Go to">
            <div className="rows mt-1">
              {[['/monitor', 'Live monitor'], ['/analyzer', 'Analyse a transaction'],
                ['/cases', 'Review the queue'], ['/thresholds', 'Tune the threshold'],
                ['/batch', 'Upload a batch']].map(([to, label]) => (
                <Link key={to} to={to}
                      className="block py-2 text-xs text-slate-400 transition-colors hover:text-slate-100">
                  {label}
                </Link>
              ))}
            </div>
          </Rail>
        </aside>
      </div>
    </div>
  )
}

/* ── pieces ──────────────────────────────────────────────────────── */

function Figure({ value, label, note, suffix, accent, urgent, onClick }) {
  const shown = useCountUp(typeof value === 'number' ? value : null)
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag onClick={onClick} className={cx('text-left', onClick && 'group')}>
      <dd className={cx(
        'numeric text-[1.75rem] leading-none',
        accent ? 'text-accent-400' : urgent ? 'text-risk-medium' : 'text-slate-100',
        onClick && 'transition-colors group-hover:text-accent-400',
      )}>
        {typeof value === 'number' ? shown : '—'}
        {suffix && <span className="text-slate-600">{suffix}</span>}
      </dd>
      <dt className="mt-2 text-xs font-medium text-slate-300">{label}</dt>
      {note && <p className="mt-0.5 text-[11px] text-slate-600">{note}</p>}
    </Tag>
  )
}

/** 24 hourly bars, bucketed from the same records the ledger lists. */
function Activity({ buckets }) {
  const max = Math.max(...buckets.map((b) => b.total), 1)
  const empty = buckets.every((b) => b.total === 0)
  return (
    <>
      {/* h-full on each column: a percentage height needs a definite parent,
          and without it every bar silently collapses to nothing. */}
      <div className="mt-4 flex h-28 items-stretch gap-[3px]">
        {buckets.map((b, i) => (
          <div key={i} className="group relative flex h-full flex-1 flex-col justify-end gap-px">
            {b.total > 0 ? (
              <>
                {b.hot > 0 && (
                  <div className="rounded-t-sm bg-risk-critical"
                       style={{ height: `${(b.hot / max) * 100}%` }} />
                )}
                <div className={cx('bg-modality-graph/55', b.hot > 0 ? '' : 'rounded-t-sm')}
                     style={{ height: `${((b.total - b.hot) / max) * 100}%` }} />
              </>
            ) : (
              <div className="h-px rounded-full bg-slate-700/40" />
            )}
            <span className="numeric pointer-events-none absolute -top-5 left-1/2 -translate-x-1/2 rounded bg-surface-overlay px-1.5 py-0.5 text-[9px] text-slate-300 opacity-0 transition-opacity group-hover:opacity-100">
              {b.total}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-slate-600">
        <span>24h ago</span>
        {empty && <span className="text-slate-500">no detections in this window</span>}
        <span>now</span>
      </div>
    </>
  )
}

function Rail({ title, note, children }) {
  return (
    <section>
      <div className="flex items-baseline justify-between">
        <h3 className="text-xs font-semibold text-slate-200">{title}</h3>
        {note && <span className="text-[10px] text-slate-600">{note}</span>}
      </div>
      {children}
    </section>
  )
}
