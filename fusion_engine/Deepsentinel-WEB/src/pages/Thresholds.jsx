import { useEffect, useMemo, useState } from 'react'
import {
  applyThresholds, getThresholds, resetThresholds, simulateThresholds,
} from '../services/api'
import { usePackage } from '../hooks/usePackage'
import Locked from '../components/Locked'
import { Alert, cx } from '../components/ui'
import { Badge, Footer, Metric, Panel, Progress, SectionHeading } from '../components/ConsoleShell'

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
  real: 'rgb(var(--ds-sev-low))',        // caught, and it was fraud
  false: 'rgb(var(--ds-sev-high))',      // caught, and it was not
  missed: 'rgb(var(--ds-sev-critical))', // not caught, and it was fraud
}

export default function Thresholds() {
  const { has, upsells } = usePackage()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  // One line per detector plus the fused verdict. They are genuinely separate
  // questions: the detectors disagree, and their scores are not on a shared
  // scale, so a single number cannot stand in for all four.
  const [selected, setSelected] = useState('fused')
  // The line the monitor is actually alerting on right now, as distinct from
  // the line being explored on this page.
  const [live, setLive] = useState(null)
  const [saving, setSaving] = useState(false)
  const [lines, setLines] = useState({
    fused: 0.5, graph: 0.5, behavioural: 0.5, temporal: 0.5,
  })
  const t = lines[selected] ?? 0.5
  const setT = (v) => setLines((p) => ({ ...p, [selected]: v }))

  useEffect(() => {
    getThresholds().then(setLive).catch(() => {})
  }, [])

  useEffect(() => {
    simulateThresholds()
      .then(setData)
      .catch((e) => setError(e?.response?.data?.detail ?? 'Could not load history.'))
  }, [])

  const DETECTORS = [
    ['fused', 'Fused verdict', 'all three, reconciled'],
    ['graph', 'Edge-Enhanced GraphSAGE', 'network structure'],
    ['behavioural', 'Stratified VAE + DSAA', 'account behaviour'],
    ['temporal', 'Transaction-Sequence TCN', 'timing and order'],
  ]
  const forKey = (k) => (k === 'fused' ? data : data?.detectors?.[k])
  const active = forKey(selected)
  const curve = active?.curve ?? []
  const point = useMemo(() => {
    if (!curve.length) return null
    return curve.reduce((best, p) =>
      Math.abs(p.threshold - t) < Math.abs(best.threshold - t) ? p : best,
    )
  }, [curve, t])

  const maxAlerts = Math.max(...curve.map((p) => p.alerts), 1)
  const hasLabels = (active?.labelled ?? 0) > 0
  const empty = data && data.sample_size === 0

  return (
    <div className="ds-fade-up" style={{ display: 'grid', gap: 16 }}>

      {/* What the chosen line would have done, stated before the controls. */}
      <div style={{ display: 'grid', gap: 11,
                    gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
        <Metric label="Alerts at this line" value={point?.alerts ?? null} tone="accent"
                meta={`${DETECTORS.find(([k]) => k === selected)?.[1]} · ${t.toFixed(2)}`} />
        <Metric label="Precision" value={hasLabels ? pct(point?.precision) : null}
                meta={hasLabels ? 'of alerts, how many were real' : 'no labels in this history'} />
        <Metric label="Recall" value={hasLabels ? pct(point?.recall) : null} tone="alert"
                meta={hasLabels ? 'of real fraud, how much was caught' : 'no labels in this history'} />
        <Metric label="Scored" value={active?.sample_size ?? null}
                meta={`${active?.labelled ?? 0} carry a label`} />
      </div>

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
            <div className="ds-empty">
              This page replays decisions the platform has already made. Ingest a
              file with the Query Runner, or analyse a transaction, and it fills in.
            </div>
          ) : (
            <>
            {/* One row per detector. Selecting a row is what the slider and
                the curve below are then tuning — the platform's line and each
                model's own line are different decisions. */}
            <Panel style={{ overflow: 'hidden' }}>
              <div style={{ padding: '17px 19px 4px' }}>
                <SectionHeading
                  label="Every line, on the same history"
                  title="Choose which threshold to tune"
                  action={<span className="ds-mono" style={{ fontSize: 12,
                          color: 'rgb(var(--ds-muted))' }}>
                    {data?.sample_size ?? 0} scored
                  </span>}
                />
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="ds-table">
                  <thead>
                    <tr>
                      <th>Detector</th><th>Reads</th><th>Line</th>
                      <th>Alerts</th><th>Precision</th><th>Recall</th>
                      <th>F1</th><th>Best F1 at</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DETECTORS.map(([key, name, reads]) => {
                      const d = forKey(key)
                      const line = lines[key] ?? 0.5
                      const pt = d?.curve?.length
                        ? d.curve.reduce((best, q) =>
                            Math.abs(q.threshold - line) < Math.abs(best.threshold - line) ? q : best)
                        : null
                      const on = selected === key
                      return (
                        <tr key={key}
                            onClick={() => d?.curve?.length && setSelected(key)}
                            style={{ cursor: d?.curve?.length ? 'pointer' : 'not-allowed',
                                     opacity: d?.curve?.length ? 1 : 0.45,
                                     background: on ? 'rgb(var(--ds-surface-2))' : undefined }}>
                          <td style={{ fontWeight: on ? 600 : 400 }}>{name}</td>
                          <td style={{ color: 'rgb(var(--ds-muted))' }}>{reads}</td>
                          <td className="ds-mono" style={{ color: on
                                ? 'rgb(var(--ds-accent-strong))' : undefined }}>
                            {d?.curve?.length ? line.toFixed(2) : '—'}
                          </td>
                          <td className="ds-mono">{pt ? pt.alerts : '—'}</td>
                          <td className="ds-mono">{pct(pt?.precision)}</td>
                          <td className="ds-mono">{pct(pt?.recall)}</td>
                          <td className="ds-mono">{pct(pt?.f1)}</td>
                          <td className="ds-mono" style={{ color: 'rgb(var(--ds-muted))' }}>
                            {d?.best ? d.best.threshold.toFixed(2) : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p style={{ padding: '11px 19px 15px', fontSize: 11, lineHeight: 1.6,
                          color: 'rgb(var(--ds-faint))', margin: 0 }}>
                A detector with no history on this window cannot be tuned.
                Changes here are simulated against past decisions and do not
                affect the running services.
              </p>
            </Panel>

            <div style={{ display: 'grid', gap: 12,
                          gridTemplateColumns: 'minmax(0, 1.5fr) minmax(280px, .72fr)' }}>
              <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>

                {/* ── the curve ── */}
                <Panel className="ds-panel-pad">
                  <div className="hair-b flex flex-wrap items-baseline justify-between gap-3 pb-2.5">
                    <h2 className="ds-section-title">
                      {DETECTORS.find(([k]) => k === selected)?.[1]} — alert volume
                      across every threshold
                    </h2>
                    <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-slate-500">
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
                    <div className="mt-1 flex justify-between text-[12px] text-slate-600">
                      <span>0.00 — alert on everything</span>
                      {active?.best && (
                        <button
                          onClick={() => setT(active.best.threshold)}
                          className="text-accent-400 transition-colors hover:text-accent-300"
                        >
                          best F1 at {active.best.threshold.toFixed(2)} →
                        </button>
                      )}
                      <span>1.00 — alert on nothing</span>
                    </div>
                  </div>
                </Panel>

                {/* ── what the decision costs ── */}
                {hasLabels && point && (
                  <Panel className="ds-panel-pad">
                    <div className="hair-b flex items-baseline justify-between pb-2.5">
                      <h2 className="text-sm font-semibold text-slate-100">
                        What this line costs
                      </h2>
                      <span className="text-[13px] text-slate-500">
                        at {point.threshold.toFixed(2)}, over {active.labelled} labelled records
                      </span>
                    </div>
                    <Outcomes point={point} />
                  </Panel>
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
              <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
                <Panel className="ds-panel-pad">
                  <div className="flex items-baseline justify-between">
                    <h3 className="ds-section-title">
                    {DETECTORS.find(([k]) => k === selected)?.[1]}
                  </h3>
                  </div>
                  <p className="numeric mt-3 text-[2.5rem] leading-none text-accent-400">
                    {t.toFixed(2)}
                  </p>
                  <p className="mt-2 text-[13px] leading-relaxed text-slate-500">
                    Everything scored at or above this raises an alert.
                  </p>

                  {/* The fused line is settable: the monitor reads it and
                      alerts on it. Per-detector lines belong to the services
                      that own them, so those stay simulated. */}
                  {selected === 'fused' && live && (
                    <div style={{ marginTop: 14, paddingTop: 13,
                                  borderTop: '1px solid rgb(var(--ds-line))' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between',
                                    fontSize: 12, marginBottom: 4 }}>
                        <span style={{ color: 'rgb(var(--ds-muted))' }}>Monitor is using</span>
                        <span className="ds-mono">
                          {Number(live.bands?.critical ?? 0).toFixed(2)}
                          <span style={{ color: 'rgb(var(--ds-faint))' }}> critical</span>
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: 'rgb(var(--ds-faint))',
                                    marginBottom: 11 }}>
                        {live.source === 'operator'
                          ? 'set here previously'
                          : "the relational model's own calibration"}
                      </div>
                      <div style={{ display: 'flex', gap: 7 }}>
                        <button className="ds-btn ds-btn-primary" disabled={saving}
                          onClick={async () => {
                            setSaving(true)
                            try {
                              // One slider, three bands: high and medium keep
                              // their spacing below the chosen critical line so
                              // the ladder stays ordered.
                              setLive(await applyThresholds({
                                critical: Number(t.toFixed(3)),
                                high: Number((t * 0.46).toFixed(3)),
                                medium: Number((t * 0.23).toFixed(3)),
                              }))
                            } catch (e) {
                              setError(e?.response?.data?.detail ?? 'Could not apply.')
                            } finally { setSaving(false) }
                          }}>
                          {saving ? 'Applying…' : 'Alert on this line'}
                        </button>
                        {live.source === 'operator' && (
                          <button className="ds-btn ds-btn-quiet" disabled={saving}
                            onClick={async () => {
                              setSaving(true)
                              try { setLive(await resetThresholds()) }
                              finally { setSaving(false) }
                            }}>
                            Reset
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </Panel>

                {data?.best && (
                  <Panel className="ds-panel-pad">
                    <h3 className="text-xs font-semibold text-slate-200">Best measured F1</h3>
                    <div className="rows mt-2">
                      <Row label="Threshold" value={active.best.threshold.toFixed(2)} />
                      <Row label="F1" value={pct(active.best.f1)} />
                      <Row label="Precision" value={pct(active.best.precision)} />
                      <Row label="Recall" value={pct(active.best.recall)} />
                      <Row label="Alerts" value={active.best.alerts} />
                    </div>
                    <p className="mt-3 text-[12px] leading-relaxed text-slate-600">
                      The optimum on this history. It is not automatically the
                      right operating point — that depends on how much an analyst
                      hour costs against a missed case.
                    </p>
                  </Panel>
                )}

                {data?.message && (
                  <Panel className="ds-panel-pad">
                    <p style={{ fontSize: 13, lineHeight: 1.6,
                                color: 'rgb(var(--ds-warn))', margin: 0 }}>
                      {data.message}
                    </p>
                  </Panel>
                )}

              </div>
            </div>
            </>
          )}
        </>
      </Locked>

      <Footer left="Replayed against past decisions. Alert volume moves with traffic." />
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
                  {/* 2px of surface between the segments so the split is a
                      boundary and not a colour change. */}
                  <div style={{ height: `${Math.max(0, h - realPart)}%`,
                                marginBottom: p.true_positives && p.false_positives ? 2 : 0,
                                background: active ? HUE.false : 'rgb(var(--ds-sev-high) / 0.5)' }} />
                  <div style={{ height: `${realPart}%`,
                                background: active ? HUE.real : 'rgb(var(--ds-sev-low) / 0.5)' }} />
                </>
              ) : (
                <div className={cx('rounded-t-sm', active ? 'bg-accent-400' : 'bg-modality-graph/45')}
                     style={{ height: `${Math.max(1.5, h)}%` }} />
              )}
              <span className="numeric pointer-events-none absolute -top-5 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded bg-surface-overlay px-1.5 py-0.5 text-[11px] text-slate-200 opacity-0 transition-opacity group-hover:opacity-100">
                {p.alerts}
              </span>
            </button>
          )
        })}
      </div>
      <div className="hair-t mt-1.5 flex justify-between pt-1.5 text-[12px] text-slate-600">
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
            <p className="mt-1 text-[12px] leading-relaxed text-slate-600">{note}</p>
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
    <div className="flex items-baseline justify-between py-1.5 text-[13px]">
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
