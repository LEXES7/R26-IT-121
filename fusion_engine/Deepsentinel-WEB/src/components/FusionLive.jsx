import { useEffect, useRef, useState } from 'react'
import { streamMonitor, getFusionModel } from '../services/api'

/**
 * The arithmetic behind each verdict, as it happens.
 *
 * The engine already computes a signed term per detector on its way to a
 * fused score, and until now those went to the log and nowhere else. Watching
 * them arrive is the difference between being told the fusion is linear and
 * seeing it: three products and an intercept, summing to the number that
 * decided the case.
 *
 * Nothing is recomputed in the browser. The terms shown are the ones the
 * server used — a second implementation here would eventually disagree with
 * the first, and then the page would be lying about the model it describes.
 */
export default function FusionLive() {
  const [rows, setRows] = useState([])
  const [live, setLive] = useState(false)
  const [weights, setWeights] = useState(null)
  const stop = useRef(null)

  useEffect(() => {
    getFusionModel().then((m) => setWeights(m)).catch(() => {})
  }, [])

  useEffect(() => {
    // The stream calls back as (kind, event), and returns a plain function
    // that closes it — both worth reading from the client rather than assuming.
    stop.current = streamMonitor({
      onEvent: (kind, e) => {
        setLive(true)
        if (kind === 'snapshot') {
          // A late subscriber gets the backlog, so the panel is not empty
          // just because it opened after the interesting part.
          const past = (e?.events ?? [])
            .filter((x) => x?.type === 'fused' || x?.contributions)
            .slice(-8).reverse()
          if (past.length) setRows(past.map((x) => ({ ...(x.data ?? x), at: Date.now() })))
          return
        }
        if (kind !== 'fused' || !e?.transaction_id) return
        setRows((prev) => [{ ...e, at: Date.now() }, ...prev].slice(0, 8))
      },
      onError: () => setLive(false),
    })
    return () => stop.current?.()
  }, [])

  const LABEL = { graph: 'Network', behavioural: 'Behaviour', temporal: 'Timing' }

  return (
    <section className="rounded-xl border p-5" style={{ borderColor: 'rgb(var(--ds-line))' }}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-[19px] font-semibold">The arithmetic, as it happens</h2>
        <span className="flex items-center gap-2 text-[13px]"
              style={{ color: 'rgb(var(--ds-muted))' }}>
          <span className="h-2 w-2 rounded-full"
                style={{ background: live ? 'rgb(var(--ds-accent))'
                  : 'rgb(var(--ds-faint))' }} />
          {live ? 'listening to the monitor' : 'not connected'}
        </span>
      </div>

      {weights?.weights && (
        <p className="ds-mono mt-2 text-[13px]" style={{ color: 'rgb(var(--ds-faint))' }}>
          z = {weights.intercept} + Σ coef · (score − mean) / scale
          {'   ·   '}coef: network {weights.weights.graph} · behaviour{' '}
          {weights.weights.behavioural} · timing {weights.weights.temporal}
        </p>
      )}

      {rows.length === 0 ? (
        <p className="mt-5 rounded-lg border border-dashed px-4 py-8 text-center text-[14px]"
           style={{ borderColor: 'rgb(var(--ds-line))', color: 'rgb(var(--ds-faint))' }}>
          Nothing fused yet. Start the live monitor, or ingest a file with the
          Query Runner, and each verdict will appear here with its working.
        </p>
      ) : (
        <div className="mt-4 grid gap-3">
          {rows.map((r) => {
            const c = r.contributions ?? {}
            const widest = Math.max(...Object.values(c).map(Math.abs), 0.5)
            const sum = Object.values(c).reduce((a, b) => a + b, 0)
            return (
              <div key={`${r.transaction_id}-${r.at}`}
                   className="rounded-lg border p-3"
                   style={{ borderColor: 'rgb(var(--ds-line))',
                            background: 'rgb(var(--ds-surface-2))' }}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="numeric truncate text-[13px]"
                        style={{ color: 'rgb(var(--ds-muted))' }}>
                    {r.transaction_id}
                  </span>
                  <span className="flex items-baseline gap-2">
                    <span className="numeric text-[17px]">{r.fused_score}</span>
                    <span className="ds-mono text-[12px] uppercase tracking-[.1em]"
                          style={{ color: `rgb(var(--ds-sev-${(r.severity || 'low').toLowerCase()}))` }}>
                      {r.severity}
                    </span>
                  </span>
                </div>

                {Object.keys(c).length > 0 ? (
                  <>
                    <div className="mt-2 grid gap-1">
                      {['graph', 'behavioural', 'temporal'].map((k) => {
                        const v = c[k]
                        if (v === undefined) return null
                        const lead = r.driver === k
                        return (
                          <div key={k} className="flex items-center gap-2 text-[13px]">
                            <span className="w-20 shrink-0"
                                  style={{ color: lead ? 'rgb(var(--ds-sev-high))'
                                    : 'rgb(var(--ds-muted))' }}>
                              {LABEL[k]}
                            </span>
                            <span className="numeric w-14 shrink-0 text-right"
                                  style={{ color: 'rgb(var(--ds-faint))' }}>
                              {r.scores?.[k] ?? '—'}
                            </span>
                            {/* Centre line: right argues for fraud, left against. */}
                            <span className="relative h-[6px] flex-1 rounded"
                                  style={{ background: 'rgb(var(--ds-line))' }}>
                              <span className="absolute top-[-2px] bottom-[-2px] w-px"
                                    style={{ left: '50%', background: 'rgb(var(--ds-faint))' }} />
                              <span className="absolute top-0 h-full rounded"
                                    style={{
                                      left: v >= 0 ? '50%' : `${50 - (Math.abs(v) / widest) * 50}%`,
                                      width: `${(Math.abs(v) / widest) * 50}%`,
                                      background: v >= 0 ? 'rgb(var(--ds-sev-critical))'
                                        : 'rgb(var(--ds-accent))',
                                    }} />
                            </span>
                            <span className="numeric w-16 shrink-0 text-right"
                                  style={{ color: v > 0 ? 'rgb(var(--ds-sev-high))'
                                    : 'rgb(var(--ds-muted))' }}>
                              {v > 0 ? '+' : ''}{v.toFixed(3)}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                    <p className="ds-mono mt-2 text-[12px]"
                       style={{ color: 'rgb(var(--ds-faint))' }}>
                      terms sum to {sum > 0 ? '+' : ''}{sum.toFixed(3)}
                      {weights?.intercept != null &&
                        ` · with intercept ${weights.intercept} → z ${(sum + weights.intercept).toFixed(3)}`}
                      {' · '}{r.modalities_used} of 3 detectors
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-[13px]" style={{ color: 'rgb(var(--ds-faint))' }}>
                    This verdict was fused before the engine reported its terms.
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
