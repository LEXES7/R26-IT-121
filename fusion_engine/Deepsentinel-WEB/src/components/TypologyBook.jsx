import { useEffect, useState } from 'react'
import { getTypologies } from '../services/api'

/**
 * Every typology the retriever can reach, with the matched one marked.
 *
 * A report that names one pattern raises an obvious question — out of what? A
 * match against a set of ten means something quite different from a match
 * against a set of one, and until the whole set is on screen the reader has no
 * way to judge which they are looking at.
 *
 * Each typology also declares which detector should be shouting for it. That
 * is what makes a match checkable rather than decorative: if the retrieved
 * pattern expects a high graph signal and the graph detector abstained, the
 * match is weaker than its similarity score suggests, and the reader can see
 * that for themselves.
 */

const SIGNAL = { high: 'rgb(var(--ds-sev-critical))', medium: 'rgb(var(--ds-sev-high))',
                 low: 'rgb(var(--ds-faint))' }

export default function TypologyBook({ matched, similarity }) {
  const [rows, setRows] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    getTypologies()
      .then((d) => { if (alive) setRows(d?.typologies ?? []) })
      .catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [])

  if (failed || !rows) return null

  return (
    <section className="rounded-xl border p-5" style={{ borderColor: 'rgb(var(--ds-line))' }}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-[19px] font-semibold">What it can match against</h2>
        <span className="ds-mono text-[13px]" style={{ color: 'rgb(var(--ds-faint))' }}>
          {rows.length} FATF typologies indexed
        </span>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-[14px]" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ color: 'rgb(var(--ds-faint))' }}>
              {['', 'Typology', 'Stage', 'Risk', 'Network', 'Behaviour', 'Timing'].map((h, i) => (
                <th key={h || i}
                    className="ds-mono px-2 pb-2 text-left text-[11px] uppercase tracking-[.12em]"
                    style={{ borderBottom: '1px solid rgb(var(--ds-line))' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const hit = matched && (t.id === matched || t.name === matched)
              return (
                <tr key={t.id}
                    style={{ background: hit ? 'rgba(45,212,191,.08)' : 'transparent' }}>
                  <td className="px-2 py-2">
                    {hit && (
                      <span className="ds-mono text-[11px]"
                            style={{ color: 'rgb(var(--ds-accent-strong))' }}>match</span>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <span className="ds-mono text-[12px]"
                          style={{ color: 'rgb(var(--ds-faint))' }}>{t.id}</span>{' '}
                    <span style={{ color: hit ? 'rgb(var(--ds-ink))' : 'rgb(var(--ds-muted))',
                                   fontWeight: hit ? 600 : 400 }}>{t.name}</span>
                  </td>
                  <td className="px-2 py-2" style={{ color: 'rgb(var(--ds-muted))' }}>
                    {t.stage}
                  </td>
                  <td className="px-2 py-2" style={{ color: 'rgb(var(--ds-muted))' }}>
                    {t.risk_level}
                  </td>
                  {['graph_signal', 'behavioral_signal', 'temporal_signal'].map((k) => (
                    <td key={k} className="px-2 py-2">
                      <span className="ds-mono text-[12px]"
                            style={{ color: SIGNAL[String(t[k]).toLowerCase()]
                              ?? 'rgb(var(--ds-faint))' }}>
                        {t[k] ?? '—'}
                      </span>
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[13px] leading-relaxed" style={{ color: 'rgb(var(--ds-muted))' }}>
        {matched
          ? <>The current transaction matched <strong>{matched}</strong>
              {similarity != null && <> at {Number(similarity).toFixed(3)} similarity</>}.
              The three signal columns say which detectors that pattern expects
              to be loud — a match whose expected signals stayed quiet is weaker
              than its score suggests.</>
          : <>Score a transaction above and the retrieved pattern is highlighted
              here, against the full set it was chosen from.</>}
      </p>
    </section>
  )
}
