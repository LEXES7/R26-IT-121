import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  getMonitorRuntime, getStoredTransaction, scoreOneDetector, searchTransactions, warmTemporalWindow,
} from '../services/api'
import { Alert } from '../components/ui'
import ConsoleShell from '../components/ConsoleShell'
import DetectorRuntime from '../components/DetectorRuntime'
import TransactionEditor from '../components/TransactionEditor'
import { Bar, PRESETS } from '../components/DetectorLab'
import BatchScoreTemporal from '../components/BatchScoreTemporal'

/**
 * What the timing model saw in the payments before this one.
 *
 * The novelty is `fraud_attention`. Most attention mechanisms report which
 * position in the window mattered — an index, which somebody then has to go
 * and look up. This reads that timestep's whole feature vector back out of the
 * rolling buffer, so what arrives is a named prior transaction with its
 * numbers attached: the account, the step, the amount, how far back it sits.
 * The whole attention row comes back too, so the window is drawn as the model
 * weighed it rather than as one highlighted slot.
 *
 * Laid out like the Network and Behaviour pages: the model drawn large with an
 * inspector beside it, the evidence in cards below, then the what-if and a
 * whole file.
 *
 * One thing differs, and it shapes the page. The window is one buffer shared
 * by everything this detector scores, the live monitor included, so every
 * score here is a payment entering it. Nothing is scored as you drag: the
 * what-if runs when asked, and a payment scored twice can find its own earlier
 * copy in the window, which the inspector says when it happens.
 */

const CARD = 'dash-card'
const WINDOW = 32
const LEVEL = {
  CRITICAL: 'rgb(var(--ds-sev-critical))',
  SUSPICIOUS: 'rgb(var(--ds-sev-high))',
  NORMAL: 'rgb(var(--ds-sev-low))',
}
// The two types PaySim's fraud happens in, marked under the window.
const TYPE_TONE = {
  TRANSFER: 'rgb(var(--ds-sev-high))',
  CASH_OUT: 'rgb(var(--ds-sev-medium))',
}
const MUTED = { fontSize: 14, lineHeight: 1.5, color: 'rgb(var(--ds-muted))', margin: 0 }
const STACK = { padding: 22, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12, alignContent: 'start' }

const fixed = (v, n) => (typeof v === 'number' ? v.toFixed(n) : '-')
const money = (v) => (typeof v === 'number' ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '-')
// hour_of_day arrives as ((step - 1) % 24) / 23; this is the hour it encodes.
const hourOf = (v) => (typeof v === 'number' ? `${String(Math.round(v * 23)).padStart(2, '0')}:00` : '-')
const shortId = (id) => (id.length > 16 ? `${id.slice(0, 6)}…${id.slice(-8)}` : id)

export default function TimingLab() {
  const [pick, setPick] = useState(0)
  const [source, setSource] = useState('fixed')
  const [liveRows, setLiveRows] = useState([])
  const [txn, setTxn] = useState(PRESETS[0].txn)
  const [scored, setScored] = useState(null)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [runtime, setRuntime] = useState(null)
  const warmedRef = useRef(false)

  const loadRuntime = useCallback(() => {
    getMonitorRuntime()
      .then((r) => setRuntime(r?.detectors?.temporal ?? null))
      .catch(() => setRuntime(null))
  }, [])
  useEffect(() => { loadRuntime() }, [loadRuntime])

  // The latest screened rows, each fetched in full: the list view carries no
  // balances, and a detector given none scores the account as if it were empty.
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
              ref: shortId(r.transaction_id ?? t.nameOrig),
              note: `${t.type} · ${Number(t.amount).toLocaleString()}`
                + (r.label_is_fraud === true ? ' · labelled fraud'
                  : r.label_is_fraud === false ? ' · labelled clean' : ''),
              txn: { ...t, transaction_id: r.transaction_id },
            }
          } catch { return null }
        }))
        if (alive) setLiveRows(full.filter(Boolean))
      })
      .catch(() => { /* the known cases still work */ })
    return () => { alive = false }
  }, [])

  const presets = source === 'live' && liveRows.length ? liveRows : PRESETS
  const preset = presets[Math.min(pick, presets.length - 1)] ?? presets[0]

  const run = useCallback(async (t) => {
    setLoading(true)
    setError(null)
    try {
      // Once per visit: a window still filling has no opinion to give.
      if (!warmedRef.current) {
        warmedRef.current = true
        try { await warmTemporalWindow() } catch { /* score anyway; it will say */ }
      }
      setResult(await scoreOneDetector('temporal', t))
      setScored(t)
    } catch (err) {
      setError(err?.userMessage ?? 'The detector did not answer.')
      setResult(null)
    } finally {
      setLoading(false)
    }
  }, [])

  // Picking another payment replaces the working row, edits included, and
  // scores it. Behind a timeout that the cleanup clears, so a double mount in
  // development cannot put the same payment into the window twice.
  useEffect(() => {
    if (!preset?.txn) return undefined
    setTxn(preset.txn)
    const id = setTimeout(() => run(preset.txn), 0)
    return () => clearTimeout(id)
  }, [preset, run])

  const ready = runtime?.ready ?? runtime?.status === 'ok'
  return (
    <ConsoleShell
      eyebrow="Detector · Timing"
      title={<>The payments before it. <em>The one it looked back at.</em></>}
      subtitle="Pick a payment to see which of the 31 before it the model weighed most."
      actions={
        <>
          <span className="dash-chip" style={{ height: 40 }}>
            <span style={{ width: 8, height: 8, borderRadius: 99,
                           background: ready ? 'rgb(var(--ds-sev-low))' : 'rgb(var(--ds-faint))' }} />
            <b style={{ fontSize: 14 }}>{ready ? 'Serving' : 'Checking'}</b>
            {runtime?.mean_latency_ms != null && (
              <span>{Number(runtime.mean_latency_ms).toFixed(0)} ms</span>
            )}
          </span>
          <button className="ds-btn" onClick={() => { loadRuntime(); run(txn) }}>Refresh</button>
        </>
      }
    >
      <TimingView
        presets={presets} pick={pick} onPick={setPick}
        source={source} onSource={(k) => { setSource(k); setPick(0) }} liveCount={liveRows.length}
        txn={txn} onTxn={setTxn} onReset={() => setTxn(preset.txn)}
        dirty={JSON.stringify(txn) !== JSON.stringify(preset?.txn)}
        scored={scored} result={result} loading={loading} error={error} runtime={runtime}
        onRun={() => run(txn)}
      />
    </ConsoleShell>
  )
}

/** The page body, drawn from data alone. */
export function TimingView({
  presets, pick, onPick, source, onSource, liveCount, txn, onTxn, onReset, dirty,
  scored, result, loading, error, runtime, onRun,
}) {
  const ev = result?.evidence ?? {}
  const cur = ev.current_transaction ?? {}
  const pred = ev.triggering_predecessor ?? {}
  const answered = result && result.available !== false
  // The row on screen has been edited since it was last scored.
  const stale = Boolean(scored) && JSON.stringify(scored) !== JSON.stringify(txn)

  return (
    <div className="dash" style={{ gap: 18 }}>
      <DetectorRuntime detector="temporal" model="Transaction-Sequence TCN" />

      {error && <Alert tone="error">{error}</Alert>}

      <div className="dash-chips">
        <span className="dash-chip" role="group" aria-label="Which payments" style={{ padding: 4, gap: 2 }}>
          {[['fixed', 'Known cases'], ['live', 'Latest screened']].map(([k, label]) => {
            const on = source === k
            const off = k === 'live' && !liveCount
            return (
              <button key={k} type="button" aria-pressed={on} aria-disabled={off}
                      onClick={() => { if (!off) onSource(k) }}
                      title={off ? 'Nothing screened yet. Start the monitor and run the Query Runner.' : undefined}
                      style={{ border: 0, borderRadius: 12, padding: '8px 14px', fontSize: 13,
                               display: 'inline-flex', alignItems: 'center', gap: 8,
                               fontWeight: on ? 600 : 500, opacity: off ? 0.45 : 1,
                               cursor: off ? 'not-allowed' : 'pointer',
                               background: on ? 'rgb(var(--dash-mint))' : 'transparent',
                               color: on ? 'rgb(var(--dash-on-mint))' : 'rgb(var(--ds-muted))' }}>
                {label}
                {k === 'live' && liveCount > 0 && (
                  <span style={{ minWidth: 20, height: 20, padding: '0 6px', borderRadius: 99, fontSize: 12,
                                 fontWeight: 600, display: 'inline-grid', placeItems: 'center',
                                 background: on ? 'rgb(var(--dash-on-mint) / .14)' : 'rgb(var(--ds-line))' }}>
                    {liveCount}
                  </span>
                )}
              </button>
            )
          })}
        </span>
        <span aria-hidden="true" style={{ width: 1, height: 28, margin: '0 4px', background: 'rgb(var(--ds-line))' }} />

        {presets.map((p, i) => {
          const on = i === pick
          return (
            <button key={p.txn?.transaction_id ?? p.ref} title={p.txn?.transaction_id} type="button"
                    className="dash-chip" aria-pressed={on} onClick={() => onPick(i)}
                    style={{ font: 'inherit', cursor: 'pointer',
                             ...(on ? { background: 'rgb(var(--dash-mint))', borderColor: 'transparent' } : {}) }}>
              <b className="ds-mono" style={{ fontSize: 14, ...(on ? { color: 'rgb(var(--dash-on-mint))' } : {}) }}>
                {p.ref}
              </b>
              <span style={{ fontSize: 13, ...(on ? { color: 'rgb(var(--dash-on-mint))' } : {}) }}>{p.note}</span>
            </button>
          )
        })}

        <span style={{ marginLeft: 'auto', display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {runtime?.buffer_filled != null && (
            <span className="dash-chip"><b>{runtime.buffer_filled}/{runtime.window_size ?? WINDOW}</b> in the window</span>
          )}
          {runtime?.model?.parameters != null && (
            <span className="dash-chip"><b>{Number(runtime.model.parameters).toLocaleString()}</b> parameters</span>
          )}
          {runtime?.model?.receptive_field != null && (
            <span className="dash-chip"><b>{runtime.model.receptive_field}</b> receptive field</span>
          )}
        </span>
      </div>

      <div className="ds-mono" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 13,
                                         color: 'rgb(var(--ds-faint))', marginTop: -6 }}>
        <span>
          {txn.type} · {Number(txn.amount).toLocaleString()} · {txn.nameOrig} → {txn.nameDest} · step {txn.step}
        </span>
        {source === 'live' && <span>· from the monitor, so this set changes</span>}
        {dirty && <span style={{ color: 'rgb(var(--ds-warn))' }}>· edited, no longer the labelled row</span>}
        {stale && <span style={{ color: 'rgb(var(--ds-warn))' }}>· not scored since the edit</span>}
      </div>

      <div className="ds-split" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 360px',
                                         gap: 18, alignItems: 'start' }}>
        <section className={CARD} style={{ padding: 22 }}>
          <div className="dash-head" style={{ marginBottom: 8 }}>
            <h2 className="dash-h dash-h-sm">Inside the window</h2>
            <span className="ds-mono" style={{ fontSize: 12, color: 'rgb(var(--ds-faint))' }}>
              fraud_attention · oldest on the left
            </span>
          </div>
          {loading && !result ? <Empty>Asking the detector…</Empty>
            : result?.available === false ? (
              <Alert tone="warning">
                This detector did not answer. {result.summary || ''} It is left out of the
                verdict, not counted as safe.
              </Alert>
            ) : answered ? <WindowStrip pred={pred} model={runtime?.model} />
              : <Empty>Pick a payment to score it.</Empty>}
        </section>

        <aside style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
          <Inspector txn={txn} result={result} ev={ev} pred={pred} loading={loading}
                     threshold={runtime?.threshold} onRun={onRun} />
        </aside>
      </div>

      {answered && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18 }}>
          <Predecessor pred={pred} cur={cur} />
          <section className={CARD} style={STACK}>
            <h2 className="dash-h dash-h-sm">This payment</h2>
            {cur.fraud_signal_summary && <p style={MUTED}>{cur.fraud_signal_summary}</p>}
            {[['Drain ratio', cur.drain_ratio], ['Left in the account', cur.post_transfer_ratio],
              ['Destination enrichment', cur.dest_enrichment], ['Type risk', cur.type_risk]]
              .filter(([, v]) => typeof v === 'number')
              .map(([label, v]) => (
                <Bar key={label} label={label} value={v} max={1}
                     tone={label === 'Drain ratio' && v > 0.9 ? 'risk' : 'accent'} right={v.toFixed(3)} />
              ))}
            <div style={{ fontSize: 14 }}>
              {[['Destination was empty', cur.dest_was_empty == null ? '-' : cur.dest_was_empty ? 'yes' : 'no'],
                ['Hour of day', hourOf(cur.hour_of_day)]].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '9px 0',
                                      borderTop: '1px solid rgb(var(--ds-line))' }}>
                  <span style={{ color: 'rgb(var(--ds-muted))' }}>{k}</span>
                  <span className="ds-mono">{v}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18 }}>
        <section className={CARD} style={STACK}>
          <h2 className="dash-h dash-h-sm">What if</h2>
          <p style={MUTED}>
            Change the amount, the balance or the type, then score it. Each score enters the window the
            monitor shares, so it runs when you ask rather than as you drag.
          </p>
          <TransactionEditor bare txn={txn} onChange={onTxn} onReset={onReset} dirty={dirty} />
          <button type="button" className="ds-btn ds-btn-primary" onClick={onRun}
                  disabled={loading || !stale} style={{ justifySelf: 'start' }}>
            {loading ? 'Scoring…' : stale ? 'Score this version' : 'Scored'}
          </button>
        </section>
      </div>

      {/* A file is a stream, which is the one thing a single row cannot give
          this model. */}
      <section className={CARD} style={{ padding: 22 }}>
        <BatchScoreTemporal threshold={runtime?.threshold} />
      </section>
    </div>
  )
}

function Empty({ children }) {
  return (
    <p style={{ padding: '70px 0', textAlign: 'center', fontSize: 14, color: 'rgb(var(--ds-faint))', margin: 0 }}>
      {children}
    </p>
  )
}

/**
 * The 32 slots as the model weighed them. Slot 31 is this payment; the other
 * 31 are the payments before it, and the tallest of those is the one named.
 * Responses from before the full row was published carry only the winner, so
 * then the strip marks that one slot and says so.
 */
function WindowStrip({ pred, model }) {
  const [hover, setHover] = useState(null)
  const offset = Math.abs(pred.offset_from_current ?? 0)
  const named = offset > 0 && offset < WINDOW ? WINDOW - 1 - offset : null
  const attn = Array.isArray(pred.window_attention) && pred.window_attention.length === WINDOW
    ? pred.window_attention : null
  const types = Array.isArray(pred.window_types) ? pred.window_types : []
  const top = attn ? Math.max(...attn, 1e-9) : 1
  // How sharply it chose: the named slot against an even split of the window.
  const sharp = attn && named != null ? attn[named] * WINDOW : null
  const focus = hover ?? named

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 190, paddingTop: 10 }}
           onMouseLeave={() => setHover(null)}>
        {Array.from({ length: WINDOW }, (_, i) => {
          const isNamed = i === named
          const isCurrent = i === WINDOW - 1
          const h = attn ? Math.max(4, (attn[i] / top) * 100)
            : isNamed ? 100 : isCurrent ? 60 : 12
          const back = WINDOW - 1 - i
          return (
            <button key={i} type="button" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)}
                    aria-label={isCurrent ? 'This payment' : `${back} back${attn ? `, weight ${attn[i]}` : ''}`}
                    style={{ flex: 1, minWidth: 0, height: '100%', padding: 0, border: 0, cursor: 'default',
                             background: 'transparent', display: 'flex', alignItems: 'flex-end' }}>
              <span style={{
                display: 'block', width: '100%', height: `${h}%`, borderRadius: '5px 5px 2px 2px',
                outline: hover === i ? '2px solid rgb(var(--ds-ink) / .5)' : 'none', outlineOffset: 1,
                background: isNamed ? 'rgb(var(--ds-sev-critical))'
                  : isCurrent ? 'rgb(var(--ds-accent))'
                    : 'rgb(var(--dash-line) / .45)',
              }} />
            </button>
          )
        })}
      </div>

      {types.length === WINDOW && (
        <div style={{ display: 'flex', gap: 3 }} aria-hidden="true">
          {types.map((t, i) => (
            <span key={i} title={t} style={{ flex: 1, height: 5, borderRadius: 2,
                                              background: TYPE_TONE[t] ?? 'rgb(var(--ds-line))' }} />
          ))}
        </div>
      )}

      <div className="ds-mono" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12,
                                         color: 'rgb(var(--ds-faint))' }}>
        <span>31 back</span>
        <span>this payment</span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', fontSize: 12,
                    color: 'rgb(var(--ds-muted))' }}>
        {[['the one it named', 'rgb(var(--ds-sev-critical))'], ['this payment', 'rgb(var(--ds-accent))'],
          ['TRANSFER', TYPE_TONE.TRANSFER], ['CASH_OUT', TYPE_TONE.CASH_OUT]].map(([k, c]) => (
          <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 9, height: 9, borderRadius: 99, background: c }} />{k}
          </span>
        ))}
        {focus != null && (
          <span className="ds-mono" style={{ marginLeft: 'auto', color: 'rgb(var(--ds-ink))' }}>
            {focus === WINDOW - 1 ? 'this payment' : `${WINDOW - 1 - focus} back`}
            {types[focus] ? ` · ${types[focus]}` : ''}
            {attn ? ` · weight ${attn[focus].toFixed(4)}` : ''}
          </span>
        )}
      </div>

      <p style={{ ...MUTED, fontSize: 13 }}>
        {sharp != null
          ? `The payment it named carries ${sharp.toFixed(1)}× an even share of the attention. `
          : !attn ? 'This answer named only the winning slot, so the others are drawn flat. ' : ''}
        {model?.dilations
          ? `${model.blocks} dilated causal blocks (${model.dilations.join(', ')}) reach back ${model.receptive_field} steps, so every slot here is within reach.`
          : 'Bar height is the attention weight on that slot.'}
      </p>
    </div>
  )
}

/** The selected payment: its score, its band, and what it looked back at. */
function Inspector({ txn, result, ev, pred, loading, threshold, onRun }) {
  const score = typeof result?.score === 'number' ? result.score : null
  const level = ev.risk_level
  const colour = LEVEL[level] ?? 'rgb(var(--ds-faint))'
  const line = typeof threshold === 'number' ? threshold : 0.4545
  const offset = Math.abs(pred.offset_from_current ?? 0)
  // Scoring a row twice leaves its first copy in the window, and the model
  // may then attend to it. Worth saying, because it reads like a finding.
  const self = pred.composite_id && pred.composite_id === `${txn.nameOrig}_${txn.step}`
  return (
    <section className={CARD} style={{ padding: 22 }}>
      <div className="ds-section-label">Selected payment</div>
      <div className="ds-mono" style={{ fontSize: 17, marginTop: 8, wordBreak: 'break-all' }}>
        {txn.transaction_id ?? txn.nameOrig}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 16 }}>
        <div style={{ width: 86, height: 86, borderRadius: 99, flex: '0 0 auto', display: 'grid', placeItems: 'center',
                      background: `conic-gradient(${colour} 0 ${Math.max(1, (score ?? 0) * 100)}%, `
                        + 'rgb(var(--ds-surface-3)) 0 100%)' }}>
          <div style={{ width: 70, height: 70, borderRadius: 99, display: 'grid', placeItems: 'center',
                        background: 'rgb(var(--dash-card-top))', textAlign: 'center' }}>
            <div>
              <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: '-.03em' }}>
                {score == null ? '-' : `${Math.round(score * 100)}%`}
              </div>
              <div style={{ fontSize: 9, letterSpacing: '.1em', color: 'rgb(var(--ds-faint))' }}>RISK</div>
            </div>
          </div>
        </div>
        <div style={{ minWidth: 0 }}>
          {level && (
            <span className="ds-badge" style={{ color: colour, borderColor: 'transparent',
                                                background: `color-mix(in srgb, ${colour} 16%, transparent)` }}>
              <span style={{ width: 7, height: 7, borderRadius: 99, background: colour }} />
              {level}
            </span>
          )}
          <div style={{ fontSize: 15, fontWeight: 600, marginTop: 10 }}>
            {score == null ? (loading ? 'Scoring…' : 'Not scored yet')
              : score >= line ? 'Above its threshold' : 'Below its threshold'}
          </div>
          <div style={{ fontSize: 13, color: 'rgb(var(--ds-muted))' }}>Read with the 31 payments before it</div>
        </div>
      </div>
      <div style={{ marginTop: 14, fontSize: 14 }}>
        {[['Looked back at', pred.nameOrig ? `${offset} back · step ${pred.step}` : '-', true],
          ['Attention weight', fixed(pred.attention_weight ?? result?.raw?.attention_weight, 3), true],
          ['Threshold', line.toFixed(4), true],
          ['Decided in', ev.inference_time_ms != null ? `${Number(ev.inference_time_ms).toFixed(0)} ms` : '-', true]]
          .map(([k, v, mono]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '9px 0',
                                  borderTop: '1px solid rgb(var(--ds-line))' }}>
              <span style={{ color: 'rgb(var(--ds-muted))' }}>{k}</span>
              <span className={mono ? 'ds-mono' : undefined} style={{ textAlign: 'right' }}>{v}</span>
            </div>
          ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button type="button" className="ds-btn ds-btn-primary" style={{ flex: 1 }} onClick={onRun} disabled={loading}>
          {loading ? 'Scoring…' : 'Run again'}
        </button>
        <Link to={`/analyzer?q=${encodeURIComponent(txn.nameOrig ?? '')}`} className="ds-btn">Analyze</Link>
      </div>
      {self && (
        <p style={{ fontSize: 13, lineHeight: 1.5, color: 'rgb(var(--ds-sev-high))', margin: '12px 0 0' }}>
          It looked back at an earlier copy of this same payment. Scoring a row again puts it in the
          window twice.
        </p>
      )}
    </section>
  )
}

/** The named prior payment, beside this one on the features both carry. */
function Predecessor({ pred, cur }) {
  const pf = pred.features ?? {}
  if (!pred.nameOrig) {
    return (
      <section className={CARD} style={STACK}>
        <h2 className="dash-h dash-h-sm">The payment it named</h2>
        <p style={MUTED}>No earlier payment stood out.</p>
      </section>
    )
  }
  const rows = [
    ['Type', pf.type ?? '-', cur.type ?? '-'],
    ['Amount', money(pf.amount), money(cur.amount)],
    ['Drain ratio', fixed(pf.drain_ratio, 3), fixed(cur.drain_ratio, 3)],
    ['Left in the account', fixed(pf.post_transfer_ratio, 3), fixed(cur.post_transfer_ratio, 3)],
    ['Destination was empty', pf.dest_was_empty == null ? '-' : pf.dest_was_empty ? 'yes' : 'no',
      cur.dest_was_empty == null ? '-' : cur.dest_was_empty ? 'yes' : 'no'],
  ]
  return (
    <section className={CARD} style={STACK}>
      <div className="dash-head">
        <h2 className="dash-h dash-h-sm">The payment it named</h2>
        <span className="ds-mono" style={{ fontSize: 12, color: 'rgb(var(--ds-faint))' }}>
          {Math.abs(pred.offset_from_current ?? 0)} back
        </span>
      </div>
      <div>
        <div className="ds-mono" style={{ fontSize: 17, wordBreak: 'break-all' }}>{pred.nameOrig}</div>
        <div style={{ fontSize: 13, color: 'rgb(var(--ds-muted))' }}>
          step {pred.step} · a real payment from the window, not a position
        </div>
      </div>
      {pred.predecessor_signal && (
        <p style={{ ...MUTED, color: 'rgb(var(--ds-sev-high))' }}>{pred.predecessor_signal}</p>
      )}
      <table className="ds-table" style={{ fontSize: 14 }}>
        <thead><tr><th /><th>Then</th><th>Now</th></tr></thead>
        <tbody>
          {rows.map(([k, a, b]) => (
            <tr key={k}>
              <td style={{ color: 'rgb(var(--ds-muted))' }}>{k}</td>
              <td className="ds-mono">{a}</td>
              <td className="ds-mono">{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
