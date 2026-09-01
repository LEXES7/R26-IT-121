import { useCallback, useRef, useState } from 'react'
import { scoreOneDetector } from '../services/api'
import { parseCsv, refOf, labelOf } from '../lib/csv'
import { Alert, Button } from './ui'

/**
 * Score a whole file through the timing model alone.
 *
 * **Strictly sequential, and that is not an optimisation choice.** This model
 * reads each transaction alongside the thirty-two before it, held in a rolling
 * buffer on the server. Four requests in flight at once would land in that
 * buffer in whatever order they happened to arrive, and every answer after
 * that would be about a window that never existed. The behavioural panel scores
 * four at a time because each of its rows is independent; this one cannot.
 *
 * The first thirty-two rows fill the window and are reported as such rather
 * than counted as failures — the model has no opinion until it has a window,
 * which is a start-up state and not an error.
 *
 * What the aggregate shows is the distance back to the transaction that
 * triggered each alert. A model that only ever looked at the row immediately
 * before would pile up at one; spread across the window is the attention
 * mechanism doing something a shorter memory could not.
 */

const CAP = 250

export default function BatchScoreTemporal() {
  const fileRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(0)
  const [total, setTotal] = useState(0)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const onFile = useCallback(async (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setBusy(true); setError(null); setResult(null); setDone(0)
    try {
      const rows = parseCsv(await f.text()).slice(0, CAP)
      if (!rows.length) throw new Error('No rows in that file.')
      setTotal(rows.length)

      const scored = []
      for (let i = 0; i < rows.length; i += 1) {
        let r = null
        try {
          r = await scoreOneDetector('temporal', rows[i])
        } catch { /* recorded below as unanswered */ }
        const ev = r?.evidence ?? {}
        const pred = ev.triggering_predecessor ?? {}
        scored.push({
          ref: refOf(rows[i], i),
          label: labelOf(rows[i]),
          score: r?.score ?? null,
          answered: Boolean(r) && r.available !== false,
          offset: pred.offset_from_current != null
            ? Math.abs(pred.offset_from_current) : null,
          signal: pred.predecessor_signal ?? null,
          summary: ev.current_transaction?.fraud_signal_summary ?? null,
        })
        setDone(i + 1)
      }

      const answered = scored.filter((s) => s.answered)
      const withPred = answered.filter((s) => s.offset != null)

      // Buckets across the window rather than one bar per offset: thirty-two
      // bars would be mostly empty on a file this size and would read as noise.
      const BUCKETS = [[1, 4], [5, 8], [9, 16], [17, 24], [25, 32]]
      const hist = BUCKETS.map(([lo, hi]) => ({
        label: lo === hi ? `${lo}` : `${lo}–${hi}`,
        n: withPred.filter((s) => s.offset >= lo && s.offset <= hi).length,
      }))

      setResult({
        rows: scored.length,
        warming: scored.length - answered.length,
        answered: answered.length,
        labelled: scored.filter((s) => s.label !== null).length,
        actualFraud: scored.filter((s) => s.label === 1).length,
        hist,
        withPred: withPred.length,
        top: answered.filter((s) => s.score != null)
          .sort((a, b) => b.score - a.score).slice(0, 8),
      })
    } catch (err) {
      setError(err?.userMessage ?? err?.message ?? 'That file could not be scored.')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }, [])

  const maxBar = result ? Math.max(...result.hist.map((h) => h.n), 1) : 1

  return (
    <section style={{ display: 'grid', gap: 10 }}>
      <h3 className="ds-mono text-[14px] uppercase tracking-wider"
          style={{ color: 'rgb(var(--ds-faint))' }}>
        Score a whole file
      </h3>

      <div className="rounded-lg border p-4" style={{ borderColor: 'rgb(var(--ds-line))' }}>
        <div className="flex flex-wrap items-center gap-3">
          <input ref={fileRef} type="file" accept=".csv,text/csv"
                 onChange={onFile} className="hidden" />
          <Button size="sm" variant="secondary" loading={busy}
                  onClick={() => fileRef.current?.click()}>
            {busy ? `Scoring ${done} of ${total}` : 'Choose a CSV'}
          </Button>
          <span className="text-[13px]" style={{ color: 'rgb(var(--ds-muted))' }}>
            One row at a time, in file order — this model reads each transaction
            against the ones before it, so the order is the measurement. First
            {' '}{CAP} rows, nothing saved.
          </span>
        </div>

        {error && <div className="mt-3"><Alert tone="error">{error}</Alert></div>}

        {result && (
          <div className="mt-4" style={{ display: 'grid', gap: 16 }}>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                ['rows sent', result.rows],
                ['scored', result.answered],
                ['filling the window', result.warming],
                ['labelled fraud in file', result.labelled ? result.actualFraud : '—'],
              ].map(([k, v]) => (
                <div key={k}>
                  <p className="ds-mono text-[11px] uppercase tracking-wider"
                     style={{ color: 'rgb(var(--ds-faint))' }}>{k}</p>
                  <p className="numeric mt-0.5 text-[22px] leading-none"
                     style={{ color: 'rgb(var(--ds-ink))' }}>{v}</p>
                </div>
              ))}
            </div>

            <div>
              <p className="ds-mono mb-2 text-[12px] uppercase tracking-wider"
                 style={{ color: 'rgb(var(--ds-faint))' }}>
                how far back the triggering transaction sat
              </p>
              {result.withPred === 0 ? (
                <p className="text-[14px]" style={{ color: 'rgb(var(--ds-muted))' }}>
                  No answer in this file named a triggering predecessor.
                </p>
              ) : (
                <div style={{ display: 'grid', gap: 6 }}>
                  {result.hist.map((h) => (
                    <div key={h.label} className="flex items-center gap-3">
                      <span className="numeric w-12 shrink-0 text-right text-[13px]"
                            style={{ color: 'rgb(var(--ds-muted))' }}>{h.label}</span>
                      <div className="h-[9px] flex-1 overflow-hidden rounded-full"
                           style={{ background: 'rgb(var(--ds-surface-3))' }}>
                        <div className="h-full rounded-full"
                             style={{
                               width: `${(h.n / maxBar) * 100}%`,
                               background: 'rgb(var(--ds-warn))',
                             }} />
                      </div>
                      <span className="numeric w-8 shrink-0 text-[13px]"
                            style={{ color: 'rgb(var(--ds-ink))' }}>{h.n}</span>
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-2 text-[12px] leading-relaxed"
                 style={{ color: 'rgb(var(--ds-faint))' }}>
                Transactions back, within the thirty-two the model holds. A model
                that only read the row immediately before would pile up at the
                top; anything further down is the attention mechanism reaching
                into the window.
              </p>
            </div>

            {result.top.length > 0 && (
              <div>
                <p className="ds-mono mb-2 text-[12px] uppercase tracking-wider"
                   style={{ color: 'rgb(var(--ds-faint))' }}>
                  highest scoring
                </p>
                <div style={{ display: 'grid', gap: 3 }}>
                  {result.top.map((s, i) => (
                    <div key={`${s.ref}-${i}`}
                         className="numeric flex items-baseline justify-between gap-3 text-[13px]">
                      <span style={{ color: 'rgb(var(--ds-ink))' }}>
                        {s.ref}
                        {s.offset != null && (
                          <span style={{ color: 'rgb(var(--ds-faint))' }}>
                            {'  '}triggered by {s.offset} back
                          </span>
                        )}
                      </span>
                      <span style={{ color: 'rgb(var(--ds-muted))' }}>
                        {(s.score ?? 0).toFixed(4)}
                        {s.label === 1 && (
                          <span style={{ color: 'rgb(var(--ds-sev-critical))' }}> · fraud</span>
                        )}
                        {s.label === 0 && (
                          <span style={{ color: 'rgb(var(--ds-warn))' }}> · false alarm</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
