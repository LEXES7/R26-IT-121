import { LENS_ORDER, MODEL_LENS } from '../data/modelLens'
import { cx } from './ui'

/**
 * Three detectors, three fields of view, one transaction.
 *
 * The question this answers is the one a panel asks first: why three models
 * rather than one good one? Because each reads a different slice of the same
 * event — the accounts around it, the transaction itself, the run that led to
 * it — and those slices barely overlap. A model cannot be wrong about
 * something it cannot see, and it cannot be right about it either.
 *
 * The near-absence of overlap in this drawing *is* the argument. Fusion is not
 * an ensemble of three opinions on the same evidence; it is the only place the
 * three pieces of evidence are ever in the same room.
 *
 * `highlight` dims the other two, so the same drawing serves the system view
 * and each component's own page.
 */

/* Positions are fixed rather than computed: this is a diagram, not a plot, and
   a stable composition reads better than an accurate one. */
const TX = { x: 404, y: 168 }

const ACCOUNTS = [
  { x: 404, y: 54, r: 8 },
  { x: 330, y: 74, r: 5.5 },
  { x: 470, y: 78, r: 5.5 },
  { x: 296, y: 112, r: 4.5 },
  { x: 366, y: 104, r: 4.5 },
  { x: 444, y: 108, r: 4.5 },
  { x: 508, y: 116, r: 4.5 },
]

const WINDOW_X0 = 72
const WINDOW_X1 = 362
const TICKS = 14

export default function SystemLens({ highlight = null, className }) {
  const on = (key) => !highlight || highlight === key
  const dim = (key) => (on(key) ? 1 : 0.18)

  return (
    <figure className={cx('min-w-0', className)}>
      <div className="overflow-x-auto">
        <svg
          viewBox="0 0 560 250"
          className="h-auto w-full min-w-[34rem]"
          role="img"
          aria-label="What each detector can see around one transaction"
        >
          {/* ── time: the run of transactions leading here ── */}
          <g style={{ opacity: dim('temporal') }}>
            <rect
              x={WINDOW_X0} y={156} width={WINDOW_X1 - WINDOW_X0} height={24} rx={4}
              style={{ fill: `rgb(${MODEL_LENS.temporal.hue} / 0.12)` }}
            />
            {Array.from({ length: TICKS }).map((_, i) => {
              const w = (WINDOW_X1 - WINDOW_X0) / TICKS
              return (
                <rect
                  key={i}
                  x={WINDOW_X0 + i * w + 1.5} y={161} width={w - 3} height={14} rx={1}
                  style={{
                    fill: `rgb(${MODEL_LENS.temporal.hue})`,
                    opacity: 0.25 + (i / TICKS) * 0.45,
                  }}
                />
              )
            })}
            <line
              x1={WINDOW_X1} y1={168} x2={TX.x - 26} y2={168}
              strokeWidth={1.5} strokeDasharray="3 3"
              style={{ stroke: `rgb(${MODEL_LENS.temporal.hue} / 0.5)` }}
            />
            <text
              x={WINDOW_X0} y={202} fontSize={11} fill="currentColor"
              className="text-modality-temporal"
            >
              what came before
            </text>
          </g>

          {/* ── structure: the accounts this transaction sits between ── */}
          <g style={{ opacity: dim('graph') }}>
            {ACCOUNTS.map((a, i) => (
              <line
                key={`e${i}`}
                x1={a.x} y1={a.y} x2={TX.x} y2={TX.y - 22}
                strokeWidth={1}
                style={{ stroke: `rgb(${MODEL_LENS.graph.hue} / 0.28)` }}
              />
            ))}
            {ACCOUNTS.map((a, i) => (
              <circle
                key={`n${i}`} cx={a.x} cy={a.y} r={a.r}
                style={{ fill: `rgb(${MODEL_LENS.graph.hue})`, opacity: 0.85 }}
              />
            ))}
            <text
              x={528} y={58} fontSize={11} textAnchor="end" fill="currentColor"
              className="text-modality-graph"
            >
              the accounts around it
            </text>
          </g>

          {/* ── behaviour: the transaction on its own terms ── */}
          <g style={{ opacity: dim('behavioural') }}>
            <circle
              cx={TX.x} cy={TX.y} r={25}
              style={{
                fill: `rgb(${MODEL_LENS.behavioural.hue} / 0.10)`,
                stroke: `rgb(${MODEL_LENS.behavioural.hue} / 0.55)`,
                strokeWidth: 1.25,
              }}
            />
            <text
              x={TX.x + 36} y={214} fontSize={11} textAnchor="middle" fill="currentColor"
              className="text-modality-behavioral"
            >
              the transaction itself
            </text>
          </g>

          {/* the event all three are looking at */}
          <circle cx={TX.x} cy={TX.y} r={7} className="fill-slate-200" />
          <text
            x={TX.x} y={TX.y - 34} fontSize={10} textAnchor="middle"
            fill="currentColor" className="text-slate-500"
          >
            one transaction
          </text>
        </svg>
      </div>

      {/* ── the same three, stated rather than drawn ── */}
      <div className="mt-7 grid gap-5 sm:grid-cols-3">
        {LENS_ORDER.map((key) => {
          const lens = MODEL_LENS[key]
          return (
            <div key={key} className={cx('min-w-0', !on(key) && 'opacity-45')}>
              <div className="flex items-baseline gap-2">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: `rgb(${lens.hue})` }}
                />
                <p className="text-xs font-semibold text-slate-200">{lens.axis}</p>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
                <span className="text-slate-500">Reads</span> — {lens.reads}
              </p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
                <span className="text-slate-600">Blind to</span> — {lens.blind}
              </p>
            </div>
          )
        })}
      </div>

      <figcaption className="mt-6 max-w-2xl text-[11px] leading-relaxed text-slate-500">
        The three fields barely overlap, and that is the point. A detector cannot
        be wrong about something it cannot see — but it cannot be right about it
        either. Fusion is not three opinions on the same evidence; it is the only
        place the three pieces of evidence are ever in the same room.
      </figcaption>
    </figure>
  )
}
