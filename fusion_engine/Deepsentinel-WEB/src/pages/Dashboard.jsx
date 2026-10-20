import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getMonitorRuntime, getMonitorState, listCases, reviewCase, startMonitor,
} from '../services/api'
import { useAuth } from '../context/AuthContext'
import NetworkGraph from '../components/NetworkGraph'
import ConsoleShell, { Badge, Footer, Progress } from '../components/ConsoleShell'
import { G, Glyph, Person, Statistics, compact } from '../components/DashKit'

/**
 * The operator's home.
 *
 * Read from the top: the state of the system in a row of chips, how many
 * cases were opened hour by hour, then the cases that need a decision, with
 * what is arriving and what has waited longest beside them. Everything is read
 * from a live endpoint; a figure that cannot be determined renders as a dash,
 * never as zero, because "nothing happened" and "we could not reach the
 * service" must never look the same.
 */

const SEV = {
  CRITICAL: { hex: 'rgb(var(--ds-sev-critical))', label: 'Critical', rank: 4, tone: 'alert' },
  HIGH:     { hex: 'rgb(var(--ds-sev-high))',     label: 'High',     rank: 3, tone: 'warn' },
  MEDIUM:   { hex: 'rgb(var(--ds-sev-medium))',   label: 'Medium',   rank: 2, tone: 'warn' },
  LOW:      { hex: 'rgb(var(--ds-sev-low))',      label: 'Low',      rank: 1, tone: 'good' },
}
const ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
// The most rows /cases returns in one call.
const HISTORY = 200
const FLAGGED = new Set(['CRITICAL', 'HIGH'])

const MODELS = [
  { keys: ['graph'], label: 'GraphSAGE', sub: 'network structure', colour: 'rgb(var(--modality-graph))', glyph: 'N' },
  { keys: ['behavioural', 'behavioral'], label: 'Stratified VAE', sub: 'account behaviour', colour: 'rgb(var(--modality-behavioral))', glyph: 'B' },
  { keys: ['temporal'], label: 'Sequence TCN', sub: 'timing and order', colour: 'rgb(var(--modality-temporal))', glyph: 'T' },
]
const pick = (o, keys) => keys.map((k) => o?.[k]).find((v) => v !== undefined)

// Network roles, folded into the three marks the case cards draw.
const DOT = {
  SINK: 'line', MULE_CENTRAL: 'line',
  MULE: 'mint', INTERMEDIARY: 'mint', FRESH_SENDER: 'mint', SENDER: 'mint',
  LEGITIMATE: 'hollow',
}

const num = (v) => (typeof v === 'number' ? v.toLocaleString() : null)
const words = (s) => (s ?? '').toString().replace(/_/g, ' ').toLowerCase().trim()

/** Time since `iso` as a running clock under a day, and in days beyond it. */
function clock(iso, now) {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return '-'
  const s = Math.max(0, Math.floor((now - t) / 1000))
  if (s >= 86400) return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`
  const p = (n) => String(n).padStart(2, '0')
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`
}
function waited(iso, now) {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return '-'
  const m = Math.max(0, Math.round((now - t) / 60000))
  if (m < 60) return `${m}m`
  if (m < 1440) return `${Math.floor(m / 60)}h ${m % 60}m`
  return `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h`
}

const greeting = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

/** The accounts in a case's ring, one dot each, the sink in the line colour. */
function RingDots({ nodes }) {
  if (!nodes?.length) {
    return <div className="dash-dots" style={{ fontSize: 12, color: 'rgb(var(--ds-faint))' }}>No ring returned</div>
  }
  const shown = nodes.slice(0, 44)
  return (
    <div className="dash-dots" role="img"
         aria-label={`${nodes.length} accounts in the ring`}>
      {shown.map((n, i) => {
        const kind = DOT[n.role] ?? 'mint'
        return (
          <span key={n.account_id ?? i} className="dash-dot"
                title={`${n.account_id ?? 'account'} · ${words(n.role) || 'account'}`}
                style={kind === 'hollow'
                  ? { border: '2px solid rgb(var(--ds-faint))' }
                  : { background: kind === 'line' ? 'rgb(var(--dash-line))' : 'rgb(var(--dash-dot))' }} />
        )
      })}
      {nodes.length > shown.length && (
        <span style={{ fontSize: 11, color: 'rgb(var(--ds-faint))', alignSelf: 'center' }}>
          +{nodes.length - shown.length}
        </span>
      )}
    </div>
  )
}

function CaseCard({ x, now, go, onDecide, deciding }) {
  const sev = SEV[x.classification]
  const nodes = x.graph_evidence?.nodes ?? []
  const answered = ['graph_available', 'behavioral_available', 'temporal_available']
    .filter((k) => x[k] !== false).length
  return (
    <div className="dash-card dash-case" role="link" tabIndex={0}
         onClick={() => go(`/cases/${x.case_ref}`)}
         onKeyDown={(e) => e.key === 'Enter' && go(`/cases/${x.case_ref}`)}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
        <div className="dash-avatar" style={{ color: sev?.hex, background: `color-mix(in srgb, ${sev?.hex} 16%, transparent)`,
                                              boxShadow: `inset 0 0 0 2px ${sev?.hex}` }}>
          {typeof x.fused_score === 'number' ? Math.round(x.fused_score * 100) : '-'}
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="ds-mono" style={{ fontSize: 15, fontWeight: 600, color: 'rgb(var(--ds-ink))' }}>{x.case_ref}</div>
          <span className="dash-timer" title="Waiting since detection"><Glyph d={G.clock} size={11} />{clock(x.detected_at, now)}</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 18, marginTop: 18, flexWrap: 'wrap' }}>
        <span className="dash-stat"><Glyph d={G.score} />{sev?.label ?? x.classification}</span>
        <span className="dash-stat"><Glyph d={G.layers} />{answered}/3 detectors</span>
      </div>
      <div className="dash-sep" />
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 14, fontSize: 13, minWidth: 0 }}>
        <span className="dash-stat" style={{ minWidth: 0 }}>
          <Glyph d={G.sink} />
          <span className="ds-mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {x.sink_account ?? 'no sink named'}
          </span>
        </span>
        <span className="dash-stat"><Glyph d={G.accounts} />{nodes.length}</span>
      </div>
      <RingDots nodes={nodes} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, gap: 8 }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'rgb(var(--ds-muted))', overflow: 'hidden',
                       textOverflow: 'ellipsis', whiteSpace: 'nowrap', textTransform: 'capitalize' }}>
          {words(x.graph_pattern ?? x.typology_name) || 'no pattern matched'}
        </span>
        {/* Decide without leaving the page. */}
        <span style={{ display: 'flex', gap: 6, flex: '0 0 auto' }} onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}>
          <button className="dash-mini" style={{ color: 'rgb(var(--ds-signal))' }} title="Confirm fraud"
                  disabled={deciding === x.case_ref} onClick={() => onDecide(x, 'confirmed_fraud')}>Fraud</button>
          <button className="dash-mini" title="False positive"
                  disabled={deciding === x.case_ref} onClick={() => onDecide(x, 'false_positive')}>Dismiss</button>
        </span>
      </div>
    </div>
  )
}

/**
 * The page body, from data alone. Kept apart from the fetching so it can be
 * looked at with recorded data, and so a slow endpoint never blanks the page.
 */
export function Board({
  state, runtime, cases, open, history, now, go, onDecide, deciding, canControlPipeline,
}) {
  const [query, setQuery] = useState('')
  const c = state?.counters ?? {}
  const queue = state?.queue ?? {}
  const running = Boolean(state?.running)
  const detectors = runtime?.detectors ?? {}
  const liveCount = MODELS.filter(({ keys }) => pick(detectors, keys)?.ready).length

  // Cases are what the monitor records: every verdict above Low, and any the
  // network model raised that fusion settled. The dashed line is the serious
  // share of them.
  const events = useMemo(() => (history ?? [])
    .map((x) => ({ t: Date.parse(x.detected_at), b: FLAGGED.has(x.classification) }))
    .filter((e) => !Number.isNaN(e.t)), [history])

  // Worst first, then the most certain, then the newest.
  const awaiting = useMemo(() => [...(open ?? [])].sort((a, b) =>
    (SEV[b.classification]?.rank ?? 0) - (SEV[a.classification]?.rank ?? 0)
    || (b.fused_score ?? 0) - (a.fused_score ?? 0)
    || Date.parse(b.detected_at) - Date.parse(a.detected_at)), [open])
  const longest = useMemo(() => [...(open ?? [])]
    .filter((x) => x.detected_at)
    .sort((a, b) => Date.parse(a.detected_at) - Date.parse(b.detected_at))
    .slice(0, 4), [open])

  const feed = useMemo(() => (state?.events ?? [])
    .filter((e) => e.kind === 'screened' && e.transaction_id)
    .slice(-2).reverse(), [state])

  // Severity leads; among equals, the one with more network to show wins.
  const featured = useMemo(() => {
    const g = (cases ?? []).filter((x) => (x.graph_evidence?.nodes?.length ?? 0) >= 2)
    if (!g.length) return null
    const rank = (x) => (SEV[x.classification]?.rank ?? 0) * 1000
      + Math.min(x.graph_evidence.nodes.length, 40) * 10 + (x.fused_score ?? 0)
    return [...g].sort((a, b) => rank(b) - rank(a))[0]
  }, [cases])

  const bySeverity = useMemo(() => {
    const acc = {}
    ;(cases ?? []).forEach((x) => { acc[x.classification] = (acc[x.classification] || 0) + 1 })
    return acc
  }, [cases])
  const typologies = useMemo(() => {
    const acc = {}
    ;(cases ?? []).forEach((x) => {
      const t = words(x.typology_name ?? x.graph_pattern)
      if (t) acc[t] = (acc[t] || 0) + 1
    })
    return Object.entries(acc).sort((a, b) => b[1] - a[1]).slice(0, 4)
  }, [cases])

  const search = (e) => {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    // A case reference opens the case; anything else is a transaction or an
    // account, which the analyzer looks up.
    go(/^CASE-/i.test(q) ? `/cases/${q.toUpperCase()}` : `/analyzer?q=${encodeURIComponent(q)}`)
  }

  return (
    <div className="dash ds-fade-up">
      <div className="dash-chips">
        <form className="dash-chip dash-search" onSubmit={search} role="search">
          <Glyph d={G.search} size={17} />
          <input value={query} onChange={(e) => setQuery(e.target.value)}
                 placeholder="Case, transaction or account" aria-label="Find a case, transaction or account" />
        </form>
        <span className="dash-chip" title={runtime ? `${liveCount} of 3 detectors can score` : 'Checking detectors'}>
          <span className="dash-faces">
            {MODELS.map(({ keys, colour, glyph, label }) => {
              const ok = pick(detectors, keys)?.ready
              return (
                <span key={label} className="dash-face" title={`${label}: ${ok ? 'ready' : 'not scoring'}`}
                      style={{ background: ok ? colour : 'rgb(var(--ds-surface-3))',
                               color: ok ? '#0D0C0B' : 'rgb(var(--ds-faint))', fontSize: 11, fontWeight: 700 }}>
                  {glyph}
                </span>
              )
            })}
          </span>
          <b>{runtime ? `${liveCount} of 3` : '-'}</b> detectors ready
        </span>
        <button className="dash-chip" style={{ cursor: 'pointer' }} onClick={() => go('/cases')}>
          <b>{open ? open.length : '-'}</b> waiting
        </button>
        <span className="dash-chip">
          <span className={running ? 'hero-pulse' : ''}
                style={running ? undefined : { width: 8, height: 8, borderRadius: 99, background: 'rgb(var(--ds-faint))' }} />
          <b style={{ fontSize: 14 }}>{running ? 'Monitor live' : 'Monitor stopped'}</b>
        </span>
      </div>

      <div className="dash-row">
        <div style={{ minWidth: 0 }}>
          <Statistics events={events} now={now} cap={HISTORY}
                      failed={history === null}
                      labels={{ a: 'Cases opened', b: 'High or critical' }} />

          <div className="dash-head" style={{ marginTop: 36 }}>
            <h2 className="dash-h">Needs your decision</h2>
            <button className="dash-mini" onClick={() => go('/cases')}>All cases →</button>
          </div>
          {awaiting.length === 0 ? (
            <div className="ds-empty">{open === null ? 'Cases could not be loaded.' : 'Nothing is waiting for a decision.'}</div>
          ) : (
            <div className="dash-cases">
              {awaiting.slice(0, 3).map((x) => (
                <CaseCard key={x.case_ref} x={x} now={now} go={go} onDecide={onDecide} deciding={deciding} />
              ))}
            </div>
          )}
        </div>

        <aside style={{ minWidth: 0 }}>
          <div className="dash-head"><h2 className="dash-h">Just screened</h2></div>
          {feed.length === 0 ? (
            <div style={{ fontSize: 14, color: 'rgb(var(--ds-faint))', marginBottom: 8 }}>
              {running ? 'Waiting for the next transaction.' : 'Start the monitor to see transactions here.'}
            </div>
          ) : feed.map((e) => (
            <Person key={`${e.transaction_id}-${e.at}`} mono
                    colour={SEV[e.risk_level]?.hex ?? 'rgb(var(--ds-faint))'}
                    mark={<Glyph d={G.swap} size={18} />}
                    name={e.transaction_id}
                    sub={`${typeof e.amount === 'number' ? e.amount.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '-'} · ${SEV[e.risk_level]?.label ?? 'scored'}`}
                    onClick={() => go('/monitor')} />
          ))}

          <div className="dash-head" style={{ marginTop: 30 }}><h2 className="dash-h">Waiting longest</h2></div>
          {longest.length === 0 ? (
            <div style={{ fontSize: 14, color: 'rgb(var(--ds-faint))' }}>No open cases.</div>
          ) : longest.map((x) => (
            <Person key={x.case_ref} mono
                    colour={SEV[x.classification]?.hex ?? 'rgb(var(--ds-faint))'}
                    mark={(SEV[x.classification]?.label ?? '?')[0]}
                    name={x.case_ref}
                    sub={words(x.typology_name ?? x.graph_pattern) || SEV[x.classification]?.label || ''}
                    badge={waited(x.detected_at, now)}
                    onClick={() => go(`/cases/${x.case_ref}`)} />
          ))}

          <div className="dash-hero" style={{ marginTop: 26 }}>
            <div className="dash-faces" style={{ justifyContent: 'center' }}>
              {MODELS.map(({ label, colour, glyph }) => (
                <span key={label} className="dash-face" style={{ background: colour, color: '#0D0C0B',
                      borderColor: '#C2F2EC', fontSize: 11, fontWeight: 700, width: 32, height: 32 }}>{glyph}</span>
              ))}
            </div>
            <div className="dash-hero-num">{typeof c.screened === 'number' ? `+${compact(c.screened)}` : '-'}</div>
            <div className="dash-hero-sub">
              transactions screened by the monitor
              {typeof c.flagged === 'number' ? `, ${num(c.flagged)} flagged` : ''}
            </div>
          </div>
        </aside>
      </div>

      <div className="dash-row">
        <div className="dash-card" style={{ padding: 24, minWidth: 0 }}>
          <div className="dash-head" style={{ marginBottom: 8 }}>
            <div>
              <div className="ds-section-label" style={{ marginBottom: 6 }}>
                {featured ? `Most serious case · ${featured.case_ref}` : 'Most serious case'}
              </div>
              <h2 className="dash-h dash-h-sm">
                {featured ? `${featured.graph_evidence.nodes.length} accounts, one destination` : 'Nothing to show yet'}
              </h2>
            </div>
            {featured && <button className="dash-mini" onClick={() => go(`/cases/${featured.case_ref}`)}>Full case →</button>}
          </div>
          {featured ? (
            <>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', fontSize: 14 }}>
                <span className="ds-mono" style={{ fontSize: 20, color: SEV[featured.classification]?.hex }}>
                  {featured.fused_score?.toFixed(3)}
                </span>
                <span style={{ color: 'rgb(var(--ds-muted))' }}>fused confidence</span>
                <Badge tone={SEV[featured.classification]?.tone}>
                  {SEV[featured.classification]?.label ?? featured.classification}
                </Badge>
                <span style={{ color: 'rgb(var(--ds-muted))' }}>{words(featured.graph_pattern) || 'no typology matched'}</span>
              </div>
              <NetworkGraph evidence={featured.graph_evidence} height={330} />
            </>
          ) : (
            <div className="ds-empty">
              Accounts around a serious case appear here.
              {canControlPipeline
                ? ' Start the monitor or upload a file.'
                : ' Screening is controlled by an administrator.'}
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gap: 14, minWidth: 0 }}>
          <div className="dash-card" style={{ padding: 22 }}>
            <div className="dash-head" style={{ marginBottom: 14 }}>
              <h2 className="dash-h dash-h-sm">Models</h2>
              <span className="ds-mono" style={{ fontSize: 14, color: 'rgb(var(--ds-muted))' }}>
                {runtime ? `${liveCount} / 3` : '-'}
              </span>
            </div>
            <div style={{ display: 'grid', gap: 14 }}>
              {MODELS.map(({ keys, label, sub }) => {
                const d = pick(detectors, keys)
                const ok = Boolean(d?.ready)
                const reachable = Boolean(d?.reachable)
                return (
                  <div key={label}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 6, gap: 8 }}>
                      <span>{label}<span style={{ color: 'rgb(var(--ds-muted))', marginLeft: 6 }}>{sub}</span></span>
                      <span className="ds-mono" style={{ color: ok ? 'rgb(var(--dash-line-ink))'
                        : reachable ? 'rgb(var(--ds-warn))' : 'rgb(var(--ds-faint))' }}>
                        {!reachable ? 'offline' : ok ? 'ready' : 'no model'}
                      </span>
                    </div>
                    <Progress value={ok ? 100 : reachable ? 45 : 4}
                              color={ok ? 'rgb(var(--dash-line))' : reachable ? 'rgb(var(--ds-warn))' : 'rgb(var(--ds-surface-3))'} />
                  </div>
                )
              })}
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.55, color: 'rgb(var(--ds-muted))', marginTop: 14 }}>
              {liveCount === 3 ? 'All three detectors are scoring.'
                : 'Results are less certain while one is missing.'}
            </div>
          </div>

          <div className="dash-card" style={{ padding: 22 }}>
            <div className="dash-head" style={{ marginBottom: 12 }}>
              <h2 className="dash-h dash-h-sm">Recent cases</h2>
              <span style={{ fontSize: 12, color: 'rgb(var(--ds-faint))' }}>last {(cases ?? []).length}</span>
            </div>
            {(cases ?? []).length === 0 ? (
              <div style={{ fontSize: 14, color: 'rgb(var(--ds-faint))' }}>No cases recorded.</div>
            ) : (
              <>
                <div style={{ display: 'flex', height: 8, gap: 3, marginBottom: 10 }}>
                  {ORDER.filter((k) => bySeverity[k]).map((k) => (
                    <div key={k} title={`${SEV[k].label}: ${bySeverity[k]}`}
                         style={{ width: `${(bySeverity[k] / cases.length) * 100}%`, background: SEV[k].hex, borderRadius: 99 }} />
                  ))}
                </div>
                {ORDER.filter((k) => bySeverity[k]).map((k) => (
                  <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '3px 0' }}>
                    <span style={{ width: 8, height: 8, borderRadius: 99, background: SEV[k].hex }} />
                    <span style={{ color: 'rgb(var(--ds-muted))' }}>{SEV[k].label}</span>
                    <span className="ds-mono" style={{ marginLeft: 'auto' }}>{bySeverity[k]}</span>
                  </div>
                ))}
                {typologies.length > 0 && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgb(var(--ds-line))', display: 'grid', gap: 9 }}>
                    {typologies.map(([t, n]) => (
                      <div key={t}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5,
                                      textTransform: 'capitalize' }}>
                          <span>{t}</span>
                          <span className="ds-mono" style={{ color: 'rgb(var(--ds-muted))' }}>{n}</span>
                        </div>
                        <Progress value={(n / typologies[0][1]) * 100} color="rgb(var(--dash-line))" />
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="dash-card" style={{ padding: 22 }}>
            <div className="dash-head" style={{ marginBottom: 12 }}>
              <h2 className="dash-h dash-h-sm">Incoming</h2>
              <Badge tone={queue.available ? 'good' : ''}>{queue.available ? 'connected' : 'not connected'}</Badge>
            </div>
            {queue.available ? (
              <div style={{ display: 'flex', gap: 26 }}>
                {[['Pending', queue.pending ?? 0], ['Screened', queue.screened ?? 0],
                  ['Per minute', typeof c.throughput_per_min === 'number' ? c.throughput_per_min : '-']].map(([l, v]) => (
                  <div key={l}>
                    <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-.03em' }}>{v}</div>
                    <div className="ds-section-label" style={{ marginTop: 4 }}>{l}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 13, lineHeight: 1.6, color: 'rgb(var(--ds-muted))' }}>
                {state?.source === 'queue' ? 'Screening ingested traffic.'
                  : running ? 'Replaying sample payments.'
                    : 'Not screening.'}
              </div>
            )}
          </div>
        </div>
      </div>

      <Footer left="Scores are probabilities, not verdicts." />
    </div>
  )
}

export default function Dashboard() {
  const { user, canControlPipeline } = useAuth()
  const navigate = useNavigate()
  const [state, setState] = useState(null)
  const [runtime, setRuntime] = useState(null)
  const [cases, setCases] = useState([])
  const [open, setOpen] = useState(undefined)
  const [history, setHistory] = useState(undefined)
  const [starting, setStarting] = useState(false)
  const [deciding, setDeciding] = useState(null)
  const [now, setNow] = useState(() => Date.now())

  const refresh = useCallback(async () => {
    const [s, r, all, o] = await Promise.allSettled([
      getMonitorState(), getMonitorRuntime(),
      listCases({ limit: 60 }), listCases({ review_status: 'open', limit: 200 }),
    ])
    if (s.status === 'fulfilled') setState(s.value)
    if (r.status === 'fulfilled') setRuntime(r.value)
    if (all.status === 'fulfilled') setCases(all.value.cases ?? [])
    setOpen(o.status === 'fulfilled' ? o.value.cases ?? [] : null)
  }, [])

  // History moves slowly and is the heaviest call, so it is read less often.
  const loadHistory = useCallback(() => {
    listCases({ limit: HISTORY }).then((r) => setHistory(r.cases ?? [])).catch(() => setHistory(null))
  }, [])

  useEffect(() => {
    refresh()
    loadHistory()
    const t = setInterval(refresh, 5000)
    const h = setInterval(loadHistory, 60000)
    return () => { clearInterval(t); clearInterval(h) }
  }, [refresh, loadHistory])

  // The case cards show how long each has waited, as a running clock.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const decide = useCallback(async (x, verdict) => {
    setDeciding(x.case_ref)
    try {
      await reviewCase(x.case_ref, verdict)
      setOpen((list) => (list ?? []).filter((r) => r.case_ref !== x.case_ref))
    } finally {
      setDeciding(null)
    }
  }, [])

  const running = Boolean(state?.running)
  const openCount = open?.length
  const name = (user?.full_name || user?.username || '')
    .replace(/deepsentinel/i, '').trim().split(' ')[0]
  const today = new Date().toLocaleDateString(undefined,
    { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  const title = openCount
    ? <>{greeting()}. <em>{openCount} case{openCount === 1 ? '' : 's'} need{openCount === 1 ? 's' : ''} your review.</em></>
    : running
      ? <>{greeting()}. <em>Nothing is waiting.</em></>
      : <>Screening is <em>turned off.</em></>

  return (
    <ConsoleShell
      eyebrow={`${today}${name ? ` · ${name}` : ''}`}
      title={title}
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
      <Board state={state} runtime={runtime} cases={cases} open={open === undefined ? [] : open}
             history={history === undefined ? [] : history} now={now}
             go={navigate} onDecide={decide} deciding={deciding}
             canControlPipeline={canControlPipeline} />
    </ConsoleShell>
  )
}
