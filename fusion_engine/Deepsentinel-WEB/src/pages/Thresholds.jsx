import { useEffect, useMemo, useState } from 'react'
import { simulateThresholds } from '../services/api'
import { usePackage } from '../hooks/usePackage'
import Locked from '../components/Locked'
import { Alert, Badge, Card, CardHeader, PageHeader, SectionLabel, cx } from '../components/ui'

/**
 * Move the decision threshold and see what it would have done.
 *
 * Alert volume is the operational cost of a fraud system — too low a threshold
 * and analysts drown, too high and cases are missed. This replays every
 * transaction the platform has already scored, so the trade-off is shown
 * against real history rather than argued about in the abstract.
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

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-10 sm:px-6">
      <PageHeader
        title="Threshold tuning"
        description="Replays every transaction already scored, at a threshold you choose. Historical, not a forecast."
      />

      <Locked
        feature="threshold_sim"
        has={has}
        upsells={upsells}
        title="Threshold tuning is not included in your package"
      >
        <>
          {error && <Alert tone="error">{error}</Alert>}

          {data?.message && <Alert tone="warning">{data.message}</Alert>}

          {data && data.sample_size === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-sm text-slate-300">Nothing has been scored yet.</p>
              <p className="mt-1 text-xs text-slate-500">
                Run the monitor or analyse a few transactions, and this fills in.
              </p>
            </Card>
          ) : (
            <>
              {/* ── the slider ── */}
              <Card className="p-5 sm:p-6">
                <CardHeader
                  title="Decision threshold"
                  description="Everything at or above this score raises an alert."
                  action={
                    <Badge tone="low">
                      {data?.sample_size ?? 0} scored · {data?.labelled ?? 0} labelled
                    </Badge>
                  }
                />

                <div className="mt-5">
                  <div className="flex items-baseline justify-between">
                    <span className="font-mono text-3xl font-semibold text-accent-400">
                      {t.toFixed(2)}
                    </span>
                    {data?.best && (
                      <button
                        onClick={() => setT(data.best.threshold)}
                        className="text-xs font-medium text-accent-400 hover:text-accent-300"
                      >
                        Jump to best F1 ({data.best.threshold.toFixed(2)})
                      </button>
                    )}
                  </div>
                  <input
                    type="range" min="0" max="1" step="0.025"
                    value={t}
                    onChange={(e) => setT(parseFloat(e.target.value))}
                    className="mt-3 w-full accent-teal-400"
                    aria-label="Decision threshold"
                  />
                  <div className="flex justify-between text-[10px] text-slate-600">
                    <span>0.00 — alert on everything</span>
                    <span>1.00 — alert on nothing</span>
                  </div>
                </div>

                {/* ── what it would have done ── */}
                {point && (
                  <div className="mt-6 grid gap-3 sm:grid-cols-4">
                    <Stat value={point.alerts} label="alerts raised" accent />
                    <Stat value={hasLabels ? pct(point.precision) : '—'} label="precision" />
                    <Stat value={hasLabels ? pct(point.recall) : '—'} label="recall" />
                    <Stat value={hasLabels ? pct(point.f1) : '—'} label="F1" />
                  </div>
                )}

                {point && hasLabels && (
                  <p className="mt-4 text-xs leading-relaxed text-slate-400">
                    At <span className="font-mono text-slate-200">{point.threshold.toFixed(2)}</span> this
                    would have raised <b className="text-slate-200">{point.alerts}</b> alert
                    {point.alerts === 1 ? '' : 's'} —{' '}
                    <span className="text-risk-low">{point.true_positives} real</span>,{' '}
                    <span className="text-risk-medium">{point.false_positives} false</span>, and{' '}
                    <span className="text-risk-high">{point.false_negatives} missed</span>.
                  </p>
                )}

                {!hasLabels && (
                  <p className="mt-4 text-xs leading-relaxed text-slate-500">
                    Alert volume is real, but no ground-truth labels exist in this
                    history so accuracy cannot be computed. Ingest a file with an
                    <span className="font-mono"> isFraud </span> column to see
                    precision and recall here.
                  </p>
                )}
              </Card>

              {/* ── the curve ── */}
              {curve.length > 0 && (
                <Card className="p-5 sm:p-6">
                  <CardHeader
                    title="Alert volume across every threshold"
                    description="Each bar is what that threshold would have raised."
                  />
                  <div className="mt-5 flex h-40 items-end gap-[2px]">
                    {curve.map((p) => {
                      const active = point && Math.abs(p.threshold - point.threshold) < 1e-6
                      return (
                        <button
                          key={p.threshold}
                          onClick={() => setT(p.threshold)}
                          title={`${p.threshold.toFixed(2)} → ${p.alerts} alerts`}
                          className={cx(
                            'flex-1 rounded-t transition-all',
                            active ? 'bg-accent-400' : 'bg-modality-graph/45 hover:bg-modality-graph/70',
                          )}
                          style={{ height: `${Math.max(2, (p.alerts / maxAlerts) * 100)}%` }}
                          aria-label={`Threshold ${p.threshold.toFixed(2)}, ${p.alerts} alerts`}
                        />
                      )
                    })}
                  </div>
                  <div className="mt-1.5 flex justify-between text-[10px] text-slate-600">
                    <span>0.0</span><span>0.5</span><span>1.0</span>
                  </div>
                </Card>
              )}

              <Card className="p-5">
                <SectionLabel>What this is</SectionLabel>
                <p className="mt-2 text-xs leading-relaxed text-slate-400">
                  A replay of decisions already made, on transactions already seen.
                  It says what <i>would have</i> happened, not what will — alert
                  volume moves with traffic. It is meaningful at all because the
                  scores are calibrated probabilities: a threshold of 0.4 means
                  &ldquo;40% likely&rdquo;, so the same number keeps its meaning as
                  models change.
                </p>
              </Card>
            </>
          )}
        </>
      </Locked>
    </div>
  )
}

function Stat({ value, label, accent }) {
  return (
    <div className="rounded-xl border border-subtle bg-surface-raised p-4">
      <p className={cx('font-mono text-2xl font-semibold',
        accent ? 'text-accent-400' : 'text-slate-200')}>{value}</p>
      <p className="mt-0.5 text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
    </div>
  )
}
