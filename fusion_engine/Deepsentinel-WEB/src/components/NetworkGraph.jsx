import { useEffect, useMemo, useRef, useState } from 'react'
import { cx } from './ui'

/**
 * The forensic subgraph, drawn.
 *
 * The extractor already returns which accounts are implicated, what role each
 * plays, and how heavily each transfer weighed in the decision. Rendered as a
 * table that is a list of facts; rendered as a graph it is a picture of a fraud
 * ring, which is the thing an investigator actually reasons about.
 *
 * Layout is deliberate rather than physical: the sink sits at the centre and
 * everything else orbits it by role. A force simulation would look livelier and
 * tell you less — the reason this structure matters is that money converges,
 * and a fixed radial layout says exactly that every time, in the same way.
 *
 * Plain SVG, no charting library: the graph is at most a few dozen nodes, and a
 * dependency would cost more than the 200 lines it saves.
 */

// The risk hues are literal in tailwind.config.js, and the modality variables
// hold bare RGB channels for Tailwind's `rgb(var(x) / a)` syntax — so neither
// can be passed to SVG as `var(--x)`. These mirror the config exactly; if the
// palette changes there, change it here too.
const ROLE = {
  SINK:          { fill: '#ef4444', label: 'Sink',         r: 22 },
  MULE_CENTRAL:  { fill: '#ef4444', label: 'Central mule', r: 22 },
  MULE:          { fill: '#f97316', label: 'Mule',         r: 16 },
  FRESH_SENDER:  { fill: '#eab308', label: 'Fresh sender', r: 12 },
  SENDER:        { fill: 'rgb(15 155 142)', label: 'Sender', r: 12 },
  INTERMEDIARY:  { fill: 'rgb(217 119 6)', label: 'Intermediary', r: 14 },
}
const fallbackRole = { fill: 'rgb(15 155 142)', label: 'Account', r: 12 }

const EDGE = 'rgb(148 163 184 / 0.55)'      // slate-400, readable in both themes
const EDGE_TRIGGER = 'rgb(45 212 191)'      // accent-400
const LABEL = 'rgb(148 163 184)'

const money = (n) =>
  typeof n === 'number'
    ? n >= 1000 ? `${(n / 1000).toFixed(0)}k` : n.toFixed(0)
    : ''

/** Sink first, then by how central the account is. */
function layout(nodes, edges, sinkId, w, h) {
  const inDeg = {}
  edges.forEach((e) => { inDeg[e.dst] = (inDeg[e.dst] || 0) + 1 })

  const centre = nodes.find((n) => n.account_id === sinkId)
    ?? [...nodes].sort((a, b) => (inDeg[b.account_id] || 0) - (inDeg[a.account_id] || 0))[0]
  const others = nodes.filter((n) => n !== centre)

  const cx0 = w / 2
  const cy0 = h / 2
  const pos = { [centre?.account_id]: { x: cx0, y: cy0 } }

  // Two rings so a wide fan does not crowd into an unreadable band.
  const inner = others.slice(0, 10)
  const outer = others.slice(10)
  const place = (list, radius, offset) =>
    list.forEach((n, i) => {
      const a = (i / Math.max(list.length, 1)) * Math.PI * 2 + offset
      pos[n.account_id] = { x: cx0 + radius * Math.cos(a), y: cy0 + radius * Math.sin(a) }
    })

  place(inner, Math.min(w, h) * 0.32, -Math.PI / 2)
  place(outer, Math.min(w, h) * 0.44, -Math.PI / 2 + 0.3)
  return { pos, centreId: centre?.account_id }
}

export default function NetworkGraph({ evidence, height = 420 }) {
  const [hover, setHover] = useState(null)
  const [selected, setSelected] = useState(null)
  const [playing, setPlaying] = useState(false)
  const [clock, setClock] = useState(null)     // current step during playback
  const frame = useRef(null)

  const nodes = evidence?.nodes ?? []
  const edges = evidence?.edges ?? []
  const sinkId = evidence?.sink_account

  const W = 720
  // Shrink to fit a small subgraph. Two accounts in a 420px canvas is mostly
  // empty space, which reads as something failing to load.
  const H = nodes.length <= 4 ? Math.min(height, 240)
          : nodes.length <= 8 ? Math.min(height, 320)
          : height
  const { pos, centreId } = useMemo(
    () => layout(nodes, edges, sinkId, W, H), [nodes, edges, sinkId, H],
  )

  const steps = useMemo(
    () => [...new Set(edges.map((e) => e.step).filter((s) => typeof s === 'number'))].sort((a, b) => a - b),
    [edges],
  )
  const maxWeight = Math.max(...edges.map((e) => e.edge_attention_weight ?? 0), 0.001)

  // ── money-flow playback ──
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

  return (
    <div>
      {/* No card around this: the page groups by hairline and space, and a box
          here would make the one dominant element look like another panel. */}
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <p className="text-xs text-slate-500">
          Line thickness is how heavily each transfer weighed in the decision.
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
          aria-label={`Network of ${nodes.length} accounts around the flagged transaction`}
        >
          <defs>
            <marker id="ng-arrow" viewBox="0 0 10 10" refX="9" refY="5"
                    markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill={EDGE} />
            </marker>
          </defs>

          {/* ── edges ── */}
          {edges.map((e, i) => {
            const a = pos[e.src]
            const b = pos[e.dst]
            if (!a || !b) return null
            const on = visible(e)
            const dim = connected && !(connected.has(e.src) && connected.has(e.dst))
            const w = 1 + 5 * ((e.edge_attention_weight ?? 0) / maxWeight)
            return (
              <g key={`e${i}`} opacity={on ? (dim ? 0.12 : 1) : 0.06}
                 style={{ transition: 'opacity .35s' }}>
                <line
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={e.is_trigger_edge ? EDGE_TRIGGER : EDGE}
                  strokeWidth={e.is_trigger_edge ? w + 1 : w}
                  markerEnd="url(#ng-arrow)"
                  strokeLinecap="round"
                />
                {/* the money itself, travelling, only while playing */}
                {playing && on && (
                  <circle r="3.5" fill={EDGE_TRIGGER}>
                    <animate attributeName="cx" from={a.x} to={b.x} dur="0.9s" fill="freeze" />
                    <animate attributeName="cy" from={a.y} to={b.y} dur="0.9s" fill="freeze" />
                  </circle>
                )}
                {(e.is_trigger_edge || (!dim && focus)) && (
                  <text
                    x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 5}
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
            const role = ROLE[n.role] ?? fallbackRole
            const isCentre = n.account_id === centreId
            const dim = connected && !connected.has(n.account_id)
            return (
              <g
                key={n.account_id}
                transform={`translate(${p.x},${p.y})`}
                opacity={dim ? 0.2 : 1}
                style={{ transition: 'opacity .25s', cursor: 'pointer' }}
                onMouseEnter={() => setHover(n.account_id)}
                onMouseLeave={() => setHover(null)}
                onClick={() => setSelected((s) => (s === n.account_id ? null : n.account_id))}
              >
                {isCentre && (
                  <circle r={role.r + 9} fill={role.fill} opacity="0.16">
                    <animate attributeName="r" values={`${role.r + 6};${role.r + 13};${role.r + 6}`}
                             dur="2.4s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.2;0.05;0.2"
                             dur="2.4s" repeatCount="indefinite" />
                  </circle>
                )}
                <circle
                  r={role.r} fill={role.fill}
                  fillOpacity={isCentre ? 0.95 : 0.75}
                  stroke={focus === n.account_id ? EDGE_TRIGGER : 'rgb(148 163 184 / 0.25)'}
                  strokeWidth={focus === n.account_id ? 2.5 : 1.5}
                />
                <text
                  y={role.r + 12} textAnchor="middle" fontSize="8.5"
                  fill={LABEL} fontFamily="ui-monospace, monospace"
                >
                  {n.account_id.slice(0, 9)}
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      {/* ── legend + playback state ── */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        {[...new Set(nodes.map((n) => n.role))].map((r) => {
          const role = ROLE[r] ?? fallbackRole
          return (
            <span key={r} className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <span className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ background: role.fill }} />
              {role.label}
            </span>
          )
        })}
        {clock !== null && (
          <span className="ml-auto font-mono text-[11px] text-accent-400">
            step {clock}
          </span>
        )}
      </div>

      {/* ── inspector ── */}
      <div className="hair-t mt-3 pt-3">
        {detail ? (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="break-all font-mono text-sm font-semibold text-slate-200">
                {detail.account_id}
              </p>
              <Badge tone={detail.account_id === sinkId ? 'critical' : 'low'}>
                {(ROLE[detail.role] ?? fallbackRole).label}
              </Badge>
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
            Hover an account to isolate its connections, or click to pin it.
            {steps.length > 1 && ' Press Play to watch the transfers in order.'}
          </p>
        )}
      </div>
    </div>
  )
}

function Fact({ label, value }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="mt-0.5 font-mono text-sm text-slate-200">{value ?? '—'}</dd>
    </div>
  )
}
