import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  getMonitorRuntime, getStoredTransaction, scoreOneDetector, searchTransactions,
} from '../services/api'
import { Alert } from '../components/ui'
import ConsoleShell from '../components/ConsoleShell'
import DetectorRuntime from '../components/DetectorRuntime'
import TransactionEditor from '../components/TransactionEditor'
import { Bar, PRESETS } from '../components/DetectorLab'
import { ExpectationGap, FingerprintStrip } from '../components/Fingerprint'
import TypologyPanel from '../components/TypologyPanel'
import BatchScore from '../components/BatchScore'
import VaeLens from '../components/VaeLens'

/**
 * What the behavioural model saw, and which part of it was wrong.
 *
 * The novelty is that it does not stop at a score. A variational autoencoder
 * computes per-feature reconstruction error and per-dimension KL divergence on
 * its way to one number, and then throws both away. This reads them back out:
 * which input it could not rebuild, and which part of its internal summary had
 * to stretch. Two independent views of the same anomaly, for free: no
 * auxiliary explainer, no second model.
 *
 * Laid out like the Network page: the model drawn large with an inspector
 * beside it, the evidence in cards below, then the what-if, the model card and
 * a whole file. It keeps its own state rather than using DetectorLab's shell,
 * so the timing page, which still uses that shell, does not change.
 */

const CARD = 'dash-card'
const LEVEL = {
  CRITICAL: 'rgb(var(--ds-sev-critical))',
  HIGH: 'rgb(var(--ds-sev-high))',
  MEDIUM: 'rgb(var(--ds-sev-medium))',
  LOW: 'rgb(var(--ds-sev-low))',
}
// The halo behind the lens labels, at the middle of the card's gradient.
const HALO = 'color-mix(in srgb, rgb(var(--dash-card-top)) 50%, rgb(var(--dash-card-bottom)))'
const STRATA_ORDER = ['TRANSFER', 'CASH_OUT', 'GLOBAL', 'PAYMENT']
const MUTED = { fontSize: 14, lineHeight: 1.5, color: 'rgb(var(--ds-muted))', margin: 0 }
// A card that stacks its parts. The column may shrink below its content's
// width, so a row of truncating labels truncates instead of pushing past the edge.
const STACK = { padding: 22, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12, alignContent: 'start' }

const fixed = (v, n) => (typeof v === 'number' ? v.toFixed(n) : '-')

// A chip's label. A long id is shortened from the middle, because its end is
// the part that tells one row from the next: cut to its first 12 characters,
// DEMO-FULL-0529 to 0532 all read DEMO-FULL-05.
const shortId = (id) => (id.length > 16 ? `${id.slice(0, 6)}…${id.slice(-8)}` : id)

export default function BehaviourLab() {
  const [pick, setPick] = useState(0)
  const [source, setSource] = useState('fixed')
  const [liveRows, setLiveRows] = useState([])
  const [txn, setTxn] = useState(PRESETS[0].txn)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [runtime, setRuntime] = useState(null)

  // What the detector says about itself: what it serves, and how it did on
  // the held-out window. The same source as the runtime card at the bottom.
  const loadRuntime = useCallback(() => {
    getMonitorRuntime()
      .then((r) => setRuntime(r?.detectors?.behavioural ?? null))
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
  // Picking another payment replaces the working row, edits included.
  useEffect(() => { if (preset?.txn) setTxn(preset.txn) }, [preset])

  const run = useCallback(async (t) => {
    setLoading(true)
    setError(null)
    try {
      setResult(await scoreOneDetector('behavioural', t))
    } catch (err) {
      setError(err?.userMessage ?? 'The detector did not answer.')
      setResult(null)
    } finally {
      setLoading(false)
    }
  }, [])

  // Debounced: a slider fires on every pixel and each change is a round trip.
  useEffect(() => {
    const id = setTimeout(() => run(txn), 300)
    return () => clearTimeout(id)
  }, [run, txn])

  const ready = runtime?.ready ?? runtime?.status === 'ok'
  return (
    <ConsoleShell
      eyebrow="Detector · Behaviour"
      title={<>What it expected. <em>What arrived.</em></>}
      subtitle="Pick a payment, or change one, to see how far it sits from normal for its type."
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
      <BehaviourView
        presets={presets} pick={pick} onPick={setPick}
        source={source} onSource={(k) => { setSource(k); setPick(0) }} liveCount={liveRows.length}
        txn={txn} onTxn={setTxn} onReset={() => setTxn(preset.txn)}
        dirty={JSON.stringify(txn) !== JSON.stringify(preset?.txn)}
        result={result} loading={loading} error={error} runtime={runtime}
        onRun={() => run(txn)}
      />
    </ConsoleShell>
  )
}

/** The page body, drawn from data alone. */
export function BehaviourView({
  presets, pick, onPick, source, onSource, liveCount, txn, onTxn, onReset, dirty,
  result, loading, error, runtime, onRun,
}) {
  const ev = result?.evidence ?? {}
  const d = ev.vae_diagnostics ?? {}
  // `fingerprint` is the raw block from the detector, carrying the per-entry
  // shares. Older responses put only the two headline strings here.
  const fp = ev.fingerprint ?? {}
  const typ = ev.fraud_typology
  const hasShares = Boolean(fp.signal_1_reconstruction_error?.shares?.length)
  const strata = runtime?.strata ?? {}
  const typologies = Object.values(strata).reduce((n, s) => n + (s?.typologies ?? 0), 0)
  const answered = result && result.available !== false

  return (
    <div className="dash" style={{ gap: 18 }}>
      {/* What is serving, first and always open: build, uptime, volume, latency. */}
      <DetectorRuntime detector="behavioural" model="Stratified VAE + DSAA" />

      {error && <Alert tone="error">{error}</Alert>}

      <div className="dash-chips">
        {/* The switch comes first so it stays put. The chips after it change
            with the source, three known cases or four screened payments, and
            placed after them it moved every time it was used. */}
        <span className="dash-chip" role="group" aria-label="Which payments" style={{ padding: 4, gap: 2 }}>
          {[['fixed', 'Known cases'], ['live', 'Latest screened']].map(([k, label]) => {
            const on = source === k
            const off = k === 'live' && !liveCount
            // aria-disabled rather than disabled, so the reason still shows on hover.
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
        {/* Keeps the switch's highlight from running into the chosen chip's. */}
        <span aria-hidden="true" style={{ width: 1, height: 28, margin: '0 4px', background: 'rgb(var(--ds-line))' }} />

        {presets.map((p, i) => {
          const on = i === pick
          // Keyed by the whole id. Four chips sharing one key made React leave
          // three of them behind on every switch back to the known cases.
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

        {/* What is loaded, not something to pick, so it keeps to the right. */}
        <span style={{ marginLeft: 'auto', display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {runtime?.model?.models != null && (
            <span className="dash-chip"><b>{runtime.model.models}</b> models</span>
          )}
          {runtime?.model?.parameters != null && (
            <span className="dash-chip"><b>{Number(runtime.model.parameters).toLocaleString()}</b> parameters</span>
          )}
          {typologies > 0 && <span className="dash-chip"><b>{typologies}</b> typologies</span>}
        </span>
      </div>

      <div className="ds-mono" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 13,
                                         color: 'rgb(var(--ds-faint))', marginTop: -6 }}>
        <span>
          {txn.type} · {Number(txn.amount).toLocaleString()} · {txn.nameOrig} → {txn.nameDest} · step {txn.step}
        </span>
        {source === 'live' && <span>· from the monitor, so this set changes</span>}
        {dirty && <span style={{ color: 'rgb(var(--ds-warn))' }}>· edited, no longer the labelled row</span>}
      </div>

      <div className="ds-split" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 360px',
                                         gap: 18, alignItems: 'start' }}>
        <section className={CARD} style={{ padding: 22 }}>
          <div className="dash-head" style={{ marginBottom: 8 }}>
            <h2 className="dash-h dash-h-sm">Inside the model</h2>
            {d.stratum && (
              <span className="ds-mono" style={{ fontSize: 12, color: 'rgb(var(--ds-faint))' }}>
                {d.stratum} model · {strata[d.stratum]?.latent_dim ?? '-'} latent dimensions
              </span>
            )}
          </div>
          {loading && !result ? <Empty>Asking the detector…</Empty>
            : result?.available === false ? (
              <Alert tone="warning">
                This detector did not answer. {result.summary || ''} It is left out of the
                verdict, not counted as safe.
              </Alert>
            ) : hasShares ? <VaeLens fingerprint={fp} halo={HALO} />
              : <Empty>{fp.dominant_reconstruction_signal ?? 'Only the headline signals came back.'}</Empty>}
        </section>

        <aside style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
          <Inspector txn={txn} result={result} ev={ev} d={d} typ={typ} loading={loading} onRun={onRun} />
          {answered && <Composition d={d} />}
        </aside>
      </div>

      {answered && hasShares && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18 }}>
          <section className={CARD} style={STACK}>
            <h2 className="dash-h dash-h-sm">Expected against arrived</h2>
            <p style={MUTED}>{fp.signal_1_reconstruction_error?.dominant_feature_signal}</p>
            <ExpectationGap shares={fp.signal_1_reconstruction_error?.shares ?? []} />
          </section>
          <section className={CARD} style={STACK}>
            <h2 className="dash-h dash-h-sm">The fingerprint</h2>
            <FingerprintStrip fingerprint={fp} />
            <p style={MUTED}>
              Three views of the same alert, straight from the model. Grouping the first two gives the typologies.
            </p>
          </section>
          {typ?.typology_label && (
            <section className={CARD} style={{ padding: 22 }}>
              <TypologyPanel typology={typ} />
            </section>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18 }}>
        <section className={CARD} style={STACK}>
          <h2 className="dash-h dash-h-sm">What if</h2>
          <p style={MUTED}>Change the amount, the balance or the type. The model scores it again as you move.</p>
          <TransactionEditor bare txn={txn} onChange={onTxn} onReset={onReset} dirty={dirty} />
        </section>
        <ModelCard performance={runtime?.performance} stratum={d.stratum} />
      </div>

      {/* One payment shows how an alert is explained. A file shows that the
          explanations group, which a single row cannot. */}
      <section className={CARD} style={{ padding: 22 }}>
        <BatchScore />
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

/** The selected payment: its score, its band, and the facts behind them. */
function Inspector({ txn, result, ev, d, typ, loading, onRun }) {
  const score = typeof result?.score === 'number' ? result.score : null
  const level = ev.risk_level
  const colour = LEVEL[level] ?? 'rgb(var(--ds-faint))'
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
            {d.flagged == null ? (loading ? 'Scoring…' : 'Not scored yet')
              : d.flagged ? 'Above its threshold' : 'Within its normal'}
          </div>
          <div style={{ fontSize: 13, color: 'rgb(var(--ds-muted))' }}>
            {d.stratum ? `Scored by the ${d.stratum} model` : 'One model per payment type'}
          </div>
        </div>
      </div>
      <div style={{ marginTop: 14, fontSize: 14 }}>
        {[['Raw anomaly', fixed(d.raw_score, 3), true],
          ['Threshold', fixed(d.threshold, 4), true],
          ['Calibration', d.calibration_method ?? '-'],
          ['Typology', typ?.typology_label ? typ.typology_label.replaceAll('_', ' ') : '-']]
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
      {d.out_of_training_distribution && (
        <p style={{ fontSize: 13, lineHeight: 1.5, color: 'rgb(var(--ds-sev-high))', margin: '12px 0 0' }}>
          Not a trained type, so this score is less reliable.
        </p>
      )}
    </section>
  )
}

/** The three z-scores and the weights that turn them into one number. */
function Composition({ d }) {
  const zs = [
    ['Reconstruction', d.recon_z, d.weights?.alpha],
    ['KL divergence', d.kl_z, d.weights?.beta],
    ['Density', d.density_z, d.weights?.gamma],
  ].filter(([, v]) => typeof v === 'number')
  if (!zs.length) return null
  const maxZ = Math.max(...zs.map(([, v]) => Math.abs(v)), 1)
  return (
    <section className={CARD} style={{ padding: 22 }}>
      <div className="ds-section-label" style={{ marginBottom: 12 }}>How the score was composed</div>
      <div style={{ display: 'grid', gap: 12 }}>
        {zs.map(([label, v, w]) => (
          <Bar key={label} label={label} value={Math.abs(v)} max={maxZ}
               tone={Math.abs(v) > 3 ? 'risk' : 'accent'} right={`${w ?? '-'} × ${v.toFixed(2)}`} />
        ))}
      </div>
      <div className="ds-mono" style={{ fontSize: 12, color: 'rgb(var(--ds-muted))', marginTop: 12 }}>
        weighted sum {fixed(d.raw_score, 3)} against a threshold of {fixed(d.threshold, 4)}
      </div>
    </section>
  )
}

/** The detector's own held-out numbers, one stratum at a time. */
function ModelCard({ performance, stratum }) {
  const available = STRATA_ORDER.filter((s) => performance?.[s])
  const [chosen, setChosen] = useState(null)
  const s = chosen ?? (available.includes(stratum) ? stratum : available[0])
  const p = performance?.[s]
  return (
    <section className={CARD} style={{ padding: 22 }}>
      <div className="dash-head" style={{ marginBottom: 14 }}>
        <h2 className="dash-h dash-h-sm">Model card</h2>
        <span className="ds-mono" style={{ fontSize: 12, color: 'rgb(var(--ds-faint))' }}>held-out window</span>
      </div>
      {available.length > 1 && (
        <span className="dash-chip" role="group" aria-label="Model"
              style={{ padding: 4, gap: 2, height: 'auto', marginBottom: 16, flexWrap: 'wrap' }}>
          {available.map((k) => (
            <button key={k} type="button" aria-pressed={k === s} onClick={() => setChosen(k)}
                    style={{ border: 0, cursor: 'pointer', borderRadius: 12, padding: '7px 12px', fontSize: 12,
                             fontWeight: k === s ? 600 : 500,
                             background: k === s ? 'rgb(var(--dash-mint))' : 'transparent',
                             color: k === s ? 'rgb(var(--dash-on-mint))' : 'rgb(var(--ds-muted))' }}>
              {k}
            </button>
          ))}
        </span>
      )}
      {!p ? (
        <p style={MUTED}>The detector has not published its held-out numbers.</p>
      ) : p.frauds === 0 ? (
        <p style={MUTED}>
          PaySim has no fraud of this type, so there is nothing for this model to catch. It is
          the control that keeps false alarms down.
        </p>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px 10px' }}>
            {[['Precision', p.precision], ['Recall', p.recall], ['F1', p.f1],
              ['AUROC', p.auc_roc], ['PR-AUC', p.auc_pr], ['Flags at', p.threshold, true]].map(([k, v, accent]) => (
              <div key={k}>
                <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-.03em',
                              color: accent ? 'rgb(var(--dash-line-ink))' : undefined }}>
                  {v == null ? '-' : Number(v).toFixed(accent ? 4 : 3)}
                </div>
                <div style={{ fontSize: 13, color: 'rgb(var(--ds-muted))' }}>{k}</div>
              </div>
            ))}
          </div>
          <p style={{ ...MUTED, fontSize: 13, marginTop: 14 }}>
            {Number(p.rows).toLocaleString()} payments after step 595, {Number(p.frauds).toLocaleString()} of
            them fraud. The threshold was chosen on the validation weeks.
          </p>
        </>
      )}
    </section>
  )
}
