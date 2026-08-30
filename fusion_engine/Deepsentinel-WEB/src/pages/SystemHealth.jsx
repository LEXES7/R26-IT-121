import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ConsoleShell, { Panel, SectionHeading, Metric } from '../components/ConsoleShell'
import { getMonitorRuntime } from '../services/api'
import { Alert, Button, cx } from '../components/ui'

/**
 * The administrator's home: is the system working, and if not, which part.
 *
 * Deliberately contains no case data. On a real deployment the people with
 * this role are the client's IT department; they keep the detectors running
 * and they have no business reading financial-crime cases. What they need is
 * the opposite of what an investigator needs — not "what did we catch" but
 * "what is answering, what is loaded, and what broke".
 *
 * Everything here is read from /api/monitor/runtime, which probes each
 * detector rather than trusting a registry.
 */

const DETECTORS = [
  ['graph', 'Network', 'Edge-Enhanced GraphSAGE', 'Relational structure around the transaction'],
  ['behavioural', 'Behaviour', 'Stratified VAE + DSAA', 'How the transaction fits its own type'],
  ['temporal', 'Timing', 'Transaction-Sequence TCN', 'The 32 transactions it arrived among'],
]

function secs(v) {
  if (v == null) return null
  const s = Number(v)
  if (s < 90) return `${Math.round(s)}s`
  if (s < 5400) return `${Math.round(s / 60)}m`
  if (s < 172800) return `${Math.round(s / 3600)}h`
  return `${Math.round(s / 86400)}d`
}

/** The one line that matters per detector: can it score right now, and why not. */
function verdict(d) {
  if (!d) return { tone: 'down', label: 'No answer', why: 'The service did not respond to the probe.' }
  if (!d.reachable) return { tone: 'down', label: 'Unreachable', why: 'Nothing is listening on its address.' }
  if (d.load_error) return { tone: 'down', label: 'Loaded with errors', why: d.load_error }
  if (d.warming_up) {
    const filled = d.buffer_filled ?? 0
    const size = d.window_size ?? 32
    return {
      tone: 'warm', label: 'Warming up',
      why: `Needs a full window before it can score — ${filled} of ${size} buffered.`,
    }
  }
  if (!d.ready) return { tone: 'warm', label: 'Not ready', why: 'Reachable, but reports it cannot score yet.' }
  return { tone: 'ok', label: 'Serving', why: null }
}

const TONE = {
  ok:   { dot: 'rgb(var(--ds-sev-low))', text: 'rgb(var(--ds-sev-low))' },
  warm: { dot: 'rgb(var(--ds-warn))', text: 'rgb(var(--ds-warn))' },
  down: { dot: 'rgb(var(--ds-signal))', text: 'rgb(var(--ds-signal))' },
}

function DetectorCard({ id, name, model, what, data }) {
  const v = verdict(data)
  const tone = TONE[v.tone]
  const version = data?.model_version ?? data?.model?.stage ?? null
  const latency = data?.mean_latency_ms ?? data?.model?.mean_latency_ms
  const scored = data?.transactions_scored ?? data?.model?.inferences

  return (
    <Panel>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: tone.dot }} />
            <h3 className="text-[15px] font-semibold text-[rgb(var(--ds-ink))]">{name}</h3>
          </div>
          <p className="mt-1 text-[12px] text-[rgb(var(--ds-muted))]">{what}</p>
        </div>
        <span className="shrink-0 font-mono text-[11px] font-semibold uppercase tracking-[0.09em]"
              style={{ color: tone.text }}>
          {v.label}
        </span>
      </div>

      {v.why && (
        <p className="mt-3 rounded-lg px-3 py-2 text-[12px] leading-relaxed"
           style={{ background: 'rgb(var(--ds-surface-2))', color: 'rgb(var(--ds-muted))' }}>
          {v.why}
        </p>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3">
        {[
          ['Model', version ?? '—'],
          ['Service up', secs(data?.service_uptime_seconds ?? data?.startup_seconds) ?? '—'],
          ['Scored', scored != null ? Number(scored).toLocaleString() : '—'],
          ['Mean latency', latency != null ? `${Number(latency).toFixed(1)} ms` : '—'],
        ].map(([k, val]) => (
          <div key={k} className="min-w-0">
            <dt className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-[rgb(var(--ds-faint))]">
              {k}
            </dt>
            <dd className="numeric mt-0.5 truncate text-[13px] text-[rgb(var(--ds-ink))]">{val}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-3 font-mono text-[10px] text-[rgb(var(--ds-faint))]">{model}</p>
    </Panel>
  )
}

export default function SystemHealth() {
  const navigate = useNavigate()
  const [rt, setRt] = useState(null)
  const [error, setError] = useState(null)
  const [at, setAt] = useState(null)

  const load = useCallback(async () => {
    try {
      setRt(await getMonitorRuntime())
      setError(null)
      setAt(new Date())
    } catch (e) {
      setError(e?.message ?? 'Could not reach the platform API.')
    }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 15000)
    return () => clearInterval(t)
  }, [load])

  const det = rt?.detectors ?? {}
  const mon = rt?.monitor ?? {}
  const live = DETECTORS.filter(([k]) => verdict(det[k]).tone === 'ok').length
  const broken = DETECTORS.filter(([k]) => verdict(det[k]).tone === 'down')

  const screening = mon.running && !mon.paused
  const state = !mon.running ? 'Stopped' : mon.paused ? 'Paused' : 'Screening'

  return (
    <ConsoleShell
      eyebrow="Workspace / Operate"
      title="System"
      subtitle="What is running, what is loaded, and what broke."
      actions={
        <Button variant="ghost" onClick={load}>Refresh</Button>
      }
    >
      {error && <Alert tone="error" className="mb-6">{error}</Alert>}

      {/* The headline is the answer to "is it working", not a count. */}
      <div className="mb-8">
        <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[rgb(var(--ds-faint))]">
          Detector readiness
        </p>
        <h2 className="ds-page-title mt-2 text-[2.4rem] leading-none">
          {live} of 3 serving.{' '}
          <span style={{ color: broken.length ? 'rgb(var(--ds-signal))' : 'rgb(var(--ds-muted))' }}>
            {broken.length
              ? `${broken.map(([, n]) => n).join(' and ')} down.`
              : 'All answering.'}
          </span>
        </h2>
        <p className="mt-3 max-w-xl text-[13px] leading-relaxed text-[rgb(var(--ds-muted))]">
          {broken.length > 0
            ? 'A detector that cannot answer abstains — the others still produce a verdict, and the '
              + 'fused confidence is reduced to say the system knows less than usual. Screening does '
              + 'not stop.'
            : 'All three detectors are scoring every transaction in parallel. The fused verdict is '
              + 'computed from three signals.'}
        </p>
      </div>

      <div className="mb-9 grid gap-3"
           style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
        <Metric label="Pipeline" value={state}
                tone={screening ? 'accent' : mon.running ? 'warn' : 'alert'}
                meta={screening ? `${mon.throughput_per_min ?? 0}/min` : 'not screening'} />
        <Metric label="Screened" value={Number(mon.screened ?? 0).toLocaleString()}
                meta="since last start" />
        <Metric label="Uptime" value={secs(mon.uptime_seconds) ?? '—'} meta="monitor process" />
        {/* Only meaningful once the monitor has started. Reported unconditionally
            it said "Averaging" on a stopped pipeline, which reads as "the
            meta-classifier failed to load" rather than "nothing has run yet". */}
        <Metric label="Fusion"
                value={!mon.running ? 'Idle' : mon.fusion === 'meta_classifier' ? 'Trained' : 'Averaging'}
                tone={!mon.running ? '' : mon.fusion === 'meta_classifier' ? '' : 'warn'}
                meta={!mon.running ? 'known once screening starts'
                  : mon.fusion === 'meta_classifier' ? 'meta-classifier loaded'
                  : 'falling back to the mean'} />
      </div>

      <SectionHeading
        label="Reachability"
        title="Detectors"
        action={at && (
          <span className="font-mono text-[10px] text-[rgb(var(--ds-faint))]">
            checked {at.toLocaleTimeString()}
          </span>
        )}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        {DETECTORS.map(([id, name, model, what]) => (
          <DetectorCard key={id} id={id} name={name} model={model} what={what} data={det[id]} />
        ))}
      </div>

      <div className="mt-10">
        <SectionHeading label="Controls" title="Operate" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ['/monitor', 'Live monitor', 'Watch the pipeline and start, pause or stop screening.'],
          ['/thresholds', 'Thresholds', 'Where a fused verdict becomes medium, high or critical.'],
          ['/settings', 'Administration', 'Alerting, people, audit trail and account.'],
        ].map(([to, label, desc]) => (
          <button
            key={to}
            onClick={() => navigate(to)}
            className={cx(
              'rounded-xl border p-4 text-left transition-colors',
              'border-[rgb(var(--ds-line))] hover:border-[rgb(var(--ds-accent))]',
            )}
            style={{ background: 'rgb(var(--ds-surface))' }}
          >
            <p className="text-[14px] font-semibold text-[rgb(var(--ds-ink))]">{label}</p>
            <p className="mt-1 text-[12px] leading-relaxed text-[rgb(var(--ds-muted))]">{desc}</p>
          </button>
        ))}
      </div>
    </ConsoleShell>
  )
}
