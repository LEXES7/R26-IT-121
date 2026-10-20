import { useEffect, useRef, useState } from 'react'
import { streamMonitor } from '../services/api'

/**
 * What the network detector is doing in the live run, one payment at a time.
 *
 * Read from the monitor's own stream, so nothing is asked of the detector to
 * draw it: each screened payment arrives with its sender, receiver, amount and
 * graph score; an escalated one adds the pattern and the account the money
 * collects in; the fused verdict follows once the other two have answered.
 * Clicking a row opens that receiver's network on the map above.
 */
export default function NetworkLive({ threshold, onOpen }) {
  const [rows, setRows] = useState([])
  const [live, setLive] = useState(false)
  const [tally, setTally] = useState({ screened: 0, above: 0, unknown: 0 })
  const line = useRef(threshold)
  line.current = threshold

  useEffect(() => {
    const merge = (txid, patch) => setRows((prev) => {
      const i = prev.findIndex((r) => r.transaction_id === txid)
      if (i === -1) return prev
      const next = prev.slice()
      next[i] = { ...next[i], ...patch }
      return next
    })
    const handle = (kind, e) => {
      if (!e?.transaction_id) return
      if (kind === 'screened') {
        const unknown = e.outcome === 'unknown_accounts'
        const above = !unknown && typeof e.graph_score === 'number' && line.current != null
          && e.graph_score >= line.current
        setTally((t) => ({ screened: t.screened + 1, above: t.above + (above ? 1 : 0),
                           unknown: t.unknown + (unknown ? 1 : 0) }))
        setRows((prev) => [{ ...e, unknown }, ...prev.filter((r) => r.transaction_id !== e.transaction_id)]
          .slice(0, 12))
      } else if (kind === 'escalated') {
        merge(e.transaction_id, { pattern: e.pattern, sink: e.sink_account, convergence: e.convergence })
      } else if (kind === 'fused') {
        merge(e.transaction_id, { fused: e.fused_score, severity: e.severity })
      }
    }
    const stop = streamMonitor({
      onEvent: (kind, e) => {
        setLive(true)
        if (kind === 'snapshot') {
          // The recent backlog, oldest first, so the newest ends up on top.
          ;(e?.events ?? []).forEach((x) => handle(x.kind ?? x.type, x.data ?? x))
          return
        }
        handle(kind, e)
      },
      onError: () => setLive(false),
    })
    return () => stop?.()
  }, [])

  const muted = 'rgb(var(--ds-muted))'
  const faint = 'rgb(var(--ds-faint))'

  return (
    <section className="dash-card" style={{ padding: 22 }}>
      <div className="dash-head" style={{ marginBottom: 6, flexWrap: 'wrap', gap: 10 }}>
        <h2 className="dash-h dash-h-sm">Live screening</h2>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: muted }}>
          <span style={{ width: 8, height: 8, borderRadius: 99,
                         background: live ? 'rgb(var(--ds-accent))' : faint }} />
          {live ? 'listening to the monitor' : 'not connected'}
        </span>
      </div>
      <p style={{ fontSize: 14, color: muted, margin: '0 0 14px' }}>
        Each payment the live run sends through this detector. Click one to open its receiver on the map.
      </p>

      <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', marginBottom: 14 }}>
        {[['screened', tally.screened], ['at or above the line', tally.above], ['not in the graph', tally.unknown]]
          .map(([k, v]) => (
            <div key={k}>
              <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-.03em' }}>{v.toLocaleString()}</div>
              <div style={{ fontSize: 13, color: muted }}>{k}</div>
            </div>
          ))}
      </div>

      {rows.length === 0 ? (
        <div className="ds-empty">
          Nothing screened yet. Start the live monitor and run the Query Runner, and payments appear here.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {rows.map((r) => {
            const score = typeof r.graph_score === 'number' ? r.graph_score : null
            const over = score != null && threshold != null && score >= threshold
            const sev = (r.severity || '').toLowerCase()
            return (
              <button key={r.transaction_id} type="button" disabled={r.unknown || !r.to}
                      onClick={() => onOpen?.(r.to)}
                      title={r.unknown ? 'Neither account is in the served graph' : `Open ${r.to} on the map`}
                      style={{ textAlign: 'left', cursor: r.unknown ? 'default' : 'pointer', font: 'inherit',
                               color: 'inherit', padding: '10px 12px', borderRadius: 14,
                               border: '1px solid rgb(var(--ds-line))', background: 'rgb(var(--ds-surface-2))',
                               display: 'grid', gap: 6 }}>
                <span style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <span className="ds-mono" style={{ fontSize: 13, color: muted }}>{r.transaction_id}</span>
                  <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    {r.pattern && <span className="ds-badge">{String(r.pattern).replace(/_/g, ' ').toLowerCase()}</span>}
                    {r.severity && (
                      <span className="ds-badge" style={{ color: `rgb(var(--ds-sev-${sev}))`, borderColor: 'transparent',
                                                          background: `color-mix(in srgb, rgb(var(--ds-sev-${sev})) 16%, transparent)` }}>
                        fused {Number(r.fused).toFixed(2)} · {r.severity}
                      </span>
                    )}
                  </span>
                </span>
                {r.unknown ? (
                  <span style={{ fontSize: 13, color: faint }}>
                    Not in the graph, so this detector abstained and the other two decided.
                  </span>
                ) : (
                  <>
                    <span className="ds-mono" style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.from} → <b>{r.to}</b>
                      {typeof r.amount === 'number' && (
                        <span style={{ color: muted }}> · {r.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                      )}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span className="ds-progress" style={{ flex: 1, position: 'relative' }}>
                        <span style={{ width: `${Math.max(2, Math.min(1, score ?? 0) * 100)}%`,
                                       background: over ? 'rgb(var(--ds-sev-high))' : 'rgb(var(--modality-graph))' }} />
                        {threshold != null && (
                          <i style={{ position: 'absolute', top: -3, bottom: -3, left: `${threshold * 100}%`,
                                      borderLeft: '2px dashed rgb(var(--ds-ink) / .55)' }} />
                        )}
                      </span>
                      <span className="ds-mono" style={{ fontSize: 13, width: 54, textAlign: 'right',
                                                         color: over ? 'rgb(var(--ds-sev-high))' : undefined }}>
                        {score == null ? '-' : score.toFixed(4)}
                      </span>
                    </span>
                  </>
                )}
              </button>
            )
          })}
        </div>
      )}
      <p style={{ fontSize: 12, color: faint, margin: '12px 0 0' }}>
        Bar = graph score; dashed line = this detector's threshold. Pattern appears when the score crosses its early-warning line.
      </p>
    </section>
  )
}
