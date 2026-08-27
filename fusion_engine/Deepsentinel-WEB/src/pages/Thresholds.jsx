import { useEffect, useMemo, useState } from 'react'
import { simulateThresholds } from '../services/api'
import { usePackage } from '../hooks/usePackage'
import Locked from '../components/Locked'
import { Alert, cx } from '../components/ui'

/**
 * Move the decision threshold and see what it would have done.
 *
 * Alert volume is the operational cost of a fraud system — too low a threshold
 * and analysts drown, too high and cases are missed. This replays every
 * transaction the platform has already scored, so the trade-off is shown
 * against real history rather than argued about in the abstract.
 *
 * The headline is the readout. Dragging the slider rewrites the sentence at the
 * top of the page, because "at 0.45 this raises 31 alerts, 22 of them real" is
 * the thing being decided — not a number in a card somewhere below the fold.
 *
 * The whole curve is fetched once and the slider reads from it. A request per
 * pixel would be slower and would tell you nothing new: the underlying history
 * does not change while you drag.
 *
 * This only means something because the scores are calibrated. Sliding a
 * threshold over uncalibrated output compares numbers that have no fixed
 * meaning — isotonic calibration (ECE 0.80 → 0.024) is what makes 0.4 mean
 * "40% likely", and therefore what makes this page honest.
 */

const pct = (v) => (typeof v === 'number' ? `${(v * 100).toFixed(1)}%` : '—')
const HUE = {
  real: '#22c55e',      // caught, and it was fraud
  false: '#eab308',     // caught, and it was not
  missed: '#ef4444',    // not caught, and it was fraud
}

export default function Thresholds() {
  const { has, upsells } = usePackage()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [t, setT] = useState(0.5)

  useEffect(() => {
    simulateThresholds()
      .then(setData)
      .catch((e) => setError(e?.response?.data?.detail ?? 'Could not load history.'))
  }, [])

  const curve = data?.curve ?? []
  const point = useMemo(() => {
    if (!curve.length) return null
    return curve.reduce((best, p) =>
      Math.abs(p.threshold - t) < Math.abs(best.threshold - t) ? p : best,
    )
  }, [curve, t])

  const maxAlerts = Math.max(...curve.map((p) => p.alerts), 1)
  const hasLabels = (data?.labelled ?? 0) > 0
  const empty = data && data.sample_size === 0

  return (
    <div className="mx-auto max-w-[88rem] px-5 pb-16 pt-8 sm:px-8">

      {/* ═══ the statement — it moves with the slider ══════════════════ */}
      <header className="hair-b pb-7">
        <p className="eyebrow text-slate-500">Threshold tuning</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-6">
          <h1 className="display max-w-2xl text-[2.75rem] text-slate-100 sm:text-[3.5rem]">
            {empty ? (
              <>Nothing has been <span className="display-italic text-slate-500">scored yet.</span></>
            ) : point ? (
              <>
                At {t.toFixed(2)},{' '}
                <span className="display-italic text-accent-400">
                  {point.alerts} alert{point.alerts === 1 ? '' : 's'}.
                </span>
              </>
            ) : (
              <>Replaying <span className="display-italic text-slate-500">history…</span></>
            )}
          </h1>
          <p className="max-w-sm text-sm leading-relaxed text-slate-400">
            {empty
              ? 'Run the monitor or analyse a few transactions, and the curve fills in from what the platform has already decided.'
              : hasLabels && point
                ? <>Of those, <b className="text-slate-200">{point.true_positives}</b> were
                    real fraud and <b className="text-slate-200">{point.false_positives}</b> were
                    not — while <b className="text-slate-200">{point.false_negatives}</b> got
                    through. Every transaction the platform has already scored, replayed at this line.</>
                : 'Every transaction the platform has already scored, replayed at the line you choose. Historical, not a forecast.'}
          </p>
        </div>

        <dl className="mt-7 grid grid-cols-2 gap-y-5 sm:grid-cols-3 lg:grid-cols-6">
          <Figure value={point?.alerts} label="Alerts raised" accent />
          <Figure value={hasLabels ? point?.precision : null} label="Precision" percent />
          <Figure value={hasLabels ? point?.recall : null} label="Recall" percent />
          <Figure value={hasLabels ? point?.f1 : null} label="F1" percent />
          <Figure value={data?.sample_size} label="Scored" />
          <Figure value={data?.labelled} label="Labelled" />
        </dl>
      </header>

      <Locked
        feature="threshold_sim"
        has={has}
        upsells={upsells}
        title="Threshold tuning is not included in your package"
        className="mt-8"
      >
        <>
          {error && <div className="mt-6"><Alert tone="error">{error}</Alert></div>}

          {empty ? (
            <section className="hair mt-8 rounded-xl border border-dashed px-8 py-16 text-center">
              <p className="display text-2xl text-slate-300">The curve is empty.</p>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-500">
                This page replays decisions the platform has already made. Ingest
                a file with the Query Runner, or analyse a transaction, and it
                fills in.
              </p>
            </section>
          ) : (
            <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
              <div className="min-w-0 space-y-8">

                {/* ── the curve ── */}
                <section>
                  <div className="hair-b flex flex-wrap items-baseline justify-between gap-3 pb-2.5">
                    <h2 className="text-sm font-semibold text-slate-100">
                      Alert volume across every threshold
                    </h2>
                    <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
                      {hasLabels ? (
                        <>
                          <Legend hex={HUE.real}>real</Legend>
                          <Legend hex={HUE.false}>false</Legend>
                        </>
                      ) : (
                        <Legend hex="rgb(var(--modality-graph))">alerts</Legend>
                      )}
                    </span>
                  </div>

                  <Curve
                    curve={curve} point={point} maxAlerts={maxAlerts}
                    hasLabels={hasLabels} onPick={setT}
                  />

                  {/* the slider, directly under the axis it controls */}
                  <div className="mt-5">
                    <input
                      type="range" min="0" max="1" step="0.025"
                      value={t}
                      onChange={(e) => setT(parseFloat(e.target.value))}
                      className="w-full accent-teal-400"
                      aria-label="Decision threshold"
                    />
                    <div className="mt-1 flex justify-between text-[10px] text-slate-600">
                      <span>0.00 — alert on everything</span>
                      {data?.best && (
                        <button
                          onClick={() => setT(data.best.threshold)}
                          className="text-accent-400 transition-colors hover:text-accent-300"
                        >
                          best F1 at {data.best.threshold.toFixed(2)} →
                        </button>
                      )}
                      <span>1.00 — alert on nothing</span>
                    </div>
                  </div>
                </section>

                {/* ── what the decision costs ── */}
                {hasLabels && point && (
                  <section>
                    <div className="hair-b flex items-baseline justify-between pb-2.5">
                      <h2 className="text-sm font-semibold text-slate-100">
                        What this line costs
                      </h2>
                      <span className="text-[11px] text-slate-500">
                        at {point.threshold.toFixed(2)}, over {data.labelled} labelled records
                      </span>
                    </div>
                    <Outcomes point={point} />
                  </section>
                )}

                {!hasLabels && (
                  <p className="text-xs leading-relaxed text-slate-500">
                    Alert volume is real, but no ground-truth labels exist in this
                    history, so accuracy cannot be computed. Ingest a file with an
                    <span className="numeric"> isFraud </span> column to see
                    precision and recall here.
                  </p>
                )}
              </div>

              {/* ═══ the rail ═══ */}
              <aside className="space-y-7 lg:hair-l lg:pl-7">
                <section>
                  <div className="flex items-baseline justify-between">
                    <h3 className="text-xs font-semibold text-slate-200">Chosen threshold</h3>
                  </div>
                  <p className="numeric mt-3 text-[2.5rem] leading-none text-accent-400">
                    {t.toFixed(2)}
                  </p>
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                    Everything scored at or above this raises an alert.
                  </p>
                </section>

                {data?.best && (
                  <section>
                    <h3 className="text-xs font-semibold text-slate-200">Best measured F1</h3>
                    <div className="rows mt-2">
                      <Row label="Threshold" value={data.best.threshold.toFixed(2)} />
                      <Row label="F1" value={pct(data.best.f1)} />
                      <Row label="Precision" value={pct(data.best.precision)} />
                      <Row label="Recall" value={pct(data.best.recall)} />
                      <Row label="Alerts" value={data.best.alerts} />
                    </div>
                    <p className="mt-3 text-[10px] leading-relaxed text-slate-600">
                      The optimum on this history. It is not automatically the
                      right operating point — that depends on how much an analyst
                      hour costs against a missed case.
                    </p>
                  </section>
                )}

                {data?.message && (
                  <section>
                    <h3 className="text-xs font-semibold text-risk-medium">Read with care</h3>
                    <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
                      {data.message}
                    </p>
                  </section>
                )}

                <section>
                  <h3 className="text-xs font-semibold text-slate-200">Why this is honest</h3>
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                    A replay of decisions already made, on transactions already
                    seen. It says what <i>would have</i> happened, not what will —
                    alert volume moves with traffic.
                  </p>
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                    It is meaningful at all because the scores are calibrated
                    probabilities: isotonic calibration took expected calibration
                    error from 0.80 to 0.024, so 0.40 means &ldquo;40% likely&rdquo;
                    and keeps that meaning as the models change.
                  </p>
                </section>
              </aside>
            </div>
          )}
        </>
      </Locked>
    </div>
  )
}

/* ── pieces ───────────────────────────────────────────────────────── */

/**
 * The sweep. Each column is one threshold; where labels exist the column is
 * split into what that threshold would have caught correctly and what it would
 * have caught wrongly, because the height alone hides the whole trade-off.
 */
function Curve({ curve, point, maxAlerts, hasLabels, onPick }) {
  return (
    <>
      <div className="mt-5 flex h-52 items-end gap-[2px]">
        {curve.map((p) => {
          const active = point && Math.abs(p.threshold - point.threshold) < 1e-6
          const h = (p.alerts / maxAlerts) * 100
          const realPart = hasLabels && p.alerts
            ? (p.true_positives / p.alerts) * h
            : 0
          return (
            <button
              key={p.threshold}
              onClick={() => onPick(p.threshold)}
              onMouseEnter={(e) => e.buttons === 1 && onPick(p.threshold)}
              title={`${p.threshold.toFixed(2)} → ${p.alerts} alerts`}
              aria-label={`Threshold ${p.threshold.toFixed(2)}, ${p.alerts} alerts`}
              className="group relative flex h-full flex-1 flex-col justify-end"
            >
              {active && (
                <span className="absolute inset-x-0 bottom-0 top-0 bg-slate-200/[0.06]" />
              )}
              {hasLabels ? (
                <>
                  <div style={{ height: `${Math.max(0, h - realPart)}%`,
                                background: active ? HUE.false : 'rgb(234 179 8 / 0.5)' }} />
                  <div style={{ height: `${realPart}%`,
                                background: active ? HUE.real : 'rgb(34 197 94 / 0.5)' }} />
                </>
              ) : (
                <div className={cx('rounded-t-sm', active ? 'bg-accent-400' : 'bg-modality-graph/45')}
                     style={{ height: `${Math.max(1.5, h)}%` }} />
              )}
              <span className="numeric pointer-events-none absolute -top-5 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded bg-surface-overlay px-1.5 py-0.5 text-[9px] text-slate-200 opacity-0 transition-opacity group-hover:opacity-100">
                {p.alerts}
              </span>
            </button>
          )
        })}
      </div>
      <div className="hair-t mt-1.5 flex justify-between pt-1.5 text-[10px] text-slate-600">
        <span>0.00</span><span>0.25</span><span>0.50</span><span>0.75</span><span>1.00</span>
      </div>
    </>
  )
}

/** Real, false and missed as one proportional rule — the trade-off in a line. */
function Outcomes({ point }) {
  const total = point.true_positives + point.false_positives + point.false_negatives
  const parts = [
    ['Real fraud caught', point.true_positives, HUE.real,
     'confirmed by the source label'],
    ['False alarms', point.false_positives, HUE.false,
     'an analyst hour spent on nothing'],
    ['Missed', point.false_negatives, HUE.missed,
     'fraud that went through unflagged'],
  ]
  return (
    <>
      <div className="mt-4 flex h-2 gap-[2px] overflow-hidden rounded-full">
        {parts.map(([label, n, hex]) => (
          n > 0 && <div key={label} title={`${label}: ${n}`}
                        style={{ width: `${(n / (total || 1)) * 100}%`, background: hex }} />
        ))}
        {total === 0 && <div className="w-full bg-surface-overlay" />}
      </div>
      <div className="mt-5 grid gap-5 sm:grid-cols-3">
        {parts.map(([label, n, hex, note]) => (
          <div key={label}>
            <p className="numeric text-[1.75rem] leading-none" style={{ color: hex }}>{n}</p>
            <p className="eyebrow mt-2 text-slate-400">{label}</p>
            <p className="mt-1 text-[10px] leading-relaxed text-slate-600">{note}</p>
          </div>
        ))}
      </div>
    </>
  )
}

function Figure({ value, label, accent, percent }) {
  const shown = typeof value === 'number'
    ? (percent ? `${(value * 100).toFixed(1)}%` : value)
    : '—'
  return (
    <div>
      <dd className={cx('numeric text-[1.75rem] leading-none',
        typeof value !== 'number' ? 'text-slate-600'
          : accent ? 'text-accent-400' : 'text-slate-100')}>
        {shown}
      </dd>
      <dt className="eyebrow mt-2 text-slate-500">{label}</dt>
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex items-baseline justify-between py-1.5 text-[11px]">
      <span className="text-slate-500">{label}</span>
      <span className="numeric text-slate-200">{value}</span>
    </div>
  )
}

function Legend({ hex, children }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: hex }} />
      {children}
    </span>
  )
}
