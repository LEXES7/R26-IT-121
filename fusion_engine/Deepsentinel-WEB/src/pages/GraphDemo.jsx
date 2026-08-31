import { useCallback, useRef, useState } from 'react'
import { demoScoreAccount, demoScoreCsv } from '../services/api'
import ConsoleShell from '../components/ConsoleShell'
import { Alert, Button, Input } from '../components/ui'

/**
 * Demo mode — the relational model on its own, for showing rather than deciding.
 *
 * Two things are being demonstrated here, and only the second is interesting.
 *
 * The CSV run is the ordinary one: rows in, scores out, no fusion and no other
 * detector, so every number on screen is attributable to this model.
 *
 * The second panel is the actual claim. GraphSAGE learns an aggregator — a
 * function from a neighbourhood to an embedding — rather than one fixed
 * embedding per node. So an account that did not exist when the model was
 * trained still gets a real embedding, computed from whoever it transacts
 * with. A transductive model (a plain GCN) cannot answer that question at all;
 * it has no row for a node it never saw.
 *
 * Which is why the demo is built around *changing the counterparty*. The
 * account stays identical; only its company changes; the score moves. That is
 * the inductive property happening in front of the room, not a claim on a
 * slide. The twelve features are shown alongside precisely because they are
 * derived from the transactions entered — there is no field where a number can
 * be typed straight into the model.
 *
 * Off by default. This screen runs real forward passes over real
 * neighbourhoods, and it is for testing, not for operating.
 */

const BLANK = {
  nameOrig: 'C57037472', amount: '404394.04', type: 'TRANSFER',
  oldbalanceOrg: '404394.04', newbalanceOrig: '0', oldbalanceDest: '0',
  newbalanceDest: '404394.04', step: '705',
}

function Field({ label, ...props }) {
  return (
    <label style={{ display: 'grid', gap: 4 }}>
      <span className="ds-mono text-[10px] uppercase tracking-wider"
            style={{ color: 'rgb(var(--ds-faint))' }}>{label}</span>
      <Input {...props} />
    </label>
  )
}

export default function GraphDemo() {
  const [on, setOn] = useState(false)

  // ── CSV ──────────────────────────────────────────────────────────────────
  const fileRef = useRef(null)
  const [csv, setCsv] = useState(null)
  const [csvBusy, setCsvBusy] = useState(false)

  // ── One invented account ─────────────────────────────────────────────────
  const [account, setAccount] = useState('DEMO-NEW-001')
  const [txn, setTxn] = useState(BLANK)
  const [runs, setRuns] = useState([])          // every score this session
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const onFile = useCallback(async (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setCsvBusy(true); setError(null)
    try {
      setCsv(await demoScoreCsv(f))
    } catch (err) {
      setError(err?.userMessage ?? 'That file could not be scored.')
      setCsv(null)
    } finally {
      setCsvBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }, [])

  const score = useCallback(async () => {
    setBusy(true); setError(null)
    const numeric = (v) => (v === '' || v == null ? 0 : Number(v))
    try {
      const r = await demoScoreAccount(account, [{
        step: numeric(txn.step), type: txn.type, amount: numeric(txn.amount),
        nameOrig: txn.nameOrig.trim(), nameDest: account,
        oldbalanceOrg: numeric(txn.oldbalanceOrg),
        newbalanceOrig: numeric(txn.newbalanceOrig),
        oldbalanceDest: numeric(txn.oldbalanceDest),
        newbalanceDest: numeric(txn.newbalanceDest),
      }])
      setRuns((prev) => [{ ...r, from: txn.nameOrig.trim(), at: Date.now() },
                         ...prev].slice(0, 8))
    } catch (err) {
      setError(err?.userMessage ?? 'The model did not answer.')
    } finally {
      setBusy(false)
    }
  }, [account, txn])

  const latest = runs[0]
  const distinct = new Set(runs.map((r) => r.raw_score)).size

  return (
    <ConsoleShell
      eyebrow="Relational model · demo"
      title="Demo mode"
      subtitle="The network detector on its own — no fusion, no other detectors, nothing written to a case."
    >
      {error && <Alert tone="error">{error}</Alert>}

      {/* The switch. Everything below appears only once it is on. */}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant={on ? 'primary' : 'secondary'} size="sm"
                onClick={() => setOn((v) => !v)}>
          {on ? 'Demo mode is on' : 'Start demo mode'}
        </Button>
        <span className="text-[11px]" style={{ color: 'rgb(var(--ds-muted))' }}>
          {on
            ? 'Only the relational model runs. Nothing here is recorded or alerted on.'
            : 'For testing and demonstration. Off by default.'}
        </span>
      </div>

      {!on ? null : (
        <div style={{ display: 'grid', gap: 30 }}>

          {/* ── 1. A file, scored by one model ─────────────────────────── */}
          <section style={{ display: 'grid', gap: 10 }}>
            <h2 className="text-[15px]" style={{ color: 'rgb(var(--ds-ink))' }}>
              1 · Score a file
            </h2>
            <p className="text-[12px] leading-relaxed" style={{ color: 'rgb(var(--ds-muted))' }}>
              Every row goes through the relational model and nothing else. Rows
              whose destination is already in the graph are looked up; rows whose
              destination is new are scored from their neighbourhood instead, and
              the table says which happened for each.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <input ref={fileRef} type="file" accept=".csv,text/csv"
                     onChange={onFile} className="hidden" id="demo-csv" />
              <Button size="sm" variant="secondary" loading={csvBusy}
                      onClick={() => fileRef.current?.click()}>
                Upload a CSV
              </Button>
              {csv && (
                <span className="numeric text-[11px]" style={{ color: 'rgb(var(--ds-muted))' }}>
                  {csv.counts.precomputed} looked up · {csv.counts.inductive} scored
                  from neighbours · {csv.counts.unscored} not scoreable
                </span>
              )}
            </div>

            {csv && (
              <div style={{ overflowX: 'auto' }}>
                <table className="w-full text-[11px]" style={{ borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ color: 'rgb(var(--ds-faint))' }}>
                      {['#', 'From', 'To', 'Amount', 'Score', 'How it was scored'].map((h) => (
                        <th key={h} className="ds-mono px-2 py-1 text-left text-[10px] uppercase tracking-wider"
                            style={{ borderBottom: '1px solid rgb(var(--ds-line))' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csv.rows.map((r) => (
                      <tr key={r.row}>
                        <td className="numeric px-2 py-1" style={{ color: 'rgb(var(--ds-faint))' }}>{r.row}</td>
                        <td className="numeric px-2 py-1" style={{ color: 'rgb(var(--ds-muted))' }}>{r.nameOrig}</td>
                        <td className="numeric px-2 py-1" style={{ color: 'rgb(var(--ds-ink))' }}>{r.nameDest}</td>
                        <td className="numeric px-2 py-1" style={{ color: 'rgb(var(--ds-muted))' }}>
                          {r.amount ? Number(r.amount).toLocaleString() : '—'}
                        </td>
                        <td className="numeric px-2 py-1"
                            style={{ color: r.score == null ? 'rgb(var(--ds-faint))'
                              : 'rgb(var(--ds-ink))' }}>
                          {r.score == null ? '—' : r.score.toFixed(4)}
                        </td>
                        <td className="px-2 py-1" style={{ color: 'rgb(var(--ds-muted))' }}>
                          {r.source === 'precomputed' ? 'already in the graph'
                            : r.source === 'inductive' ? 'new account · from its neighbours'
                              : (r.note ?? 'not scoreable')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ── 2. The claim ───────────────────────────────────────────── */}
          <section style={{ display: 'grid', gap: 10 }}>
            <h2 className="text-[15px]" style={{ color: 'rgb(var(--ds-ink))' }}>
              2 · Invent an account the model has never seen
            </h2>
            <p className="text-[12px] leading-relaxed" style={{ color: 'rgb(var(--ds-muted))' }}>
              Name an account that does not exist, give it one transaction from a
              real one, and it gets a score. Then change only who it received
              from and run it again. The account is identical each time — if the
              score moves, it moved because of the company it keeps. That is what
              inductive means, and it is the thing a model with one fixed
              embedding per node cannot do.
            </p>

            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
              <Field label="New account" value={account}
                     onChange={(e) => setAccount(e.target.value)} />
              <Field label="Received from (a real account)" value={txn.nameOrig}
                     onChange={(e) => setTxn({ ...txn, nameOrig: e.target.value })} />
              <Field label="Amount" value={txn.amount}
                     onChange={(e) => setTxn({ ...txn, amount: e.target.value })} />
              <Field label="Sender's balance before" value={txn.oldbalanceOrg}
                     onChange={(e) => setTxn({ ...txn, oldbalanceOrg: e.target.value })} />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm" onClick={score} loading={busy}>Score it</Button>
              {runs.length > 1 && (
                <span className="text-[11px]"
                      style={{ color: distinct > 1 ? 'rgb(var(--ds-sev-high))'
                        : 'rgb(var(--ds-muted))' }}>
                  {distinct > 1
                    ? `${distinct} different scores from ${runs.length} runs — the neighbourhood is what changed them.`
                    : 'Same score so far. Try a different sender.'}
                </span>
              )}
            </div>

            {latest && (
              <div className="grid gap-8 md:grid-cols-2">
                <div style={{ display: 'grid', gap: 8 }}>
                  <p className="ds-mono text-[10px] uppercase tracking-wider"
                     style={{ color: 'rgb(var(--ds-faint))' }}>Every run this session</p>
                  <table className="w-full text-[11px]" style={{ borderCollapse: 'collapse' }}>
                    <tbody>
                      {runs.map((r, i) => (
                        <tr key={r.at}>
                          <td className="numeric px-2 py-1"
                              style={{ color: 'rgb(var(--ds-muted))' }}>{r.from}</td>
                          <td className="numeric px-2 py-1 text-right"
                              style={{ color: i === 0 ? 'rgb(var(--ds-accent))'
                                : 'rgb(var(--ds-ink))' }}>
                            {r.raw_score.toFixed(4)}
                          </td>
                          <td className="px-2 py-1 text-right text-[10px]"
                              style={{ color: 'rgb(var(--ds-faint))' }}>
                            {r.provenance.neighbourhood_accounts.toLocaleString()} accounts aggregated
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="text-[11px] leading-relaxed" style={{ color: 'rgb(var(--ds-muted))' }}>
                    This is the raw network probability. It is not the calibrated
                    number the rest of the platform reports — the isotonic
                    calibrator was never saved as a reusable artefact, so a
                    calibrated score cannot honestly be produced on this path.
                    What is comparable is these runs against each other, and
                    against the neighbours below, all measured the same way.
                  </p>
                </div>

                <div style={{ display: 'grid', gap: 8 }}>
                  <p className="ds-mono text-[10px] uppercase tracking-wider"
                     style={{ color: 'rgb(var(--ds-faint))' }}>
                    Its twelve features, derived from that transaction
                  </p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                    {Object.entries(latest.features).map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-2">
                        <span style={{ color: 'rgb(var(--ds-muted))' }}>{k}</span>
                        <span className="numeric" style={{ color: 'rgb(var(--ds-ink))' }}>{v}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] leading-relaxed" style={{ color: 'rgb(var(--ds-muted))' }}>
                    Computed by the same arithmetic the training set was built
                    with — there is no field on this page that writes a feature
                    directly. Every number above came from the transaction.
                  </p>

                  {latest.neighbours?.length > 0 && (
                    <>
                      <p className="ds-mono mt-2 text-[10px] uppercase tracking-wider"
                         style={{ color: 'rgb(var(--ds-faint))' }}>
                        The neighbour it aggregated from
                      </p>
                      {latest.neighbours.map((n) => (
                        <div key={n.account} className="flex justify-between gap-3 text-[11px]">
                          <span className="numeric" style={{ color: 'rgb(var(--ds-muted))' }}>
                            {n.account}
                          </span>
                          <span className="numeric" style={{ color: 'rgb(var(--ds-ink))' }}>
                            {n.raw_score.toFixed(4)} raw
                          </span>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </ConsoleShell>
  )
}
