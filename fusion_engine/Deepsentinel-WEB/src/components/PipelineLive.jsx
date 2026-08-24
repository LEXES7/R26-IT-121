import { cx } from './ui'

/**
 * The screening pipeline, drawn as it actually behaves.
 *
 * The geometry carries the argument: every transaction enters the graph model,
 * and only the escalated minority continues along the branch to the other two
 * detectors. A row of five equal boxes would imply all five always run, which
 * is exactly the misunderstanding this replaces.
 *
 * SVG rather than DOM boxes because the connectors need to fork, and an
 * animated dash offset along a path is the cheapest honest way to show flow.
 */

const ACTIVE = { graph: '#0f9b8e', behavioural: '#dc2649', temporal: '#c2740a' }

function Node({ x, y, w = 120, h = 46, label, sub, status, colour }) {
  const active = status === 'active'
  return (
    <g>
      {active && (
        <rect
          x={x - 3} y={y - 3} width={w + 6} height={h + 6} rx={11}
          fill="none" stroke={colour} strokeWidth="1.5" opacity="0.45"
        >
          <animate attributeName="opacity" values="0.45;0.1;0.45" dur="1.4s" repeatCount="indefinite" />
        </rect>
      )}
      <rect
        x={x} y={y} width={w} height={h} rx={9}
        className="fill-surface"
        stroke={active ? colour : 'currentColor'}
        strokeWidth={active ? 1.6 : 1}
        opacity={active ? 1 : 0.5}
      />
      <text x={x + w / 2} y={y + 19} textAnchor="middle"
        className="fill-slate-200 text-[11px] font-semibold">{label}</text>
      <text x={x + w / 2} y={y + 34} textAnchor="middle"
        className="fill-slate-600 text-[9px]">{sub}</text>
    </g>
  )
}

function Flow({ d, active, colour = '#0f9b8e', dim = false }) {
  return (
    <>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1"
        opacity={dim ? 0.18 : 0.3} />
      {active && (
        <path d={d} fill="none" stroke={colour} strokeWidth="1.6"
          strokeDasharray="5 9" opacity="0.9">
          <animate attributeName="stroke-dashoffset" from="28" to="0"
            dur="0.85s" repeatCount="indefinite" />
        </path>
      )}
    </>
  )
}

export default function PipelineLive({ stages, escalating }) {
  const s = (k) => stages?.[k] ?? 'idle'
  const graphOn = s('graph') === 'active'
  const branchOn = s('behavioural') === 'active' || s('temporal') === 'active' || escalating

  return (
    <svg viewBox="0 0 760 200" className="w-full text-slate-700" role="img"
      aria-label="Live screening pipeline">
      {/* Ingest → graph: every transaction takes this path */}
      <Flow d="M 40 100 H 96" active={graphOn} />
      <text x="40" y="92" className="fill-slate-600 text-[9px]">stream</text>

      <Node x={96} y={77} label="GraphSAGE" sub="screens everything"
        status={s('graph')} colour={ACTIVE.graph} />

      {/* Fork — only escalations continue */}
      <Flow d="M 216 100 H 250 M 250 100 V 46 H 300" active={branchOn} colour={ACTIVE.behavioural} dim={!branchOn} />
      <Flow d="M 250 100 V 154 H 300" active={branchOn} colour={ACTIVE.temporal} dim={!branchOn} />
      <text x="238" y="118" className="fill-slate-600 text-[9px]">escalate</text>

      <Node x={300} y={23} label="Behaviour" sub="VAE + DSAA"
        status={s('behavioural')} colour={ACTIVE.behavioural} />
      <Node x={300} y={131} label="Timing" sub="temporal CNN"
        status={s('temporal')} colour={ACTIVE.temporal} />

      <Flow d="M 420 46 H 462 V 100 M 420 154 H 462 V 100" active={s('fusion') === 'active'} dim={!branchOn} />

      <Node x={462} y={77} label="Fusion" sub="meta-classifier"
        status={s('fusion')} colour={ACTIVE.graph} />

      <Flow d="M 582 100 H 620" active={s('report') === 'active'} dim={!branchOn} />
      <Node x={620} y={77} w={110} label="Alert" sub="report + email"
        status={s('report')} colour={ACTIVE.graph} />
    </svg>
  )
}
