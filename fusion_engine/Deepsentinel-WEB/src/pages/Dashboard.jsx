import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getMonitorRuntime, getMonitorState, listCases, reviewCase, startMonitor,
} from '../services/api'
import { useAuth } from '../context/AuthContext'
import NetworkGraph from '../components/NetworkGraph'
import ConsoleShell, {
  Badge, Footer, Metric, Panel, Progress, SectionHeading, Ticker,
} from '../components/ConsoleShell'

/**
 * The operator's home.
 *
 * Three questions in order: is anything waiting for me, is the system
 * actually working, and what does the worst case look like. Everything here
 * is read from a live endpoint — a figure that cannot be determined renders
 * as an em dash, never as zero, because "nothing happened" and "we could not
 * reach the service" must never look the same.
 *
 * The queue comes first and sits beside the live feed, under a sign that says
 * in one line what the monitor is doing: the page is read from the top, and
 * the top is where the decisions are.
 */

const SEV = {
  CRITICAL: { hex: 'rgb(var(--ds-signal))', label: 'Critical', rank: 4, tone: 'alert' },
  HIGH:     { hex: 'rgb(var(--ds-warn))',   label: 'High',     rank: 3, tone: 'warn' },
  MEDIUM:   { hex: 'rgb(var(--ds-warn))',   label: 'Medium',   rank: 2, tone: 'warn' },
  LOW:      { hex: 'rgb(var(--ds-accent))', label: 'Low',      rank: 1, tone: 'good' },
}
const ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']

const MODELS = [
  { keys: ['graph'], label: 'GraphSAGE', sub: 'network structure' },
  { keys: ['behavioural', 'behavioral'], label: 'Stratified VAE', sub: 'account behaviour' },
  { keys: ['temporal'], label: 'Sequence TCN', sub: 'timing and order' },
]
const pick = (o, keys) => keys.map((k) => o?.[k]).find((v) => v !== undefined)

// The three detectors' own scores on a case, in the order used everywhere.
const READINGS = [
  ['graph_score', 'graph_available', 'rgb(var(--modality-graph))', 'Network'],
  ['behavioral_score', 'behavioral_available', 'rgb(var(--modality-behavioral))', 'Behaviour'],
  ['temporal_score', 'temporal_available', 'rgb(var(--modality-temporal))', 'Timing'],
]

const FILTERS = [['all', 'All'], ['CRITICAL', 'Critical'], ['HIGH', 'High'], ['MEDIUM', 'Medium']]

const num = (v) => (typeof v === 'number' ? v.toLocaleString() : null)
const since = (iso) => {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const m = Math.round((Date.now() - t) / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  return h < 24 ? `${h} hr ago` : `${Math.floor(h / 24)}d ago`
}
const greeting = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

/** Three small bars: what each detector scored. An absent one is a stub. */
function Readings({ c }) {
  return (
    <span className="inline-flex items-end gap-[3px]" style={{ height: 22 }}
          aria-label={READINGS.map(([k, a, , n]) =>
            `${n} ${c[a] === false || typeof c[k] !== 'number' ? 'did not answer' : c[k].toFixed(2)}`).join(', ')}>
      {READINGS.map(([k, a, colour]) => {
        const v = c[a] === false || typeof c[k] !== 'number' ? null : c[k]
        return (
          <span key={k} style={{
            width: 6, borderRadius: 2,
            height: v === null ? 3 : `${Math.max(8, v * 100)}%`,
            background: v === null ? 'rgb(var(--ds-surface-3))' : colour,
          }} />
        )
      })}
    </span>
  )
}

/** The top of the planet the site's hero shows, as the live card's header. */
function Planet({ live }) {
  return (
    <div style={{ position: 'relative', height: 150, overflow: 'hidden', borderRadius: '20px 20px 0 0',
                  background: 'radial-gradient(ellipse 80% 70% at 50% 100%, rgb(15 155 142 / .35), rgb(13 12 11 / 0) 70%), #0b0a09' }}>
      <svg viewBox="40 60 520 260" aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        <defs>
          <radialGradient id="dash-planet" cx="36%" cy="26%" r="80%">
            <stop offset="0" stopColor="#1d3b37" /><stop offset=".45" stopColor="#14110f" /><stop offset="1" stopColor="#0b0a09" />
          </radialGradient>
        </defs>
        <circle cx="300" cy="300" r="231" fill="url(#dash-planet)" />
        <circle cx="300" cy="300" r="231" fill="none" stroke="rgb(45 212 191 / .55)" strokeWidth="1.4" />
        <g fill="none" stroke="rgb(255 255 255 / .09)">
          <ellipse cx="300" cy="226.9" rx="216.1" ry="80.2" /><ellipse cx="300" cy="162.7" rx="176.2" ry="65.4" />
          <ellipse cx="300" cy="115" rx="115" ry="42.7" />
        </g>
        <g fill="none" stroke="rgb(255 255 255 / .1)">
          <ellipse className="mer" cx="300" cy="300" rx="230" ry="214" />
          <ellipse className="mer" style={{ animationDelay: '-4.67s' }} cx="300" cy="300" rx="230" ry="214" />
          <ellipse className="mer" style={{ animationDelay: '-9.33s' }} cx="300" cy="300" rx="230" ry="214" />
        </g>
        {live && (
          <g fill="none" strokeWidth="2" strokeLinecap="round">
            <path className="art-flow" d="M473,253.4 Q394.3,61 228.1,160.6" stroke="#2DD4BF" />
            <path className="art-flow" d="M486.1,304 Q459.3,65 299.4,102.3" stroke="#FF6B6B" />
          </g>
        )}
      </svg>
      <span style={{ position: 'absolute', left: 14, top: 12, display: 'inline-flex', alignItems: 'center', gap: 7,
                     borderRadius: 99, padding: '5px 11px', fontSize: 12, color: '#D6D1C9',
                     background: 'rgb(13 12 11 / .6)', border: '1px solid rgb(255 255 255 / .12)' }}>
        <span className={live ? 'hero-pulse' : ''}
              style={live ? undefined : { width: 7, height: 7, borderRadius: 99, background: '#857E75' }} />
        {live ? 'Screening live' : 'Monitor stopped'}
      </span>
    </div>
  )
}

export default function Dashboard() {
  const { user, canControlPipeline } = useAuth()
  const navigate = useNavigate()
  const [state, setState] = useState(null)
  const [runtime, setRuntime] = useState(null)
  const [cases, setCases] = useState([])
  const [openCount, setOpenCount] = useState(null)
  const [starting, setStarting] = useState(false)
  const [deciding, setDeciding] = useState(null)
  const [filter, setFilter] = useState('all')

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
  // `ready`, not `reachable`: a service that answers a health probe but has no
  // weights cannot score, and counting it overstates the system.
  const liveCount = MODELS.filter(({ keys }) => pick(detectors, keys)?.ready).length

  const bySeverity = useMemo(() => {
    const acc = {}
    cases.forEach((x) => { acc[x.classification] = (acc[x.classification] || 0) + 1 })
    return acc
  }, [cases])

  // Worst first. Ordered by arrival, a triage list opens on a run of LOWs and
  // buries the cases that actually need a person.
  const awaiting = useMemo(() => cases
    .filter((x) => (x.review_status ?? 'open') === 'open')
    .sort((a, b) =>
      (SEV[b.classification]?.rank ?? 0) - (SEV[a.classification]?.rank ?? 0)
      || (b.fused_score ?? 0) - (a.fused_score ?? 0)
      || Date.parse(b.detected_at) - Date.parse(a.detected_at)),
  [cases])
  const shown = filter === 'all' ? awaiting : awaiting.filter((x) => x.classification === filter)

  // Severity leads; among equals, the one with more network to show wins.
  const featured = useMemo(() => {
    const g = cases.filter((x) => (x.graph_evidence?.nodes?.length ?? 0) >= 2)
    if (!g.length) return null
    const rank = (x) => (SEV[x.classification]?.rank ?? 0) * 1000
      + Math.min(x.graph_evidence.nodes.length, 40) * 10 + (x.fused_score ?? 0)
    return [...g].sort((a, b) => rank(b) - rank(a))[0]
  }, [cases])

  // What the monitor has screened most recently, newest first.
  const feed = useMemo(() => (state?.events ?? [])
    .filter((e) => e.kind === 'screened' && e.transaction_id)
    .slice(-6).reverse(), [state])

  // Typologies across the cases in view: what the retrieval actually matched.
  const typologies = useMemo(() => {
    const acc = {}
    cases.forEach((x) => {
      const t = (x.typology_name ?? x.graph_pattern ?? '').toString().replace(/_/g, ' ').trim()
      if (t) acc[t] = (acc[t] || 0) + 1
    })
    return Object.entries(acc).sort((a, b) => b[1] - a[1]).slice(0, 5)
  }, [cases])

  const decide = useCallback(async (x, verdict) => {
    setDeciding(x.case_ref)
    try {
      await reviewCase(x.case_ref, verdict)
      setCases((list) => list.filter((r) => r.case_ref !== x.case_ref))
      setOpenCount((n) => (typeof n === 'number' ? Math.max(n - 1, 0) : n))
    } finally {
      setDeciding(null)
    }
  }, [])

  const name = (user?.full_name || user?.username || '')
    .replace(/deepsentinel/i, '').trim().split(' ')[0]
  const today = new Date().toLocaleDateString(undefined,
    { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  const title = openCount
    ? <>{greeting()}. <em>{openCount} case{openCount === 1 ? '' : 's'} need{openCount === 1 ? 's' : ''} your review.</em></>
    : running
      ? <>{greeting()}. <em>Nothing is waiting.</em></>
      : <>Screening is <em>turned off.</em></>

  // The sign: only what is known right now, phrased for a glance.
  const newest = cases[0]
  const sign = [
    { text: running ? 'Monitor live' : 'Monitor stopped', alert: !running },
    newest && { text: `${newest.case_ref} ${newest.classification}`, alert: newest.classification === 'CRITICAL' },
    runtime && { text: `${liveCount} of 3 detectors ready`, alert: liveCount < 3 },
    typeof c.screened === 'number' && { text: `${c.screened.toLocaleString()} screened` },
    typeof c.flagged === 'number' && { text: `${c.flagged.toLocaleString()} flagged` },
  ].filter(Boolean)

  return (
    <ConsoleShell
      eyebrow={`${today}${name ? ` · ${name}` : ''}`}
      title={title}
      subtitle={running ? 'The monitor is screening every transaction as it arrives.'
        : 'Nothing new is being screened until the monitor is started.'}
      actions={running || !canControlPipeline ? (
        <button className="ds-btn" onClick={() => navigate('/monitor')}>Open monitor</button>
      ) : (
        <button className="ds-btn ds-btn-primary" disabled={starting}
                onClick={async () => {
                  setStarting(true)
                  try { await startMonitor() } finally { setStarting(false); refresh() }
                }}>
          {starting ? 'Starting…' : 'Start monitoring'}
        </button>
      )}
    >
      <div className="ds-fade-up" style={{ display: 'grid', gap: 18 }}>

        <Ticker items={sign} />

        {/* ── the four figures that decide what you do next ── */}
        <div style={{ display: 'grid', gap: 12,
                      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          <Metric label="Waiting for you" value={num(openCount)} tone={openCount ? 'alert' : ''}
                  meta={openCount ? 'cases to review' : 'nothing to review'}
                  onClick={() => navigate('/cases')} />
          <Metric label="Transactions checked" value={num(c.screened)}
                  meta={`${num(c.flagged) ?? '—'} worth a second look`} />
          <Metric label="Alerts sent" value={num(c.alerts)}
                  meta="someone was emailed" />
          <Metric label="Models ready" value={runtime ? `${liveCount}/3` : null}
                  tone={runtime && liveCount < 3 ? 'warn' : ''}
                  meta={liveCount === 3 ? 'all scoring' : `${3 - liveCount} cannot score`} />
        </div>

        {/* ── decide here, beside what is arriving ── */}
        <div style={{ display: 'grid', gap: 14, alignItems: 'start',
                      gridTemplateColumns: 'minmax(0, 1.75fr) minmax(280px, .85fr)' }}
             className="ds-split">
          <Panel className="ds-panel-pad">
            <SectionHeading
              label="Most serious first"
              title="Needs your decision"
              action={<button className="ds-btn ds-btn-quiet" onClick={() => navigate('/cases')}>
                All cases →
              </button>}
            />
            <div role="tablist" aria-label="Filter by severity"
                 style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
              {FILTERS.map(([k, label]) => {
                const n = k === 'all' ? awaiting.length : awaiting.filter((x) => x.classification === k).length
                return (
                  <button key={k} role="tab" aria-selected={filter === k}
                          className={`ds-btn ${filter === k ? '' : 'ds-btn-quiet'}`}
                          style={{ minHeight: 34, padding: '5px 12px' }}
                          onClick={() => setFilter(k)}>
                    {label} <span className="ds-mono" style={{ fontSize: 11, color: 'rgb(var(--ds-faint))' }}>{n}</span>
                  </button>
                )
              })}
            </div>
            {shown.length === 0 ? (
              <div className="ds-empty">
                {awaiting.length ? 'Nothing at this severity is waiting.'
                  : cases.length ? 'Every recent case has been reviewed.' : 'Nothing recorded yet.'}
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="ds-table">
                  <thead>
                    <tr>
                      <th>Case</th><th>Detectors</th><th>Fused</th><th>Severity</th>
                      <th>Pattern</th><th>Detected</th>
                      <th style={{ textAlign: 'right' }}>Decide</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.slice(0, 8).map((x) => (
                      <tr key={x.case_ref} style={{ cursor: 'pointer' }}
                          onClick={() => navigate(`/cases/${x.case_ref}`)}>
                        <td>
                          <div className="ds-mono" style={{ fontSize: 13 }}>{x.case_ref}</div>
                          <div className="ds-mono" style={{ fontSize: 11, color: 'rgb(var(--ds-faint))' }}>
                            {x.transaction_id}
                          </div>
                        </td>
                        <td><Readings c={x} /></td>
                        <td className="ds-mono" style={{ color: SEV[x.classification]?.hex }}>
                          {typeof x.fused_score === 'number' ? x.fused_score.toFixed(3) : '—'}
                        </td>
                        <td><Badge tone={SEV[x.classification]?.tone}>
                          {SEV[x.classification]?.label ?? x.classification}
                        </Badge></td>
                        <td style={{ color: 'rgb(var(--ds-muted))' }}>
                          {(x.graph_pattern ?? x.typology_name ?? '—').toLowerCase().replace(/_/g, ' ')}
                        </td>
                        <td style={{ color: 'rgb(var(--ds-faint))', fontSize: 14 }}>
                          {since(x.detected_at)}
                        </td>
                        {/* Decide without leaving. The page opens by saying N cases
                            need review; making you navigate away to act on any of
                            them is the gap this closes. */}
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}
                            onClick={(e) => e.stopPropagation()}>
                          <button className="ds-btn ds-btn-quiet" title="Confirm fraud"
                                  disabled={deciding === x.case_ref}
                                  onClick={() => decide(x, 'confirmed_fraud')}
                                  style={{ padding: '4px 8px', color: 'rgb(var(--ds-signal))' }}>
                            Fraud
                          </button>
                          <button className="ds-btn ds-btn-quiet" title="False positive"
                                  disabled={deciding === x.case_ref}
                                  onClick={() => decide(x, 'false_positive')}
                                  style={{ padding: '4px 8px' }}>
                            Dismiss
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel style={{ overflow: 'hidden' }}>
            <Planet live={running} />
            <div className="ds-panel-pad">
              <SectionHeading label="As it arrives" title="Live feed"
                action={<button className="ds-btn ds-btn-quiet" onClick={() => navigate('/monitor')}>
                  Monitor →
                </button>} />
              {feed.length === 0 ? (
                <div style={{ fontSize: 14, color: 'rgb(var(--ds-faint))' }}>
                  {running ? 'Waiting for the next transaction.' : 'Start the monitor to see transactions here.'}
                </div>
              ) : feed.map((e) => (
                <div key={`${e.transaction_id}-${e.at}`}
                     style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 10,
                              alignItems: 'center', padding: '9px 0', borderTop: '1px solid rgb(var(--ds-line))' }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="ds-mono" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {e.transaction_id}
                    </div>
                    <div style={{ fontSize: 12, color: 'rgb(var(--ds-faint))' }}>
                      {typeof e.amount === 'number' ? e.amount.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'}
                      {e.outcome === 'unknown_accounts' && ' · accounts not in the graph'}
                    </div>
                  </div>
                  {e.risk_level && (
                    <Badge tone={SEV[e.risk_level]?.tone}>{SEV[e.risk_level]?.label ?? e.risk_level}</Badge>
                  )}
                </div>
              ))}
            </div>
          </Panel>
        </div>

        {/* ── the worst case, and the system beside it ── */}
        <div style={{ display: 'grid', gap: 14, alignItems: 'start',
                      gridTemplateColumns: 'minmax(0, 1.65fr) minmax(280px, .85fr)' }}
             className="ds-split">
          <Panel className="ds-panel-pad">
            <SectionHeading
              label={featured ? `Most serious case · ${featured.case_ref}` : 'Most serious case'}
              title={featured
                ? `${featured.graph_evidence.nodes.length} accounts, one destination`
                : 'Nothing to show yet'}
              action={featured && (
                <button className="ds-btn ds-btn-quiet"
                        onClick={() => navigate(`/cases/${featured.case_ref}`)}>
                  Full case →
                </button>
              )}
            />
            {featured ? (
              <>
                <div style={{ display: 'flex', gap: 22, alignItems: 'baseline', marginBottom: 6, flexWrap: 'wrap' }}>
                  <div>
                    <span className="ds-mono" style={{ fontSize: 23,
                            color: SEV[featured.classification]?.hex }}>
                      {featured.fused_score?.toFixed(3)}
                    </span>
                    <span style={{ fontSize: 14, color: 'rgb(var(--ds-muted))', marginLeft: 9 }}>
                      fused confidence
                    </span>
                  </div>
                  <Badge tone={SEV[featured.classification]?.tone}>
                    {SEV[featured.classification]?.label ?? featured.classification}
                  </Badge>
                  <span style={{ fontSize: 14, color: 'rgb(var(--ds-muted))' }}>
                    {(featured.graph_pattern ?? 'no typology matched')
                      .toLowerCase().replace(/_/g, ' ')}
                  </span>
                </div>
                <NetworkGraph evidence={featured.graph_evidence} height={330} />
              </>
            ) : (
              <div className="ds-empty">
                When a transaction escalates, the accounts around it are drawn here.
                {canControlPipeline
                  ? ' Ingest a file with the Query Runner, or start the monitor.'
                  : ' Screening is controlled by an administrator.'}
              </div>
            )}
          </Panel>

          <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
            <Panel className="ds-panel-pad">
              <SectionHeading label="Runtime health" title="Models in service"
                action={<span className="ds-mono" style={{ fontSize: 14, color: 'rgb(var(--ds-muted))' }}>
                  {runtime ? `${liveCount} / 3` : '—'}
                </span>} />
              <div style={{ display: 'grid', gap: 15 }}>
                {MODELS.map(({ keys, label, sub }) => {
                  const d = pick(detectors, keys)
                  const ok = Boolean(d?.ready)
                  const reachable = Boolean(d?.reachable)
                  const status = !reachable ? 'offline' : ok ? 'ready' : 'no model'
                  return (
                    <div key={label}>
                      <div style={{ display: 'flex', justifyContent: 'space-between',
                                    fontSize: 15, marginBottom: 7, gap: 8 }}>
                        <span style={{ minWidth: 0 }}>
                          {label}
                          <span style={{ color: 'rgb(var(--ds-muted))', marginLeft: 6 }}>{sub}</span>
                        </span>
                        <span className="ds-mono" style={{
                          color: ok ? 'rgb(var(--ds-accent-strong))'
                            : reachable ? 'rgb(var(--ds-warn))' : 'rgb(var(--ds-faint))' }}>
                          {status}
                        </span>
                      </div>
                      <Progress value={ok ? 100 : reachable ? 45 : 4}
                                color={ok ? undefined
                                  : reachable ? 'rgb(var(--ds-warn))' : 'rgb(var(--ds-surface-3))'} />
                    </div>
                  )
                })}
              </div>
              <div style={{ borderRadius: 12, background: 'rgb(var(--ds-workspace))', padding: 12,
                            marginTop: 18, fontSize: 14, lineHeight: 1.55,
                            color: 'rgb(var(--ds-muted))' }}>
                {liveCount === 3 ? (
                  <>
                    <span className="ds-mono" style={{ color: 'rgb(var(--ds-accent-strong))' }}>
                      ALL THREE CONTRIBUTING
                    </span><br />
                    Every verdict is fused from the full set of detectors.
                  </>
                ) : (
                  <>
                    <span className="ds-mono" style={{ color: 'rgb(var(--ds-warn))' }}>
                      UNCERTAINTY PENALTY APPLIED
                    </span><br />
                    Confidence is reduced while a model is missing.
                  </>
                )}
              </div>
            </Panel>

            <Panel className="ds-panel-pad">
              <SectionHeading label={`Last ${cases.length} cases`} title="Severity and typology" />
              {cases.length === 0 ? (
                <div style={{ fontSize: 14, color: 'rgb(var(--ds-faint))' }}>No cases recorded.</div>
              ) : (
                <>
                  <div style={{ display: 'flex', height: 6, gap: 2, marginBottom: 11 }}>
                    {ORDER.filter((k) => bySeverity[k]).map((k) => (
                      <div key={k} title={`${k}: ${bySeverity[k]}`}
                           style={{ width: `${(bySeverity[k] / cases.length) * 100}%`,
                                    background: SEV[k].hex, borderRadius: 99 }} />
                    ))}
                  </div>
                  {ORDER.filter((k) => bySeverity[k]).map((k) => (
                    <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 7,
                                          fontSize: 14, padding: '3px 0' }}>
                      <span style={{ width: 6, height: 6, borderRadius: 99, background: SEV[k].hex }} />
                      <span style={{ color: 'rgb(var(--ds-muted))' }}>{SEV[k].label}</span>
                      <span className="ds-mono" style={{ marginLeft: 'auto' }}>{bySeverity[k]}</span>
                    </div>
                  ))}
                  {typologies.length > 0 && (
                    <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgb(var(--ds-line))',
                                  display: 'grid', gap: 9 }}>
                      {typologies.map(([t, n]) => (
                        <div key={t}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13,
                                        textTransform: 'capitalize', marginBottom: 5 }}>
                            <span>{t.toLowerCase()}</span>
                            <span className="ds-mono" style={{ color: 'rgb(var(--ds-muted))' }}>{n}</span>
                          </div>
                          <Progress value={(n / typologies[0][1]) * 100} />
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </Panel>

            <Panel className="ds-panel-pad">
              <SectionHeading label="Ingestion" title="Incoming work"
                action={<Badge tone={queue.available ? 'good' : ''}>
                  {queue.available ? 'connected' : 'not connected'}
                </Badge>} />
              {queue.available ? (
                <div style={{ display: 'flex', gap: 30 }}>
                  <div>
                    <div className="ds-mono" style={{ fontSize: 21 }}>{queue.pending ?? 0}</div>
                    <div className="ds-section-label" style={{ marginTop: 5 }}>Pending</div>
                  </div>
                  <div>
                    <div className="ds-mono" style={{ fontSize: 21, color: 'rgb(var(--ds-muted))' }}>
                      {queue.screened ?? 0}
                    </div>
                    <div className="ds-section-label" style={{ marginTop: 5 }}>Screened</div>
                  </div>
                  <div>
                    <div className="ds-mono" style={{ fontSize: 21 }}>
                      {typeof c.throughput_per_min === 'number' ? c.throughput_per_min : '—'}
                    </div>
                    <div className="ds-section-label" style={{ marginTop: 5 }}>Per minute</div>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 14, lineHeight: 1.6, color: 'rgb(var(--ds-muted))' }}>
                  {state?.source === 'queue' ? 'Screening ingested traffic.'
                    : running ? 'Replaying sample transactions. Point this service and the Query Runner at the same database to screen real arrivals.'
                      : 'Not screening. Point this service and the Query Runner at the same database to screen real arrivals.'}
                </div>
              )}
            </Panel>
          </div>
        </div>

        <Footer left="Scores are calibrated probabilities, not verdicts." />
      </div>
    </ConsoleShell>
  )
}
