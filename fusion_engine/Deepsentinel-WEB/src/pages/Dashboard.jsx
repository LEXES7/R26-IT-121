import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getMonitorRuntime, getMonitorState, listCases, reviewCase, startMonitor,
} from '../services/api'
import { useAuth } from '../context/AuthContext'
import NetworkGraph from '../components/NetworkGraph'
import ConsoleShell, {
  Badge, Footer, Metric, Panel, Progress, SectionHeading,
} from '../components/ConsoleShell'

/**
 * The operator's home.
 *
 * Three questions in order: is anything waiting for me, is the system
 * actually working, and what does the worst case look like. Everything here
 * is read from a live endpoint — a figure that cannot be determined renders
 * as an em dash, never as zero, because "nothing happened" and "we could not
 * reach the service" must never look the same.
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

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [state, setState] = useState(null)
  const [runtime, setRuntime] = useState(null)
  const [cases, setCases] = useState([])
  const [openCount, setOpenCount] = useState(null)
  const [starting, setStarting] = useState(false)
  const [deciding, setDeciding] = useState(null)

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

  // Severity leads; among equals, the one with more network to show wins.
  const featured = useMemo(() => {
    const g = cases.filter((x) => (x.graph_evidence?.nodes?.length ?? 0) >= 2)
    if (!g.length) return null
    const rank = (x) => (SEV[x.classification]?.rank ?? 0) * 1000
      + Math.min(x.graph_evidence.nodes.length, 40) * 10 + (x.fused_score ?? 0)
    return [...g].sort((a, b) => rank(b) - rank(a))[0]
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
    ? <>{openCount} case{openCount === 1 ? '' : 's'} <em>need your review.</em></>
    : running
      ? <>All clear. <em>Nothing is waiting.</em></>
      : <>Screening is <em>turned off.</em></>

  return (
    <ConsoleShell
      eyebrow={`Workspace / Observe${name ? ` · ${name}` : ''}`}
      title={title}
      subtitle={`${today} · ${running ? 'monitor live' : 'monitor stopped'}`}
      actions={running ? (
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
      <div className="ds-fade-up" style={{ display: 'grid', gap: 23 }}>

        {/* ── the four figures that decide what you do next ── */}
        <div style={{ display: 'grid', gap: 11,
                      gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
          <Metric label="Waiting for you" value={num(openCount)} tone="alert"
                  meta={openCount ? 'cases to review' : 'nothing to review'}
                  onClick={() => navigate('/cases')} />
          <Metric label="Transactions checked" value={num(c.screened)} tone="accent"
                  meta={`${num(c.flagged) ?? '—'} worth a second look`} />
          <Metric label="Alerts sent" value={num(c.alerts)}
                  meta="someone was emailed" />
          <Metric label="Models ready" value={runtime ? `${liveCount}/3` : null}
                  tone={liveCount < 3 ? 'warn' : ''}
                  meta={liveCount === 3 ? 'all scoring' : `${3 - liveCount} cannot score`} />
        </div>

        {/* ── the case on the desk, and system health beside it ── */}
        <div style={{ display: 'grid', gap: 12, alignItems: 'start',
                      gridTemplateColumns: 'minmax(0, 1.65fr) minmax(280px, .8fr)' }}
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
                <div style={{ display: 'flex', gap: 22, alignItems: 'baseline', marginBottom: 6 }}>
                  <div>
                    <span className="ds-mono" style={{ fontSize: 23,
                            color: SEV[featured.classification]?.hex }}>
                      {featured.fused_score?.toFixed(3)}
                    </span>
                    <span style={{ fontSize: 10, color: 'rgb(var(--ds-muted))', marginLeft: 9 }}>
                      fused confidence
                    </span>
                  </div>
                  <Badge tone={SEV[featured.classification]?.tone}>
                    {SEV[featured.classification]?.label ?? featured.classification}
                  </Badge>
                  <span style={{ fontSize: 10, color: 'rgb(var(--ds-muted))' }}>
                    {(featured.graph_pattern ?? 'no typology matched')
                      .toLowerCase().replace(/_/g, ' ')}
                  </span>
                </div>
                <NetworkGraph evidence={featured.graph_evidence} height={330} />
              </>
            ) : (
              <div className="ds-empty">
                When a transaction escalates, the accounts around it are drawn here.
                Ingest a file with the Query Runner, or start the monitor.
              </div>
            )}
          </Panel>

          <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
          <Panel className="ds-panel-pad">
            <SectionHeading label="Runtime health" title="Models in service"
              action={<span className="ds-mono" style={{ fontSize: 10, color: 'rgb(var(--ds-muted))' }}>
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
                                  fontSize: 11, marginBottom: 7, gap: 8 }}>
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
            <div style={{ borderRadius: 6, background: 'rgb(var(--ds-workspace))', padding: 11,
                          marginTop: 18, fontSize: 10, lineHeight: 1.55,
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
            <SectionHeading label={`Last ${cases.length} cases`} title="Severity mix" />
            {cases.length === 0 ? (
              <div style={{ fontSize: 10, color: 'rgb(var(--ds-faint))' }}>No cases recorded.</div>
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
                                        fontSize: 10, padding: '3px 0' }}>
                    <span style={{ width: 6, height: 6, borderRadius: 99, background: SEV[k].hex }} />
                    <span style={{ color: 'rgb(var(--ds-muted))' }}>{SEV[k].label}</span>
                    <span className="ds-mono" style={{ marginLeft: 'auto' }}>{bySeverity[k]}</span>
                  </div>
                ))}
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
                </div>
              ) : (
                <div style={{ fontSize: 10, lineHeight: 1.6, color: 'rgb(var(--ds-muted))' }}>
                  Point this service and the Query Runner at the same database to
                  screen real arrivals.
                </div>
              )}
            </Panel>

            <Panel className="ds-panel-pad">
              <SectionHeading label="Throughput" title="Rate right now" />
              <div className="ds-mono" style={{ fontSize: 21 }}>
                {typeof c.throughput_per_min === 'number' ? c.throughput_per_min : '—'}
                <span style={{ fontSize: 10, color: 'rgb(var(--ds-muted))', marginLeft: 8 }}>
                  per minute
                </span>
              </div>
              <div style={{ fontSize: 10, color: 'rgb(var(--ds-muted))', marginTop: 8 }}>
                {state?.source === 'queue' ? 'Screening ingested traffic.'
                  : running ? 'Replaying sample transactions.' : 'Not screening.'}
              </div>
            </Panel>
          </div>
        </div>

        {/* ── decide here ── */}
        <Panel className="ds-panel-pad">
          <SectionHeading
            label="Most serious first"
            title="Waiting for a decision"
            action={<button className="ds-btn ds-btn-quiet" onClick={() => navigate('/cases')}>
              All cases →
            </button>}
          />
          {awaiting.length === 0 ? (
            <div className="ds-empty">
              {cases.length ? 'Every recent case has been reviewed.' : 'Nothing recorded yet.'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="ds-table">
                <thead>
                  <tr>
                    <th>Case</th><th>Score</th><th>Severity</th>
                    <th>Pattern</th><th>Models</th><th>Detected</th>
                    <th style={{ textAlign: 'right' }}>Decide</th>
                  </tr>
                </thead>
                <tbody>
                  {awaiting.slice(0, 8).map((x) => (
                    <tr key={x.case_ref} style={{ cursor: 'pointer' }}
                        onClick={() => navigate(`/cases/${x.case_ref}`)}>
                      <td className="ds-mono" style={{ fontSize: 10 }}>{x.case_ref}</td>
                      <td className="ds-mono" style={{ color: SEV[x.classification]?.hex }}>
                        {typeof x.fused_score === 'number' ? x.fused_score.toFixed(3) : '—'}
                      </td>
                      <td><Badge tone={SEV[x.classification]?.tone}>
                        {SEV[x.classification]?.label ?? x.classification}
                      </Badge></td>
                      <td style={{ color: 'rgb(var(--ds-muted))' }}>
                        {(x.graph_pattern ?? x.typology_name ?? '—').toLowerCase().replace(/_/g, ' ')}
                      </td>
                      <td className="ds-mono" style={{ fontSize: 10 }}>{x.modalities_used}/3</td>
                      <td style={{ color: 'rgb(var(--ds-faint))', fontSize: 10 }}>
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

        <Footer left="Scores are calibrated probabilities, not verdicts." />
      </div>
    </ConsoleShell>
  )
}
