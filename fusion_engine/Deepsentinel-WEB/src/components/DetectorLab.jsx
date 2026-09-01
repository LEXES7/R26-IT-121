import { useCallback, useEffect, useRef, useState } from 'react'
import {
  scoreOneDetector, warmTemporalWindow, searchTransactions, getStoredTransaction,
} from '../services/api'
import { Alert, Button, cx } from './ui'
import ConsoleShell from './ConsoleShell'
import TransactionEditor from './TransactionEditor'
import DetectorRuntime from './DetectorRuntime'

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

export default function DetectorLab({
  detector, eyebrow, title, subtitle, model, children, editable = false,
}) {
  const [pick, setPick] = useState(0)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const warmedRef = useRef(false)
  const [liveRows, setLiveRows] = useState([])
  const [source, setSource] = useState('fixed')
  // The row actually scored. Seeded from whichever preset is selected, so
  // an edit always starts from a real transaction rather than a blank form.
  const [txn, setTxn] = useState(PRESETS[0].txn)

  /* The three fixed rows are known cases you can rehearse against. These are
   * whatever the monitor screened most recently — genuinely live, and so
   * genuinely different every time, which is the point: a picker that only
   * ever offers the same three transactions proves nothing about the stream.
   *
   * The list view does not carry balances, so each row is fetched in full
   * before it can be scored — a detector given a transaction with no balances
   * would score it as though the account were empty. */
  useEffect(() => {
    let alive = true
    searchTransactions('', 6)
      .then(async (d) => {
        const rows = Array.isArray(d) ? d : (d?.transactions ?? [])
        const full = await Promise.all(rows.slice(0, 4).map(async (r) => {
          try {
            const one = await getStoredTransaction(r.transaction_id)
            const t = one?.transaction ?? one
            if (!t?.nameOrig) return null
            return {
              ref: r.transaction_id?.slice(0, 12) ?? t.nameOrig,
              note: `${t.type} · ${Number(t.amount).toLocaleString()}`
                + (r.label_is_fraud === true ? ' · labelled fraud'
                  : r.label_is_fraud === false ? ' · labelled clean' : ''),
              txn: { ...t, transaction_id: r.transaction_id },
            }
          } catch { return null }
        }))
        if (alive) setLiveRows(full.filter(Boolean))
      })
      .catch(() => { /* the fixed three still work */ })
    return () => { alive = false }
  }, [])

  const presets = source === 'live' && liveRows.length ? liveRows : PRESETS

  const run = useCallback(async (t) => {
    setLoading(true)
    setError(null)
    try {
      // Once per visit, and only for the detector that needs it.
      if (detector === 'temporal' && !warmedRef.current) {
        warmedRef.current = true
        try { await warmTemporalWindow() } catch { /* score anyway; it will say */ }
      }
      setResult(await scoreOneDetector(detector, t))
    } catch (err) {
      setError(err?.userMessage ?? 'The detector did not answer.')
      setResult(null)
    } finally {
      setLoading(false)
    }
  }, [detector])

  const p = presets[Math.min(pick, presets.length - 1)] ?? presets[0]

  // Choosing a different preset, or switching between the fixed and live
  // lists, replaces the working row outright. Any edits go with it, which is
  // what picking a different transaction should mean.
  useEffect(() => { if (p?.txn) setTxn(p.txn) }, [p])

  // Debounced: a slider fires on every pixel and each change is a round trip
  // to the model. 300ms makes one request at the end of a drag and still feels
  // immediate. Unedited pages score straight away.
  useEffect(() => {
    const id = setTimeout(() => run(txn), editable ? 300 : 0)
    return () => clearTimeout(id)
  }, [run, txn, editable])

  const dirty = editable && JSON.stringify(txn) !== JSON.stringify(p?.txn)
  return (
    <ConsoleShell eyebrow={eyebrow} title={title} subtitle={subtitle}>
      {/* .ds-content sets padding but no gap, so blocks rendered straight into
          it sit flush against one another. The page owns its own rhythm. */}
      <div style={{ display: 'grid', gap: 18 }}>
      <DetectorRuntime detector={detector === 'behavioural' ? 'behavioural' : detector}
                       model={model} />
      {error && <Alert tone="error">{error}</Alert>}

      <div className="flex flex-wrap items-center gap-2">
        {presets.map((x, i) => (
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
        <Button size="sm" variant="ghost" onClick={() => run(txn)} loading={loading}>
          Run again
        </Button>

        {/* Fixed rows are for rehearsing; live rows are for proving. Both are
            real transactions — the difference is only whether they change. */}
        <span className="ml-auto flex items-center gap-1 rounded-full border p-1"
              style={{ borderColor: 'rgb(var(--ds-line))' }}>
          {[['fixed', 'Known cases'], ['live', 'Latest screened']].map(([k, label]) => (
            <button key={k}
                    onClick={() => { setSource(k); setPick(0) }}
                    disabled={k === 'live' && liveRows.length === 0}
                    className="rounded-full px-3 py-1 text-[13px] transition-colors disabled:opacity-40"
                    style={{
                      background: source === k ? 'rgb(var(--ds-accent-soft))' : 'transparent',
                      color: source === k ? 'rgb(var(--ds-accent-strong))'
                        : 'rgb(var(--ds-muted))',
                    }}>
              {label}
              {k === 'live' && liveRows.length > 0 && ` (${liveRows.length})`}
            </button>
          ))}
        </span>
      </div>

      <p className="numeric text-[15px]" style={{ color: 'rgb(var(--ds-faint))' }}>
        {txn.type} · {Number(txn.amount).toLocaleString()} · {txn.nameOrig} → {txn.nameDest}
        {' · '}step {txn.step}
        {source === 'live' && ' · from the monitor, so this set changes'}
        {dirty && (
          <span style={{ color: 'rgb(var(--ds-warn))' }}>
            {' · '}edited, no longer the labelled row
          </span>
        )}
      </p>

      {editable && (
        <TransactionEditor
          txn={txn}
          onChange={setTxn}
          onReset={() => setTxn(p.txn)}
          dirty={dirty}
        />
      )}

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
