import { useCallback, useRef, useState } from 'react'
import { analyzeBatch } from '../services/api'
import { Alert, Button } from './ui'

/**
 * A file through the whole pipeline, with each verdict's working shown.
 *
 * The Batch upload page already runs this endpoint and reports what was
 * flagged, which is the operator's question. This is the other one: not what
 * was decided but how — three detector scores and three signed terms per row,
 * so the arithmetic can be checked against the weights on this same page.
 *
 * It streams. A hundred rows take a while because every row is three real
 * models, and a progress bar that only appears at the end is a page that looks
 * broken for a minute.
 */
export default function FusionBatch() {
  const fileRef = useRef(null)
  const stopRef = useRef(null)
  const [rows, setRows] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(null)

  const onFile = useCallback((e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setRows([]); setDone(null); setError(null); setBusy(true)

    stopRef.current = analyzeBatch(f, {
      onEvent: (name, d) => {
        if (name !== 'progress' || !d) return
        setRows((prev) => [...prev, d])
      },
      onDone: (summary) => { setBusy(false); setDone(summary ?? {}) },
      onError: (err) => {
        setBusy(false)
        setError(err?.userMessage ?? String(err?.message ?? err) ?? 'That file could not be scored.')
      },
    })
    if (fileRef.current) fileRef.current.value = ''
  }, [])

  const stop = useCallback(() => { stopRef.current?.(); setBusy(false) }, [])

  const LABEL = { graph: 'N', behavioural: 'B', temporal: 'T' }
  const flagged = rows.filter((r) => r.alerted || (r.score ?? 0) >= 0.39).length

  return (
    <section className="rounded-xl border p-5" style={{ borderColor: 'rgb(var(--ds-line))' }}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-[19px] font-semibold">Score a file, and see the working</h2>
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept=".csv,text/csv"
                 onChange={onFile} className="hidden" />
          {busy ? (
            <Button size="sm" variant="secondary" onClick={stop}>Stop</Button>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
              Upload a CSV
            </Button>
          )}
        </div>
      </div>

      <p className="mt-2 text-[13px]" style={{ color: 'rgb(var(--ds-muted))' }}>
        Every row through all three detectors and the meta-classifier. The three
        terms are what each detector added to the log-odds — they sum to the
        decision, minus the intercept.
      </p>

      {error && <div className="mt-3"><Alert tone="error">{error}</Alert></div>}

      {(busy || rows.length > 0) && (
        <p className="ds-mono mt-3 text-[13px]" style={{ color: 'rgb(var(--ds-faint))' }}>
          {rows.length} scored{busy && ' · still going'}
          {rows.length > 0 && ` · ${flagged} at or above the critical band`}
          {done?.elapsed_ms != null && ` · ${(done.elapsed_ms / 1000).toFixed(1)}s`}
        </p>
      )}

      {rows.length > 0 && (
        <div className="mt-3 overflow-auto" style={{ maxHeight: 380 }}>
          <table className="w-full text-[13px]" style={{ borderCollapse: 'collapse' }}>
            <thead className="sticky top-0" style={{ background: 'rgb(var(--ds-surface))' }}>
              <tr style={{ color: 'rgb(var(--ds-faint))' }}>
                {['#', 'To', 'Network', 'Behaviour', 'Timing', 'Terms (N · B · T)',
                  'Fused', ''].map((h, i) => (
                  <th key={h || i}
                      className="ds-mono px-2 pb-2 text-left text-[11px] uppercase tracking-[.11em]"
                      style={{ borderBottom: '1px solid rgb(var(--ds-line))' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const c = r.contributions ?? {}
                return (
                  <tr key={`${r.transaction_id ?? i}-${i}`}>
                    <td className="numeric px-2 py-1.5"
                        style={{ color: 'rgb(var(--ds-faint))' }}>{i + 1}</td>
                    <td className="numeric px-2 py-1.5"
                        style={{ color: 'rgb(var(--ds-muted))' }}>{r.name_dest ?? r.nameDest ?? '—'}</td>
                    {['graph_score', 'behavioral_score', 'temporal_score'].map((k) => (
                      <td key={k} className="numeric px-2 py-1.5"
                          style={{ color: r[k] == null ? 'rgb(var(--ds-faint))'
                            : 'rgb(var(--ds-muted))' }}>
                        {r[k] == null ? 'abstained' : Number(r[k]).toFixed(4)}
                      </td>
                    ))}
                    <td className="ds-mono px-2 py-1.5">
                      {Object.keys(c).length === 0 ? (
                        <span style={{ color: 'rgb(var(--ds-faint))' }}>—</span>
                      ) : ['graph', 'behavioural', 'temporal'].map((k, n) => (
                        <span key={k}
                              style={{ color: r.driver === k ? 'rgb(var(--ds-sev-high))'
                                : (c[k] ?? 0) > 0 ? 'rgb(var(--ds-ink))'
                                  : 'rgb(var(--ds-muted))' }}>
                          {n > 0 && ' · '}
                          {LABEL[k]}{(c[k] ?? 0) > 0 ? '+' : ''}{(c[k] ?? 0).toFixed(2)}
                        </span>
                      ))}
                    </td>
                    <td className="numeric px-2 py-1.5">{Number(r.score ?? 0).toFixed(4)}</td>
                    <td className="ds-mono px-2 py-1.5 text-[11px] uppercase"
                        style={{ color: `rgb(var(--ds-sev-${
                          (r.classification ?? 'low').toLowerCase()}))` }}>
                      {r.classification ?? ''}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
