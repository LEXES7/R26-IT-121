import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  getMonitorRuntime, getMonitorState, pauseMonitor, restartMonitor,
  resumeMonitor, startMonitor, stopMonitor, streamMonitor,
} from '../services/api'
import { Alert, Badge, Button, cx } from '../components/ui'
import { Eyebrow } from '../components/Editorial'
import PipelineLive from '../components/PipelineLive'
import RuntimePanel from '../components/RuntimePanel'

/**
 * Live monitoring surface.
 *
 * The platform is always screening; this is the window onto it. Everything
 * here comes from the server's event stream — no interval polling, no local
 * simulation — so what an analyst reads is what the models actually did.
 *
 * Layout follows how an incident is actually handled: the funnel counters say
 * whether anything is wrong, the pipeline says where the work is happening,
 * alerts say what to act on, and the feed is the audit trail underneath.
 */

const SEVERITY_TONE = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
}

function Stat({ label, value, sub, accent }) {
  return (
    <div className="rounded-2xl border border-subtle bg-surface p-5">
      <p className={cx('text-3xl font-bold tabular-nums', accent ? 'text-accent-500' : 'text-slate-200')}>
        {value}
      </p>
      <p className="mt-1 text-xs font-semibold text-slate-400">{label}</p>
      {sub && <p className="mt-0.5 text-[10px] text-slate-600">{sub}</p>}
    </div>
  )
}

function severityColour(sev) {
  return {
    CRITICAL: 'text-risk-critical border-risk-critical/40 bg-risk-critical/10',
    HIGH: 'text-risk-high border-risk-high/40 bg-risk-high/10',
    MEDIUM: 'text-risk-medium border-risk-medium/40 bg-risk-medium/10',
  }[sev] ?? 'text-slate-400 border-subtle bg-surface'
}

export default function Monitor() {
  const [snap, setSnap] = useState(null)
  const [feed, setFeed] = useState([])
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [escalating, setEscalating] = useState(false)
  const [runtime, setRuntime] = useState(null)
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

    setFeed((f) => [{ kind, ...e }, ...f].slice(0, 60))

    if (kind === 'escalated') {
      setEscalating(true)
      clearTimeout(escTimer.current)
      escTimer.current = setTimeout(() => setEscalating(false), 4000)
    }
    if (kind === 'alert') {
      setSnap((s) => (s ? { ...s, alerts: [e, ...(s.alerts ?? [])].slice(0, 20) } : s))
    }
    if (kind === 'screened' || kind === 'fused') {
      // Counters live on the server; refresh them cheaply rather than
      // recomputing a parallel copy that could drift.
      getMonitorState().then((s) => setSnap((prev) => ({ ...s, stages: prev?.stages ?? s.stages }))).catch(() => {})
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

  const c = snap?.counters ?? {}
  const running = !!snap?.running
  const paused = !!runtime?.monitor?.paused

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Eyebrow>Live monitoring</Eyebrow>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-200">
            Transaction stream
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-500">
            The graph model screens every transaction as it arrives. Only what
            looks structurally suspicious is escalated to the behavioural and
            temporal detectors, then fused into a verdict.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span
            className={cx(
              'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium',
              running
                ? 'border-risk-low/40 bg-risk-low/10 text-risk-low'
                : 'border-subtle text-slate-500',
            )}
          >
            <span
              className={cx(
                'h-1.5 w-1.5 rounded-full',
                running && !paused ? 'animate-pulse bg-risk-low' : 'bg-slate-600',
              )}
            />
            {!running ? 'Stopped' : paused ? 'Paused' : 'Monitoring'}
          </span>

          {/* Pause keeps the session; stop tears it down. Both are offered
              because an analyst reading an alert wants the first, not the
              second. */}
          {!running ? (
            <Button onClick={() => control(() => startMonitor(1.2))} loading={busy}>
              Start monitoring
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                onClick={() => control(paused ? resumeMonitor : pauseMonitor)}
                loading={busy}
              >
                {paused ? 'Resume' : 'Pause'}
              </Button>
              <Button variant="ghost" onClick={() => control(() => restartMonitor(1.2))} loading={busy}>
                Restart
              </Button>
              <Button variant="danger" onClick={() => control(stopMonitor)} loading={busy}>
                Stop
              </Button>
            </div>
          )}
        </div>
      </div>

      {error && (
        <Alert tone="danger" className="mt-6" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* ── Funnel ─────────────────────────────────────────────────── */}
      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Screened" value={c.screened ?? 0} sub="every transaction" />
        <Stat
          label="Escalated"
          value={c.escalated ?? 0}
          sub={`${((c.escalation_rate ?? 0) * 100).toFixed(1)}% of stream`}
        />
        <Stat label="Alerts" value={c.alerts ?? 0} sub="fused, MEDIUM+" accent />
        <Stat label="Throughput" value={`${c.throughput_per_min ?? 0}`} sub="per minute" />
      </div>

      {/* ── Pipeline ───────────────────────────────────────────────── */}
      <div className="mt-4 rounded-2xl border border-subtle bg-surface p-5">
        <PipelineLive stages={snap?.stages} escalating={escalating} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <RuntimePanel runtime={runtime} />
        <div className="lg:col-span-2 grid gap-4 sm:grid-cols-2">
        {/* ── Alerts ───────────────────────────────────────────────── */}
        <section className="rounded-2xl border border-subtle bg-surface p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-slate-200">Open alerts</h2>
            <span className="text-[10px] text-slate-600">fused verdict ≥ MEDIUM</span>
          </div>

          {!snap?.alerts?.length ? (
            <p className="py-10 text-center text-xs text-slate-600">
              {running
                ? 'Nothing flagged yet. Most traffic is legitimate — that is the point.'
                : 'Start monitoring to screen the live stream.'}
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {snap.alerts.map((a) => (
                <li
                  key={a.transaction_id + a.at}
                  className="rounded-xl border border-subtle bg-sentinel-950 p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span
                      className={cx(
                        'rounded-md border px-2 py-0.5 text-[10px] font-bold',
                        severityColour(a.severity),
                      )}
                    >
                      {a.severity}
                    </span>
                    <span className="font-mono text-[10px] text-slate-600">
                      {a.transaction_id}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-300">
                    {a.pattern?.replace(/_/g, ' ') ?? 'pattern unknown'} · sink{' '}
                    <span className="font-mono">{a.sink_account ?? '—'}</span>
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-600">
                    <span>fused {a.fused_score}</span>
                    <span>graph {a.graph_score}</span>
                    <span>{a.modalities_used}/3 detectors</span>
                    <span>{Number(a.amount).toLocaleString()}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── Feed ─────────────────────────────────────────────────── */}
        <section className="rounded-2xl border border-subtle bg-surface p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-slate-200">Activity</h2>
            <span className="text-[10px] text-slate-600">newest first</span>
          </div>

          <ul className="mt-4 max-h-[26rem] space-y-1 overflow-y-auto pr-1">
            {feed.length === 0 && (
              <li className="py-10 text-center text-xs text-slate-600">
                Waiting for the stream…
              </li>
            )}
            {feed.map((e, i) => (
              <li
                key={`${e.transaction_id ?? e.kind}-${e.at}-${i}`}
                className="flex items-baseline gap-2 rounded-lg px-2 py-1.5 font-mono text-[11px] odd:bg-surface-raised"
              >
                <span
                  className={cx(
                    'w-[4.5rem] shrink-0 font-semibold',
                    e.kind === 'alert' && 'text-risk-critical',
                    e.kind === 'escalated' && 'text-accent-500',
                    e.kind === 'notification' && 'text-risk-medium',
                    !['alert', 'escalated', 'notification'].includes(e.kind) && 'text-slate-600',
                  )}
                >
                  {e.kind}
                </span>
                <span className="min-w-0 flex-1 truncate text-slate-400">
                  {e.kind === 'screened' &&
                    `${e.transaction_id} · ${e.risk_level} · ${e.graph_score}${e.escalated ? ' → escalate' : ''}`}
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
      </div>

      <p className="mt-6 text-center text-xs text-slate-600">
        Seeing something you want explained?{' '}
        <Link to="/assistant" className="text-accent-500 hover:text-accent-400">
          Ask the assistant
        </Link>{' '}
        — it reads this same live state.
      </p>
    </div>
  )
}
