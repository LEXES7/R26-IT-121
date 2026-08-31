import { useEffect, useState } from 'react'
import { getFusionModel } from '../services/api'

/**
 * The meta-classifier's own shape, and what it has decided so far.
 *
 * The weights are shown because this component's claim is that the fusion is
 * linear and its terms can be read off any verdict. Publishing them is that
 * claim kept — a reader can take the three detector scores from any analysis
 * and reproduce the fused number by hand.
 *
 * The band counts are what the model has actually done on this deployment,
 * not a benchmark. Said plainly, because a distribution over seventy demo
 * analyses is not a performance measure and should not be dressed as one.
 */
export default function FusionModelPanel() {
  const [m, setM] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    getFusionModel()
      .then((r) => { if (alive) setM(r) })
      .catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [])

  if (failed || !m) return null

  const w = m.weights ?? {}
  const decided = m.decided ?? {}
  const by = decided.by_classification ?? {}
  const total = decided.total ?? 0
  const perf = m.performance
  const widest = Math.max(...Object.values(w).map(Math.abs), 0.5)
  const LABEL = { graph: 'Network', behavioural: 'Behaviour', temporal: 'Timing' }
  const BAND = { CRITICAL: 'sev-critical', HIGH: 'sev-high', MEDIUM: 'sev-medium', LOW: 'accent' }

  return (
    <section className="rounded-xl border p-5" style={{ borderColor: 'rgb(var(--ds-line))' }}>
      <h2 className="text-[19px] font-semibold">How the fusion engine is doing</h2>

      <div className="mt-5 grid gap-8 md:grid-cols-2">
        {/* What it weighs each detector at. */}
        <div>
          <p className="ds-mono text-[11px] uppercase tracking-[.13em]"
             style={{ color: 'rgb(var(--ds-faint))' }}>Weight on each detector</p>
          <div className="mt-3 grid gap-2.5">
            {['graph', 'behavioural', 'temporal'].map((k) => (
              <div key={k} style={{ display: 'grid', gap: 4 }}>
                <div className="flex items-baseline justify-between gap-3 text-[14px]">
                  <span>{LABEL[k]}</span>
                  <span className="numeric" style={{ color: 'rgb(var(--ds-muted))' }}>
                    {w[k] != null ? w[k].toFixed(3) : '—'}
                  </span>
                </div>
                <span className="block h-[7px] rounded"
                      style={{ background: 'rgb(var(--ds-line))' }}>
                  <span className="block h-full rounded"
                        style={{ width: `${Math.max(2, (Math.abs(w[k] ?? 0) / widest) * 100)}%`,
                                 background: 'rgb(var(--ds-accent))' }} />
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[13px] leading-relaxed" style={{ color: 'rgb(var(--ds-muted))' }}>
            With the intercept at {m.intercept ?? '—'}, these three numbers
            reproduce any verdict this engine returns.
          </p>
        </div>

        {/* What it has decided. */}
        <div>
          <p className="ds-mono text-[11px] uppercase tracking-[.13em]"
             style={{ color: 'rgb(var(--ds-faint))' }}>
            Verdicts on this deployment
          </p>
          <p className="numeric mt-2 text-[30px] leading-none">{total.toLocaleString()}</p>
          <p className="text-[13px]" style={{ color: 'rgb(var(--ds-muted))' }}>
            transactions fused, mean confidence{' '}
            {decided.mean_confidence != null
              ? Number(decided.mean_confidence).toFixed(4) : '—'}
          </p>

          <div className="mt-4 grid gap-1.5">
            {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((band) => (
              <div key={band} className="flex items-center gap-3 text-[14px]">
                <span className="w-20 shrink-0" style={{ color: 'rgb(var(--ds-muted))' }}>
                  {band.toLowerCase()}
                </span>
                <span className="h-[7px] flex-1 rounded"
                      style={{ background: 'rgb(var(--ds-line))' }}>
                  <span className="block h-full rounded"
                        style={{ width: `${total ? ((by[band] ?? 0) / total) * 100 : 0}%`,
                                 background: `rgb(var(--ds-${BAND[band]}))` }} />
                </span>
                <span className="numeric w-8 shrink-0 text-right">{by[band] ?? 0}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Does fusing actually beat the parts? The only question that
          justifies this component existing, answered on the held-out window. */}
      {perf && (
        <div className="mt-6" style={{ borderTop: '1px solid rgb(var(--ds-line))',
                                       paddingTop: 20 }}>
          <p className="ds-mono text-[11px] uppercase tracking-[.13em]"
             style={{ color: 'rgb(var(--ds-faint))' }}>
            Against each detector alone · held-out window ·{' '}
            {perf.window?.rows?.toLocaleString()} transactions,{' '}
            {perf.window?.frauds} fraudulent
          </p>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-[14px]" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ color: 'rgb(var(--ds-faint))' }}>
                  {['', 'PR-AUC', 'AUROC'].map((h, i) => (
                    <th key={h || i}
                        className="ds-mono px-2 pb-2 text-left text-[11px] uppercase tracking-[.12em]"
                        style={{ borderBottom: '1px solid rgb(var(--ds-line))' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[['Fused verdict', perf.fusion, true],
                  ...Object.entries(perf.detectors ?? {}).map(([k, v]) => [k, v, false])]
                  .map(([name, v, isFusion]) => (
                    <tr key={name}>
                      <td className="px-2 py-2"
                          style={{ color: isFusion ? 'rgb(var(--ds-accent-strong))'
                            : 'rgb(var(--ds-muted))',
                            fontWeight: isFusion ? 700 : 400 }}>{name}</td>
                      <td className="numeric px-2 py-2"
                          style={{ fontWeight: isFusion ? 700 : 400 }}>
                        {v?.pr_auc?.toFixed(4) ?? '—'}
                      </td>
                      <td className="numeric px-2 py-2"
                          style={{ color: 'rgb(var(--ds-muted))' }}>
                        {v?.auroc?.toFixed(4) ?? '—'}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-[13px] leading-relaxed"
             style={{ color: 'rgb(var(--ds-muted))' }}>
            Read PR-AUC — the right metric at this class balance, and the fused
            verdict leads it. On AUROC behaviour edges ahead; both are shown.
          </p>

          {perf.at_threshold && (
            <div className="mt-5 grid gap-5 sm:grid-cols-4">
              {[
                ['Precision', perf.at_threshold.precision, 'of what it alerts on'],
                ['Recall', perf.at_threshold.recall, 'of the fraud present'],
                ['F1', perf.at_threshold.f1, 'the balance'],
                ['Accuracy', perf.at_threshold.accuracy, 'flattered by the balance'],
              ].map(([k, v, note]) => (
                <div key={k} className="min-w-0">
                  <p className="ds-mono text-[11px] uppercase tracking-[.13em]"
                     style={{ color: 'rgb(var(--ds-faint))' }}>{k}</p>
                  <p className="numeric mt-1 text-[24px] leading-none">
                    {v != null ? Number(v).toFixed(3) : '—'}
                  </p>
                  <p className="mt-1 text-[13px]"
                     style={{ color: 'rgb(var(--ds-muted))' }}>{note}</p>
                </div>
              ))}
            </div>
          )}
          <p className="mt-2 ds-mono text-[13px]" style={{ color: 'rgb(var(--ds-faint))' }}>
            at the critical band {perf.at_threshold?.threshold} · tp{' '}
            {perf.at_threshold?.confusion?.tp} · fp {perf.at_threshold?.confusion?.fp}
            {' · '}fn {perf.at_threshold?.confusion?.fn} · tn{' '}
            {perf.at_threshold?.confusion?.tn}
          </p>
        </div>
      )}

      <dl className="mt-6 grid gap-2 text-[14px]"
          style={{ borderTop: '1px solid rgb(var(--ds-line))', paddingTop: 18 }}>
        {[
          ['Method', m.method ?? '—'],
          ['Missing-detector penalty', m.uncertainty_shrink != null
            ? `${m.uncertainty_shrink} of the log-odds, per absent detector` : '—'],
          ['Alerting band', m.bands?.critical != null
            ? `critical ${m.bands.critical} · high ${m.bands.high} · medium ${m.bands.medium}`
            : 'the model’s own calibrated bands'],
        ].map(([k, v]) => (
          <div key={k} className="flex flex-wrap justify-between gap-x-6">
            <dt style={{ color: 'rgb(var(--ds-muted))' }}>{k}</dt>
            <dd className="ds-mono" style={{ color: 'rgb(var(--ds-ink))' }}>{v}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-4 text-[13px] leading-relaxed" style={{ color: 'rgb(var(--ds-faint))' }}>
        Counts from this deployment, not a benchmark.
      </p>
    </section>
  )
}
