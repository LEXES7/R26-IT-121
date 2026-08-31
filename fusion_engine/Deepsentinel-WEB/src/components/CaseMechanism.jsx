import { LENS_ORDER, MODEL_LENS, STATUS } from '../data/modelLens'
import { cx } from './ui'

/**
 * How each detector reached its answer on this case.
 *
 * The evidence panels above this one say *what* each model found. They do not
 * say how it was arrived at, and the three mechanisms are genuinely different:
 * one aggregates a neighbourhood, one rebuilds a transaction and measures the
 * gap, one scans a window for the transaction that set this one off. A reader
 * who cannot see that has to take three numbers on trust.
 *
 * Every panel is built from the stored case. Where a detector did not answer
 * the panel still renders and says which of the two reasons applies — a
 * service that is deployed but unreachable is a different fact from one that
 * has not shipped, and collapsing them into "unavailable" reads as broken.
 */

/* ── shared frame ───────────────────────────────────────────────────────── */

const STATUS_COPY = {
  [STATUS.LIVE]: { label: 'answered', tone: 'text-slate-400' },
  [STATUS.UNREACHABLE]: { label: 'did not answer', tone: 'text-risk-medium' },
  [STATUS.AWAITING]: { label: 'awaiting integration', tone: 'text-slate-600' },
}

function MechanismPanel({ lens, status, children }) {
  const dim = status !== STATUS.LIVE
  const s = STATUS_COPY[status] ?? STATUS_COPY[STATUS.AWAITING]

  return (
    <div className={cx('min-w-0', dim && 'opacity-55')}>
      <div className="flex items-baseline gap-2">
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ background: `rgb(${lens.hue})` }}
        />
        <h3 className="text-xs font-semibold text-slate-200">{lens.axis}</h3>
        <span className={cx('ml-auto text-[14px]', s.tone)}>{s.label}</span>
      </div>

      <p className="mt-2 text-[17px] font-medium text-slate-300">{lens.question}</p>
      <p className="mt-1.5 text-[15px] leading-relaxed text-slate-500">{lens.mechanism}</p>

      <div className="mt-4 min-h-[5rem]">{children}</div>

      <p className="hair-t mt-4 pt-2.5 text-[14px] leading-relaxed text-slate-600">
        <span className="text-slate-500">Blind to</span> — {lens.blind}
      </p>
    </div>
  )
}

/** Shown in place of a visual when a detector produced nothing to draw. */
function Absent({ children }) {
  return (
    <p className="text-[15px] leading-relaxed text-slate-600">{children}</p>
  )
}

/* ── behavioural: which model answered, and against which line ──────────── */

// The service trains one model per transaction type and falls back to GLOBAL.
// PAYMENT is carried as a false-positive control rather than a detector, and
// types outside this list are scored by extrapolation and flagged as such.
const STRATA = [
  ['TRANSFER', null],
  ['CASH_OUT', null],
  ['PAYMENT', 'control'],
  ['GLOBAL', 'fallback'],
]

function BehaviouralMechanism({ evidence }) {
  const d = evidence?.vae_diagnostics ?? {}
  const stratum = d.stratum
  const score = d.combined_anomaly_score ?? d.raw_score
  const threshold = d.threshold

  if (typeof score !== 'number' || typeof threshold !== 'number') {
    return <Absent>No diagnostics were recorded with this score.</Absent>
  }

  // The axis has to hold both marks with room to read them, and the flagged
  // side has to look like a region rather than a coincidence of scaling.
  const top = Math.max(score, threshold) * 1.25
  const pos = (v) => `${Math.min(100, Math.max(0, (v / top) * 100))}%`
  const flagged = score >= threshold

  return (
    <div>
      {/* which of the four models answered */}
      <div className="flex flex-wrap gap-1.5">
        {STRATA.map(([name, note]) => {
          const active = name === stratum
          return (
            <span
              key={name}
              className={cx(
                'rounded px-1.5 py-1 text-[14px] leading-none',
                active
                  ? 'bg-modality-behavioral/15 text-modality-behavioral'
                  : 'text-slate-600',
              )}
            >
              <span className="numeric">{name}</span>
              {note && <span className="ml-1 opacity-60">{note}</span>}
            </span>
          )
        })}
      </div>
      <p className="mt-2 text-[14px] leading-relaxed text-slate-600">
        One model per transaction type, each with its own threshold — a score is
        only ever compared against transactions of its own kind.
      </p>

      {/* where the score fell against that model's own line */}
      <div className="relative mt-5 h-9">
        <div
          className="absolute inset-x-0 top-4 h-px"
          style={{ background: 'var(--hair-strong)' }}
        />

        {/* the flagged region, so the threshold reads as a boundary */}
        <div
          className="absolute top-[0.9375rem] h-[3px] rounded-full opacity-25"
          style={{
            left: pos(threshold),
            right: 0,
            background: `rgb(${MODEL_LENS.behavioural.hue})`,
          }}
        />

        <div
          className="absolute top-1.5 h-6 w-px bg-slate-500"
          style={{ left: pos(threshold) }}
        >
          <span className="numeric absolute -top-1 left-1.5 whitespace-nowrap text-[14px] text-slate-500">
            {threshold.toFixed(2)}
          </span>
        </div>

        <div
          className="absolute top-[0.8125rem] -ml-1.5 h-3 w-3 rounded-full"
          style={{
            left: pos(score),
            background: flagged ? `rgb(${MODEL_LENS.behavioural.hue})` : '#6c655d',
          }}
        />
        <span
          className="numeric absolute top-[1.75rem] -translate-x-1/2 whitespace-nowrap text-[14px] text-slate-300"
          style={{ left: pos(score) }}
        >
          {score.toFixed(2)}
        </span>
      </div>

      <p className="mt-3 text-[15px] leading-relaxed text-slate-500">
        {flagged
          ? `Above the ${stratum} line, so it was flagged.`
          : `Below the ${stratum} line, so it was not flagged.`}
        {d.operating_point && (
          <span className="text-slate-600">
            {' '}Threshold set at the {String(d.operating_point).replace('_', ' ')} operating point.
          </span>
        )}
      </p>

      {d.out_of_training_distribution && (
        <p className="mt-2 text-[14px] leading-relaxed text-risk-medium">
          This transaction type was not in any stratum's training data. The score
          is extrapolation and should carry little weight.
        </p>
      )}
      {d.is_control_stratum && (
        <p className="mt-2 text-[14px] leading-relaxed text-slate-500">
          PAYMENT is carried as a false-positive control rather than a detector —
          a high score here is a finding about the model, not the transaction.
        </p>
      )}
    </div>
  )
}

/* ── relational: how far the neighbourhood reached, and where it looked ─── */

/**
 * Distance from the destination, walking edges backwards.
 *
 * The model aggregates inward, so a ring is one hop of message passing: ring 1
 * paid the destination directly, ring 2 paid ring 1. Counting them says how
 * far the model had to reach to build its answer.
 */
function ringsFrom(edges, sinkId) {
  const depth = { [sinkId]: 0 }
  let changed = true
  let guard = 0
  while (changed && guard++ < 12) {
    changed = false
    for (const e of edges) {
      if (depth[e.dst] !== undefined && depth[e.src] === undefined) {
        depth[e.src] = depth[e.dst] + 1
        changed = true
      }
    }
  }
  const counts = []
  Object.values(depth).forEach((d) => { counts[d] = (counts[d] ?? 0) + 1 })
  return counts
}

function GraphMechanism({ evidence }) {
  const nodes = evidence?.nodes ?? []
  const edges = evidence?.edges ?? []
  const sink = evidence?.sink_account

  if (!edges.length || !sink) {
    return <Absent>No subgraph was recorded, so there is nothing to walk.</Absent>
  }

  const counts = ringsFrom(edges, sink)
  const weights = edges
    .map((e) => e.edge_attention_weight ?? 0)
    .sort((a, b) => b - a)
  const total = weights.reduce((s, w) => s + w, 0)
  const topShare = total > 0
    ? weights.slice(0, 3).reduce((s, w) => s + w, 0) / total
    : 0

  const structural = evidence?.structural_evidence ?? {}
  const facts = [
    ['convergence', structural.convergence_count],
    ['fresh senders', structural.fresh_sender_ratio],
    ['mules', structural.mules_in_subgraph],
  ].filter(([, v]) => v !== undefined && v !== null)

  return (
    <div>
      {/* how far the aggregation reached */}
      <div className="space-y-1.5">
        {counts.map((n, ring) => (
          <div key={ring} className="flex items-center gap-2.5">
            <span className="numeric w-14 shrink-0 text-[14px] text-slate-600">
              {ring === 0 ? 'sink' : `ring ${ring}`}
            </span>
            <div className="flex flex-wrap gap-1">
              {Array.from({ length: Math.min(n, 14) }).map((_, i) => (
                <span
                  key={i}
                  className="h-1.5 w-1.5 rounded-full"
                  style={{
                    background: `rgb(${MODEL_LENS.graph.hue})`,
                    opacity: ring === 0 ? 1 : Math.max(0.3, 1 - ring * 0.3),
                  }}
                />
              ))}
            </div>
            <span className="numeric ml-auto text-[14px] text-slate-500">{n}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[14px] leading-relaxed text-slate-600">
        One ring is one hop of message passing — ring 1 paid the destination
        directly, ring 2 paid ring 1.
      </p>

      {/* where the attention actually went */}
      <div className="mt-5">
        <div className="flex items-baseline justify-between">
          <span className="text-[15px] text-slate-400">
            Top {Math.min(3, weights.length)} transfers carry
          </span>
          <span className="numeric text-xs text-slate-200">
            {(topShare * 100).toFixed(0)}%
          </span>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-overlay">
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.max(2, topShare * 100)}%`,
              background: `rgb(${MODEL_LENS.graph.hue})`,
            }}
          />
        </div>
        <p className="mt-1.5 text-[14px] leading-relaxed text-slate-600">
          of all the attention the model placed across {edges.length} transfers
          between {nodes.length} accounts.
        </p>
      </div>

      {facts.length > 0 && (
        <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-1">
          {facts.map(([label, v]) => (
            <div key={label} className="flex items-baseline gap-1.5">
              <dd className="numeric text-[15px] text-slate-300">
                {typeof v === 'number' && v < 1 && v > 0 ? v.toFixed(2) : v}
              </dd>
              <dt className="text-[14px] text-slate-600">{label}</dt>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}

/* ── temporal: the window, and the one transaction that set this off ────── */

const WINDOW = 32

function TemporalMechanism({ evidence }) {
  const predecessor = evidence?.triggering_predecessor
  const offset = predecessor?.steps_before ?? predecessor?.offset

  if (!evidence) {
    return (
      <Absent>
        When this detector ships it will show the {WINDOW}-transaction window
        ending here, with the one earlier transaction it weighted most heavily.
      </Absent>
    )
  }

  // Position within the window: the current transaction sits at the right end,
  // and the predecessor is placed by how far back it was. Without an offset the
  // slot is unknown, so no slot is highlighted rather than a wrong one.
  const idx = typeof offset === 'number'
    ? Math.max(0, WINDOW - 1 - offset)
    : null

  return (
    <div>
      <div className="flex gap-[2px]">
        {Array.from({ length: WINDOW }).map((_, i) => {
          const isNow = i === WINDOW - 1
          const isTrigger = idx !== null && i === idx
          return (
            <span
              key={i}
              className="h-6 flex-1 rounded-[1px]"
              style={{
                background: isNow || isTrigger
                  ? `rgb(${MODEL_LENS.temporal.hue})`
                  : 'var(--hair-strong)',
                opacity: isNow ? 1 : isTrigger ? 0.7 : 1,
              }}
            />
          )
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-[14px] text-slate-600">
        <span>−{WINDOW - 1}</span>
        <span>now</span>
      </div>

      {predecessor?.predecessor_signal && (
        <p className="mt-3 text-[15px] leading-relaxed text-slate-400">
          {predecessor.predecessor_signal}
        </p>
      )}
      {typeof predecessor?.attention_weight === 'number' && (
        <p className="numeric mt-1.5 text-[14px] text-slate-600">
          attention {predecessor.attention_weight.toFixed(3)}
        </p>
      )}
      {typeof evidence.step_burstiness === 'number' && (
        <p className="numeric mt-1 text-[14px] text-slate-600">
          burstiness {evidence.step_burstiness.toFixed(3)}
        </p>
      )}
    </div>
  )
}

/* ── the three together ─────────────────────────────────────────────────── */

const RENDER = {
  graph: GraphMechanism,
  behavioural: BehaviouralMechanism,
  temporal: TemporalMechanism,
}

/**
 * `c` is a stored case. Availability is read from the case rather than from
 * whether evidence happens to be present, so a detector that answered without
 * recording its working is not mistaken for one that never ran.
 */
export default function CaseMechanism({ c }) {
  if (!c) return null

  const evidence = {
    graph: c.graph_evidence,
    behavioural: c.behavioral_evidence,
    temporal: c.temporal_evidence,
  }
  const answered = {
    graph: c.graph_available,
    behavioural: c.behavioral_available,
    temporal: c.temporal_available,
  }

  return (
    <section>
      <div className="hair-b flex flex-wrap items-baseline gap-3 pb-2.5">
        <h2 className="text-sm font-semibold text-slate-100">How each model read this</h2>
        <span className="text-[15px] text-slate-500">
          one transaction, three mechanisms
        </span>
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-3 lg:gap-7">
        {LENS_ORDER.map((key) => {
          const lens = MODEL_LENS[key]
          const Body = RENDER[key]
          const status = answered[key]
            ? STATUS.LIVE
            : evidence[key]
              ? STATUS.UNREACHABLE
              // Nothing scored and nothing stored: for the temporal detector
              // that is because it has not shipped, not because it failed.
              : key === 'temporal'
                ? STATUS.AWAITING
                : STATUS.UNREACHABLE

          return (
            <MechanismPanel key={key} lens={lens} status={status}>
              <Body evidence={evidence[key]} />
            </MechanismPanel>
          )
        })}
      </div>
    </section>
  )
}
