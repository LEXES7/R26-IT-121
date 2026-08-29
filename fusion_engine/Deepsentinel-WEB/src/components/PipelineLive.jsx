import { useMemo } from 'react'

/**
 * The screening pipeline, drawn as it actually behaves.
 *
 * The geometry carries the argument. Every transaction enters the relational
 * model; only the escalated minority continues to the other two detectors, and
 * only a fraction of those becomes an alert. A row of five equal boxes implies
 * all five always run on everything, which is exactly the misunderstanding
 * this replaces — and it is also the project's central efficiency claim, so it
 * is worth drawing correctly.
 *
 * So the connectors are **ribbons whose width is the real volume passing
 * through them**, taken from the monitor's own counters. The pipe into
 * GraphSAGE is thick, the escalation branch is a sliver, and the difference
 * between them is the point. The cleared traffic is drawn too, fading out
 * downward, because "most of it stops here" is information and an unlabelled
 * gap is not.
 *
 * Flow is shown by particles travelling the ribbons rather than a marching
 * dash: their spacing reads as density, so a busy pipeline looks busy. They
 * are suppressed under `prefers-reduced-motion`.
 *
 * SVG throughout, no dependency: this is a dozen paths and a handful of
 * circles, and the layout is fixed rather than computed.
 */

const reduceMotion = () =>
  typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

const W = 940
const H = 288

/* Stage geometry. Fixed rather than solved: five nodes in a known shape. */
const NODES = {
  graph:       { x: 150, y: 118, w: 132, h: 52, label: 'GraphSAGE',  sub: 'screens everything' },
  behavioural: { x: 412, y: 44,  w: 132, h: 52, label: 'Behaviour',  sub: 'VAE + DSAA' },
  temporal:    { x: 412, y: 192, w: 132, h: 52, label: 'Timing',     sub: 'sequence TCN' },
  fusion:      { x: 632, y: 118, w: 126, h: 52, label: 'Fusion',     sub: 'meta-classifier' },
  alert:       { x: 802, y: 118, w: 112, h: 52, label: 'Alert',      sub: 'report + email' },
}
const HUE = {
  graph: 'var(--ds-accent)',
  behavioural: 'var(--ds-signal)',
  temporal: 'var(--ds-warn)',
  fusion: 'var(--ds-accent)',
  alert: 'var(--ds-signal)',
}

const mid = (n) => ({ x: n.x + n.w / 2, y: n.y + n.h / 2 })
const right = (n) => ({ x: n.x + n.w, y: n.y + n.h / 2 })
const left = (n) => ({ x: n.x, y: n.y + n.h / 2 })

/** A horizontal ribbon of a given thickness, bending between two points. */
function ribbon(a, b, thickness) {
  const t = thickness / 2
  const cx = (a.x + b.x) / 2
  return [
    `M${a.x},${a.y - t}`,
    `C${cx},${a.y - t} ${cx},${b.y - t} ${b.x},${b.y - t}`,
    `L${b.x},${b.y + t}`,
    `C${cx},${b.y + t} ${cx},${a.y + t} ${a.x},${a.y + t}`,
    'Z',
  ].join(' ')
}

/** The centre line of that ribbon, for particles to travel along. */
function spine(a, b) {
  const cx = (a.x + b.x) / 2
  return `M${a.x},${a.y} C${cx},${a.y} ${cx},${b.y} ${b.x},${b.y}`
}

function Stage({ id, node, status, count, label }) {
  const active = status === 'active'
  const colour = `rgb(${HUE[id]})`
  return (
    <g>
      {active && (
        <rect x={node.x - 4} y={node.y - 4} width={node.w + 8} height={node.h + 8} rx={12}
              fill="none" stroke={colour} strokeWidth="1.5" opacity="0.5">
          <animate attributeName="opacity" values="0.5;0.08;0.5" dur="1.3s" repeatCount="indefinite" />
          <animate attributeName="stroke-width" values="1.5;3;1.5" dur="1.3s" repeatCount="indefinite" />
        </rect>
      )}
      <rect x={node.x} y={node.y} width={node.w} height={node.h} rx={9}
            fill="rgb(var(--ds-surface))"
            stroke={active ? colour : 'rgb(var(--ds-line))'}
            strokeWidth={active ? 1.6 : 1} />
      {/* A tick of stage colour, so the node is identifiable at a glance. */}
      <rect x={node.x} y={node.y} width={3} height={node.h} rx={2} fill={colour}
            opacity={active ? 1 : 0.45} />
      <text x={node.x + 14} y={node.y + 22} fontSize="12.5" fontWeight="600"
            fill="rgb(var(--ds-ink))" fontFamily="Space Grotesk, sans-serif">
        {node.label}
      </text>
      <text x={node.x + 14} y={node.y + 38} fontSize="9.5" fill="rgb(var(--ds-muted))"
            fontFamily="Space Grotesk, sans-serif">
        {node.sub}
      </text>
      {count !== null && count !== undefined && (
        <>
          <text x={node.x + node.w} y={node.y - 16} fontSize="13" textAnchor="end"
                fill={colour} fontFamily="DM Mono, monospace">
            {count.toLocaleString()}
          </text>
          {label && (
            <text x={node.x + node.w} y={node.y - 5} fontSize="8" textAnchor="end"
                  fill="rgb(var(--ds-faint))" fontFamily="Space Grotesk, sans-serif"
                  letterSpacing="0.09em">
              {label.toUpperCase()}
            </text>
          )}
        </>
      )}
    </g>
  )
}

/** Money moving. Count and speed follow the ribbon's own volume. */
function Flow({ d, colour, n, dur, r = 2.4 }) {
  return Array.from({ length: n }, (_, i) => (
    <circle key={i} r={r} fill={colour} opacity="0.9">
      {/* Negative begin: already this far along, so every drop is on the path
          from the first frame instead of parking at the origin. */}
      <animateMotion path={d} dur={`${dur}s`} repeatCount="indefinite"
                     begin={`${-(i * dur) / n}s`} />
    </circle>
  ))
}

export default function PipelineLive({ stages, escalating, counters }) {
  const still = useMemo(reduceMotion, [])
  const c = counters ?? {}
  const screened = c.screened ?? 0
  const escalated = c.escalated ?? 0
  const alerts = c.alerts ?? 0
  const cleared = Math.max(screened - escalated, 0)

  // Ribbon widths are the real proportions, floored so a rare path stays
  // visible and capped so a common one does not swamp the drawing.
  const width = (part, whole, max = 30) => {
    if (!whole) return 3
    return Math.max(2.5, Math.min((part / whole) * max, max))
  }
  const inWidth = 30
  const escWidth = width(escalated, screened || 1, 26)
  const clearWidth = Math.max(inWidth - escWidth, 2)
  const alertWidth = width(alerts, escalated || 1, 20)

  const g = NODES.graph
  const gRight = right(g)
  const stream = { x: 34, y: mid(g).y }

  const toBeh = spine(gRight, left(NODES.behavioural))
  const toTem = spine(gRight, left(NODES.temporal))
  const behToFus = spine(right(NODES.behavioural), { x: NODES.fusion.x, y: mid(NODES.fusion).y - 9 })
  const temToFus = spine(right(NODES.temporal), { x: NODES.fusion.x, y: mid(NODES.fusion).y + 9 })
  const fusToAlert = spine(right(NODES.fusion), left(NODES.alert))
  const inFlow = spine(stream, left(g))

  const rate = c.throughput_per_min ?? 0
  // Busier stream, faster drops — bounded so it never becomes a strobe.
  const dur = rate > 0 ? Math.max(1.6, Math.min(6, 220 / rate)) : 4

  const st = (k) => stages?.[k]
  const anyActive = Object.values(stages ?? {}).some((v) => v === 'active')

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 700, height: 'auto' }}
           role="img"
           aria-label={`Screening pipeline: ${screened} screened, ${escalated} escalated, ${alerts} alerts`}>
        <defs>
          <filter id="pl-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <linearGradient id="pl-clear" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--ds-accent))" stopOpacity="0.22" />
            <stop offset="100%" stopColor="rgb(var(--ds-accent))" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* ── the ribbons, widths proportional to real volume ── */}
        <g>
          <path d={ribbon(stream, left(g), inWidth)}
                fill="rgb(var(--ds-accent))" opacity="0.14" />

          {/* Cleared traffic: the majority, and it stops here. Drawn falling
              away so the drop-off is visible rather than merely implied. */}
          <path d={ribbon(gRight, { x: gRight.x + 52, y: gRight.y + 108 }, clearWidth)}
                fill="url(#pl-clear)" />
          <text x={gRight.x + 6} y={gRight.y + 112} fontSize="8"
                fill="rgb(var(--ds-faint))" fontFamily="Space Grotesk, sans-serif"
                letterSpacing="0.09em">
            CLEARED
          </text>
          <text x={gRight.x + 6} y={gRight.y + 126} fontSize="11"
                fill="rgb(var(--ds-muted))" fontFamily="DM Mono, monospace">
            {cleared.toLocaleString()}
          </text>

          <path d={ribbon(gRight, left(NODES.behavioural), escWidth)}
                fill="rgb(var(--ds-signal))" opacity="0.2" />
          <path d={ribbon(gRight, left(NODES.temporal), escWidth)}
                fill="rgb(var(--ds-warn))" opacity="0.2" />
          <path d={ribbon(right(NODES.behavioural), { x: NODES.fusion.x, y: mid(NODES.fusion).y - 9 }, escWidth)}
                fill="rgb(var(--ds-signal))" opacity="0.16" />
          <path d={ribbon(right(NODES.temporal), { x: NODES.fusion.x, y: mid(NODES.fusion).y + 9 }, escWidth)}
                fill="rgb(var(--ds-warn))" opacity="0.16" />
          <path d={ribbon(right(NODES.fusion), left(NODES.alert), alertWidth)}
                fill="rgb(var(--ds-signal))" opacity="0.24" />
        </g>

        {/* ── flow ── */}
        {!still && (
          <g filter="url(#pl-glow)">
            <Flow d={inFlow} colour="rgb(var(--ds-accent))" n={5} dur={dur} />
            <Flow d={toBeh} colour="rgb(var(--ds-signal))" n={2} dur={dur * 1.25} r={2} />
            <Flow d={toTem} colour="rgb(var(--ds-warn))" n={2} dur={dur * 1.25} r={2} />
            <Flow d={behToFus} colour="rgb(var(--ds-signal))" n={1} dur={dur * 1.4} r={2} />
            <Flow d={temToFus} colour="rgb(var(--ds-warn))" n={1} dur={dur * 1.4} r={2} />
            {alerts > 0 && (
              <Flow d={fusToAlert} colour="rgb(var(--ds-signal))" n={1} dur={dur * 1.5} r={2.6} />
            )}
          </g>
        )}

        {/* ── labels on the branch ── */}
        <text x={stream.x} y={stream.y - 24} fontSize="9.5" fill="rgb(var(--ds-faint))"
              fontFamily="Space Grotesk, sans-serif">stream</text>
        <text x={stream.x} y={stream.y - 11} fontSize="11" fill="rgb(var(--ds-muted))"
              fontFamily="DM Mono, monospace">
          {rate ? `${rate}/min` : 'idle'}
        </text>

        <text x={gRight.x + 20} y={gRight.y - 40} fontSize="9"
              fill={escalating ? 'rgb(var(--ds-signal))' : 'rgb(var(--ds-faint))'}
              fontFamily="Space Grotesk, sans-serif">
          escalate
        </text>
        <text x={gRight.x + 20} y={gRight.y - 28} fontSize="10"
              fill="rgb(var(--ds-signal))" fontFamily="DM Mono, monospace">
          {screened ? `${((escalated / screened) * 100).toFixed(1)}%` : '—'}
        </text>

        {/* ── the stages ── */}
        <Stage id="graph" node={NODES.graph} status={st('graph')}
               count={screened || null} label="screened" />
        <Stage id="behavioural" node={NODES.behavioural} status={st('behavioural')} />
        <Stage id="temporal" node={NODES.temporal} status={st('temporal')} />
        <Stage id="fusion" node={NODES.fusion} status={st('fusion')}
               count={escalated || null} label="fused" />
        <Stage id="alert" node={NODES.alert} status={st('report')}
               count={alerts || null} label="sent" />

        {/* A quiet marker that nothing is moving, so a stalled pipeline is not
            mistaken for a calm one. */}
        {!anyActive && !escalating && (
          <text x={W - 8} y={H - 8} fontSize="9" textAnchor="end"
                fill="rgb(var(--ds-faint))" fontFamily="Space Grotesk, sans-serif">
            {rate ? 'between transactions' : 'not screening'}
          </text>
        )}
      </svg>
    </div>
  )
}
