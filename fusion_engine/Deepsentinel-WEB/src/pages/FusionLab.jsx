import { useCallback, useEffect, useState } from 'react'
import {
  analyzeTransaction, getThresholds, downloadAnalysisReport,
} from '../services/api'
import { PRESETS } from '../components/DetectorLab'
import ConsoleShell from '../components/ConsoleShell'
import { Alert, Button, cx } from '../components/ui'

/**
 * All three detectors at once, and the arithmetic that turns them into one
 * number.
 *
 * One table, not four sections. The earlier version showed each detector's
 * score, its contribution, and its own sentence in three separate places, so
 * reading a single detector meant looking in three. They are one row each now:
 * what it said, how far that moved the verdict, and which way.
 *
 * The contributions are exact rather than estimated. The meta-classifier is a
 * StandardScaler followed by a logistic regression, so the decision function
 * decomposes term by term: z = intercept + Σ coef · (x − mean) / scale. Each
 * bar is one of those products. No SHAP, no sampling — for a linear model the
 * attribution is the model, read out.
 */

const BAND_COLOURS = {
  CRITICAL: 'rgb(var(--ds-sev-critical))',
  HIGH: 'rgb(var(--ds-sev-high))',
  MEDIUM: 'rgb(var(--ds-sev-medium))',
  LOW: 'rgb(var(--ds-accent))',
}

export default function FusionLab() {
  const [pick, setPick] = useState(0)
  const [r, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [bands, setBands] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getThresholds().then((t) => setBands(t?.bands ?? null)).catch(() => setBands(null))
  }, [])

  const run = useCallback(async (i) => {
    setLoading(true)
    setError(null)
    try {
      setResult(await analyzeTransaction(PRESETS[i].txn))
    } catch (err) {
      setError(err?.userMessage ?? 'The pipeline did not answer.')
      setResult(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { run(pick) }, [run, pick])

  const p = PRESETS[pick]
  const contrib = r?.contributions ?? {}
  const rows = [
    ['Network', 'graph', r?.graph_score, r?.graph_available, r?.graph_signal],
    ['Behaviour', 'behavioural', r?.behavioral_score, r?.behavioral_available, r?.behavioral_signal],
    ['Timing', 'temporal', r?.temporal_score, r?.temporal_available, r?.temporal_signal],
  ]
  const widest = Math.max(...rows.map(([, k]) => Math.abs(contrib[k] ?? 0)), 0.5)
  const driver = rows
    .filter(([, k]) => (contrib[k] ?? 0) > 0)
    .sort((a, b) => (contrib[b[1]] ?? 0) - (contrib[a[1]] ?? 0))[0]

  return (
    <ConsoleShell
      eyebrow="Detector · Fusion"
      title="Fusion and chain-of-evidence"
      subtitle="Three detectors, one verdict, and how much each moved it."
    >
      <div style={{ display: 'grid', gap: 18 }}>
        {error && <Alert tone="error">{error}</Alert>}

        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map((x, i) => (
            <button
              key={x.ref}
              onClick={() => setPick(i)}
              className={cx('rounded-lg border px-3 py-2 text-left transition-colors',
                i === pick ? 'border-accent-400/60' : 'border-slate-800 hover:border-slate-700')}
              style={{ background: i === pick ? 'rgba(45,212,191,.06)' : 'transparent' }}
            >
              <span className="numeric block text-[14px]"
                    style={{ color: 'rgb(var(--ds-ink))' }}>{x.ref}</span>
              <span className="block text-[12px]"
                    style={{ color: 'rgb(var(--ds-faint))' }}>{x.note}</span>
            </button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => run(pick)} loading={loading}>
            Run again
          </Button>
        </div>

        {loading && !r ? (
          <p className="py-16 text-center text-xs" style={{ color: 'rgb(var(--ds-faint))' }}>
            Running all three detectors…
          </p>
        ) : r ? (
          <>
            {/* The verdict, once, at the size it deserves. */}
            <div className="flex flex-wrap items-end gap-x-6 gap-y-2 rounded-xl border p-4"
                 style={{ borderColor: 'rgb(var(--ds-line))' }}>
              <div>
                <p className="numeric text-[44px] leading-none"
                   style={{ color: BAND_COLOURS[r.classification] ?? 'rgb(var(--ds-ink))' }}>
                  {(r.fraud_confidence_score ?? 0).toFixed(4)}
                </p>
                <p className="ds-mono mt-1 text-[12px] uppercase tracking-wider"
                   style={{ color: 'rgb(var(--ds-faint))' }}>Fused confidence</p>
              </div>
              <div>
                <p className="text-[22px] leading-none"
                   style={{ color: BAND_COLOURS[r.classification] ?? 'rgb(var(--ds-ink))' }}>
                  {r.classification ?? '—'}
                </p>
                <p className="numeric mt-1 text-[12px]" style={{ color: 'rgb(var(--ds-faint))' }}>
                  {bands ? `critical ${bands.critical} · high ${bands.high} · medium ${bands.medium}`
                    : 'live operating point'}
                </p>
              </div>
              <div className="ml-auto text-right">
                <p className="numeric text-[22px] leading-none"
                   style={{ color: 'rgb(var(--ds-ink))' }}>{r.modalities_used ?? 0} of 3</p>
                <p className="text-[12px]" style={{ color: 'rgb(var(--ds-faint))' }}>
                  {r.modalities_used === 3 ? 'detectors answered' : 'shrunk toward neutral'}
                </p>
              </div>
            </div>

            {/* One row per detector: what it said, and what that did. */}
            <table className="w-full" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Detector', 'Score', 'Moved the verdict', ''].map((h, i) => (
                    <th key={h || i}
                        className="ds-mono px-2 pb-2 text-left text-[12px] uppercase tracking-wider"
                        style={{ color: 'rgb(var(--ds-faint))',
                                 borderBottom: '1px solid rgb(var(--ds-line))' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(([label, key, score, available]) => {
                  const v = contrib[key]
                  const lead = driver && driver[1] === key
                  return (
                    <tr key={key}>
                      <td className="px-2 py-2 text-[15px]"
                          style={{ color: 'rgb(var(--ds-ink))' }}>
                        {label}
                        {lead && (
                          <span className="ml-2 text-[12px]"
                                style={{ color: 'rgb(var(--ds-sev-high))' }}>decided it</span>
                        )}
                      </td>
                      <td className="numeric px-2 py-2 text-[15px]"
                          style={{ color: available ? 'rgb(var(--ds-ink))' : 'rgb(var(--ds-faint))' }}>
                        {available ? Number(score ?? 0).toFixed(4) : 'abstained'}
                      </td>
                      <td className="px-2 py-2" style={{ width: '55%' }}>
                        {v === undefined ? (
                          <span className="text-[13px]" style={{ color: 'rgb(var(--ds-faint))' }}>—</span>
                        ) : (
                          <span style={{ position: 'relative', display: 'block', height: 8,
                                         borderRadius: 4, background: 'rgb(var(--ds-line))' }}>
                            <span style={{ position: 'absolute', top: -3, bottom: -3, left: '50%',
                                           width: 1, background: 'rgb(var(--ds-faint))' }} />
                            <span style={{
                              position: 'absolute', top: 0, height: '100%', borderRadius: 4,
                              left: v >= 0 ? '50%' : `${50 - (Math.abs(v) / widest) * 50}%`,
                              width: `${(Math.abs(v) / widest) * 50}%`,
                              background: v >= 0 ? 'rgb(var(--ds-sev-critical))'
                                : 'rgb(var(--ds-accent))',
                            }} />
                          </span>
                        )}
                      </td>
                      <td className="numeric px-2 py-2 text-right text-[14px]"
                          style={{ color: v > 0 ? 'rgb(var(--ds-sev-high))'
                            : 'rgb(var(--ds-muted))' }}>
                        {v === undefined ? '' : `${v > 0 ? '+' : ''}${v.toFixed(2)}`}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p className="text-[13px]" style={{ color: 'rgb(var(--ds-muted))' }}>
              Right of centre argues for fraud, left against.
            </p>

            {/* The deciding detector's own sentence — one, not three. */}
            {driver?.[4] && (
              <p className="rounded-lg border p-3 text-[14px] leading-relaxed"
                 style={{ borderColor: 'rgb(var(--ds-line))', color: 'rgb(var(--ds-ink))' }}>
                {driver[4]}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 text-[13px]">
              {r.retrieval && (
                <span style={{ color: 'rgb(var(--ds-muted))' }}>
                  Closest typology{' '}
                  <span style={{ color: 'rgb(var(--ds-ink))' }}>
                    {r.retrieval.typology_name}
                  </span>
                  {' · '}
                  <span className="numeric">
                    {Number(r.retrieval.similarity_score ?? 0).toFixed(3)}
                  </span>
                </span>
              )}
              {r.forensic_report && (
                <details>
                  <summary className="cursor-pointer"
                           style={{ color: 'rgb(var(--ds-accent))' }}>
                    Generated report
                  </summary>
                  {r.analysis_id != null && (
                    <Button
                      size="sm" variant="secondary" loading={saving}
                      className="mt-2"
                      onClick={async () => {
                        setSaving(true)
                        setError(null)
                        try {
                          await downloadAnalysisReport(r.analysis_id)
                        } catch (err) {
                          setError(err?.userMessage
                            ?? 'That report could not be rendered as a PDF.')
                        } finally {
                          setSaving(false)
                        }
                      }}
                    >
                      Download PDF
                    </Button>
                  )}
                  <pre className="mt-2 overflow-x-auto rounded-lg border p-3 text-[13px]"
                       style={{ borderColor: 'rgb(var(--ds-line))',
                                color: 'rgb(var(--ds-muted))', whiteSpace: 'pre-wrap',
                                maxHeight: 320 }}>
                    {r.forensic_report}
                  </pre>
                </details>
              )}
            </div>
          </>
        ) : null}
      </div>
    </ConsoleShell>
  )
}
