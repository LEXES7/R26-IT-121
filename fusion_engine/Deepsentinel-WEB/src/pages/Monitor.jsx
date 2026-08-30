import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  clearMonitor, getMonitorRuntime, getMonitorState, pauseMonitor, restartMonitor,
  resumeMonitor, startMonitor, stopMonitor, streamMonitor,
} from '../services/api'
import { Alert, cx } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import PipelineLive from '../components/PipelineLive'
import RuntimePanel from '../components/RuntimePanel'

/**
 * Live monitoring surface.
 *
 * The platform is always screening; this is the window onto it. Everything
 * here comes from the server's event stream — no interval polling, no local
 * simulation — so what an analyst reads is what the models actually did.
 *
 * Layout follows how an incident is actually handled: the headline says
 * whether anything is wrong, the funnel says how much got through, the
 * pipeline says where the work is happening, alerts say what to act on, and
 * the feed is the audit trail underneath.
 */

const SEV_HEX = {
  CRITICAL: 'rgb(var(--ds-sev-critical))', HIGH: 'rgb(var(--ds-sev-high))', MEDIUM: 'rgb(var(--ds-sev-medium))', LOW: 'rgb(var(--ds-sev-low))',
}

// Scores arrive already rounded by the server, so 0.9 and 0.8985 sit in the
// same column at different widths. Fix the decimals here: a column of figures
// that does not line up is harder to scan than one that does.
const score3 = (v) => (typeof v === 'number' ? v.toFixed(3) : Number.isFinite(Number(v)) ? Number(v).toFixed(3) : '—')
const money = (v) => (Number.isFinite(Number(v))
  ? Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })
  : '—')

export default function Monitor() {
  const [snap, setSnap] = useState(null)
  const [feed, setFeed] = useState([])
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  // canManageAlerts is administrators and risk managers — the people who act
  // on an alert, and so the people who need to know which detector raised it.
  const {
    canControlPipeline, canViewCases, canRunAnalysis, canConfigureSystem,
    canManageAlerts,
  } = useAuth()
  const [escalating, setEscalating] = useState(false)
  const [runtime, setRuntime] = useState(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const confirmTimer = useRef(null)
  const stopRef = useRef(null)
  const escTimer = useRef(null)

  const apply = useCallback((kind, e) => {
    if (kind === 'snapshot') {
      setSnap(e)
      setFeed(e.events?.slice(-40).reverse() ?? [])
      return
    }

    // Stage flips are frequent and only affect the diagram; keep them out of
    // the feed or it becomes unreadable.
    if (kind === 'stage') {
      setSnap((s) => (s ? { ...s, stages: { ...s.stages, [e.stage]: e.status } } : s))
      return
    }

    if (kind === 'heartbeat') return

    // An administrator cleared the board, here or from a database reset.
    // Everyone watching drops their copy: the list is shared state, and one
    // dashboard still showing alerts the others have cleared is worse than
    // showing none.
    if (kind === 'cleared') {
      setSnap((s) => (s ? { ...s, alerts: [], counters: {} } : s))
      setFeed([{ kind, ...e }])
      getMonitorState().then(setSnap).catch(() => {})
      return
    }

    setFeed((f) => [{ kind, ...e }, ...f].slice(0, 60))

    if (kind === 'escalated') {
      setEscalating(true)
      clearTimeout(escTimer.current)
      escTimer.current = setTimeout(() => setEscalating(false), 4000)
    }
    if (kind === 'alert') {
      // One row per transaction, newest kept. A transaction screened more than
      // once is still one thing for somebody to act on, and listing it five
      // times reads as five frauds.
      setSnap((s) => (s ? {
        ...s,
        alerts: [e, ...(s.alerts ?? []).filter(
          (a) => a.transaction_id !== e.transaction_id)].slice(0, 20),
      } : s))
    }
    if (kind === 'screened' || kind === 'fused') {
      // Counters live on the server; refresh them cheaply rather than
      // recomputing a parallel copy that could drift.
      getMonitorState()
        .then((s) => setSnap((prev) => ({ ...s, stages: prev?.stages ?? s.stages })))
        .catch(() => {})
    }
    if (kind === 'monitor') {
      setSnap((s) => (s ? { ...s, running: e.status === 'started' } : s))
    }
  }, [])

  useEffect(() => {
    getMonitorState().then(setSnap).catch((err) => setError(err.message))
    stopRef.current = streamMonitor({ onEvent: apply, onError: setError })

    // Runtime probes three upstream services, so it polls slowly rather than
    // riding the event stream.
    const refreshRuntime = () => getMonitorRuntime().then(setRuntime).catch(() => {})
    refreshRuntime()
    const t = setInterval(refreshRuntime, 10000)

    return () => {
      stopRef.current?.()
      clearInterval(t)
      clearTimeout(escTimer.current)
      clearTimeout(confirmTimer.current)
    }
  }, [apply])

  const control = async (action) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      setSnap(await getMonitorState())
      setRuntime(await getMonitorRuntime())
    } catch (err) {
      setError(err?.userMessage ?? 'Could not change the monitor state.')
    } finally {
      setBusy(false)
    }
  }

  // First click arms, second clears. The armed state times out rather than
  // waiting indefinitely for a click that is not coming.
  const clearBoard = async () => {
    if (!confirmClear) {
      setConfirmClear(true)
      clearTimeout(confirmTimer.current)
      confirmTimer.current = setTimeout(() => setConfirmClear(false), 4000)
      return
    }
    clearTimeout(confirmTimer.current)
    setConfirmClear(false)
    setBusy(true)
    setError(null)
    try {
      await clearMonitor()
      // The server publishes `cleared` to every subscriber, this one included,
      // so the list empties through the same path as it would for a colleague.
      setSnap(await getMonitorState())
    } catch (err) {
      setError(err?.userMessage ?? 'Could not clear the monitor.')
    } finally {
      setBusy(false)
    }
  }

  const c = snap?.counters ?? {}
  const running = !!snap?.running
  const paused = !!runtime?.monitor?.paused
  // The server's ring buffer keeps every alert event, so a transaction
  // screened twice appears twice. Collapse to the newest per transaction here,
  // where every path — snapshot and stream alike — passes through.
  const alerts = Array.from(
    (snap?.alerts ?? []).reduce((m, a) => {
      const key = a.transaction_id ?? `${a.sink_account}-${a.at}`
      if (!m.has(key)) m.set(key, a)
      return m
    }, new Map()).values(),
  )
  const worst = alerts.reduce(
    (w, a) => (['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].indexOf(a.severity)
      > ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].indexOf(w) ? a.severity : w),
    'LOW',
  )
  // What can actually score. A service that answers its health probe without
  // weights is reachable but useless, and must not be counted as live.
  const live = Object.values(runtime?.detectors ?? {}).filter((d) => d?.ready).length

  return (
    <div className="mx-auto max-w-[88rem] px-5 pb-16 pt-8 sm:px-8">

      {/* ═══ the statement ═══════════════════════════════════════════ */}
      <header className="hair-b pb-7">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0">
            <p className="eyebrow text-slate-500">Live monitoring</p>
            <h1 className="display mt-3 text-[2.75rem] text-slate-100 sm:text-[3.5rem]">
              {!running ? (
                <>The stream is <span className="display-italic text-slate-500">not running.</span></>
              ) : paused ? (
                <>Screening is <span className="display-italic text-risk-medium">paused.</span></>
              ) : alerts.length ? (
                <>
                  {alerts.length} open alert{alerts.length === 1 ? '' : 's'}.{' '}
                  <span className="display-italic" style={{ color: SEV_HEX[worst] }}>
                    Worst is {worst.toLowerCase()}.
                  </span>
                </>
              ) : (
                <>Screening. <span className="display-italic text-slate-500">Nothing flagged.</span></>
              )}
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-400">
              All three detectors read every transaction as it arrives, at the
              same time, and their scores are fused into one verdict. None of
              them waits on another&rsquo;s opinion.
            </p>
          </div>

          {/* controls, typographic rather than a row of chips */}
          <div className="flex items-end gap-6">
            <div>
              <p className="eyebrow text-slate-500">Status</p>
              <p className="mt-2 flex items-center gap-2 text-sm font-medium text-slate-200">
                <span className="relative flex h-2 w-2">
                  {running && !paused && (
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-400 opacity-70" />
                  )}
                  <span className={cx('relative h-2 w-2 rounded-full',
                    !running ? 'bg-slate-600' : paused ? 'bg-risk-medium' : 'bg-accent-400')} />
                </span>
                {!running ? 'Stopped' : paused ? 'Paused' : 'Monitoring'}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                {snap?.source === 'queue' ? 'ingested traffic' : running ? 'sample replay' : 'idle'}
              </p>
            </div>

            {/* Whether the institution is screening at all is an
                administrator's decision. Everyone else watches. The buttons
                are hidden here as a courtesy; require_admin on the monitor
                routes is what actually enforces it. */}
            {!canControlPipeline ? (
              <p className="max-w-[15rem] text-right text-[11px] leading-relaxed text-slate-500">
                Screening is controlled by an administrator.
              </p>
            ) : !running ? (
              <button
                onClick={() => control(() => startMonitor(1.2))}
                disabled={busy}
                className="rounded-lg bg-accent-500 px-4 py-2 text-sm font-medium text-[#04231f] transition-colors hover:bg-accent-400 disabled:opacity-50"
              >
                {busy ? 'Starting…' : 'Start monitoring'}
              </button>
            ) : (
              <div className="flex items-end gap-4 text-sm">
                <Ctl onClick={() => control(paused ? resumeMonitor : pauseMonitor)} busy={busy}>
                  {paused ? 'Resume' : 'Pause'}
                </Ctl>
                <Ctl onClick={() => control(() => restartMonitor(1.2))} busy={busy}>Restart</Ctl>
                <Ctl onClick={() => control(stopMonitor)} busy={busy} danger>Stop</Ctl>
              </div>
            )}
          </div>
        </div>

        {/* the funnel */}
        <dl className="mt-7 grid grid-cols-2 gap-y-5 sm:grid-cols-3 lg:grid-cols-6">
          <Figure value={c.screened} label="Screened" note="every transaction" />
          <Figure value={c.flagged} label="Flagged"
                  note={`${((c.flag_rate ?? 0) * 100).toFixed(1)}% of stream`} />
          <Figure value={c.alerts} label="Alerts" note="fused, medium+" accent />
          <Figure value={c.throughput_per_min} label="Per minute" note="throughput" />
          <Figure value={alerts.length} label="Open" note="awaiting action"
                  urgent={alerts.length > 0} />
          <Figure value={live} suffix="/3" label="Detectors" note="reachable"
                  urgent={live < 3} />
        </dl>
      </header>

      {error && (
        <div className="mt-6">
          <Alert tone="error" onDismiss={() => setError(null)}>{error}</Alert>
        </div>
      )}

      {/* ═══ the pipeline ═══════════════════════════════════════════ */}
      <section className="mt-8">
        <div className="hair-b flex items-baseline justify-between pb-2.5">
          <h2 className="text-sm font-semibold text-slate-100">The pipeline, right now</h2>
          <span className="text-[11px] text-slate-500">
            lit as each stage runs
          </span>
        </div>
        <div className="mt-5">
          <PipelineLive stages={snap?.stages} escalating={escalating} counters={c} />
        </div>
      </section>

      {/* ═══ alerts · feed · runtime ════════════════════════════════ */}
      <div className="mt-9 grid gap-8 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0 space-y-9">

          {/* ── alerts ── */}
          <section>
            <div className="hair-b flex items-baseline justify-between gap-4 pb-2.5">
              <h2 className="text-sm font-semibold text-slate-100">Open alerts</h2>
              <div className="flex items-baseline gap-4">
                <span className="text-[11px] text-slate-500">fused verdict ≥ medium</span>
                {/* Administrators only: this list is shared, so clearing it
                    empties what every other dashboard is looking at. Two
                    clicks, because there is no undo — though nothing is lost
                    either, the cases stay in the database. */}
                {canControlPipeline && !!alerts.length && (
                  <button
                    onClick={clearBoard}
                    disabled={busy}
                    className={cx(
                      'shrink-0 text-[11px] transition-colors disabled:opacity-50',
                      confirmClear
                        ? 'font-medium text-risk-high'
                        : 'text-slate-500 hover:text-slate-300',
                    )}
                    title="Empties the live view. Cases remain in the database."
                  >
                    {busy ? 'Clearing…' : confirmClear ? 'Clear for everyone?' : 'Clear'}
                  </button>
                )}
              </div>
            </div>

            {!alerts.length ? (
              <p className="py-10 text-center text-sm text-slate-500">
                {running
                  ? 'Nothing flagged yet. Most traffic is legitimate — that is the point.'
                  : 'Start monitoring to screen the live stream.'}
              </p>
            ) : (
              <div className="rows mt-1">
                {alerts.map((a) => (
                  <div key={a.transaction_id + a.at}
                       className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                    <span className="h-7 w-[3px] shrink-0 rounded-full"
                          style={{ background: SEV_HEX[a.severity] ?? 'rgb(var(--ds-faint))' }} />
                    <span className="numeric w-14 shrink-0 text-sm text-slate-100">
                      {score3(a.fused_score)}
                    </span>
                    <span className="w-16 shrink-0 text-xs"
                          style={{ color: SEV_HEX[a.severity] }}>
                      {(a.severity ?? '').toLowerCase()}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs text-slate-400">
                      {a.pattern?.replace(/_/g, ' ') ?? 'pattern unknown'}
                      <span className="text-slate-600"> · sink </span>
                      <span className="numeric text-slate-500">{a.sink_account ?? '—'}</span>
                    </span>
                    {canManageAlerts ? (
                      <Detectors alert={a} />
                    ) : (
                      <span className="numeric hidden shrink-0 text-[11px] text-slate-600 sm:block">
                        graph {score3(a.graph_score)} · {a.modalities_used}/3
                      </span>
                    )}
                    <span className="numeric w-24 shrink-0 text-right text-[11px] text-slate-500">
                      {money(a.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── the feed ── */}
          <section>
            <div className="hair-b flex items-baseline justify-between pb-2.5">
              <h2 className="text-sm font-semibold text-slate-100">Activity</h2>
              <span className="text-[11px] text-slate-500">newest first · from the event stream</span>
            </div>

            <ul className="mt-2 max-h-[28rem] overflow-y-auto">
              {feed.length === 0 && (
                <li className="py-10 text-center text-sm text-slate-500">
                  Waiting for the stream…
                </li>
              )}
              {feed.map((e, i) => (
                <li
                  key={`${e.transaction_id ?? e.kind}-${e.at}-${i}`}
                  className="numeric flex items-baseline gap-3 py-1 text-[11px]"
                >
                  <span
                    className={cx(
                      'w-[4.5rem] shrink-0',
                      e.kind === 'alert' && 'text-risk-critical',
                      e.kind === 'escalated' && 'text-accent-400',
                      e.kind === 'notification' && 'text-risk-medium',
                      !['alert', 'escalated', 'notification'].includes(e.kind) && 'text-slate-600',
                    )}
                  >
                    {e.kind}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-slate-400">
                    {e.kind === 'screened' &&
                      `${e.transaction_id} · ${e.risk_level} · ${e.graph_score}${e.escalated ? ' → early flag' : ''}`}
                    {e.kind === 'escalated' &&
                      `${e.transaction_id} · ${e.pattern ?? '—'} · ${e.convergence ?? 0} senders`}
                    {e.kind === 'model' && `${e.transaction_id} · ${e.model} = ${e.score ?? 'unavailable'}`}
                    {e.kind === 'fused' &&
                      `${e.transaction_id} · ${e.severity} · ${e.fused_score} (${e.modalities_used}/3)`}
                    {e.kind === 'alert' && `${e.transaction_id} · ${e.severity} · ${e.pattern ?? ''}`}
                    {e.kind === 'notification' &&
                      `${e.transaction_id} · ${e.stage} email ${e.sent ? 'sent' : 'not sent'}`}
                    {e.kind === 'monitor' && `monitor ${e.status}`}
                    {e.kind === 'error' && e.message}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* ═══ the rail ═══ */}
        <aside className="space-y-7 lg:hair-l lg:pl-7">
          <RuntimePanel runtime={runtime} />

          <section>
            <h3 className="text-xs font-semibold text-slate-200">Fusion</h3>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
              {runtime?.monitor?.fusion
                ? <>Strategy <span className="numeric text-slate-300">{runtime.monitor.fusion}</span>.</>
                : 'Strategy unavailable.'}{' '}
              A detector that cannot be reached abstains — fusion applies an
              uncertainty penalty rather than reading silence as innocence.
            </p>
          </section>

          <section>
            <h3 className="text-xs font-semibold text-slate-200">Go to</h3>
            <div className="rows mt-1">
              {/* Both consoles land here, so the list is filtered to what the
                  reader's role can open — a link to "Access restricted" is
                  worse than no link. */}
              {[
                canViewCases && ['/cases', 'Review the queue'],
                canRunAnalysis && ['/analyzer', 'Analyse a transaction'],
                canConfigureSystem && ['/thresholds', 'Tune the threshold'],
                canViewCases && ['/assistant', 'Ask the assistant'],
                canControlPipeline && ['/models', 'Test each detector'],
              ].filter(Boolean).map(([to, label]) => (
                <Link key={to} to={to}
                      className="block py-2 text-xs text-slate-400 transition-colors hover:text-slate-100">
                  {label}
                </Link>
              ))}
            </div>
            <p className="mt-3 text-[10px] leading-relaxed text-slate-600">
              The assistant reads this same live state.
            </p>
          </section>
        </aside>
      </div>
    </div>
  )
}

/* ── pieces ───────────────────────────────────────────────────────── */

// What each detector said, and which one drove the verdict.
//
// The row used to show the graph score alone, so every alert read as a graph
// finding — including the ones where behaviour was the only reason it fired.
//
// `driver` is the detector with the largest positive contribution to the fused
// log-odds. For a standardised linear meta-classifier that is exact, not an
// attribution heuristic: the log-odds are the intercept plus those three
// terms. A detector that did not answer contributes nothing by construction,
// and is shown as absent rather than as a zero score.
const DETECTORS = [
  ['graph', 'graph'],
  ['behavioural', 'behav'],
  ['temporal', 'timing'],
]

function Detectors({ alert }) {
  const scores = alert.scores ?? { graph: alert.graph_score }
  const driver = alert.driver

  return (
    <span className="hidden shrink-0 items-center gap-3 text-[11px] sm:flex">
      {DETECTORS.map(([key, label]) => {
        const v = scores[key]
        const absent = v === null || v === undefined
        const isDriver = key === driver
        return (
          <span
            key={key}
            className={cx('numeric', absent ? 'text-slate-700'
              : isDriver ? 'font-medium text-slate-100' : 'text-slate-500')}
            title={absent
              ? `${label}: did not answer, so it contributed nothing to the verdict`
              : isDriver
                ? `${label} drove this verdict (contribution ${alert.contributions?.[key]?.toFixed(2) ?? '—'})`
                : `${label} score ${score3(v)}`}
          >
            {isDriver && (
              <span className="mr-1 inline-block h-1 w-1 -translate-y-[2px] rounded-full bg-accent-400" />
            )}
            <span className="text-slate-600">{label} </span>
            {absent ? '—' : score3(v)}
          </span>
        )
      })}
    </span>
  )
}

function Figure({ value, label, note, suffix, accent, urgent }) {
  return (
    <div>
      <dd className={cx('numeric text-[1.75rem] leading-none',
        typeof value !== 'number' ? 'text-slate-600'
          : accent ? 'text-accent-400' : urgent ? 'text-risk-medium' : 'text-slate-100')}>
        {typeof value === 'number' ? value : '—'}
        {suffix && typeof value === 'number' && <span className="text-slate-600">{suffix}</span>}
      </dd>
      <dt className="eyebrow mt-2 text-slate-500">{label}</dt>
      {note && <p className="mt-1 text-[10px] text-slate-600">{note}</p>}
    </div>
  )
}

function Ctl({ onClick, busy, danger, children }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={cx(
        'hair border-b pb-1 transition-colors disabled:opacity-50',
        danger ? 'text-slate-400 hover:text-risk-critical' : 'text-slate-300 hover:text-slate-100',
      )}
    >
      {children}
    </button>
  )
}
