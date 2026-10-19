import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getMonitorRuntime, getMonitorState, listAnalyses, listCases, reviewCase, startMonitor,
} from '../services/api'
import { useAuth } from '../context/AuthContext'
import NetworkGraph from '../components/NetworkGraph'
import ConsoleShell, { Badge, Footer, Progress } from '../components/ConsoleShell'

/**
 * The operator's home.
 *
 * Read from the top: the state of the system in a row of chips, how much was
 * screened and flagged hour by hour, then the cases that need a decision, with
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

const DAY = 86_400_000
const DAYS_SHOWN = 13

const num = (v) => (typeof v === 'number' ? v.toLocaleString() : null)
const compact = (v) => {
  if (typeof v !== 'number') return '—'
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`
  if (v >= 1e4) return `${(v / 1e3).toFixed(1)}k`
  return v.toLocaleString()
}
const words = (s) => (s ?? '').toString().replace(/_/g, ' ').toLowerCase().trim()
const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime() }

/** Time since `iso` as a running clock under a day, and in days beyond it. */
function clock(iso, now) {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return '—'
  const s = Math.max(0, Math.floor((now - t) / 1000))
  if (s >= 86400) return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`
  const p = (n) => String(n).padStart(2, '0')
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`
}
function waited(iso, now) {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return '—'
  const m = Math.max(0, Math.round((now - t) / 60000))
  if (m < 60) return `${m}m`
  if (m < 1440) return `${Math.floor(m / 60)}h ${m % 60}m`
  return `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h`
}

const greeting = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

/* Small inline glyphs; they inherit currentColor. */
const G = {
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.35-4.35',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-15v5l3 2',
  score: 'M3 12h4l3 8 4-16 3 8h4',
  layers: 'M12 2 2 7l10 5 10-5-10-5ZM2 17l10 5 10-5M2 12l10 5 10-5',
  sink: 'M12 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM5 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm14 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM6.4 6.4 10.6 15.6m7-9.2-4.2 9.2',
  accounts: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-14v.01M12 11v6',
  swap: 'M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4m4 4H7',
}
function Glyph({ d, size = 15 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
         strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

/** Width of an element, kept current as the layout changes. */
function useWidth() {
  const ref = useRef(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    if (!ref.current) return undefined
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

/** A smooth path through points that never overshoots them (monotone cubic). */
function smooth(pts) {
  if (pts.length < 2) return ''
  const n = pts.length
  const dx = [], m = [], t = []
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1][0] - pts[i][0]
    m[i] = (pts[i + 1][1] - pts[i][1]) / dx[i]
  }
  t[0] = m[0]; t[n - 1] = m[n - 2]
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue }
    const a = t[i] / m[i], b = t[i + 1] / m[i], h = a * a + b * b
    if (h > 9) { const k = 3 / Math.sqrt(h); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i] }
  }
  let d = `M${pts[0][0]},${pts[0][1]}`
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3
    d += ` C${pts[i][0] + h},${pts[i][1] + t[i] * h} ${pts[i + 1][0] - h},${pts[i + 1][1] - t[i + 1] * h} ${pts[i + 1][0]},${pts[i + 1][1]}`
  }
  return d
}

/** Screened as a filled line, flagged as a dashed one, on one scale. */
function VolumeChart({ buckets }) {
  const [ref, width] = useWidth()
  const [hover, setHover] = useState(null)
  const H = 250, padL = 34, padR = 8, padT = 16, padB = 30
  const W = Math.max(width, 300)
  const max = Math.max(1, ...buckets.map((b) => b.screened))
  const step = Math.max(1, Math.ceil(max / 3))
  const top = step * 3
  const x = (i) => padL + (i / Math.max(1, buckets.length - 1)) * (W - padL - padR)
  const y = (v) => padT + (1 - v / top) * (H - padT - padB)
  // Hours still to come are not zeros; the line stops at the present.
  const past = buckets.filter((b) => !b.future)
  const line = past.map((b, i) => [x(i), y(b.screened)])
  const dash = past.map((b, i) => [x(i), y(b.flagged)])
  const area = line.length > 1 ? `${smooth(line)} L${x(past.length - 1)},${y(0)} L${x(0)},${y(0)} Z` : ''
  const every = buckets.length > 14 ? 2 : 1

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * W
    const i = Math.round(((px - padL) / (W - padL - padR)) * (buckets.length - 1))
    setHover(Math.max(0, Math.min(past.length - 1, i)))
  }
  const h = hover === null ? null : buckets[hover]

  return (
    <div className="dash-chart" ref={ref}>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} role="img"
           aria-label={`Screened and flagged per ${buckets.length === 24 ? 'hour' : 'day'}`}
           onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id="dash-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="rgb(var(--dash-line))" stopOpacity=".32" />
            <stop offset="1" stopColor="rgb(var(--dash-line))" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((k) => (
          <g key={k}>
            <line x1={padL} x2={W - padR} y1={y(k * step)} y2={y(k * step)}
                  stroke="rgb(var(--ds-line))" strokeOpacity={k === 0 ? 0.9 : 0.45} />
            <text x={0} y={y(k * step) + 4}>{k * step}</text>
          </g>
        ))}
        <path d={area} fill="url(#dash-fill)" />
        <path d={smooth(line)} fill="none" stroke="rgb(var(--dash-line))" strokeWidth="2.5" strokeLinejoin="round" />
        <path d={smooth(dash)} fill="none" stroke="rgb(var(--ds-ink))" strokeOpacity=".7" strokeWidth="2" strokeDasharray="6 6" />
        {buckets.map((b, i) => i % every === 0 && (
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle">{b.label}</text>
        ))}
        {h && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={padT} y2={y(0)} stroke="rgb(var(--ds-ink))" strokeOpacity=".25" />
            <circle cx={x(hover)} cy={y(h.screened)} r="5" fill="rgb(var(--dash-line))"
                    stroke="rgb(var(--ds-workspace))" strokeWidth="2" />
            <circle cx={x(hover)} cy={y(h.flagged)} r="4" fill="rgb(var(--ds-ink))"
                    stroke="rgb(var(--ds-workspace))" strokeWidth="2" />
          </g>
        )}
      </svg>
      {h && (
        <div className="dash-tip" style={{ left: `${(x(hover) / W) * 100}%` }}>
          <b>{h.title}</b> · {h.screened.toLocaleString()} screened · {h.flagged.toLocaleString()} flagged
        </div>
      )}
    </div>
  )
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
          {typeof x.fused_score === 'number' ? Math.round(x.fused_score * 100) : '—'}
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

function Person({ colour, mark, name, sub, badge, onClick, mono }) {
  return (
    <div className="dash-card dash-person" role="link" tabIndex={0} onClick={onClick}
         onKeyDown={(e) => e.key === 'Enter' && onClick()}>
      <div className="dash-avatar" style={{ width: 44, height: 44, color: colour,
                                            background: `color-mix(in srgb, ${colour} 16%, transparent)` }}>
        {mark}
      </div>
      <div style={{ minWidth: 0 }}>
        <div className={`dash-person-name ${mono ? 'ds-mono' : ''}`} style={mono ? { fontSize: 13 } : undefined}>{name}</div>
        <div className="dash-person-sub">{sub}</div>
      </div>
      {badge && <span className="dash-badge">{badge}</span>}
    </div>
  )
}

/**
 * The page body, from data alone. Kept apart from the fetching so it can be
 * looked at with recorded data, and so a slow endpoint never blanks the page.
 */
export function Board({
  state, runtime, cases, open, analyses, now, go, onDecide, deciding, canControlPipeline,
}) {
  const [query, setQuery] = useState('')
  const [scale, setScale] = useState('hours')
  const [day, setDay] = useState(() => startOfDay(Date.now()))

  const c = state?.counters ?? {}
  const queue = state?.queue ?? {}
  const running = Boolean(state?.running)
  const detectors = runtime?.detectors ?? {}
  const liveCount = MODELS.filter(({ keys }) => pick(detectors, keys)?.ready).length

  // The strip of days, today last, each with how many screenings it holds.
  const today = startOfDay(now)
  const rows = useMemo(() => (analyses ?? [])
    .map((a) => ({ t: Date.parse(a.created_at), flagged: FLAGGED.has(a.classification) }))
    .filter((a) => !Number.isNaN(a.t)), [analyses])
  const days = useMemo(() => Array.from({ length: DAYS_SHOWN }, (_, i) => {
    const start = today - (DAYS_SHOWN - 1 - i) * DAY
    const d = new Date(start)
    return {
      start,
      date: String(d.getDate()).padStart(2, '0'),
      weekday: d.toLocaleDateString(undefined, { weekday: 'short' }),
      count: rows.filter((r) => r.t >= start && r.t < start + DAY).length,
    }
  }), [rows, today])
  const oldest = rows.length ? Math.min(...rows.map((r) => r.t)) : null
  const truncated = analyses?.length >= 500 && oldest !== null && oldest > days[0].start

  const buckets = useMemo(() => {
    if (scale === 'days') {
      return days.map((d) => {
        const inDay = rows.filter((r) => r.t >= d.start && r.t < d.start + DAY)
        return { label: d.date, title: `${d.weekday} ${d.date}`, screened: inDay.length,
                 flagged: inDay.filter((r) => r.flagged).length }
      })
    }
    return Array.from({ length: 24 }, (_, h) => {
      const from = day + h * 3_600_000
      const inHour = rows.filter((r) => r.t >= from && r.t < from + 3_600_000)
      const label = h === 0 ? '12 am' : h < 12 ? `${h} am` : h === 12 ? '12 pm' : `${h - 12} pm`
      return { label, title: label, screened: inHour.length, flagged: inHour.filter((r) => r.flagged).length,
               future: from > now }
    })
  }, [scale, day, days, rows, now])

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
          <b>{runtime ? `${liveCount} of 3` : '—'}</b> detectors ready
        </span>
        <button className="dash-chip" style={{ cursor: 'pointer' }} onClick={() => go('/cases')}>
          <b>{open ? open.length : '—'}</b> waiting
        </button>
        <span className="dash-chip">
          <span className={running ? 'hero-pulse' : ''}
                style={running ? undefined : { width: 8, height: 8, borderRadius: 99, background: 'rgb(var(--ds-faint))' }} />
          <b style={{ fontSize: 14 }}>{running ? 'Monitor live' : 'Monitor stopped'}</b>
        </span>
      </div>

      <div className="dash-row">
        <div style={{ minWidth: 0 }}>
          <div className="dash-head">
            <h2 className="dash-h">Statistics</h2>
            <div className="dash-tabs" role="tablist" aria-label="Chart scale">
              <button role="tab" aria-selected={scale === 'hours'} onClick={() => setScale('hours')}>Hours</button>
              <button role="tab" aria-selected={scale === 'days'} onClick={() => setScale('days')}>Days</button>
            </div>
          </div>
          <div className="dash-days" role="group" aria-label="Day">
            {days.map((d) => (
              <button key={d.start} className="dash-day"
                      aria-pressed={scale === 'hours' && d.start === day}
                      data-empty={d.count === 0}
                      title={`${d.count.toLocaleString()} screened`}
                      onClick={() => { setDay(d.start); setScale('hours') }}>
                <b>{d.date}</b><span>{d.weekday}</span>
              </button>
            ))}
          </div>
          {analyses === null ? (
            <div className="ds-empty">Screening history could not be loaded.</div>
          ) : (
            <VolumeChart buckets={buckets} />
          )}
          <div className="dash-legend">
            <span><i />Screened</span>
            <span><i className="dashed" />Flagged high or critical</span>
            <span style={{ marginLeft: 'auto', color: 'rgb(var(--ds-faint))' }}>
              {truncated ? 'Older days fall outside the latest 500 screenings' : `${rows.length.toLocaleString()} screenings in view`}
            </span>
          </div>

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
                    sub={`${typeof e.amount === 'number' ? e.amount.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'} · ${SEV[e.risk_level]?.label ?? 'scored'}`}
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
            <div className="dash-hero-num">{typeof c.screened === 'number' ? `+${compact(c.screened)}` : '—'}</div>
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
              When a transaction escalates, the accounts around it are drawn here.
              {canControlPipeline
                ? ' Ingest a file with the Query Runner, or start the monitor.'
                : ' Screening is controlled by an administrator.'}
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gap: 14, minWidth: 0 }}>
          <div className="dash-card" style={{ padding: 22 }}>
            <div className="dash-head" style={{ marginBottom: 14 }}>
              <h2 className="dash-h dash-h-sm">Models</h2>
              <span className="ds-mono" style={{ fontSize: 14, color: 'rgb(var(--ds-muted))' }}>
                {runtime ? `${liveCount} / 3` : '—'}
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
              {liveCount === 3 ? 'Every verdict is fused from the full set of detectors.'
                : 'Confidence is reduced while a model is missing.'}
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
                  ['Per minute', typeof c.throughput_per_min === 'number' ? c.throughput_per_min : '—']].map(([l, v]) => (
                  <div key={l}>
                    <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-.03em' }}>{v}</div>
                    <div className="ds-section-label" style={{ marginTop: 4 }}>{l}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 13, lineHeight: 1.6, color: 'rgb(var(--ds-muted))' }}>
                {state?.source === 'queue' ? 'Screening ingested traffic.'
                  : running ? 'Replaying sample transactions. Point this service and the Query Runner at the same database to screen real arrivals.'
                    : 'Not screening. Point this service and the Query Runner at the same database to screen real arrivals.'}
              </div>
            )}
          </div>
        </div>
      </div>

      <Footer left="Scores are calibrated probabilities, not verdicts." />
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
  const [analyses, setAnalyses] = useState(undefined)
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
    listAnalyses(500).then((a) => setAnalyses(Array.isArray(a) ? a : [])).catch(() => setAnalyses(null))
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
             analyses={analyses === undefined ? [] : analyses} now={now}
             go={navigate} onDecide={decide} deciding={deciding}
             canControlPipeline={canControlPipeline} />
    </ConsoleShell>
  )
}
