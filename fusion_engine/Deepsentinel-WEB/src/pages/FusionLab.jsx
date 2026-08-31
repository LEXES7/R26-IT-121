import { useCallback, useEffect, useState } from 'react'
import { analyzeTransaction, getThresholds } from '../services/api'
import { PRESETS, Bar, Stat } from '../components/DetectorLab'
import ConsoleShell from '../components/ConsoleShell'
import { Alert, Button, cx } from '../components/ui'

/**
 * All three detectors at once, and the arithmetic that turns them into one
 * number.
 *
 * The other three pages each show one model arguing its case. This is the page
 * where those cases are weighed. The interesting claim it has to support is
 * that combining the three beats any of them alone — which is not automatic,
 * and was not true here until the sequential model was retrained.
 *
 * The contributions are exact rather than estimated. The meta-classifier is a
 * StandardScaler followed by a logistic regression, so the decision function
 * decomposes term by term: z = intercept + Σ coef · (x − mean) / scale. Each
 * bar below is one of those products. No SHAP, no sampling, no approximation —
 * for a linear model the attribution is just the model, read out.
 */

const BAND_COLOURS = {
  CRITICAL: 'rgb(var(--ds-sev-critical))',
  HIGH: 'rgb(var(--ds-sev-high))',
  MEDIUM: 'rgb(var(--ds-sev-medium))',
  LOW: 'rgb(var(--ds-accent))',
}

function bandColour(classification) {
  return BAND_COLOURS[classification] ?? BAND_COLOURS.LOW
}

export default function FusionLab() {
  const [pick, setPick] = useState(0)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [bands, setBands] = useState(null)

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
  const r = result
  const contrib = r?.contributions ?? {}
  const terms = [
    ['Network', 'graph', r?.graph_score, r?.graph_available, r?.graph_signal],
    ['Behaviour', 'behavioural', r?.behavioral_score, r?.behavioral_available, r?.behavioral_signal],
    ['Timing', 'temporal', r?.temporal_score, r?.temporal_available, r?.temporal_signal],
  ]
  const maxTerm = Math.max(...terms.map(([, k]) => Math.abs(contrib[k] ?? 0)), 0.5)
  const driver = terms
    .filter(([, k]) => (contrib[k] ?? 0) > 0)
    .sort((a, b) => (contrib[b[1]] ?? 0) - (contrib[a[1]] ?? 0))[0]

  return (
    <ConsoleShell
      eyebrow="Detector · Fusion"
      title="Fusion and chain-of-evidence"
      subtitle="Three independent opinions, one verdict, and an exact account of how each opinion moved it."
    >
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
            <span className="numeric block text-[12px]"
                  style={{ color: 'rgb(var(--ds-ink))' }}>{x.ref}</span>
            <span className="block text-[10px]"
                  style={{ color: 'rgb(var(--ds-faint))' }}>{x.note}</span>
          </button>
        ))}
        <Button size="sm" variant="ghost" onClick={() => run(pick)} loading={loading}>
          Run again
        </Button>
      </div>

      <p className="numeric text-[11px]" style={{ color: 'rgb(var(--ds-faint))' }}>
        {p.txn.type} · {p.txn.amount.toLocaleString()} · {p.txn.nameOrig} → {p.txn.nameDest} · step {p.txn.step}
      </p>

      {loading && !r ? (
        <p className="py-16 text-center text-xs" style={{ color: 'rgb(var(--ds-faint))' }}>
          Running all three detectors…
        </p>
      ) : r ? (
        <div style={{ display: 'grid', gap: 22 }}>
          <div className="grid gap-6 sm:grid-cols-4">
            <Stat label="Fused confidence"
                  value={(r.fraud_confidence_score ?? 0).toFixed(4)}
                  note="the number the platform acts on" />
            <Stat label="Classification" value={r.classification ?? '—'}
                  note={bands
                    ? `critical ${bands.critical} · high ${bands.high} · medium ${bands.medium}`
                    : 'live operating point'} />
            <Stat label="Detectors answering" value={`${r.modalities_used ?? 0} of 3`}
                  note={r.modalities_used === 3 ? 'full evidence' : 'verdict shrunk toward neutral'} />
            <Stat label="Decided by" value={driver ? driver[0] : '—'}
                  note="largest positive contribution" />
          </div>

          {/* Three inputs, three signed terms. */}
          <div className="grid gap-8 md:grid-cols-2">
            <section style={{ display: 'grid', gap: 10 }}>
              <h3 className="ds-mono text-[10px] uppercase tracking-wider"
                  style={{ color: 'rgb(var(--ds-faint))' }}>
                What each detector said
              </h3>
              {terms.map(([label, key, score, available]) => (
                <Bar key={key} label={available ? label : `${label} · did not answer`}
                     value={available ? (score ?? 0) : 0} max={1}
                     tone={available ? ((score ?? 0) > 0.6 ? 'risk' : 'accent') : 'warn'}
                     right={available ? Number(score ?? 0).toFixed(4) : 'abstained'} />
              ))}
              <p className="text-[11px] leading-relaxed" style={{ color: 'rgb(var(--ds-muted))' }}>
                A detector that abstains is imputed at its own training mean, not
                at zero — an absent opinion is neutral, not an argument for
                innocence. The verdict is then shrunk toward 0.5 to say, in the
                number itself, that less evidence went into it.
              </p>
            </section>

            <section style={{ display: 'grid', gap: 10 }}>
              <h3 className="ds-mono text-[10px] uppercase tracking-wider"
                  style={{ color: 'rgb(var(--ds-faint))' }}>
                How much each moved the verdict
              </h3>
              {terms.map(([label, key]) => {
                const v = contrib[key]
                if (v === undefined) return null
                return (
                  <div key={key} style={{ display: 'grid', gap: 4 }}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-[12px]" style={{ color: 'rgb(var(--ds-ink))' }}>{label}</span>
                      <span className="numeric text-[12px]"
                            style={{ color: v > 0 ? 'rgb(var(--ds-sev-high))' : 'rgb(var(--ds-muted))' }}>
                        {v > 0 ? '+' : ''}{v.toFixed(3)} log-odds
                      </span>
                    </div>
                    {/* Centre line: right of it argues for fraud, left against. */}
                    <div style={{ position: 'relative', height: 7, borderRadius: 4,
                                  background: 'rgb(var(--ds-line))' }}>
                      <div style={{
                        position: 'absolute', top: 0, height: '100%', borderRadius: 4,
                        left: v >= 0 ? '50%' : `${50 - (Math.abs(v) / maxTerm) * 50}%`,
                        width: `${(Math.abs(v) / maxTerm) * 50}%`,
                        background: v >= 0 ? 'rgb(var(--ds-sev-critical))' : 'rgb(var(--ds-accent))',
                      }} />
                    </div>
                  </div>
                )
              })}
              {Object.keys(contrib).length === 0 && (
                <p className="text-[11px] leading-relaxed" style={{ color: 'rgb(var(--ds-muted))' }}>
                  The saved meta-classifier this instance loaded does not report
                  its terms. The verdict above is unaffected — decomposition is
                  read off the model, it is not part of computing the score.
                </p>
              )}
              <p className="text-[11px] leading-relaxed" style={{ color: 'rgb(var(--ds-muted))' }}>
                Right of centre argues for fraud, left against. These are exact,
                not estimated: the meta-classifier is linear, so each term is
                literally coefficient × standardised score, and the three sum to
                the decision function minus its intercept.
              </p>
            </section>
          </div>

          {/* What each detector actually said, in words. */}
          <section style={{ display: 'grid', gap: 8 }}>
            <h3 className="ds-mono text-[10px] uppercase tracking-wider"
                style={{ color: 'rgb(var(--ds-faint))' }}>
              In their own words
            </h3>
            {terms.filter(([, , , , signal]) => signal).map(([label, key, , , signal]) => (
              <div key={key} className="rounded-lg border p-3"
                   style={{ borderColor: 'rgb(var(--ds-line))' }}>
                <p className="ds-mono text-[10px] uppercase tracking-wider"
                   style={{ color: 'rgb(var(--ds-faint))' }}>{label}</p>
                <p className="mt-1 text-[12px] leading-relaxed"
                   style={{ color: 'rgb(var(--ds-ink))' }}>{signal}</p>
              </div>
            ))}
          </section>

          {/* The retrieved typology — what grounds the narrative. */}
          {r.retrieval && (
            <section style={{ display: 'grid', gap: 6 }}>
              <h3 className="ds-mono text-[10px] uppercase tracking-wider"
                  style={{ color: 'rgb(var(--ds-faint))' }}>
                Closest known typology
              </h3>
              <div className="rounded-lg border p-3"
                   style={{ borderColor: 'rgb(var(--ds-line))',
                            borderLeft: `3px solid ${bandColour(r.classification)}` }}>
                <p className="text-[13px]" style={{ color: 'rgb(var(--ds-ink))' }}>
                  {r.retrieval.typology_name}
                </p>
                <p className="numeric mt-1 text-[11px]" style={{ color: 'rgb(var(--ds-muted))' }}>
                  {r.retrieval.typology_id} · {r.retrieval.stage} · {r.retrieval.risk_level}
                  {' · similarity '}{Number(r.retrieval.similarity_score ?? 0).toFixed(3)}
                </p>
              </div>
              <p className="text-[11px] leading-relaxed" style={{ color: 'rgb(var(--ds-muted))' }}>
                The report writer may only cite what is retrieved here and what
                the three detectors returned. Nothing else is available to it,
                which is what makes the narrative checkable against the record.
              </p>
            </section>
          )}

          {r.forensic_report && (
            <section style={{ display: 'grid', gap: 6 }}>
              <h3 className="ds-mono text-[10px] uppercase tracking-wider"
                  style={{ color: 'rgb(var(--ds-faint))' }}>
                Generated report
              </h3>
              <pre className="overflow-x-auto rounded-lg border p-3 text-[11px] leading-relaxed"
                   style={{ borderColor: 'rgb(var(--ds-line))', color: 'rgb(var(--ds-muted))',
                            whiteSpace: 'pre-wrap' }}>
                {r.forensic_report}
              </pre>
            </section>
          )}
        </div>
      ) : null}
    </ConsoleShell>
  )
}
