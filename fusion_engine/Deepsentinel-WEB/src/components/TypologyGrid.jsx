import { useEffect, useState } from 'react'
import { getTypologies } from '../services/api'

/**
 * Every laundering method the retriever can match, as cards, with the matched
 * one lit.
 *
 * A match against a set of ten means something different from a match against
 * a set of one, so the whole set stays on screen. The three dots on each card
 * say which detectors that method should set off: a solid dot is a strong
 * expected signal, a faded one a moderate one, an empty one none. If the
 * matched method expects a detector that stayed quiet, the reader can see it.
 */

const DETECTORS = [
  ['graph_signal', 'Network', 'rgb(var(--modality-graph))'],
  ['behavioral_signal', 'Behaviour', 'rgb(var(--modality-behavioral))'],
  ['temporal_signal', 'Timing', 'rgb(var(--modality-temporal))'],
]
const STRENGTH = { high: 1, medium: 0.45 }

export default function TypologyGrid({ matchedId, matchedName, similarity }) {
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
    <section className="dash-card" style={{ padding: 24 }}>
      <div className="dash-head" style={{ marginBottom: 14 }}>
        <h2 className="dash-h dash-h-sm">Laundering methods it can match</h2>
        <span style={{ fontSize: 13, color: 'rgb(var(--ds-muted))' }}>
          Dots show which detectors each one should trigger.
        </span>
      </div>
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
        {rows.map((t) => {
          const hit = (matchedId && t.id === matchedId) || (matchedName && t.name === matchedName)
          return (
            <div key={t.id} style={{
              borderRadius: 18, padding: 14,
              border: hit ? '1px solid transparent' : '1px solid rgb(var(--ds-line))',
              background: hit ? 'rgb(var(--dash-mint))' : 'transparent',
              color: hit ? 'rgb(var(--dash-on-mint))' : 'rgb(var(--ds-ink))',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span className="ds-mono" style={{ fontSize: 11, opacity: 0.7 }}>{t.id}</span>
                {hit && <span style={{ fontSize: 11, fontWeight: 700 }}>
                  match{similarity != null ? ` · ${Number(similarity).toFixed(2)}` : ''}
                </span>}
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, margin: '6px 0 10px', minHeight: 38 }}>{t.name}</div>
              <div style={{ display: 'flex', gap: 5 }}
                   aria-label={DETECTORS.map(([k, n]) => `${n} ${t[k] ?? 'none'}`).join(', ')}>
                {DETECTORS.map(([k, n, c]) => {
                  const s = STRENGTH[String(t[k]).toLowerCase()] ?? 0
                  return (
                    <span key={k} title={`${n}: ${t[k] ?? 'none'}`} style={{
                      width: 10, height: 10, borderRadius: 99,
                      background: s ? c : 'transparent',
                      opacity: s ? s : 1,
                      boxShadow: s ? 'none' : 'inset 0 0 0 1.5px rgb(var(--ds-faint))',
                    }} />
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
