import { MODEL_LENS } from '../data/modelLens'
import { cx } from './ui'

/**
 * Three detectors, three fields of view, one transaction.
 *
 * The question this answers is the one a panel asks first: why three models
 * rather than one good one? Because each reads a different slice of the same
 * event, and those slices barely overlap. A model cannot be wrong about
 * something it cannot see — and it cannot be right about it either.
 *
 * The composition carries that. Each field is a bounded region with its own
 * shape, chosen for what it actually reads: a run of prior transactions is a
 * strip along time, a neighbourhood is a fan of accounts, one transaction's
 * own values are bars tight to the centre. All three touch the same mark and
 * nothing else, which is the argument — fusion is not three opinions on one
 * piece of evidence, it is the only place the three pieces meet.
 *
 * Labels sit outside their regions on leader lines. The previous version put
 * them on top of the marks they named, so at small sizes the diagram read as
 * overlapping text.
 *
 * `highlight` dims the other two, so one drawing serves the system view and
 * each component's own page.
 */

const W = 900
const H = 340
const TX = { x: 450, y: 186 }        // the one transaction, dead centre

/* Fixed positions: this is a diagram, not a plot, and a stable composition
   reads better than an accurate one. */
const ACCOUNTS = [
  { x: 450, y: 56, r: 7 },
  { x: 366, y: 70, r: 5 }, { x: 534, y: 70, r: 5 },
  { x: 300, y: 100, r: 4 }, { x: 600, y: 100, r: 4 },
  { x: 258, y: 140, r: 3.5 }, { x: 642, y: 140, r: 3.5 },
]

const TICKS = 12
const T0 = 60
const T1 = 336

/* The transaction's own values, as the behavioural model sees them: a handful
   of features, each a distance from normal. Illustrative proportions — this is
   a diagram of what is read, not a rendering of a specific score. */
const FEATURES = [0.35, 0.72, 0.28, 0.9, 0.44, 0.61]

export default function SystemLens({ highlight = null, className }) {
  const on = (k) => !highlight || highlight === k
  const dim = (k) => (on(k) ? 1 : 0.3)
  const hue = (k) => `rgb(${MODEL_LENS[k].hue})`

  return (
    <figure className={cx('m-0 min-w-0', className)}>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[38rem]"
             role="img"
             aria-label="What each detector can see around one transaction: the run of
                         transactions before it, the accounts around it, and its own values">
          <defs>
            <radialGradient id="lens-core">
              <stop offset="0%" stopColor="rgb(var(--slate-200))" stopOpacity="0.9" />
              <stop offset="100%" stopColor="rgb(var(--slate-200))" stopOpacity="0" />
            </radialGradient>
            <marker id="lens-tip" viewBox="0 0 8 8" refX="7" refY="4"
                    markerWidth="5" markerHeight="5" orient="auto">
              <path d="M0,0 L8,4 L0,8 z" fill="currentColor" />
            </marker>
          </defs>

          {/* ══ TIME — the run of transactions ending at this one ══ */}
          <g style={{ opacity: dim('temporal') }}>
            <rect x={T0 - 10} y={166} width={T1 - T0 + 30} height={40} rx={20}
                  fill={hue('temporal')} fillOpacity="0.07" />
            {Array.from({ length: TICKS }).map((_, i) => {
              const w = (T1 - T0) / TICKS
              const x = T0 + i * w
              // Rising toward the transaction: the window is what led here.
              const h = 8 + (i / TICKS) * 14
              return (
                <rect key={i} x={x} y={186 - h / 2} width={w - 4} height={h} rx={2}
                      fill={hue('temporal')}
                      fillOpacity={0.2 + (i / TICKS) * 0.55} />
              )
            })}
            <path d={`M${T1 + 4},186 L${TX.x - 34},186`} stroke={hue('temporal')}
                  strokeWidth="1.5" strokeDasharray="3 3" opacity="0.7"
                  style={{ color: hue('temporal') }} markerEnd="url(#lens-tip)" />
          </g>

          {/* ══ NETWORK — the accounts around it ══ */}
          <g style={{ opacity: dim('graph') }}>
            <path d={`M${TX.x},${TX.y - 26} C 250,120 250,40 450,40
                      C 650,40 650,120 ${TX.x},${TX.y - 26} Z`}
                  fill={hue('graph')} fillOpacity="0.06" />
            {ACCOUNTS.map((a, i) => (
              <g key={i}>
                <path d={`M${a.x},${a.y} Q${(a.x + TX.x) / 2},${(a.y + TX.y) / 2 - 18}
                          ${TX.x},${TX.y - 26}`}
                      fill="none" stroke={hue('graph')} strokeWidth="1" opacity="0.4" />
                <circle cx={a.x} cy={a.y} r={a.r} fill={hue('graph')} fillOpacity="0.85" />
              </g>
            ))}
          </g>

          {/* ══ BEHAVIOUR — this transaction's own values ══ */}
          <g style={{ opacity: dim('behavioural') }}>
            <rect x={TX.x + 34} y={150} width={182} height={72} rx={8}
                  fill={hue('behavioural')} fillOpacity="0.07" />
            {FEATURES.map((v, i) => {
              const x = TX.x + 50 + i * 26
              const h = 10 + v * 40
              return (
                <g key={i}>
                  <rect x={x} y={196 - h} width={11} height={h} rx={2.5}
                        fill={hue('behavioural')} fillOpacity={0.35 + v * 0.5} />
                  <rect x={x} y={200} width={11} height={2} rx={1}
                        fill={hue('behavioural')} fillOpacity="0.3" />
                </g>
              )
            })}
            <path d={`M${TX.x + 30},186 L${TX.x + 26},186`} stroke={hue('behavioural')}
                  strokeWidth="1.5" opacity="0.7" />
          </g>

          {/* ══ the transaction itself ══ */}
          <circle cx={TX.x} cy={TX.y} r={34} fill="url(#lens-core)" opacity="0.14" />
          <circle cx={TX.x} cy={TX.y} r={13} fill="rgb(var(--sentinel-950))"
                  stroke="rgb(var(--slate-200))" strokeWidth="1.6" />
          <circle cx={TX.x} cy={TX.y} r={4.5} fill="rgb(var(--slate-200))" />
          <text x={TX.x} y={TX.y + 40} textAnchor="middle" fontSize="10"
                fill="rgb(var(--slate-400))" letterSpacing="0.11em">
            ONE TRANSACTION
          </text>

          {/* ══ labels — outside their regions, on leaders ══ */}
          <g fontSize="11" fontWeight="600">
            {/* time */}
            <g style={{ opacity: dim('temporal') }}>
              <path d="M120,160 L120,138" stroke={hue('temporal')} strokeWidth="1" opacity="0.5" />
              <text x={120} y={130} textAnchor="middle" fill={hue('temporal')}>
                What came before
              </text>
              <text x={120} y={144} textAnchor="middle" fontSize="9" fontWeight="400"
                    fill="rgb(var(--slate-500))" opacity="0">.</text>
              <text x={120} y={252} textAnchor="middle" fontSize="9" fontWeight="400"
                    fill="rgb(var(--slate-500))">
                the 32 transactions ending here
              </text>
              <path d="M120,212 L120,240" stroke={hue('temporal')} strokeWidth="1" opacity="0.35" />
            </g>

            {/* network */}
            <g style={{ opacity: dim('graph') }}>
              <path d="M700,90 L648,112" stroke={hue('graph')} strokeWidth="1" opacity="0.5" />
              <text x={708} y={86} fill={hue('graph')}>The accounts around it</text>
              <text x={708} y={102} fontSize="9" fontWeight="400" fill="rgb(var(--slate-500))">
                who paid whom, two hops out
              </text>
            </g>

            {/* behaviour */}
            <g style={{ opacity: dim('behavioural') }}>
              <path d="M700,246 L648,224" stroke={hue('behavioural')} strokeWidth="1" opacity="0.5" />
              <text x={708} y={244} fill={hue('behavioural')}>The transaction itself</text>
              <text x={708} y={260} fontSize="9" fontWeight="400" fill="rgb(var(--slate-500))">
                its own values, against its type
              </text>
            </g>
          </g>

          {/* the one place all three meet */}
          <text x={TX.x} y={H - 16} textAnchor="middle" fontSize="9"
                fill="rgb(var(--slate-600))">
            the only point all three fields share
          </text>
        </svg>
      </div>
    </figure>
  )
}
