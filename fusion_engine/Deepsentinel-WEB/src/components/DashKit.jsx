import { useEffect, useMemo, useRef, useState } from 'react'

/**
 * The parts both console home pages are built from: a volume chart under a
 * strip of days, list rows with a badge, and small inline glyphs.
 *
 * The chart takes plain events, a time and one yes/no each, so the operator's
 * page can chart cases opened against the serious ones and the
 * administrator's page alerts raised against the ones delivered, from the
 * same component and without either knowing about the other.
 */

export const DAY = 86_400_000
const HOUR = 3_600_000
const DAYS_SHOWN = 13

export const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime() }

export const compact = (v) => {
  if (typeof v !== 'number') return '—'
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`
  if (v >= 1e4) return `${(v / 1e3).toFixed(1)}k`
  return v.toLocaleString()
}

/* Small inline glyphs; they inherit currentColor. */
export const G = {
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.35-4.35',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-15v5l3 2',
  score: 'M3 12h4l3 8 4-16 3 8h4',
  layers: 'M12 2 2 7l10 5 10-5-10-5ZM2 17l10 5 10-5M2 12l10 5 10-5',
  sink: 'M12 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM5 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm14 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM6.4 6.4 10.6 15.6m7-9.2-4.2 9.2',
  accounts: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-14v.01M12 11v6',
  swap: 'M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4m4 4H7',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7l1-8Z',
  refresh: 'M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6',
  mail: 'M4 5h16v14H4zM4 6l8 7 8-7',
  server: 'M4 4h16v6H4zM4 14h16v6H4zM8 7h.01M8 17h.01',
}

export function Glyph({ d, size = 15 }) {
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

/** Series A as a filled line, series B as a dashed one, on one scale. */
function VolumeChart({ buckets, labels }) {
  const [ref, width] = useWidth()
  const [hover, setHover] = useState(null)
  const H = 250, padL = 34, padR = 8, padT = 16, padB = 30
  const W = Math.max(width, 300)
  const max = Math.max(1, ...buckets.map((b) => Math.max(b.a, b.b)))
  const step = Math.max(1, Math.ceil(max / 3))
  const top = step * 3
  const x = (i) => padL + (i / Math.max(1, buckets.length - 1)) * (W - padL - padR)
  const y = (v) => padT + (1 - v / top) * (H - padT - padB)
  // Hours still to come are not zeros; the line stops at the present.
  const past = buckets.filter((b) => !b.future)
  const lineA = past.map((b, i) => [x(i), y(b.a)])
  const lineB = past.map((b, i) => [x(i), y(b.b)])
  const area = lineA.length > 1 ? `${smooth(lineA)} L${x(past.length - 1)},${y(0)} L${x(0)},${y(0)} Z` : ''
  const every = buckets.length > 14 ? 2 : 1

  const onMove = (e) => {
    if (!past.length) return
    const r = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * W
    const i = Math.round(((px - padL) / (W - padL - padR)) * (buckets.length - 1))
    setHover(Math.max(0, Math.min(past.length - 1, i)))
  }
  const h = hover === null ? null : past[hover]

  return (
    <div className="dash-chart" ref={ref}>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} role="img"
           aria-label={`${labels.a} and ${labels.b.toLowerCase()} per ${buckets.length === 24 ? 'hour' : 'day'}`}
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
        <path d={smooth(lineA)} fill="none" stroke="rgb(var(--dash-line))" strokeWidth="2.5" strokeLinejoin="round" />
        <path d={smooth(lineB)} fill="none" stroke="rgb(var(--ds-ink))" strokeOpacity=".7" strokeWidth="2" strokeDasharray="6 6" />
        {buckets.map((b, i) => i % every === 0 && (
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle">{b.label}</text>
        ))}
        {h && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={padT} y2={y(0)} stroke="rgb(var(--ds-ink))" strokeOpacity=".25" />
            <circle cx={x(hover)} cy={y(h.a)} r="5" fill="rgb(var(--dash-line))"
                    stroke="rgb(var(--ds-workspace))" strokeWidth="2" />
            <circle cx={x(hover)} cy={y(h.b)} r="4" fill="rgb(var(--ds-ink))"
                    stroke="rgb(var(--ds-workspace))" strokeWidth="2" />
          </g>
        )}
      </svg>
      {h && (
        <div className="dash-tip" style={{ left: `${(x(hover) / W) * 100}%` }}>
          <b>{h.title}</b> · {h.a.toLocaleString()} {labels.a.toLowerCase()} · {h.b.toLocaleString()} {labels.b.toLowerCase()}
        </div>
      )}
    </div>
  )
}

/**
 * The statistics block: a heading with an hours or days switch, thirteen
 * days to pick from, and the chart for the one picked.
 *
 * `events` are `{ t, b }`: when something happened, and whether it also
 * counts for the dashed series. `cap` is how many rows the source returns at
 * most, so the block can say when older days are missing rather than drawing
 * them as quiet.
 */
export function Statistics({ events, now, labels, cap, failed }) {
  const [scale, setScale] = useState('hours')
  const [picked, setPicked] = useState(null)
  const today = startOfDay(now)

  const days = useMemo(() => Array.from({ length: DAYS_SHOWN }, (_, i) => {
    const start = today - (DAYS_SHOWN - 1 - i) * DAY
    const d = new Date(start)
    return {
      start,
      date: String(d.getDate()).padStart(2, '0'),
      weekday: d.toLocaleDateString(undefined, { weekday: 'short' }),
      count: events.filter((e) => e.t >= start && e.t < start + DAY).length,
    }
  }), [events, today])

  // Open on the latest day that has anything, rather than on an empty today.
  const day = picked ?? [...days].reverse().find((d) => d.count)?.start ?? today

  const buckets = useMemo(() => {
    if (scale === 'days') {
      return days.map((d) => {
        const inDay = events.filter((e) => e.t >= d.start && e.t < d.start + DAY)
        return { label: d.date, title: `${d.weekday} ${d.date}`, a: inDay.length, b: inDay.filter((e) => e.b).length }
      })
    }
    return Array.from({ length: 24 }, (_, h) => {
      const from = day + h * HOUR
      const inHour = events.filter((e) => e.t >= from && e.t < from + HOUR)
      const label = h === 0 ? '12 am' : h < 12 ? `${h} am` : h === 12 ? '12 pm' : `${h - 12} pm`
      return { label, title: label, a: inHour.length, b: inHour.filter((e) => e.b).length, future: from > now }
    })
  }, [scale, day, days, events, now])

  const oldest = events.length ? Math.min(...events.map((e) => e.t)) : null
  const truncated = cap && events.length >= cap && oldest !== null && oldest > days[0].start

  return (
    <div>
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
                  title={`${d.count.toLocaleString()} ${labels.a.toLowerCase()}`}
                  onClick={() => { setPicked(d.start); setScale('hours') }}>
            <b>{d.date}</b><span>{d.weekday}</span>
          </button>
        ))}
      </div>
      {failed ? (
        <div className="ds-empty">The history could not be loaded.</div>
      ) : (
        <VolumeChart buckets={buckets} labels={labels} />
      )}
      <div className="dash-legend">
        <span><i />{labels.a}</span>
        <span><i className="dashed" />{labels.b}</span>
        <span style={{ marginLeft: 'auto', color: 'rgb(var(--ds-faint))' }}>
          {truncated ? `Older days fall outside the latest ${cap}` : `${events.length.toLocaleString()} in view`}
        </span>
      </div>
    </div>
  )
}

/** A row in the side column: a round mark, two lines, and a badge on the corner. */
export function Person({ colour, mark, name, sub, badge, badgeAlert, onClick, mono }) {
  const clickable = Boolean(onClick)
  return (
    <div className="dash-card dash-person" role={clickable ? 'link' : undefined} tabIndex={clickable ? 0 : undefined}
         style={clickable ? undefined : { cursor: 'default' }}
         onClick={onClick} onKeyDown={(e) => clickable && e.key === 'Enter' && onClick()}>
      <div className="dash-avatar" style={{ width: 44, height: 44, color: colour,
                                            background: `color-mix(in srgb, ${colour} 16%, transparent)` }}>
        {mark}
      </div>
      <div style={{ minWidth: 0 }}>
        <div className={`dash-person-name ${mono ? 'ds-mono' : ''}`} style={mono ? { fontSize: 13 } : undefined}>{name}</div>
        <div className="dash-person-sub">{sub}</div>
      </div>
      {badge && (
        <span className="dash-badge"
              style={badgeAlert ? { background: 'rgb(var(--ds-signal))', color: '#FFFFFF' } : undefined}>
          {badge}
        </span>
      )}
    </div>
  )
}
