import { cx } from './ui'

/**
 * How three detector scores became one number.
 *
 * The case header already states each score. What it cannot state is the two
 * things a reviewer actually needs before trusting the fused figure:
 *
 *   * **whether the detectors agreed.** Three models reading the same
 *     transaction three different ways is only worth having when they can
 *     disagree. A case where one detector is alone in calling it is the case
 *     worth opening first — and it is invisible in a column of numbers.
 *   * **where the confidence went.** With a detector missing the fusion
 *     applies a deliberate penalty, so the number shown is lower than the
 *     evidence alone produced. Printing the result without the subtraction
 *     invites the reader to mistake a conservative score for a weak signal.
 *
 * Nothing here is recomputed from the models. The scores, the availability
 * flags and the penalty flag are all read from the stored case; the penalty
 * itself is the fusion's own rule — 0.10 for every detector that did not
 * answer — so the arithmetic is shown rather than asserted.
 */

const MODALITIES = [
  ['Relational', 'graph_score', 'graph_available', 'var(--modality-graph)'],
  ['Behavioural', 'behavioral_score', 'behavioral_available', 'var(--modality-behavioral)'],
  ['Temporal', 'temporal_score', 'temporal_available', 'var(--modality-temporal)'],
]

/** The fusion's own rule: 0.10 of confidence for each detector that was absent. */
const PENALTY_PER_MISSING = 0.1

/** Below this spread the detectors are reading the transaction the same way. */
const AGREEMENT_BAND = 0.15

/** Above this, one of them is making a materially different claim. */
const DISSENT_BAND = 0.3

const fmt = (v, d = 4) => (typeof v === 'number' ? v.toFixed(d) : '—')

/**
 * The detector furthest from the consensus of the others.
 *
 * Compared against the mean of the *rest* rather than the mean of all three,
 * so a single outlier cannot drag the baseline toward itself and hide.
 */
function findDissenter(live) {
  if (live.length < 3) return null
  let worst = null
  for (const m of live) {
    const others = live.filter((o) => o !== m)
    const mean = others.reduce((s, o) => s + o.value, 0) / others.length
    const distance = Math.abs(m.value - mean)
    if (!worst || distance > worst.distance) worst = { ...m, distance }
  }
  return worst
}

function reading(live) {
  if (live.length === 0) {
    return {
      tone: 'none',
      headline: 'No detector answered.',
      detail:
        'Every score below is the neutral value the fusion imputes when a model '
        + 'is unreachable. This case carries no evidence.',
    }
  }
  if (live.length === 1) {
    return {
      tone: 'none',
      headline: `Only the ${live[0].label.toLowerCase()} detector answered.`,
      detail:
        'With one opinion there is nothing to cross-check it against. The fused '
        + 'confidence is this score, made conservative by the uncertainty penalty.',
    }
  }

  const values = live.map((m) => m.value)
  const spread = Math.max(...values) - Math.min(...values)

  if (spread <= AGREEMENT_BAND) {
    return {
      tone: 'agree',
      spread,
      headline: 'The detectors agree.',
      detail:
        `All ${live.length} scores fall within ${spread.toFixed(3)} of each other. `
        + 'Independent models reading the transaction different ways reached the '
        + 'same reading, which is the strongest form this evidence takes.',
    }
  }

  if (spread <= DISSENT_BAND) {
    return {
      tone: 'partial',
      spread,
      headline: 'Partial agreement.',
      detail:
        `The scores span ${spread.toFixed(3)}. The detectors point the same way `
        + 'but not with the same force — worth reading the attribution below '
        + 'before treating the fused figure as settled.',
    }
  }

  const dissenter = findDissenter(live)
  return {
    tone: 'dissent',
    spread,
    dissenter,
    headline: dissenter
      ? `${dissenter.label} is the dissenter.`
      : 'The detectors disagree.',
    detail: dissenter
      ? `It scored ${fmt(dissenter.value, 3)}, ${dissenter.distance.toFixed(3)} away `
        + 'from what the others read. A lone detector calling a transaction is not '
        + 'a weaker case than a unanimous one — it is a different case, and usually '
        + 'the one worth opening first.'
      : `The scores span ${spread.toFixed(3)}.`,
  }
}

const TONE = {
  agree: 'text-risk-low',
  partial: 'text-risk-medium',
  dissent: 'text-risk-high',
  none: 'text-slate-400',
}

export default function ModalityVerdict({ c }) {
  if (!c) return null

  const rows = MODALITIES.map(([label, scoreKey, availKey, hue]) => ({
    label,
    hue,
    available: Boolean(c[availKey]),
    value: typeof c[scoreKey] === 'number' ? c[scoreKey] : null,
  }))

  const live = rows.filter((m) => m.available && typeof m.value === 'number')
  const verdict = reading(live)

  const missing = 3 - (c.modalities_used ?? live.length)
  const penalty = c.uncertainty_penalty_applied
    ? PENALTY_PER_MISSING * Math.max(0, missing)
    : 0

  const fused = typeof c.fused_score === 'number' ? c.fused_score : null

  // The penalty is a subtraction the fusion already made, so the value before
  // it is recoverable exactly — except where the result was clamped at zero,
  // in which case the original is genuinely unknown and is not guessed at.
  const clamped = fused === 0 && penalty > 0
  const beforePenalty = fused !== null && penalty > 0 && !clamped ? fused + penalty : null

  return (
    <section>
      <div className="hair-b flex flex-wrap items-baseline gap-3 pb-2.5">
        <h2 className="text-sm font-semibold text-slate-100">How the verdict was reached</h2>
        <span className="text-[11px] text-slate-500">
          three detectors, one number
        </span>
      </div>

      {/* ── where each detector landed ── */}
      <div className="mt-6">
        <div className="relative h-10">
          {/* the axis */}
          <div
            className="absolute inset-x-0 top-[1.125rem] h-px"
            style={{ background: 'var(--hair-strong)' }}
          />

          {/* the fused verdict, as the line everything else is read against */}
          {fused !== null && (
            <div
              className="absolute top-0 h-10 w-px bg-slate-300"
              style={{ left: `${Math.min(100, Math.max(0, fused * 100))}%` }}
            >
              <span className="numeric absolute -top-0.5 left-1.5 whitespace-nowrap text-[10px] text-slate-300">
                fused {fmt(fused, 3)}
              </span>
            </div>
          )}

          {/* each detector that answered */}
          {live.map((m) => (
            <div
              key={m.label}
              className="absolute top-[0.8125rem] -ml-1.5 h-3 w-3 rounded-full"
              style={{
                left: `${Math.min(100, Math.max(0, m.value * 100))}%`,
                background: `rgb(${m.hue})`,
              }}
              title={`${m.label} ${fmt(m.value, 4)}`}
            />
          ))}
        </div>

        <div className="flex justify-between">
          <span className="numeric text-[10px] text-slate-600">0.0</span>
          <span className="numeric text-[10px] text-slate-600">1.0</span>
        </div>
      </div>

      {/* ── what that spread means ── */}
      <div className="mt-5">
        <p className={cx('text-sm font-medium', TONE[verdict.tone])}>{verdict.headline}</p>
        <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-slate-500">
          {verdict.detail}
        </p>
      </div>

      {/* ── the arithmetic ── */}
      <dl className="mt-6 space-y-2">
        {rows.map((m) => (
          <Line
            key={m.label}
            label={m.label}
            hue={m.hue}
            value={m.available ? m.value : 0.5}
            muted={!m.available}
            note={
              m.available
                ? null
                : 'imputed at the neutral value — this detector did not answer'
            }
          />
        ))}

        <div className="hair-t !mt-4 pt-3">
          {beforePenalty !== null && (
            <Line label="Before penalty" value={beforePenalty} derived />
          )}
          {penalty > 0 && (
            <Line
              label="Uncertainty penalty"
              value={-penalty}
              signed
              muted
              note={`${missing} detector${missing === 1 ? '' : 's'} did not answer`}
            />
          )}
        </div>

        <div className="hair-t !mt-3 flex items-baseline justify-between pt-3">
          <dt className="text-xs font-semibold text-slate-200">Fused confidence</dt>
          <dd className="numeric text-sm font-semibold text-slate-100">{fmt(fused)}</dd>
        </div>
      </dl>

      {clamped && (
        <p className="mt-3 text-[10px] leading-relaxed text-slate-600">
          The penalty took this score to zero, so the value before it cannot be
          recovered from the stored case and is not shown.
        </p>
      )}
    </section>
  )
}

function Line({ label, hue, value, muted, signed, derived, note }) {
  const shown = signed && value < 0 ? `−${Math.abs(value).toFixed(4)}` : fmt(value)
  return (
    <div className="flex items-baseline gap-3">
      <dt className="flex min-w-0 shrink-0 items-center gap-2">
        {hue && (
          <span
            className={cx('h-1.5 w-1.5 rounded-full', muted && 'opacity-30')}
            style={{ background: `rgb(${hue})` }}
          />
        )}
        <span className={cx('text-xs', muted ? 'text-slate-600' : 'text-slate-300')}>
          {label}
        </span>
      </dt>

      {note && (
        <span className="truncate text-[10px] text-slate-600">{note}</span>
      )}

      <dd
        className={cx(
          'numeric ml-auto shrink-0 text-xs',
          muted ? 'text-slate-600' : derived ? 'text-slate-400' : 'text-slate-200',
        )}
      >
        {shown}
      </dd>
    </div>
  )
}
