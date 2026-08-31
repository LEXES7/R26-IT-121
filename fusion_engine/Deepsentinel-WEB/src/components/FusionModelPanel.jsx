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
            Timing carries the most weight, then behaviour, then the network.
            With the intercept at {m.intercept ?? '—'}, these three numbers
            reproduce any verdict this engine has ever returned.
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
        The counts above are what this deployment has decided, not a benchmark.
        A distribution over a few dozen demo analyses says nothing about
        accuracy and is not offered as if it did.
      </p>
    </section>
  )
}
