/**
 * A small drawing of one pattern a detector catches.
 *
 * Keyed by the pattern's name in data/components.js, so the drawing follows
 * the list rather than a second copy of it. A name with no drawing falls back
 * to a plain mark rather than to nothing, so a pattern added to the data
 * still gets a card that looks finished.
 */

const TONE = {
  graph: { stroke: 'stroke-modality-graph', fill: 'fill-modality-graph' },
  behavioral: { stroke: 'stroke-modality-behavioral', fill: 'fill-modality-behavioral' },
  temporal: { stroke: 'stroke-modality-temporal', fill: 'fill-modality-temporal' },
  fusion: { stroke: 'stroke-accent-400', fill: 'fill-accent-400' },
}

/** The flagged account: solid, with a ring that keeps leaving it. */
function Flag({ cx, cy, r = 9 }) {
  return (
    <>
      <circle className="art-ping fill-risk-critical" cx={cx} cy={cy} r={r} />
      <circle className="fill-risk-critical" cx={cx} cy={cy} r={r} />
    </>
  )
}

const SPOKES = [[40, 20], [22, 64], [48, 104], [200, 18], [218, 66], [190, 106]]
const SPLITS = [14, 37, 60, 83, 106]

function draw(name, t) {
  switch (name) {
    case 'Hub-and-spoke':
      return (
        <>
          <g className={t.stroke} strokeWidth="1.5" strokeOpacity="0.8">
            {SPOKES.map(([x, y]) => <line key={x} className="art-flow" x1={x} y1={y} x2="120" y2="60" />)}
          </g>
          <g className={t.fill}>{SPOKES.map(([x, y]) => <circle key={x} cx={x} cy={y} r="5" />)}</g>
          <Flag cx={120} cy={60} />
        </>
      )
    case 'Smurfing':
      return (
        <>
          <g className={t.stroke} strokeWidth="1.5" strokeOpacity="0.8">
            {SPLITS.map((y) => <line key={y} className="art-flow" x1="34" y1="60" x2="190" y2={y} />)}
          </g>
          <g className={t.fill}>
            {SPLITS.map((y) => <circle key={y} cx="190" cy={y} r="5" />)}
            {SPLITS.map((y) => <rect key={`a${y}`} x="202" y={y - 3} width="26" height="6" rx="3" fillOpacity="0.45" />)}
          </g>
          <Flag cx={34} cy={60} />
        </>
      )
    case 'Layering':
      return (
        <>
          <path className={`art-flow ${t.stroke}`} d="M20 92 L70 34 L120 92 L170 34 L220 78"
                fill="none" strokeWidth="1.6" strokeOpacity="0.85" />
          <g className={t.fill}>
            <circle cx="20" cy="92" r="6" /><circle cx="70" cy="34" r="5" />
            <circle cx="120" cy="92" r="5" /><circle cx="170" cy="34" r="5" />
          </g>
          <Flag cx={220} cy={78} />
        </>
      )
    case 'Account takeover':
      return (
        <>
          <circle className="stroke-slate-500" cx="58" cy="60" r="22" fill="none"
                  strokeWidth="1.5" strokeDasharray="3 5" />
          <circle className="fill-slate-500" cx="58" cy="60" r="8" fillOpacity="0.6" />
          <line className={`art-flow ${t.stroke}`} x1="82" y1="60" x2="178" y2="60"
                strokeWidth="5" strokeLinecap="round" />
          <Flag cx={190} cy={60} r={10} />
        </>
      )

    case 'Odd balance changes':
      return (
        <>
          <line className="stroke-slate-500" x1="16" y1="105" x2="224" y2="105" strokeWidth="1" strokeOpacity="0.5" />
          <g className={t.fill}>
            <rect x="30" y="24" width="28" height="80" rx="4" fillOpacity="0.35" />
            <rect x="62" y="40" width="28" height="64" rx="4" fillOpacity="0.35" />
            <rect x="140" y="24" width="28" height="80" rx="4" />
          </g>
          <rect className="fill-risk-critical" x="172" y="100" width="28" height="4" rx="2" />
          <path className="stroke-risk-critical" d="M172 24 H200" strokeWidth="1.5" strokeDasharray="3 4" />
        </>
      )
    case 'Unusual amounts':
      return (
        <>
          <path className={t.stroke} d="M8 104 C 40 104, 52 22, 84 22 S 128 104, 160 104"
                fill="none" strokeWidth="2" />
          <path className={t.fill} d="M8 104 C 40 104, 52 22, 84 22 S 128 104, 160 104 Z" fillOpacity="0.14" />
          <line className="stroke-slate-500" x1="176" y1="16" x2="176" y2="106" strokeWidth="1.2" strokeDasharray="3 4" />
          <Flag cx={208} cy={98} r={7} />
        </>
      )
    case 'Repeat patterns':
      return (
        <>
          {[[62, 52], [132, 82], [192, 40]].map(([x, y]) => (
            <g key={x}>
              <circle className={t.stroke} cx={x} cy={y} r="27" fill="none" strokeWidth="1.2" strokeOpacity="0.4" />
              <g className={t.fill}>
                <circle cx={x - 9} cy={y - 7} r="4" /><circle cx={x + 8} cy={y - 9} r="4" />
                <circle cx={x - 11} cy={y + 8} r="4" /><circle cx={x + 10} cy={y + 6} r="4" />
                <circle cx={x} cy={y} r="4" />
              </g>
            </g>
          ))}
        </>
      )

    case 'Escalating drains':
      return (
        <>
          <line className="stroke-slate-500" x1="16" y1="105" x2="224" y2="105" strokeWidth="1" strokeOpacity="0.5" />
          <g className={t.fill}>
            <rect x="26" y="24" width="30" height="80" rx="4" fillOpacity="0.35" />
            <rect x="76" y="52" width="30" height="52" rx="4" fillOpacity="0.55" />
            <rect x="126" y="78" width="30" height="26" rx="4" fillOpacity="0.8" />
          </g>
          <rect className="fill-risk-critical" x="176" y="100" width="30" height="4" rx="2" />
          <path className="stroke-slate-500" d="M41 16 C 90 12, 150 40, 190 88" fill="none"
                strokeWidth="1.2" strokeDasharray="3 4" />
        </>
      )
    case 'Mule priming':
      return (
        <>
          <line className="stroke-slate-500" x1="16" y1="105" x2="110" y2="105" strokeWidth="1" strokeOpacity="0.5" />
          <g className={t.fill}>
            <rect x="26" y="34" width="28" height="70" rx="4" fillOpacity="0.4" />
            <rect x="62" y="100" width="28" height="4" rx="2" />
          </g>
          <line className={`art-flow ${t.stroke}`} x1="104" y1="60" x2="186" y2="60" strokeWidth="6" strokeLinecap="round" />
          <Flag cx={202} cy={60} r={11} />
        </>
      )
    case 'Fraud bursts':
      return (
        <>
          <line className="stroke-slate-500" x1="10" y1="76" x2="230" y2="76" strokeWidth="1" strokeOpacity="0.6" />
          <g className="fill-slate-500" fillOpacity="0.55">
            {[18, 40, 58, 84, 104, 122, 196, 214].map((x) => <circle key={x} cx={x} cy="76" r="4" />)}
          </g>
          <g className="fill-risk-critical">
            {[146, 156, 166, 176].map((x) => <circle key={x} cx={x} cy="76" r="5" />)}
          </g>
          <path className={t.stroke} d="M140 52 V44 H182 V52" fill="none" strokeWidth="1.4" />
        </>
      )

    case 'Weighted fusion':
      return (
        <>
          <g fill="none" strokeLinecap="round">
            <path className="art-flow stroke-modality-graph" d="M8 20 C 80 20, 100 60, 150 60" strokeWidth="4" />
            <path className="art-flow stroke-modality-behavioral" d="M8 60 L 150 60" strokeWidth="2.6" />
            <path className="art-flow stroke-modality-temporal" d="M8 100 C 80 100, 100 60, 150 60" strokeWidth="1.6" />
            <path className={t.stroke} d="M150 60 L 214 60" strokeWidth="5" />
          </g>
          <circle className={t.fill} cx="222" cy="60" r="9" />
        </>
      )
    case 'Handles outages':
      return (
        <>
          <g fill="none" strokeLinecap="round" strokeWidth="3">
            <path className="art-flow stroke-modality-graph" d="M8 20 C 80 20, 100 60, 150 60" />
            <path className="stroke-slate-500" d="M8 60 L 120 60" strokeDasharray="2 8" strokeOpacity="0.7" />
            <path className="art-flow stroke-modality-temporal" d="M8 100 C 80 100, 100 60, 150 60" />
            <path className={t.stroke} d="M150 60 L 214 60" strokeWidth="5" />
          </g>
          <path className="stroke-slate-500" d="M58 52 l16 16 M74 52 l-16 16" strokeWidth="2" strokeLinecap="round" />
          <circle className={t.fill} cx="222" cy="60" r="9" />
        </>
      )
    case 'Cited reports':
      return (
        <>
          <rect className={t.stroke} x="18" y="10" width="120" height="100" rx="10" fill="none" strokeWidth="1.6" />
          <g className="fill-slate-500" fillOpacity="0.5">
            <rect x="32" y="26" width="80" height="6" rx="3" /><rect x="32" y="44" width="92" height="6" rx="3" />
            <rect x="32" y="62" width="70" height="6" rx="3" /><rect x="32" y="80" width="86" height="6" rx="3" />
          </g>
          <g className={t.stroke} strokeWidth="1.2" strokeDasharray="3 4">
            <path d="M112 29 H170" /><path d="M124 47 C 150 47, 150 60, 170 60" /><path d="M118 83 C 150 83, 150 91, 170 91" />
          </g>
          <g className={t.fill}>
            <rect x="172" y="21" width="44" height="16" rx="6" /><rect x="172" y="52" width="44" height="16" rx="6" />
            <rect x="172" y="83" width="44" height="16" rx="6" />
          </g>
        </>
      )

    default:
      return (
        <g className={t.fill}>
          {[40, 80, 120, 160, 200].map((x) => <circle key={x} cx={x} cy="60" r="6" fillOpacity="0.5" />)}
        </g>
      )
  }
}

export default function PatternArt({ name, tone = 'graph', label }) {
  return (
    <svg viewBox="0 0 240 120" role="img" aria-label={label ?? name} className="h-auto w-full">
      {draw(name, TONE[tone] ?? TONE.graph)}
    </svg>
  )
}
