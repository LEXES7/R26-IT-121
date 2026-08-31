import { useCallback, useEffect, useRef, useState } from 'react'
import { scoreOneDetector, warmTemporalWindow } from '../services/api'
import { Alert, Button, cx } from './ui'
import ConsoleShell from './ConsoleShell'

/**
 * The shell the three detector pages share: pick a transaction, run one
 * detector on it, hand the answer to the page to draw.
 *
 * One detector at a time on purpose. The monitor already shows the fused
 * verdict; what these pages are for is seeing what a single model said and
 * why, without the other two in the way. That is also what makes them useful
 * to the person who owns that model — it is their component, answering on its
 * own, against a transaction they chose.
 *
 * The presets are real rows from the held-out showcase file, labelled with the
 * ground truth rather than with a score. A made-up transaction would exercise
 * the same code and prove nothing about the data.
 *
 * The label deliberately does not name a band. Scored one at a time here, a row
 * can land in a different band than it did during a stream replay, because the
 * sequential detector reads the 32 transactions that actually preceded it — and
 * those differ between a replay and a single call. A label naming a band would
 * be right in one context and wrong in the other. The band the page shows is
 * the one this run produced.
 */

export const PRESETS = [
  { ref: 'LK-2026-0041', note: 'known fraud · TRANSFER, drained',
    txn: { transaction_id: 'LK-2026-0041', step: 705, type: 'TRANSFER',
           amount: 404394.04, nameOrig: 'C57037472', nameDest: 'C149688378',
           oldbalanceOrg: 404394.04, newbalanceOrig: 0.0,
           oldbalanceDest: 0.0, newbalanceDest: 0.0, isFlaggedFraud: 0 } },
  { ref: 'LK-2026-0039', note: 'known fraud · CASH_OUT, large',
    txn: { transaction_id: 'LK-2026-0039', step: 703, type: 'CASH_OUT',
           amount: 6498297.70, nameOrig: 'C357275895', nameDest: 'C185710964',
           oldbalanceOrg: 6498297.7, newbalanceOrig: 0.0,
           oldbalanceDest: 103810.91, newbalanceDest: 6602108.61, isFlaggedFraud: 0 } },
  { ref: 'LK-2026-0001', note: 'known legitimate',
    txn: { transaction_id: 'LK-2026-0001', step: 705, type: 'CASH_OUT',
           amount: 161299.34, nameOrig: 'C1859807389', nameDest: 'C375991142',
           oldbalanceOrg: 0.0, newbalanceOrig: 0.0,
           oldbalanceDest: 229061.35, newbalanceDest: 390360.69, isFlaggedFraud: 0 } },
]

export function Bar({ value, max = 1, tone = 'accent', label, right }) {
  const pct = Math.max(1, Math.min(100, ((value ?? 0) / (max || 1)) * 100))
  const colour = tone === 'risk' ? 'rgb(var(--ds-sev-critical))'
    : tone === 'warn' ? 'rgb(var(--ds-sev-high))'
      : 'rgb(var(--ds-accent))'
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[16px]" style={{ color: 'rgb(var(--ds-ink))' }}>{label}</span>
        <span className="numeric text-[16px]" style={{ color: 'rgb(var(--ds-muted))' }}>{right}</span>
      </div>
      <div style={{ height: 7, borderRadius: 4, background: 'rgb(var(--ds-line))' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 4, background: colour }} />
      </div>
    </div>
  )
}

export function Stat({ label, value, note }) {
  return (
    <div>
      <p className="ds-mono text-[14px] uppercase tracking-wider"
         style={{ color: 'rgb(var(--ds-faint))' }}>{label}</p>
      <p className="numeric mt-1 text-[28px] leading-none"
         style={{ color: 'rgb(var(--ds-ink))' }}>{value}</p>
      {note && <p className="mt-1 text-[15px]" style={{ color: 'rgb(var(--ds-muted))' }}>{note}</p>}
    </div>
  )
}

export default function DetectorLab({ detector, eyebrow, title, subtitle, children }) {
  const [pick, setPick] = useState(0)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const warmedRef = useRef(false)

  const run = useCallback(async (i) => {
    setLoading(true)
    setError(null)
    try {
      // Once per visit, and only for the detector that needs it.
      if (detector === 'temporal' && !warmedRef.current) {
        warmedRef.current = true
        try { await warmTemporalWindow() } catch { /* score anyway; it will say */ }
      }
      setResult(await scoreOneDetector(detector, PRESETS[i].txn))
    } catch (err) {
      setError(err?.userMessage ?? 'The detector did not answer.')
      setResult(null)
    } finally {
      setLoading(false)
    }
  }, [detector])

  useEffect(() => { run(pick) }, [run, pick])

  const p = PRESETS[pick]
  return (
    <ConsoleShell eyebrow={eyebrow} title={title} subtitle={subtitle}>
      {/* .ds-content sets padding but no gap, so blocks rendered straight into
          it sit flush against one another. The page owns its own rhythm. */}
      <div style={{ display: 'grid', gap: 18 }}>
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
            <span className="numeric block text-[16px]"
                  style={{ color: 'rgb(var(--ds-ink))' }}>{x.ref}</span>
            <span className="block text-[14px]"
                  style={{ color: 'rgb(var(--ds-faint))' }}>{x.note}</span>
          </button>
        ))}
        <Button size="sm" variant="ghost" onClick={() => run(pick)} loading={loading}>
          Run again
        </Button>
      </div>

      <p className="numeric text-[15px]" style={{ color: 'rgb(var(--ds-faint))' }}>
        {p.txn.type} · {p.txn.amount.toLocaleString()} · {p.txn.nameOrig} → {p.txn.nameDest} · step {p.txn.step}
      </p>

      {loading && !result ? (
        <p className="py-16 text-center text-xs" style={{ color: 'rgb(var(--ds-faint))' }}>
          Asking the detector…
        </p>
      ) : result?.available === false ? (
        <Alert tone="warning">
          This detector did not answer. {result.summary || ''} Its score is excluded
          from any fused verdict rather than counted as low.
        </Alert>
      ) : result ? (
        children(result)
      ) : null}
      </div>
    </ConsoleShell>
  )
}
