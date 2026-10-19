/**
 * A small moving picture of the signal each model reads.
 *
 * Shared by the home page's four chapters and each component's own page, so
 * a detector is drawn the same way wherever it appears.
 */

const ART = 'relative h-auto w-full'

/** Senders converging on one account, and that account flagged. */
function NetworkArt({ className }) {
  const senders = [[30, 20], [20, 70], [60, 100]]
  const onward = [[200, 30], [210, 86]]
  return (
    <svg viewBox="0 0 240 110" aria-hidden className={className}>
      <g className="stroke-modality-graph" strokeOpacity="0.75" strokeWidth="1.6">
        {senders.map(([x, y]) => (
          <line key={`in-${x}`} className="art-flow" x1={x} y1={y} x2="120" y2="55" />
        ))}
        {onward.map(([x, y]) => (
          <line key={`out-${x}`} className="art-flow" x1="120" y1="55" x2={x} y2={y} />
        ))}
      </g>
      <g className="fill-modality-graph">
        {[...senders, ...onward].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="5" />)}
      </g>
      <circle className="art-ping fill-risk-critical" cx="120" cy="55" r="9" />
      <circle className="fill-risk-critical" cx="120" cy="55" r="9" />
    </svg>
  )
}

// Feature reconstruction errors: most in range, two that the model could not
// account for.
const BEHAVIOUR = [40, 58, 100, 50, 80, 36, 54, 30, 44]
const UNEXPLAINED = new Set([2, 4])

function BehaviourArt({ className }) {
  return (
    <svg viewBox="0 0 240 110" aria-hidden className={className}>
      <g className="fill-modality-behavioral">
        {BEHAVIOUR.map((h, i) => (
          <rect key={i} x={6 + i * 26} y={110 - h} width="16" height={h} rx="3"
                fillOpacity={UNEXPLAINED.has(i) ? 1 : 0.35} />
        ))}
      </g>
    </svg>
  )
}

// Activity over time: an even rhythm, then a burst no person types at.
const TIMING = [40, 48, 34, 50, 38, 44, 32, 46, 36, 80, 102, 88, 66, 46, 38, 42, 34]
const inBurst = (i) => i >= 9 && i <= 12

function TimingArt({ className }) {
  return (
    <svg viewBox="0 0 240 110" aria-hidden className={className}>
      <g className="fill-modality-temporal">
        {TIMING.map((h, i) => (
          <rect key={i} x={2 + i * 14} y={110 - h} width="9" height={h} rx="2"
                fillOpacity={inBurst(i) ? 1 : 0.35} />
        ))}
      </g>
    </svg>
  )
}

/** Three readings flowing into one. */
function FusionArt({ className }) {
  return (
    <svg viewBox="0 0 240 110" aria-hidden className={className}>
      <g fill="none" strokeWidth="3" strokeLinecap="round">
        <path className="art-flow stroke-modality-graph" d="M6 18 C 80 18, 100 55, 150 55" />
        <path className="art-flow stroke-modality-behavioral" d="M6 55 L 150 55" />
        <path className="art-flow stroke-modality-temporal" d="M6 92 C 80 92, 100 55, 150 55" />
        <path className="stroke-accent-400" strokeWidth="5" d="M150 55 L 214 55" />
      </g>
      <circle className="art-ping fill-accent-400" cx="222" cy="55" r="9" />
      <circle className="fill-accent-400" cx="222" cy="55" r="9" />
    </svg>
  )
}

/** `kind` is a component's colour key: graph, behavioral, temporal or fusion. */
export default function ModelArt({ kind, className = ART }) {
  switch (kind) {
    case 'graph': return <NetworkArt className={className} />
    case 'behavioral': return <BehaviourArt className={className} />
    case 'temporal': return <TimingArt className={className} />
    case 'fusion': return <FusionArt className={className} />
    default: return null
  }
}
