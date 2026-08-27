import { useEffect, useMemo, useRef, useState } from 'react'
import { cx } from './ui'

/**
 * The forensic subgraph, drawn.
 *
 * The extractor already returns which accounts are implicated, what role each
 * plays, how heavily each transfer weighed in the decision, and at which step
 * it happened. Rendered as a table that is a list of facts; rendered like this
 * it is a picture of money converging, which is the thing an investigator
 * actually reasons about.
 *
 * Why this layout
 * ---------------
 * Nodes are ranked by how many hops of *money* separate them from the sink,
 * walking edges backwards from it. Ring 0 is the destination, ring 1 pays it
 * directly, ring 2 pays ring 1. Depth is therefore laundering distance, not
 * an arbitrary split, and the picture says the same true thing every time: a
 * ring that is one hop deep is a collection funnel, and one that is three hops
 * deep has been layered.
 *
 * Within a ring, accounts are ordered by the attention the model paid them, so
 * the heaviest contributor sits at the top and the eye lands on it first.
 *
 * What is encoded, and in what
 * ---------------------------
 *   ring          hops of money between this account and the destination
 *   edge width    the attention weight the model put on that transfer
 *   edge colour   a gradient from payer to payee, so direction reads without
 *                 needing to find the arrowhead
 *   particles     continuous flow; more and faster on heavier edges
 *   node arc      that account's own risk score, 0 to 1 around its rim
 *   node size     role, widened slightly by risk
 *
 * Plain SVG, no charting library: the graph is at most a few dozen nodes, and
 * a dependency would cost more than the code it saves.
 */

// The risk hues are literal in tailwind.config.js, and the modality variables
// hold bare RGB channels for Tailwind's `rgb(var(x) / a)` syntax — so neither
// can be passed to SVG as `var(--x)`. These mirror the config exactly; if the
// palette changes there, change it here too.
const ROLE = {
  SINK:          { fill: '#ef4444', label: 'Sink',          r: 21 },
  MULE_CENTRAL:  { fill: '#ef4444', label: 'Central mule',  r: 21 },
  MULE:          { fill: '#f97316', label: 'Mule',          r: 15 },
  FRESH_SENDER:  { fill: '#eab308', label: 'Fresh sender',  r: 12 },
  SENDER:        { fill: '#0f9b8e', label: 'Sender',        r: 12 },
  INTERMEDIARY:  { fill: '#c2740a', label: 'Intermediary',  r: 14 },
  LEGITIMATE:    { fill: '#6c655d', label: 'Not implicated', r: 11 },
}
const FALLBACK = { fill: '#0f9b8e', label: 'Account', r: 12 }
const role = (n) => ROLE[n?.role] ?? FALLBACK

const HAIR = 'rgb(148 163 184 / 0.22)'
const LABEL = 'rgb(148 163 184)'
const TRIGGER = '#2dd4bf'

const money = (n) =>
  typeof n === 'number'
    ? n >= 1000 ? `${(n / 1000).toFixed(0)}k` : n.toFixed(0)
    : ''

const reduceMotion = () =>
  typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/* ── geometry ─────────────────────────────────────────────────────── */

/** A quadratic curve between two points, bowed by `k` of its own length. */
function curve(a, b, k) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  return {
    cx: (a.x + b.x) / 2 - dy * k,
    cy: (a.y + b.y) / 2 + dx * k,
  }
}

/** Trim a curve back to the rim of each node so it meets the circle cleanly. */
function trimmed(a, b, ra, rb, k) {
  const { cx, cy } = curve(a, b, k)
  const start = pull(a, { x: cx, y: cy }, ra)
  const end = pull(b, { x: cx, y: cy }, rb)
  return {
    d: `M${start.x},${start.y} Q${cx},${cy} ${end.x},${end.y}`,
    end,
    // Tangent at t=1 on a quadratic is the direction control → end.
    angle: (Math.atan2(end.y - cy, end.x - cx) * 180) / Math.PI,
  }
}

/** Move `from` toward `toward` by `dist`. */
function pull(from, toward, dist) {
  const dx = toward.x - from.x
  const dy = toward.y - from.y
  const len = Math.hypot(dx, dy) || 1
  return { x: from.x + (dx / len) * dist, y: from.y + (dy / len) * dist }
}

/**
 * Rank every account by hops of money from the sink, then place each ring.
 *
 * The walk is backwards along the edges — from the destination toward whoever
 * paid it — because that is the direction the question runs in: not "where did
 * this account send money" but "who fed this".
 */
function layout(nodes, edges, sinkId, w, h) {
  const inbound = {}
  const weightOut = {}
  edges.forEach((e) => {
    (inbound[e.dst] ??= []).push(e.src)
    weightOut[e.src] = (weightOut[e.src] || 0) + (e.edge_attention_weight ?? 0)
  })

  const byId = Object.fromEntries(nodes.map((n) => [n.account_id, n]))
  const centre = byId[sinkId]
    ?? [...nodes].sort((a, b) => (b.in_degree ?? 0) - (a.in_degree ?? 0))[0]
  const centreId = centre?.account_id

  // Breadth-first, so every account gets its shortest distance to the money.
  const depth = { [centreId]: 0 }
  let frontier = [centreId]
  while (frontier.length) {
    const next = []
    frontier.forEach((id) => {
      (inbound[id] ?? []).forEach((src) => {
        if (depth[src] === undefined) {
          depth[src] = depth[id] + 1
          next.push(src)
        }
      })
    })
    frontier = next
  }

  // Some accounts in the subgraph never reach the destination at all when the
  // edges are walked backwards — they are present because they touch the ring,
  // not because they fund it. They get their own outer band, labelled for what
  // they are. Filing them on the next numbered ring would assert a funding
  // path that does not exist, which is the one thing this picture must not do.
  const detached = nodes
    .filter((n) => depth[n.account_id] === undefined)
    .map((n) => n.account_id)
  const reached = Object.values(depth)
  const maxReal = reached.length ? Math.max(...reached) : 0
  const DETACHED = maxReal + 1
  detached.forEach((id) => { depth[id] = DETACHED })
  const maxDepth = Math.max(...Object.values(depth), 1)

  const cx0 = w / 2
  const cy0 = h / 2
  // Room for the label under the lowest node and the amount on the edge.
  const rx = w / 2 - Math.min(92, w * 0.14)
  const ry = h / 2 - 34

  const pos = { [centreId]: { x: cx0, y: cy0 } }
  const angleOf = { [centreId]: 0 }
  const rings = []

  // Who each account pays. Used to seat a deeper account beside its own payee
  // rather than anywhere on its ring — otherwise a two-hop node lands opposite
  // the account it funds and drags a long edge straight across the picture.
  const paysTo = {}
  edges.forEach((e) => { (paysTo[e.src] ??= []).push(e.dst) })

  for (let d = 1; d <= maxDepth; d += 1) {
    const ring = nodes
      .filter((n) => depth[n.account_id] === d && n.account_id !== centreId)
      // Heaviest contributor first, so ring order carries the model's own
      // ranking rather than whatever order the extractor happened to emit.
      .sort((a, b) => (weightOut[b.account_id] ?? 0) - (weightOut[a.account_id] ?? 0))
    if (!ring.length) continue

    const t = maxDepth === 1 ? 1 : d / maxDepth
    const scale = 0.42 + 0.58 * t
    rings.push({
      depth: d, rx: rx * scale, ry: ry * scale, count: ring.length,
      detached: detached.length > 0 && d === DETACHED,
    })

    const place = (id, a) => {
      angleOf[id] = a
      pos[id] = {
        x: cx0 + rx * scale * Math.cos(a),
        y: cy0 + ry * scale * Math.sin(a),
      }
    }

    if (d === 1) {
      // One or two payers read best laid out across the page rather than
      // stacked above the sink; a real fan reads best as a fan.
      const start = ring.length <= 2 ? Math.PI : -Math.PI / 2
      ring.forEach((n, i) => {
        const a = ring.length === 1
          ? start
          : ring.length === 2
            ? start + (i === 0 ? -0.42 : 0.42)
            : start + (i / ring.length) * Math.PI * 2
        place(n.account_id, a)
      })
      continue
    }

    // Deeper rings cluster around whoever they fund, so the picture reads as
    // branches feeding branches instead of a tangle.
    const groups = new Map()
    ring.forEach((n) => {
      const parent = (paysTo[n.account_id] ?? []).find((id) => angleOf[id] !== undefined)
      const key = parent ?? '__orphan'
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(n)
    })

    let orphanSlot = 0
    const orphanCount = groups.get('__orphan')?.length ?? 0
    groups.forEach((kids, parent) => {
      if (parent === '__orphan') {
        // Nothing to cluster around: spread them evenly and leave it visible
        // that they attach elsewhere.
        kids.forEach((n) => {
          place(n.account_id, -Math.PI / 2 + (orphanSlot / Math.max(orphanCount, 1)) * Math.PI * 2)
          orphanSlot += 1
        })
        return
      }
      const base = angleOf[parent]
      // A wider fan for more children, capped so two branches cannot merge.
      const spread = Math.min(0.85, 0.26 * kids.length)
      kids.forEach((n, i) => {
        const offset = kids.length === 1
          ? 0
          : -spread / 2 + (i / (kids.length - 1)) * spread
        place(n.account_id, base + offset)
      })
    })
  }

  return { pos, centreId, depth, rings, cx0, cy0, detached: new Set(detached) }
}

/* ── component ────────────────────────────────────────────────────── */

export default function NetworkGraph({ evidence, height = 420 }) {
  const [hover, setHover] = useState(null)
  const [selected, setSelected] = useState(null)
  const [playing, setPlaying] = useState(false)
  const [clock, setClock] = useState(null)     // current step during playback
  const frame = useRef(null)
  const still = useMemo(reduceMotion, [])

  const nodes = evidence?.nodes ?? []
  const edges = evidence?.edges ?? []
  const sinkId = evidence?.sink_account

  // Height is what binds here, so a wide viewBox on a small graph does not
  // make the drawing bigger — it just pads it with empty canvas.
  const W = nodes.length <= 3 ? 560 : nodes.length <= 6 ? 700 : 860
  // Give a denser ring more room; a two-account case in a 420px canvas is
  // mostly empty, which reads as something failing to load.
  const H = nodes.length <= 2 ? Math.min(height, 230)
          : nodes.length <= 4 ? Math.min(height, 300)
          : nodes.length <= 8 ? Math.min(height, 360)
          : height

  const { pos, centreId, depth, rings, cx0, cy0, detached } = useMemo(
    () => layout(nodes, edges, sinkId, W, H), [nodes, edges, sinkId, W, H],
  )

  const steps = useMemo(
    () => [...new Set(edges.map((e) => e.step).filter((s) => typeof s === 'number'))]
      .sort((a, b) => a - b),
    [edges],
  )
  const maxWeight = Math.max(...edges.map((e) => e.edge_attention_weight ?? 0), 0.001)

  // ── step-by-step playback ──
  useEffect(() => {
    if (!playing || steps.length === 0) return
    let i = 0
    setClock(steps[0])
    frame.current = setInterval(() => {
      i += 1
      if (i >= steps.length) {
        clearInterval(frame.current)
        setPlaying(false)
        setClock(null)          // back to showing everything
        return
      }
      setClock(steps[i])
    }, 900)
    return () => clearInterval(frame.current)
  }, [playing, steps])

  if (!evidence || nodes.length === 0) return null

  const visible = (e) => clock === null || (e.step ?? Infinity) <= clock
  const focus = selected ?? hover
  const connected = focus
    ? new Set(edges.filter((e) => e.src === focus || e.dst === focus)
        .flatMap((e) => [e.src, e.dst]))
    : null
  const detail = focus ? nodes.find((n) => n.account_id === focus) : null
  const byId = Object.fromEntries(nodes.map((n) => [n.account_id, n]))

  // Curvature falls off as the graph fills up: a strong bow reads as elegant
  // with six edges and as spaghetti with forty.
  const bow = edges.length > 18 ? 0.06 : edges.length > 8 ? 0.11 : 0.16

  return (
    <div>
      {/* No card around this: the page groups by hairline and space, and a box
          here would make the one dominant element look like another panel. */}
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <p className="text-xs text-slate-500">
          Money flows toward the account in the middle. Each ring out is one
          step further away, and thicker lines counted for more.
        </p>
        <div className="ml-auto flex items-center gap-3">
          <span className="numeric text-[11px] text-slate-500">
            {nodes.length} accounts · {edges.length} transfers
          </span>
          {steps.length > 1 ? (
            <button
              onClick={() => setPlaying((p) => !p)}
              className={cx(
                'rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
                playing
                  ? 'text-slate-400 hover:text-slate-200'
                  : 'bg-accent-500/15 text-accent-300 hover:bg-accent-500/25',
              )}
            >
              {playing ? '■ Stop' : `▶ Replay ${steps.length} transfers`}
            </button>
          ) : (
            // Say why there is nothing to play rather than omitting the control
            // and leaving the reader to wonder whether it failed.
            <span className="text-[10px] text-slate-600">single transfer</span>
          )}
        </div>
      </div>

      <div className="mt-2 overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full min-w-[560px]"
          style={{ height: H }}   /* H, not the prop — see the shrink above */
          role="img"
          aria-label={`Network of ${nodes.length} accounts converging on the flagged destination`}
        >
          <defs>
            <filter id="ng-glow" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="5" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <radialGradient id="ng-vignette">
              <stop offset="55%" stopColor="#ef4444" stopOpacity="0.07" />
              <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
            </radialGradient>
            {edges.map((e, i) => {
              const a = pos[e.src]
              const b = pos[e.dst]
              if (!a || !b) return null
              return (
                <linearGradient
                  key={`lg${i}`} id={`ng-e${i}`} gradientUnits="userSpaceOnUse"
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                >
                  <stop offset="0%" stopColor={role(byId[e.src]).fill} stopOpacity="0.75" />
                  <stop offset="100%" stopColor={role(byId[e.dst]).fill} stopOpacity="0.95" />
                </linearGradient>
              )
            })}
          </defs>

          {/* ── the field the money falls into ── */}
          <ellipse cx={cx0} cy={cy0} rx={W / 2} ry={H / 2} fill="url(#ng-vignette)" />
          {rings.map((r) => (
            <g key={`ring${r.depth}`}>
              <ellipse
                cx={cx0} cy={cy0} rx={r.rx} ry={r.ry}
                fill="none" stroke={HAIR} strokeWidth="1"
                strokeDasharray={r.detached ? '1 9' : '2 6'}
                opacity={r.detached ? 0.5 : 1}
              />
              <text
                x={cx0 + r.rx * 0.72} y={cy0 - r.ry - 4} fontSize="8.5" fill={LABEL}
                opacity="0.5" fontFamily="ui-monospace, monospace"
              >
                {r.detached ? 'not upstream' : `${r.depth} hop${r.depth === 1 ? '' : 's'}`}
              </text>
            </g>
          ))}

          {/* ── edges ── */}
          {edges.map((e, i) => {
            const a = pos[e.src]
            const b = pos[e.dst]
            if (!a || !b) return null
            const on = visible(e)
            const dim = connected && !(connected.has(e.src) && connected.has(e.dst))
            const ratio = (e.edge_attention_weight ?? 0) / maxWeight
            const w = 1.2 + 5.5 * ratio
            const { d, end, angle } = trimmed(
              a, b, role(byId[e.src]).r + 2, role(byId[e.dst]).r + 7, bow,
            )
            // Heavier edges carry more money, faster.
            const dur = 3.4 - 1.6 * ratio
            const drops = 1 + Math.round(2 * ratio)
            const flow = !still && on && !dim

            return (
              <g key={`e${i}`} opacity={on ? (dim ? 0.1 : 1) : 0.05}
                 style={{ transition: 'opacity .35s' }}>
                {/* A wide, faint underlay so a thin edge still reads as a
                    channel rather than a scratch. */}
                <path d={d} fill="none" stroke={`url(#ng-e${i})`}
                      strokeWidth={w + 5} strokeOpacity="0.1" strokeLinecap="round" />
                <path
                  d={d} fill="none"
                  stroke={e.is_trigger_edge ? TRIGGER : `url(#ng-e${i})`}
                  strokeWidth={e.is_trigger_edge ? w + 1 : w}
                  strokeLinecap="round"
                />
                {/* Drawn rather than a marker: a marker cannot take the edge's
                    gradient, and a grey arrowhead on a coloured edge looks
                    like a rendering fault. */}
                <path
                  d="M0,0 L-7,-3.4 L-7,3.4 Z"
                  transform={`translate(${end.x},${end.y}) rotate(${angle})`}
                  fill={e.is_trigger_edge ? TRIGGER : role(byId[e.dst]).fill}
                  opacity="0.95"
                />

                {/* The money itself, always moving toward the destination.
                    Stagger with a NEGATIVE begin — "already this far along" —
                    so every drop is on the path from the first frame. A
                    positive begin parks the unstarted ones at the element
                    origin, which draws a stray dot in the canvas corner. */}
                {flow && Array.from({ length: drops }, (_, k) => (
                  <circle key={k} r={1.6 + 1.4 * ratio}
                          fill={e.is_trigger_edge ? TRIGGER : role(byId[e.dst]).fill}
                          opacity="0.9">
                    <animateMotion
                      path={d} dur={`${dur}s`} repeatCount="indefinite"
                      begin={`${-(k * dur) / drops}s`} rotate="auto"
                    />
                  </circle>
                ))}

                {(e.is_trigger_edge || (!dim && focus)) && (
                  <text
                    x={(a.x + b.x) / 2 - (b.y - a.y) * bow}
                    y={(a.y + b.y) / 2 + (b.x - a.x) * bow - 6}
                    textAnchor="middle" fontSize="9"
                    fill={LABEL} fontFamily="ui-monospace, monospace"
                  >
                    {money(e.amount)}
                  </text>
                )}
              </g>
            )
          })}

          {/* ── nodes ── */}
          {nodes.map((n) => {
            const p = pos[n.account_id]
            if (!p) return null
            const rl = role(n)
            const isCentre = n.account_id === centreId
            const dim = connected && !connected.has(n.account_id)
            const risk = Math.max(0, Math.min(n.node_risk_score ?? 0, 1))
            // Size carries role, then leans on risk so the worst account in a
            // ring of equals is still the one you look at.
            const r = rl.r + 3 * risk
            const arcR = r + 4.5
            const circumference = 2 * Math.PI * arcR
            const focused = focus === n.account_id
            const named = isCentre || focused || nodes.length <= 12
              || (connected?.has(n.account_id) ?? false)

            return (
              <g
                key={n.account_id}
                transform={`translate(${p.x},${p.y})`}
                opacity={dim ? 0.18 : detached.has(n.account_id) ? 0.5 : 1}
                style={{ transition: 'opacity .25s', cursor: 'pointer' }}
                onMouseEnter={() => setHover(n.account_id)}
                onMouseLeave={() => setHover(null)}
                onClick={() => setSelected((s) => (s === n.account_id ? null : n.account_id))}
              >
                {/* the destination keeps a slow ripple: it is where everything
                    is going, and it should never be mistaken for a sender */}
                {isCentre && !still && (
                  <circle r={r + 8} fill={rl.fill} opacity="0.16">
                    <animate attributeName="r" values={`${r + 5};${r + 20};${r + 5}`}
                             dur="3s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.22;0;0.22"
                             dur="3s" repeatCount="indefinite" />
                  </circle>
                )}

                <circle r={r} fill={rl.fill} opacity={isCentre ? 0.3 : 0.22}
                        filter="url(#ng-glow)" />
                <circle
                  r={r} fill={rl.fill}
                  fillOpacity={isCentre ? 0.92 : 0.8}
                  stroke={focused ? TRIGGER : 'rgb(13 12 11 / 0.55)'}
                  strokeWidth={focused ? 2.5 : 1.5}
                />

                {/* that account's own risk score, read around the rim */}
                {risk > 0.01 && (
                  <circle
                    r={arcR} fill="none" stroke={rl.fill} strokeWidth="2"
                    strokeLinecap="round" opacity="0.85"
                    strokeDasharray={`${risk * circumference} ${circumference}`}
                    transform="rotate(-90)"
                  />
                )}

                {named && (
                  <text
                    y={arcR + 12} textAnchor="middle" fontSize="8.5"
                    fill={focused ? '#f0ede7' : LABEL}
                    fontFamily="ui-monospace, monospace"
                  >
                    {n.account_id.slice(0, 9)}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      </div>

      {/* ── legend + playback state ── */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        {[...new Set(nodes.map((n) => n.role))].map((r) => {
          const rl = ROLE[r] ?? FALLBACK
          return (
            <span key={r} className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <span className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ background: rl.fill }} />
              {rl.label}
            </span>
          )
        })}
        <span className="flex items-center gap-1.5 text-[11px] text-slate-600">
          <svg width="18" height="8" aria-hidden>
            <circle cx="3" cy="4" r="2" fill={LABEL} opacity="0.7" />
            <circle cx="10" cy="4" r="2" fill={LABEL} opacity="0.45" />
            <circle cx="16" cy="4" r="2" fill={LABEL} opacity="0.2" />
          </svg>
          direction of funds
        </span>
        {clock !== null && (
          <span className="numeric ml-auto text-[11px] text-accent-400">
            step {clock}
          </span>
        )}
      </div>

      {/* ── inspector ── */}
      <div className="hair-t mt-3 pt-3">
        {detail ? (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="numeric break-all text-sm font-semibold text-slate-200">
                {detail.account_id}
              </p>
              <span
                className="rounded-md px-2 py-0.5 text-[11px] font-medium"
                style={{
                  color: role(detail).fill,
                  background: `${role(detail).fill}1f`,
                }}
              >
                {role(detail).label}
                {detached.has(detail.account_id)
                  ? ' · does not reach the destination'
                  : depth[detail.account_id] > 0
                    ? ` · ${depth[detail.account_id]} hop${depth[detail.account_id] === 1 ? '' : 's'} out`
                    : ' · the destination'}
              </span>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
              <Fact label="risk score" value={(detail.node_risk_score ?? 0).toFixed(4)} />
              <Fact label="received from" value={detail.in_degree} />
              <Fact label="sent to" value={detail.out_degree} />
              <Fact label="active steps"
                    value={detail.first_seen_step === detail.last_seen_step
                      ? detail.first_seen_step
                      : `${detail.first_seen_step}–${detail.last_seen_step}`} />
            </dl>
            {detail.first_seen_step === detail.last_seen_step && detail.out_degree > 0 && (
              <p className="mt-2.5 text-[11px] leading-relaxed text-slate-500">
                Active in a single step only — the pattern of an account created to
                make one transfer.
              </p>
            )}
          </>
        ) : (
          <p className="text-xs text-slate-500">
            Point at an account to see only its connections, or click to keep it selected.
            {steps.length > 1 && ' Press Replay to watch the transfers in order.'}
          </p>
        )}
      </div>
    </div>
  )
}

function Fact({ label, value }) {
  return (
    <div>
      <dt className="eyebrow text-slate-500">{label}</dt>
      <dd className="numeric mt-1 text-sm text-slate-200">{value ?? '—'}</dd>
    </div>
  )
}
