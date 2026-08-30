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

/** A dependency that is not a detector: on, off, and what that costs. */
function ServiceRow({ label, svc }) {
  const ok = Boolean(svc?.ok)
  return (
    <div className="flex items-start justify-between gap-4 border-b py-2.5 last:border-b-0"
         style={{ borderColor: 'rgb(var(--ds-line))' }}>
      <div className="min-w-0">
        <p className="text-[13px] text-[rgb(var(--ds-ink))]">{label}</p>
        <p className="mt-0.5 text-[11px] leading-snug text-[rgb(var(--ds-muted))]">
          {svc?.detail ?? '—'}
        </p>
      </div>
      <span className="mt-1 h-2 w-2 shrink-0 rounded-full"
            style={{ background: ok ? 'rgb(var(--ds-sev-low))' : 'rgb(var(--ds-signal))' }}
            title={ok ? 'available' : 'unavailable'} />
    </div>
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
  const svc = rt?.services ?? {}
  const delivery = rt?.delivery ?? {}
  const queue = rt?.queue ?? {}
  const missed = delivery.raised != null && delivery.delivered != null
    ? delivery.raised - delivery.delivered : 0
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

      {/* The quiet failures. A detector going down is loud — a verdict stops
          appearing. These three stop nothing and change no number on the
          operations dashboard, which is why they need somewhere to be seen. */}
      <div className="mt-10 grid gap-4 lg:grid-cols-3">
        <Panel>
          <SectionHeading label="Are alerts arriving" title="Delivery" />
          {/* A handful of failures in a long run is an SMTP hiccup; a total
              of zero is a broken configuration. They read very differently to
              someone on call, so they are not phrased the same way. */}
          {missed > 0 && (
            <p className="mb-3 rounded-lg px-3 py-2 text-[12px] leading-relaxed"
               style={{
                 background: delivery.delivered === 0
                   ? 'rgb(var(--ds-signal-soft))' : 'rgb(var(--ds-warn-soft))',
                 color: delivery.delivered === 0
                   ? 'rgb(var(--ds-signal))' : 'rgb(var(--ds-warn))',
               }}>
              {delivery.delivered === 0
                ? `None of ${delivery.raised} alerts reached anyone. Screening is working; the mail is not.`
                : `${missed} of ${delivery.raised} alerts did not reach anyone. The rest were delivered.`}
            </p>
          )}
          <div className="flex items-baseline gap-2">
            <span className="numeric text-[2rem] leading-none"
                  style={{ color: delivery.raised && delivery.delivered === 0
                    ? 'rgb(var(--ds-signal))' : 'rgb(var(--ds-ink))' }}>
              {delivery.delivered ?? '—'}
            </span>
            <span className="text-[13px] text-[rgb(var(--ds-muted))]">
              {delivery.raised == null
                ? 'no alert record on this database'
                : `of ${delivery.raised.toLocaleString()} alerts delivered`}
            </span>
          </div>
          <dl className="mt-4">
            <ServiceRow label="SMTP"
                        svc={{ ok: delivery.configured,
                               detail: delivery.configured
                                 ? `sending as ${delivery.sending_as ?? 'unknown'}`
                                 : 'not configured — nothing can be sent' }} />
            <ServiceRow label="Recipients"
                        svc={{ ok: (delivery.recipients ?? 0) > 0,
                               detail: delivery.recipients
                                 ? `${delivery.recipients} risk manager${delivery.recipients > 1 ? 's' : ''} on the list`
                                 : 'nobody is listed — alerts have no destination' }} />
          </dl>
        </Panel>

        <Panel>
          <SectionHeading label="Not detectors" title="Supporting services" />
          <div>
            <ServiceRow label="Fusion model" svc={svc.fusion} />
            <ServiceRow label="Typology retrieval" svc={svc.retrieval} />
            <ServiceRow label="Report generator" svc={svc.reporter} />
            <ServiceRow label="Database" svc={svc.database} />
          </div>
        </Panel>

        <Panel>
          <SectionHeading label="Work waiting" title="Ingestion queue" />
          {queue.available ? (
            <>
              <div className="flex items-baseline gap-2">
                <span className="numeric text-[2rem] leading-none"
                      style={{ color: (queue.pending ?? 0) > 0
                        ? 'rgb(var(--ds-warn))' : 'rgb(var(--ds-ink))' }}>
                  {queue.pending ?? 0}
                </span>
                <span className="text-[13px] text-[rgb(var(--ds-muted))]">waiting</span>
              </div>
              <dl className="mt-4">
                <ServiceRow label="In flight"
                            svc={{ ok: true, detail: `${queue.claimed ?? 0} claimed by the monitor` }} />
                <ServiceRow label="Completed"
                            svc={{ ok: true, detail: `${(queue.screened ?? 0).toLocaleString()} screened` }} />
                <ServiceRow label="Failed"
                            svc={{ ok: (queue.failed ?? 0) === 0,
                                   detail: (queue.failed ?? 0) === 0
                                     ? 'none' : `${queue.failed} could not be screened` }} />
              </dl>
            </>
          ) : (
            <p className="text-[12px] leading-relaxed text-[rgb(var(--ds-muted))]">
              No ingestion queue. The monitor is replaying sample transactions rather
              than reading submitted traffic, so there is no backlog to report.
            </p>
          )}
        </Panel>
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
