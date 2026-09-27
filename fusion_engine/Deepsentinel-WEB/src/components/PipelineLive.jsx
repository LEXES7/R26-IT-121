import { useMemo } from 'react'

/**
 * The screening pipeline, drawn as it actually behaves.
 *
 * Three detectors, one transaction, all at once. This diagram has been wrong
 * twice, in the same direction each time: it drew a cascade, where the
 * relational model decided whether the other two were worth running. That was
 * how the engine worked, and the engine was measured and changed — the gate
 * cost half the frauds in a 400-transaction replay, because a gate in front of
 * an independent detector cannot do better than the detector.
 *
 * So the geometry is now a fan-out and a convergence, and it has no branch in
 * it at all. Everything narrows in one place: the fused verdict, where most of
 * the stream is cleared and a little of it becomes a case. That is the only
 * decision the system makes, so it should be the only fork in the picture.
 *
 * The connectors are ribbons whose width is real volume. Upstream of Fusion
 * every ribbon is the whole stream and they are all the same width — that
 * equality is the claim. Downstream it splits into what was cleared and what
 * was flagged, and those two widths are the measured proportions.
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
const H = 310

/* Stage geometry. Fixed rather than solved: five nodes in a known shape. */
//
// A column of three, none of them above the others, and nothing between them.
// Any layout that puts one detector in front of another — even visually — is
// making a claim about the engine that stopped being true.
const NODES = {
  graph:       { x: 172, y: 44,  w: 152, h: 50, label: 'GraphSAGE', sub: 'every transaction' },
  behavioural: { x: 172, y: 128, w: 152, h: 50, label: 'Behaviour', sub: 'every transaction' },
  temporal:    { x: 172, y: 212, w: 152, h: 50, label: 'Timing',    sub: 'every transaction' },
  fusion:      { x: 566, y: 123, w: 132, h: 60, label: 'Fusion',    sub: 'meta-classifier' },
  alert:       { x: 762, y: 128, w: 130, h: 50, label: 'Alert',     sub: 'report + email' },
}
const HUE = {
  graph: 'var(--ds-accent)',
  behavioural: 'var(--ds-signal)',
  temporal: 'var(--ds-warn)',
  fusion: 'var(--ds-accent)',
  alert: 'var(--ds-signal)',
}

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

/** The same ribbon, falling instead of running: thickness is horizontal. */
function vribbon(a, b, thickness) {
  const t = thickness / 2
  const cy = (a.y + b.y) / 2
  return [
    `M${a.x - t},${a.y}`,
    `C${a.x - t},${cy} ${b.x - t},${cy} ${b.x - t},${b.y}`,
    `L${b.x + t},${b.y}`,
    `C${b.x + t},${cy} ${a.x + t},${cy} ${a.x + t},${a.y}`,
    'Z',
  ].join(' ')
}

/** The centre line of a ribbon, for particles to travel along. */
function spine(a, b) {
  const cx = (a.x + b.x) / 2
  return `M${a.x},${a.y} C${cx},${a.y} ${cx},${b.y} ${b.x},${b.y}`
}
function vspine(a, b) {
  const cy = (a.y + b.y) / 2
  return `M${a.x},${a.y} C${a.x},${cy} ${b.x},${cy} ${b.x},${b.y}`
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
  const flagged = c.flagged ?? 0
  const alerts = c.alerts ?? 0
  const cleared = Math.max(screened - flagged, 0)

  // Ribbon widths are the real proportions, floored so a rare path stays
  // visible and capped so a common one does not swamp the drawing.
  const width = (part, whole, max = 30) => {
    if (!whole) return 3
    return Math.max(2.5, Math.min((part / whole) * max, max))
  }
  const inWidth = 16
  const flagWidth = width(flagged, screened || 1, inWidth)
  const clearWidth = Math.max(inWidth - flagWidth, 2)
  const alertWidth = width(alerts, screened || 1, inWidth)

  const stream = { x: 38, y: 153 }
  // Three arrivals on the Fusion edge, spaced so the ribbons keep a gap.
  const FUSE_IN = { graph: 135, behavioural: 153, temporal: 171 }
  const fuseAt = (k) => ({ x: NODES.fusion.x, y: FUSE_IN[k] })
  const fuseBottom = { x: NODES.fusion.x + NODES.fusion.w / 2, y: NODES.fusion.y + NODES.fusion.h }
  const dropEnd = { x: fuseBottom.x, y: 264 }

  const feed = (k) => spine(stream, left(NODES[k]))
  const carry = (k) => spine(right(NODES[k]), fuseAt(k))
  const fusToAlert = spine(right(NODES.fusion), left(NODES.alert))
  const clearFall = vspine(fuseBottom, dropEnd)

  const rate = c.throughput_per_min ?? 0
  // Busier stream, faster drops — bounded so it never becomes a strobe.
  const dur = rate > 0 ? Math.max(1.6, Math.min(6, 220 / rate)) : 4

  const st = (k) => stages?.[k]
  const anyActive = Object.values(stages ?? {}).some((v) => v === 'active')

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 700, height: 'auto' }}
           role="img"
           aria-label={`Screening pipeline: ${screened} screened by all three detectors, ${flagged} flagged, ${alerts} alerts`}>
        <defs>
          <filter id="pl-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <linearGradient id="pl-clear" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--ds-accent))" stopOpacity="0.22" className="pl-clear-stop" />
            <stop offset="100%" stopColor="rgb(var(--ds-accent))" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* ── the ribbons ── */}
        <g>
          {/* the same stream to all three, at the same width, at once */}
          <path d={ribbon(stream, left(NODES.graph), inWidth)}
                fill="rgb(var(--ds-accent))" opacity="0.14" className="pl-ribbon" />
          <path d={ribbon(stream, left(NODES.behavioural), inWidth)}
                fill="rgb(var(--ds-signal))" opacity="0.13" className="pl-ribbon" />
          <path d={ribbon(stream, left(NODES.temporal), inWidth)}
                fill="rgb(var(--ds-warn))" opacity="0.12" className="pl-ribbon" />

          {/* three scores converging on the meta-classifier */}
          <path d={ribbon(right(NODES.graph), fuseAt('graph'), inWidth)}
                fill="rgb(var(--ds-accent))" opacity="0.14" className="pl-ribbon" />
          <path d={ribbon(right(NODES.behavioural), fuseAt('behavioural'), inWidth)}
                fill="rgb(var(--ds-signal))" opacity="0.13" className="pl-ribbon" />
          <path d={ribbon(right(NODES.temporal), fuseAt('temporal'), inWidth)}
                fill="rgb(var(--ds-warn))" opacity="0.12" className="pl-ribbon" />

          {/* The one decision in the system, and the only fork in the picture:
              most of the stream is cleared here, a little of it is flagged. */}
          <path d={vribbon(fuseBottom, dropEnd, clearWidth)} fill="url(#pl-clear)" />
          <path d={ribbon(right(NODES.fusion), left(NODES.alert), alertWidth)}
                fill="rgb(var(--ds-signal))" opacity="0.26" className="pl-ribbon-alert" />
        </g>

        {/* ── flow ── */}
        {!still && (
          <>
            <g filter="url(#pl-glow)">
              <Flow d={feed('graph')} colour="rgb(var(--ds-accent))" n={4} dur={dur} />
              <Flow d={feed('behavioural')} colour="rgb(var(--ds-signal))" n={4} dur={dur} />
              <Flow d={feed('temporal')} colour="rgb(var(--ds-warn))" n={4} dur={dur} />
              <Flow d={carry('graph')} colour="rgb(var(--ds-accent))" n={3} dur={dur * 1.2} r={2} />
              <Flow d={carry('behavioural')} colour="rgb(var(--ds-signal))" n={3} dur={dur * 1.2} r={2} />
              <Flow d={carry('temporal')} colour="rgb(var(--ds-warn))" n={3} dur={dur * 1.2} r={2} />
              {alerts > 0 && (
                <Flow d={fusToAlert} colour="rgb(var(--ds-signal))" n={1} dur={dur * 1.5} r={2.6} />
              )}
            </g>
            {/* the cleared majority, falling out of the pipeline */}
            <g opacity="0.32">
              <Flow d={clearFall} colour="rgb(var(--ds-accent))" n={4} dur={dur * 1.6} r={1.8} />
            </g>
          </>
        )}

        {/* ── labels ── */}
        <text x={stream.x} y={stream.y - 44} fontSize="9.5" fill="rgb(var(--ds-faint))"
              fontFamily="Space Grotesk, sans-serif">stream</text>
        <text x={stream.x} y={stream.y - 31} fontSize="11" fill="rgb(var(--ds-muted))"
              fontFamily="DM Mono, monospace">
          {rate ? `${rate}/min` : 'idle'}
        </text>

        {/* Counted once, above the column, because one screening happened —
            not three. Putting it on a single box would say that box did it. */}
        {screened > 0 && (
          <>
            <text x={NODES.graph.x} y={28} fontSize="13" fill="rgb(var(--ds-accent))"
                  fontFamily="DM Mono, monospace">
              {screened.toLocaleString()}
            </text>
            <text x={NODES.graph.x + 12 + String(screened).length * 8} y={28} fontSize="8"
                  fill="rgb(var(--ds-faint))" fontFamily="Space Grotesk, sans-serif"
                  letterSpacing="0.09em">
              SCREENED · ALL THREE
            </text>
          </>
        )}

        <text x={dropEnd.x} y={dropEnd.y + 16} fontSize="8" textAnchor="middle"
              fill="rgb(var(--ds-faint))" fontFamily="Space Grotesk, sans-serif"
              letterSpacing="0.09em">
          CLEARED
        </text>
        <text x={dropEnd.x} y={dropEnd.y + 32} fontSize="11" textAnchor="middle"
              fill="rgb(var(--ds-muted))" fontFamily="DM Mono, monospace">
          {cleared.toLocaleString()}
        </text>

        {/* ── the stages ── */}
        <Stage id="graph" node={NODES.graph} status={st('graph')} />
        <Stage id="behavioural" node={NODES.behavioural} status={st('behavioural')} />
        <Stage id="temporal" node={NODES.temporal} status={st('temporal')} />
        <Stage id="fusion" node={NODES.fusion} status={st('fusion')}
               count={flagged || null} label="flagged" />
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
