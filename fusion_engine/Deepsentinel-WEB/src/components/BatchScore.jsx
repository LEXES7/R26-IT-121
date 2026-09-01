import { useCallback, useEffect, useRef, useState } from 'react'
import { scoreOneDetector } from '../services/api'
import { parseCsv, refOf, labelOf } from '../lib/csv'
import { Alert, Button } from './ui'
import TypologyChart from './TypologyChart'

/**
 * Score a whole file through this detector alone, one row at a time, in view.
 *
 * A single transaction shows how the model explains one alert. A file shows
 * the thing a single transaction cannot: that the fingerprints fall into a
 * small number of groups, and that those groups are the discovered typologies
 * rather than a taxonomy anyone wrote down.
 *
 * Rows appear in the feed as they are answered rather than all at once at the
 * end. On a hundred rows that is a few seconds' difference, and it is the
 * difference between a number arriving and a model visibly working — which is
 * the reason to show a file rather than quote a figure.
 *
 * Scored through the same endpoint the page above already uses rather than a
 * new bulk route: a bulk route would be faster and would also be a new
 * contract, a new proxy, and a new thing to be wrong on the morning it is
 * needed. Four at a time, because each row here is independent of the others —
 * the timing detector's panel cannot do that and scores strictly in order.
 *
 * The finished run is kept in this browser so a reload does not throw it away.
 * Nothing leaves the browser and nothing is written to the platform: no case,
 * no alert, no database row.
 */

const CAP = 250
const CONCURRENCY = 4
const STORE = 'ds.behaviour.batch.v1'
const FEED_MAX = 400

/* localStorage throws in a private window and on quota, and neither is worth
   losing the panel over. */
function load() {
  try {
    const raw = localStorage.getItem(STORE)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}
function save(v) {
  try { localStorage.setItem(STORE, JSON.stringify(v)) } catch { /* full or blocked */ }
}
function drop() {
  try { localStorage.removeItem(STORE) } catch { /* nothing to do */ }
}

function summarise(scored, fileName) {
  const flagged = scored.filter((s) => s.flagged)
  const groups = new Map()
  for (const s of flagged) {
    const key = s.typology ?? 'UNASSIGNED'
    const g = groups.get(key) ?? { name: key, n: 0, fraud: 0, purity: s.purity }
    g.n += 1
    if (s.label === 1) g.fraud += 1
    groups.set(key, g)
  }
  return {
    file: fileName,
    at: Date.now(),
    rows: scored.length,
    answered: scored.filter((s) => s.answered).length,
    labelled: scored.filter((s) => s.label !== null).length,
    actualFraud: scored.filter((s) => s.label === 1).length,
    flagged: flagged.length,
    caught: flagged.filter((s) => s.label === 1).length,
    groups: [...groups.values()].sort((a, b) => b.n - a.n),
    all: scored,
  }
}

export default function BatchScore() {
  const fileRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(0)
  const [total, setTotal] = useState(0)
  const [feed, setFeed] = useState([])
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  // A run from a previous visit, if there was one.
  useEffect(() => {
    const prev = load()
    if (prev?.all) {
      setResult(prev)
      setFeed([...prev.all].reverse().slice(0, FEED_MAX))
    }
  }, [])

  const clear = useCallback(() => {
    setResult(null); setFeed([]); setError(null); setDone(0); setTotal(0)
    drop()
  }, [])

  const onFile = useCallback(async (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setBusy(true); setError(null); setResult(null); setFeed([]); setDone(0)
    try {
      const rows = parseCsv(await f.text()).slice(0, CAP)
      if (!rows.length) throw new Error('No rows in that file.')
      setTotal(rows.length)

      const out = new Array(rows.length)
      let next = 0
      const worker = async () => {
        for (;;) {
          const i = next++
          if (i >= rows.length) return
          let r = null
          try { r = await scoreOneDetector('behavioural', rows[i]) } catch { /* recorded below */ }
          const ev = r?.evidence ?? {}
          const d = ev.vae_diagnostics ?? {}
          const row = {
            ref: refOf(rows[i], i),
            type: rows[i].type,
            amount: rows[i].amount,
            label: labelOf(rows[i]),
            flagged: Boolean(d.flagged),
            score: r?.score ?? null,
            typology: ev.fraud_typology?.typology_label ?? null,
            purity: ev.fraud_typology?.cluster_fraud_purity ?? null,
            answered: Boolean(r),
          }
          out[i] = row
          // Newest first and capped: an unbounded list makes the page slower
          // the further into a long file it gets.
          setFeed((prev) => [row, ...prev].slice(0, FEED_MAX))
          setDone((n) => n + 1)
        }
      }
      await Promise.all(Array.from({ length: CONCURRENCY }, worker))

      const summary = summarise(out.filter(Boolean), f.name)
      setResult(summary)
      save(summary)
    } catch (err) {
      setError(err?.userMessage ?? err?.message ?? 'That file could not be scored.')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }, [])

  const when = result?.at ? new Date(result.at).toLocaleString() : null

  return (
    <section style={{ display: 'grid', gap: 10 }}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="ds-mono text-[14px] uppercase tracking-wider"
            style={{ color: 'rgb(var(--ds-faint))' }}>
          Score a whole file
        </h3>
        {result && !busy && when && (
          <span className="text-[12px]" style={{ color: 'rgb(var(--ds-faint))' }}>
            {result.file} · {when} · kept in this browser
          </span>
        )}
      </div>

      <div className="rounded-lg border p-4" style={{ borderColor: 'rgb(var(--ds-line))' }}>
        <div className="flex flex-wrap items-center gap-3">
          <input ref={fileRef} type="file" accept=".csv,text/csv"
                 onChange={onFile} className="hidden" />
          <Button size="sm" variant="secondary" loading={busy}
                  onClick={() => fileRef.current?.click()}>
            {busy ? `Scoring ${done} of ${total}` : 'Choose a CSV'}
          </Button>
          {(result || feed.length > 0) && !busy && (
            <Button size="sm" variant="ghost" onClick={clear}>Clear</Button>
          )}
          <span className="text-[13px]" style={{ color: 'rgb(var(--ds-muted))' }}>
            This detector alone. Nothing is fused, alerted, or written to the
            platform. First {CAP} rows.
          </span>
        </div>

        {busy && (
          <div className="mt-3 h-[5px] overflow-hidden rounded-full"
               style={{ background: 'rgb(var(--ds-surface-3))' }}>
            <div className="h-full rounded-full"
                 style={{
                   width: `${total ? (done / total) * 100 : 0}%`,
                   background: 'rgb(var(--ds-accent))',
                   transition: 'width .15s linear',
                 }} />
          </div>
        )}

        {error && <div className="mt-3"><Alert tone="error">{error}</Alert></div>}

        {/* Rows as they come back. Visible during the run and kept afterwards,
            so a finished result still shows what it was built from. */}
        {feed.length > 0 && (
          <div className="mt-4">
            <p className="ds-mono mb-1 text-[12px] uppercase tracking-wider"
               style={{ color: 'rgb(var(--ds-faint))' }}>
              rows through the model · newest first
            </p>
            <ul className="max-h-[15rem] overflow-y-auto rounded-md border"
                style={{ borderColor: 'rgb(var(--ds-line))' }}>
              {feed.map((s, i) => (
                <li key={`${s.ref}-${i}`}
                    className="numeric flex items-baseline gap-3 px-2.5 py-[3px] text-[13px]"
                    style={{ borderTop: i ? '1px solid rgb(var(--ds-line))' : 'none' }}>
                  <span className="w-[74px] shrink-0 truncate"
                        style={{
                          color: !s.answered ? 'rgb(var(--ds-sev-high))'
                            : s.flagged ? 'rgb(var(--ds-sev-critical))'
                              : 'rgb(var(--ds-faint))',
                        }}>
                    {!s.answered ? 'no answer' : s.flagged ? 'flagged' : 'cleared'}
                  </span>
                  <span className="min-w-0 flex-1 truncate"
                        style={{ color: 'rgb(var(--ds-ink))' }}>
                    {s.ref}
                    <span style={{ color: 'rgb(var(--ds-faint))' }}>
                      {'  '}{s.type}{'  '}{Number(s.amount).toLocaleString()}
                      {s.flagged && s.typology ? `  ${s.typology}` : ''}
                    </span>
                  </span>
                  <span className="shrink-0" style={{ color: 'rgb(var(--ds-muted))' }}>
                    {s.score == null ? '—' : s.score.toFixed(4)}
                    {s.label === 1 && (
                      <span style={{ color: 'rgb(var(--ds-sev-critical))' }}> · fraud</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {result && (
          <div className="mt-4" style={{ display: 'grid', gap: 16 }}>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                ['rows scored', result.answered],
                ['flagged', result.flagged],
                ['labelled fraud in file', result.labelled ? result.actualFraud : '—'],
                ['of those, caught', result.labelled ? result.caught : '—'],
              ].map(([k, v]) => (
                <div key={k}>
                  <p className="ds-mono text-[11px] uppercase tracking-wider"
                     style={{ color: 'rgb(var(--ds-faint))' }}>{k}</p>
                  <p className="numeric mt-0.5 text-[22px] leading-none"
                     style={{ color: 'rgb(var(--ds-ink))' }}>{v}</p>
                </div>
              ))}
            </div>

            {/* The panel's reason for existing. */}
            <div>
              <p className="ds-mono mb-2 text-[12px] uppercase tracking-wider"
                 style={{ color: 'rgb(var(--ds-faint))' }}>
                typologies the fingerprints fell into
              </p>
              {result.groups.length === 0 ? (
                <p className="text-[14px]" style={{ color: 'rgb(var(--ds-muted))' }}>
                  Nothing in this file was flagged, so there is nothing to group.
                </p>
              ) : (
                <TypologyChart groups={result.groups} rows={result.all}
                               labelled={result.labelled} />
              )}
              <p className="mt-2 text-[12px] leading-relaxed"
                 style={{ color: 'rgb(var(--ds-faint))' }}>
                These groups were not defined in advance. Each row's fingerprint was
                matched to the nearest cluster discovered by DBSCAN over flagged
                transactions; UNASSIGNED means it fell inside none of them.
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
