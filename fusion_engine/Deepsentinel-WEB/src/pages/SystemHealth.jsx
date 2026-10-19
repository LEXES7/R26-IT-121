import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ConsoleShell, { Footer } from '../components/ConsoleShell'
import { G, Glyph, Person, Statistics, compact } from '../components/DashKit'
import { getMonitorRuntime, listCases } from '../services/api'
import { Alert } from '../components/ui'

/**
 * The administrator's home: is the system working, and if not, which part.
 *
 * Deliberately shows no case data. On a real deployment the people with this
 * role are the client's IT department; they keep the detectors running and
 * they have no business reading financial-crime cases. What they need is the
 * opposite of what an investigator needs: not "what did we catch" but "what is
 * answering, what is loaded, and what broke". The one chart is alert volume,
 * raised against delivered, built from timestamps alone.
 *
 * Detector state is read from /api/monitor/runtime, which probes each
 * detector rather than trusting a registry.
 */

const DETECTOR_PAGE = {
  graph: '/graph',
  behavioural: '/lab/behaviour',
  temporal: '/lab/timing',
}

const DETECTORS = [
  ['graph', 'Network', 'Edge-Enhanced GraphSAGE', 'Relational structure around the transaction', 'rgb(var(--modality-graph))', 'N'],
  ['behavioural', 'Behaviour', 'Stratified VAE + DSAA', 'How the transaction fits its own type', 'rgb(var(--modality-behavioral))', 'B'],
  ['temporal', 'Timing', 'Transaction-Sequence TCN', 'The 32 transactions it arrived among', 'rgb(var(--modality-temporal))', 'T'],
]

// The most rows /cases returns in one call.
const HISTORY = 200

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
      why: `Needs a full window before it can score: ${filled} of ${size} buffered.`,
    }
  }
  if (!d.ready) return { tone: 'warm', label: 'Not ready', why: 'Reachable, but reports it cannot score yet.' }
  return { tone: 'ok', label: 'Serving', why: null }
}

const TONE = {
  ok: 'rgb(var(--ds-sev-low))',
  warm: 'rgb(var(--ds-warn))',
  down: 'rgb(var(--ds-signal))',
}

/** Seconds as a running clock under a day, and in days beyond it. */
function clock(s) {
  if (s == null || Number.isNaN(s)) return null
  const n = Math.max(0, Math.floor(s))
  if (n >= 86400) return `${Math.floor(n / 86400)}d ${Math.floor((n % 86400) / 3600)}h`
  const p = (v) => String(v).padStart(2, '0')
  return `${p(Math.floor(n / 3600))}:${p(Math.floor((n % 3600) / 60))}:${p(n % 60)}`
}

/** What each detector carries that can be drawn as dots: a window filling, or strata loaded. */
function slots(id, d) {
  if (!d) return null
  if (id === 'temporal' && (d.window_size || d.buffer_filled != null)) {
    const size = Number(d.window_size ?? 32)
    const filled = d.ready && !d.warming_up ? size : Number(d.buffer_filled ?? 0)
    return { caption: `${Math.min(filled, size)} of ${size} in the window`,
             dots: Array.from({ length: size }, (_, i) => i < filled), newest: Math.min(filled, size) - 1 }
  }
  if (id === 'behavioural') {
    const list = (v) => (Array.isArray(v) ? v : typeof v === 'object' && v ? Object.keys(v) : [])
    const loaded = list(d.strata_loaded)
    const missing = list(d.strata_missing)
    if (loaded.length + missing.length) {
      return { caption: `${loaded.length} of ${loaded.length + missing.length} strata loaded`,
               dots: [...loaded.map(() => true), ...missing.map(() => false)],
               titles: [...loaded, ...missing.map((m) => `${m} (missing)`)] }
    }
  }
  return null
}

function DetectorCard({ id, name, model, what, colour, glyph, d, age, go }) {
  const v = verdict(d)
  const up = (d?.service_uptime_seconds ?? d?.startup_seconds ?? d?.model?.uptime_seconds)
  const scored = d?.transactions_scored ?? d?.model?.inferences
  const lat = d?.mean_latency_ms ?? d?.model?.mean_latency_ms
  const graph = d?.precomputed
  const s = slots(id, d)
  return (
    <div className="dash-card dash-case" role="link" tabIndex={0}
         onClick={() => go(DETECTOR_PAGE[id])}
         onKeyDown={(e) => e.key === 'Enter' && go(DETECTOR_PAGE[id])}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
        <div className="dash-avatar" style={{ color: colour, background: `color-mix(in srgb, ${colour} 16%, transparent)`,
                                              boxShadow: `inset 0 0 0 2px ${colour}`, fontSize: 18 }}>
          {glyph}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'rgb(var(--ds-ink))' }}>{name}</div>
          {up != null && (
            <span className="dash-timer" title="Serving for"><Glyph d={G.clock} size={11} />{clock(Number(up) + age)}</span>
          )}
        </div>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12,
                       fontWeight: 600, color: TONE[v.tone], whiteSpace: 'nowrap' }}>
          <span style={{ width: 8, height: 8, borderRadius: 99, background: TONE[v.tone] }} />{v.label}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 18, marginTop: 18, flexWrap: 'wrap' }}>
        <span className="dash-stat"><Glyph d={G.bolt} />{lat != null ? `${Number(lat).toFixed(1)} ms` : 'no latency yet'}</span>
        <span className="dash-stat"><Glyph d={G.layers} />{scored != null ? `${compact(Number(scored))} scored` : '—'}</span>
      </div>
      <div className="dash-sep" />
      <div className="ds-mono" style={{ fontSize: 12, color: 'rgb(var(--ds-muted))', marginBottom: 12 }}>{model}</div>
      {s ? (
        <>
          <div className="dash-dots" role="img" aria-label={s.caption}>
            {s.dots.map((on, i) => (
              <span key={i} className="dash-dot" title={s.titles?.[i]}
                    style={on ? { background: i === s.newest ? 'rgb(var(--dash-line))' : 'rgb(var(--dash-dot))' }
                      : { border: '2px solid rgb(var(--ds-faint))' }} />
            ))}
          </div>
          <div style={{ fontSize: 12, color: 'rgb(var(--ds-faint))', marginTop: 8 }}>{s.caption}</div>
        </>
      ) : graph ? (
        <div style={{ fontSize: 14, color: 'rgb(var(--ds-ink))', lineHeight: 1.5 }}>
          {compact(graph.accounts)} accounts, {compact(graph.transactions)} transfers in the served graph
        </div>
      ) : (
        <div style={{ fontSize: 14, color: 'rgb(var(--ds-muted))', lineHeight: 1.5 }}>{what}</div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 16, fontSize: 12 }}>
        <span style={{ color: v.why ? TONE[v.tone] : 'rgb(var(--ds-muted))', minWidth: 0 }}>
          {v.why ?? 'Scoring every transaction'}
        </span>
        <span style={{ color: 'rgb(var(--dash-line-ink))', fontWeight: 600, whiteSpace: 'nowrap' }}>Open →</span>
      </div>
    </div>
  )
}

/**
 * The page body, from data alone, so it can be looked at with recorded data
 * and a slow endpoint never blanks the page.
 */
export function SystemBoard({ rt, history, at, now, go, onRefresh }) {
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
  const age = at ? (now - at) / 1000 : 0

  // Timestamps only: when an alert was raised, and whether it was delivered.
  // Raised is the same rule the delivery figures use, a verdict above Low.
  const events = useMemo(() => (history ?? [])
    .filter((x) => x.classification !== 'LOW')
    .map((x) => ({ t: Date.parse(x.detected_at), b: x.alert_sent === true }))
    .filter((e) => !Number.isNaN(e.t)), [history])

  const services = [
    ['Fusion model', svc.fusion, G.layers],
    ['Typology retrieval', svc.retrieval, G.search],
    ['Report generator', svc.reporter, G.score],
    ['Database', svc.database, G.server],
  ]

  return (
    <div className="dash ds-fade-up">
      <div className="dash-chips">
        <span className="dash-chip">
          <span className={screening ? 'hero-pulse' : ''}
                style={screening ? undefined : { width: 8, height: 8, borderRadius: 99,
                  background: mon.running ? 'rgb(var(--ds-warn))' : 'rgb(var(--ds-signal))' }} />
          <b style={{ fontSize: 14 }}>{rt ? state : 'Checking'}</b>
          {screening && <span>{mon.throughput_per_min ?? 0}/min</span>}
        </span>
        <span className="dash-chip" title={`${live} of 3 detectors can score`}>
          <span className="dash-faces">
            {DETECTORS.map(([id, name, , , colour, glyph]) => {
              const ok = verdict(det[id]).tone === 'ok'
              return (
                <span key={id} className="dash-face" title={`${name}: ${verdict(det[id]).label}`}
                      style={{ background: ok ? colour : 'rgb(var(--ds-surface-3))',
                               color: ok ? '#0D0C0B' : 'rgb(var(--ds-faint))', fontSize: 11, fontWeight: 700 }}>
                  {glyph}
                </span>
              )
            })}
          </span>
          <b>{rt ? `${live} of 3` : '—'}</b> serving
        </span>
        <span className="dash-chip">
          <Glyph d={G.mail} size={16} />
          <b>{delivery.delivered ?? '—'}</b>
          {delivery.raised != null ? `of ${delivery.raised.toLocaleString()} alerts delivered` : 'alerts delivered'}
        </span>
        <button className="dash-chip" style={{ cursor: 'pointer' }} onClick={onRefresh}
                title="Probe every service again">
          <Glyph d={G.refresh} size={16} />
          {at ? `checked ${new Date(at).toLocaleTimeString()}` : 'Refresh'}
        </button>
      </div>

      <div className="dash-row">
        <div style={{ minWidth: 0 }}>
          <Statistics events={events} now={now} cap={HISTORY} failed={history === null}
                      labels={{ a: 'Alerts raised', b: 'Delivered' }} />

          <div className="dash-head" style={{ marginTop: 36 }}>
            <h2 className="dash-h">Detectors</h2>
            <span style={{ fontSize: 13, color: 'rgb(var(--ds-faint))' }}>
              {broken.length ? 'A detector that cannot answer abstains; screening does not stop.'
                : 'Each scores every transaction in parallel'}
            </span>
          </div>
          <div className="dash-cases">
            {DETECTORS.map(([id, name, model, what, colour, glyph]) => (
              <DetectorCard key={id} id={id} name={name} model={model} what={what} colour={colour}
                            glyph={glyph} d={det[id]} age={age} go={go} />
            ))}
          </div>
        </div>

        <aside style={{ minWidth: 0 }}>
          <div className="dash-head"><h2 className="dash-h">Services</h2></div>
          {services.map(([label, s, glyph]) => (
            <Person key={label}
                    colour={s?.ok ? 'rgb(var(--ds-sev-low))' : 'rgb(var(--ds-signal))'}
                    mark={<Glyph d={glyph} size={18} />}
                    name={label}
                    sub={s?.detail ?? '—'}
                    badge={s ? (s.ok ? 'up' : 'down') : null} badgeAlert={s ? !s.ok : false} />
          ))}

          <div className="dash-head" style={{ marginTop: 30 }}><h2 className="dash-h">Delivery</h2></div>
          {missed > 0 && (
            <p style={{ margin: '0 0 10px', borderRadius: 16, padding: '10px 14px', fontSize: 13, lineHeight: 1.5,
                        background: delivery.delivered === 0 ? 'rgb(var(--ds-signal-soft))' : 'rgb(var(--ds-warn-soft))',
                        color: delivery.delivered === 0 ? 'rgb(var(--ds-signal))' : 'rgb(var(--ds-warn))' }}>
              {delivery.delivered === 0
                ? `None of ${delivery.raised} alerts reached anyone. Screening is working; the mail is not.`
                : `${missed} of ${delivery.raised} alerts did not reach anyone. The rest were delivered.`}
            </p>
          )}
          <Person colour={delivery.configured ? 'rgb(var(--ds-sev-low))' : 'rgb(var(--ds-signal))'}
                  mark={<Glyph d={G.mail} size={18} />} name="SMTP"
                  sub={delivery.configured ? `sending as ${delivery.sending_as ?? 'unknown'}` : 'not configured; nothing can be sent'}
                  badge={rt ? (delivery.configured ? 'up' : 'down') : null} badgeAlert={rt ? !delivery.configured : false}
                  onClick={() => go('/settings')} />
          <Person colour={(delivery.recipients ?? 0) > 0 ? 'rgb(var(--ds-sev-low))' : 'rgb(var(--ds-signal))'}
                  mark={<Glyph d={G.accounts} size={18} />} name="Recipients"
                  sub={delivery.recipients
                    ? `${delivery.recipients} risk manager${delivery.recipients > 1 ? 's' : ''} on the list`
                    : 'nobody is listed; alerts have no destination'}
                  badge={rt ? String(delivery.recipients ?? 0) : null} badgeAlert={rt ? !delivery.recipients : false}
                  onClick={() => go('/settings')} />

          <div className="dash-hero" style={{ marginTop: 26 }}>
            <div className="dash-faces" style={{ justifyContent: 'center' }}>
              {DETECTORS.map(([id, , , , colour, glyph]) => (
                <span key={id} className="dash-face" style={{ background: colour, color: '#0D0C0B',
                      borderColor: '#C2F2EC', fontSize: 11, fontWeight: 700, width: 32, height: 32 }}>{glyph}</span>
              ))}
            </div>
            <div className="dash-hero-num">{rt ? `+${compact(Number(mon.screened ?? 0))}` : '—'}</div>
            <div className="dash-hero-sub">
              transactions screened since the monitor last started
              {mon.uptime_seconds != null ? `, ${clock(Number(mon.uptime_seconds) + (mon.running ? age : 0))} ago` : ''}
            </div>
          </div>
        </aside>
      </div>

      <div className="dash-row">
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', minWidth: 0 }}>
          {[
            ['/monitor', 'Live monitor', 'Watch the pipeline and start, pause or stop screening.', G.score],
            ['/thresholds', 'Thresholds', 'Where a fused verdict becomes medium, high or critical.', G.layers],
            ['/settings', 'Administration', 'Alerting, people, audit trail and account.', G.server],
          ].map(([to, label, desc, glyph]) => (
            <button key={to} className="dash-card dash-case"
                    style={{ textAlign: 'left', font: 'inherit', color: 'inherit', display: 'flex',
                             flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'flex-start' }}
                    onClick={() => go(to)}>
              <span className="dash-avatar" style={{ width: 44, height: 44, color: 'rgb(var(--dash-line-ink))',
                    background: 'rgb(var(--dash-line) / .16)' }}>
                <Glyph d={glyph} size={19} />
              </span>
              <div style={{ fontSize: 18, fontWeight: 600, marginTop: 14 }}>{label}</div>
              <div style={{ fontSize: 14, lineHeight: 1.5, color: 'rgb(var(--ds-muted))', marginTop: 4 }}>{desc}</div>
            </button>
          ))}
        </div>

        <div className="dash-card" style={{ padding: 22 }}>
          <div className="dash-head" style={{ marginBottom: 12 }}>
            <h2 className="dash-h dash-h-sm">Ingestion</h2>
            <span style={{ fontSize: 12, color: 'rgb(var(--ds-faint))' }}>
              {!mon.running ? 'fusion idle' : mon.fusion === 'meta_classifier' ? 'trained fusion' : 'averaging fallback'}
            </span>
          </div>
          {queue.available ? (
            <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
              {[['Waiting', queue.pending ?? 0, (queue.pending ?? 0) > 0],
                ['In flight', queue.claimed ?? 0, false],
                ['Screened', compact(queue.screened ?? 0), false],
                ['Failed', queue.failed ?? 0, (queue.failed ?? 0) > 0]].map(([l, v, warn]) => (
                <div key={l}>
                  <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-.03em',
                                color: warn ? 'rgb(var(--ds-warn))' : 'rgb(var(--ds-ink))' }}>{v}</div>
                  <div className="ds-section-label" style={{ marginTop: 4 }}>{l}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 13, lineHeight: 1.6, color: 'rgb(var(--ds-muted))' }}>
              No ingestion queue. The monitor is replaying sample transactions rather than reading
              submitted traffic, so there is no backlog to report.
            </div>
          )}
        </div>
      </div>

      <Footer left="Detector state is probed live; nothing here is read from a registry." />
    </div>
  )
}

export default function SystemHealth() {
  const navigate = useNavigate()
  const [rt, setRt] = useState(null)
  const [error, setError] = useState(null)
  const [at, setAt] = useState(null)
  const [history, setHistory] = useState(undefined)
  const [now, setNow] = useState(() => Date.now())

  const load = useCallback(async () => {
    try {
      setRt(await getMonitorRuntime())
      setError(null)
      setAt(Date.now())
    } catch (e) {
      setError(e?.message ?? 'Could not reach the platform API.')
    }
  }, [])

  // Alert history moves slowly and is the heaviest call, so it is read less often.
  const loadHistory = useCallback(() => {
    listCases({ limit: HISTORY }).then((r) => setHistory(r.cases ?? [])).catch(() => setHistory(null))
  }, [])

  useEffect(() => {
    load()
    loadHistory()
    const t = setInterval(load, 15000)
    const h = setInterval(loadHistory, 60000)
    return () => { clearInterval(t); clearInterval(h) }
  }, [load, loadHistory])

  // The uptime clocks run between probes.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const det = rt?.detectors ?? {}
  const live = DETECTORS.filter(([k]) => verdict(det[k]).tone === 'ok').length
  const broken = DETECTORS.filter(([k]) => verdict(det[k]).tone === 'down')

  return (
    <ConsoleShell
      eyebrow="Workspace / Operate"
      title={rt
        ? <>System health. <em>{broken.length
            ? `${broken.map(([, n]) => n).join(' and ')} down.`
            : `${live} of 3 detectors serving.`}</em></>
        : 'System health'}
    >
      {error && <Alert tone="error" className="mb-6">{error}</Alert>}
      <SystemBoard rt={rt} history={history} at={at} now={now} go={navigate}
                   onRefresh={() => { load(); loadHistory() }} />
    </ConsoleShell>
  )
}
