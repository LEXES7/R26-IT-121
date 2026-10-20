import { useState } from 'react'

/**
 * Change the transaction and watch the model change its mind.
 *
 * The point of this is one specific question, which a domain reviewer asked of
 * this component directly: does it flag a payment for being large? Reading the
 * answer off a table takes trust. Dragging the amount to ten million against a
 * large balance and watching nothing happen, then dragging the balance down to
 * meet it and watching the verdict flip, does not.
 *
 * So the two controls are the amount and the balance it is drawn from, and the
 * ratio between them is displayed as a first-class number rather than left to
 * be inferred. That ratio is `F2_amount_balance_ratio`, and it is the feature
 * that makes the answer to the reviewer's question "no".
 *
 * Balances after the transaction are derived rather than typed. A form that
 * lets you set an origin balance of 500,000, an amount of 400,000 and a
 * closing balance of 500,000 can produce a row that could not occur, and the
 * model would be answering about arithmetic that never happens in the data it
 * was fitted on.
 *
 * For the same reason the amount stops at the balance and the balance at the
 * amount. Past that point the origin cannot fall below zero, so the ledger
 * stops reconciling, and in PaySim that is the ordinary case: of the transfers
 * up to step 595, 96% of legitimate ones send more than the balance shows and
 * 97% of fraudulent ones drain it exactly. One step past the balance, the
 * model calls a payment that empties the account normal.
 */

const money = (n) => Math.round(n).toLocaleString()

// Headroom above whichever of the two is larger.
const span = (amount, balance) => Math.max(amount, balance, 1) * 2.2

function Slider({ label, value, onChange, min = 0, max, hint }) {
  return (
    <div style={{ display: 'grid', gap: 5 }}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="ds-mono text-[12px] uppercase tracking-wider"
              style={{ color: 'rgb(var(--ds-faint))' }}>{label}</span>
        <span className="numeric text-[15px]" style={{ color: 'rgb(var(--ds-ink))' }}>
          {money(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={Math.max((max - min) / 1000, 0.01)}
        value={Math.min(Math.max(value, min), max)}
        onChange={(e) => onChange(Number(e.target.value))}
        className="ds-range"
        aria-label={label}
      />
      {hint && (
        <span className="text-[12px]" style={{ color: 'rgb(var(--ds-faint))' }}>{hint}</span>
      )}
    </div>
  )
}

// `bare` drops the frame and the heading, for a card that already has both.
export default function TransactionEditor({ txn, onChange, onReset, dirty, bare = false }) {
  const amount = Number(txn.amount) || 0
  const balance = Number(txn.oldbalanceOrg) || 0
  const ratio = balance > 0 ? amount / balance : null

  // The track is sized once per row, from the row as it was picked. Sized from
  // the values being edited, its end moved away from the pointer during a drag.
  const id = txn.transaction_id ?? txn.nameOrig
  const [frame, setFrame] = useState(() => ({ id, ceiling: span(amount, balance) }))
  if (frame.id !== id) setFrame({ id, ceiling: span(amount, balance) })
  const { ceiling } = frame

  // An account with no balance has nothing to stop at, which is its own
  // ordinary case in PaySim and is labelled below rather than prevented.
  const amountMax = balance > 0 ? balance : ceiling

  // Evenly spaced positions land on round figures whenever the span is round,
  // and F12_round_amount reads a round figure as structuring. So the amount
  // keeps the cents of the one it replaces, as PaySim's amounts have them.
  const cents = Math.round((amount % 1) * 100) / 100

  const set = (patch) => {
    const next = { ...txn, ...patch }
    // Money leaves the origin, so what remains follows from the two values
    // above rather than being a third thing to keep consistent by hand.
    next.newbalanceOrig = Math.max(0, (Number(next.oldbalanceOrg) || 0) - (Number(next.amount) || 0))
    next.newbalanceDest = (Number(next.oldbalanceDest) || 0) + (Number(next.amount) || 0)
    onChange(next)
  }

  // Only a row picked as it came can be over: the sliders keep it within.
  const over = ratio != null && ratio > 1
  const drained = ratio != null && ratio >= 0.995 && !over

  return (
    <div className={bare ? undefined : 'rounded-lg border p-4'}
         style={bare ? undefined : { borderColor: 'rgb(var(--ds-line))' }}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        {!bare && (
          <h3 className="ds-mono text-[14px] uppercase tracking-wider"
              style={{ color: 'rgb(var(--ds-faint))' }}>
            Change the transaction
          </h3>
        )}
        {dirty && (
          <button onClick={onReset} className="text-[13px] underline underline-offset-2"
                  style={{ color: 'rgb(var(--ds-muted))' }}>
            back to the original row
          </button>
        )}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Slider label="Amount" value={amount} max={amountMax}
                onChange={(v) => set({ amount: Math.min(Math.floor(v) + cents, amountMax) })} />
        <Slider label="Balance before" value={balance} min={amount} max={ceiling}
                onChange={(v) => set({ oldbalanceOrg: Math.max(Math.round(v * 100) / 100, amount) })} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
        <span className="ds-mono text-[12px] uppercase tracking-wider"
              style={{ color: 'rgb(var(--ds-faint))' }}>
          type
        </span>
        {['TRANSFER', 'CASH_OUT'].map((t) => (
          <button key={t} onClick={() => set({ type: t })}
                  className="rounded-md border px-2.5 py-1 text-[13px] transition-colors"
                  style={{
                    borderColor: txn.type === t
                      ? 'rgb(var(--ds-accent))' : 'rgb(var(--ds-line))',
                    color: txn.type === t
                      ? 'rgb(var(--ds-accent-strong))' : 'rgb(var(--ds-muted))',
                    background: txn.type === t ? 'rgb(var(--ds-accent) / 0.07)' : 'transparent',
                  }}>
            {t}
          </button>
        ))}
      </div>

      {/* The number the whole demonstration turns on. */}
      <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t pt-3"
           style={{ borderColor: 'rgb(var(--ds-line))' }}>
        <span className="ds-mono text-[12px] uppercase tracking-wider"
              style={{ color: 'rgb(var(--ds-faint))' }}>
          share of the account
        </span>
        <span className="numeric text-[22px] leading-none"
              style={{ color: drained ? 'rgb(var(--ds-sev-critical))' : 'rgb(var(--ds-ink))' }}>
          {ratio == null ? '-' : `${(ratio * 100).toFixed(1)}%`}
        </span>
        <span className="text-[13px]" style={{ color: 'rgb(var(--ds-muted))' }}>
          {ratio == null ? 'the account had no balance to draw on'
            : over ? 'more than the account held'
              : drained ? 'the account is emptied'
                : `${money(Math.max(0, balance - amount))} left afterwards`}
        </span>
      </div>
    </div>
  )
}
