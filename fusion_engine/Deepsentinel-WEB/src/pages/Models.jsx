import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { Link } from 'react-router-dom'
import {
  getMonitorRuntime, getStoredTransaction, scoreOneDetector, searchTransactions,
} from '../services/api'
import NetworkGraph from '../components/NetworkGraph'
import GraphEvidence from '../components/GraphEvidence'
import BehaviouralEvidence from '../components/BehaviouralEvidence'
import TemporalEvidence from '../components/TemporalEvidence'
import { Badge, Footer, Panel, Progress, SectionHeading } from '../components/ConsoleShell'

/**
 * Each detector, on its own.
 *
 * Everywhere else in the platform the three models are fused, which is correct
 * for an operator — one number, one decision — and useless to anyone who has
 * to account for a single component. This page runs one model at a time
 * against one transaction and shows exactly what that model returned: its
 * score, its own reasoning, its raw response, and how long it took.
 *
 * Nothing is fused here and nothing is imputed. A detector that does not
 * answer is reported as unavailable rather than given a neutral score, which
 * is the whole reason the per-detector endpoint exists.
 */

const DETECTORS = [
  {
    key: 'graph',
    name: 'Edge-Enhanced GraphSAGE',
    reads: 'The payment network around this transaction.',
    novelty: 'Edge features carried through neighbourhood aggregation, a '
           + 'graph-aware imbalance sampler, and a suspicious-subgraph extractor '
           + 'that returns the accounts and transfers behind the score.',
    evidence: (r) => r.evidence && <>
      <NetworkGraph evidence={r.evidence} height={320} />
      <GraphEvidence evidence={r.evidence} />
    </>,
  },
  {
    key: 'behavioural',
    name: 'Stratified VAE with Dual-Signal Anomaly Attribution',
    reads: 'Whether this fits normal behaviour for its transaction type.',
    novelty: 'One autoencoder per transaction type, trained only on non-fraud '
           + 'traffic, with reconstruction error and latent distance attributed '
           + 'back to individual features.',
    evidence: (r) => r.evidence && <BehaviouralEvidence evidence={r.evidence} />,
  },
  {
    key: 'temporal',
    name: 'Transaction-Sequence TCN with fraud_attention',
    reads: 'The transactions immediately preceding this one.',
    novelty: 'A dilated causal TCN over a system-wide 32-transaction window, '
           + 'with a self-attention layer that names the single prior '
           + 'transaction that drove the score.',
    evidence: (r) => r.evidence && <TemporalEvidence evidence={r.evidence} />,
  },
]

const pick = (o, keys) => keys.map((k) => o?.[k]).find((v) => v !== undefined)

export default function Models() {
  const { canRunAnalysis } = useAuth()
  const [runtime, setRuntime] = useState(null)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState([])
  const [txn, setTxn] = useState(null)
  const [results, setResults] = useState({})
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    getMonitorRuntime().then(setRuntime).catch(() => {})
  }, [])

  useEffect(() => {
    let dead = false
    const t = setTimeout(() => {
      searchTransactions(query)
        .then((d) => !dead && setHits(d.transactions ?? []))
        .catch(() => !dead && setHits([]))
    }, 250)
    return () => { dead = true; clearTimeout(t) }
  }, [query])

  const choose = useCallback(async (id) => {
    setError(null); setResults({})
    try {
      const { transaction } = await getStoredTransaction(id)
      setTxn(transaction)
    } catch (e) {
      setError(e?.response?.data?.detail ?? 'Could not load that transaction.')
    }
  }, [])

  const runOne = useCallback(async (key) => {
    if (!txn) return
    setBusy(key); setError(null)
    try {
      const r = await scoreOneDetector(key, txn)
      setResults((p) => ({ ...p, [key]: r }))
    } catch (e) {
      setResults((p) => ({ ...p, [key]: { error: e?.response?.data?.detail ?? 'Failed.' } }))
    } finally { setBusy(null) }
  }, [txn])

  const runAll = () => DETECTORS.forEach((d) => runOne(d.key))

  return (
    <div className="ds-fade-up" style={{ display: 'grid', gap: 16 }}>

      <Panel className="ds-panel-pad">
        <SectionHeading
          label="Pick a transaction"
          title={txn ? txn.transaction_id : 'Nothing selected'}
          action={<button className="ds-btn ds-btn-primary" onClick={runAll}
                          disabled={!txn || busy}>
            {busy ? 'Running…' : 'Run every detector'}
          </button>}
        />
        <input className="ds-field" value={query} placeholder="Transaction id or account…"
               onChange={(e) => setQuery(e.target.value)} />
        <div className="ds-scroll" style={{ maxHeight: 150, overflowY: 'auto', marginTop: 9 }}>
          {hits.slice(0, 20).map((t) => (
            <button key={t.transaction_id} onClick={() => choose(t.transaction_id)}
                    style={{ all: 'unset', cursor: 'pointer', display: 'flex', width: '100%',
                             gap: 10, padding: '6px 6px', borderRadius: 5, alignItems: 'center',
                             background: txn?.transaction_id === t.transaction_id
                               ? 'rgb(var(--ds-surface-2))' : undefined }}>
              <span className="ds-mono" style={{ fontSize: 10, flex: 1 }}>{t.transaction_id}</span>
              <span style={{ fontSize: 9, color: 'rgb(var(--ds-muted))' }}>
                {t.type} · {Number(t.amount).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </button>
          ))}
          {hits.length === 0 && (
            <div style={{ fontSize: 10, color: 'rgb(var(--ds-faint))', padding: '8px 0' }}>
              No ingested transactions yet — upload a file on Batch upload.
            </div>
          )}
        </div>
        {error && (
          <div style={{ marginTop: 10, background: 'rgb(var(--ds-signal-soft))',
                        color: 'rgb(var(--ds-signal))', borderRadius: 6,
                        padding: 10, fontSize: 11 }}>{error}</div>
        )}
      </Panel>

      {DETECTORS.map((d) => {
        const live = pick(runtime?.detectors, [d.key, 'behavioral'])
        const r = results[d.key]
        const ready = Boolean(live?.ready)
        return (
          <Panel key={d.key} className="ds-panel-pad">
            <SectionHeading
              label={d.reads}
              title={d.name}
              action={
                <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Badge tone={ready ? 'good' : live?.reachable ? 'warn' : ''}>
                    {ready ? 'ready' : live?.reachable ? 'no model' : 'offline'}
                  </Badge>
                  <button className="ds-btn" onClick={() => runOne(d.key)}
                          disabled={!txn || busy === d.key}>
                    {busy === d.key ? 'Running…' : 'Run this model'}
                  </button>
                </span>
              }
            />

            <p style={{ fontSize: 10, lineHeight: 1.6, color: 'rgb(var(--ds-muted))',
                        margin: '0 0 14px', maxWidth: 720 }}>
              {d.novelty}
            </p>

            {!r ? (
              <div className="ds-empty">
                Not run. Pick a transaction above and run this model on its own —
                no fusion, no retrieval, just what this detector returns.
              </div>
            ) : r.error ? (
              <div style={{ background: 'rgb(var(--ds-signal-soft))',
                            color: 'rgb(var(--ds-signal))', borderRadius: 6,
                            padding: 11, fontSize: 11 }}>{r.error}</div>
            ) : (
              <>
                <div style={{ display: 'grid', gap: 16, alignItems: 'center',
                              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                              paddingBottom: 14 }}>
                  <div>
                    <div className="ds-section-label">Its score</div>
                    <div className="ds-mono" style={{ fontSize: 25, marginTop: 6,
                          color: r.available ? 'rgb(var(--ds-signal))' : 'rgb(var(--ds-faint))' }}>
                      {r.available && typeof r.score === 'number' ? r.score.toFixed(4) : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="ds-section-label">Answered</div>
                    <div style={{ fontSize: 11, marginTop: 8 }}>
                      {r.available ? 'yes' : 'no — it abstained'}
                    </div>
                  </div>
                  <div>
                    <div className="ds-section-label">Latency</div>
                    <div className="ds-mono" style={{ fontSize: 11, marginTop: 8 }}>
                      {r.latency_ms} ms
                    </div>
                  </div>
                  <div>
                    <div className="ds-section-label">Served from</div>
                    <div className="ds-mono" style={{ fontSize: 9, marginTop: 8,
                          color: 'rgb(var(--ds-muted))' }}>{r.endpoint}</div>
                  </div>
                </div>

                {r.available && typeof r.score === 'number' && (
                  <div style={{ marginBottom: 14 }}>
                    <Progress value={r.score * 100}
                              color={r.score >= 0.7 ? 'rgb(var(--ds-signal))'
                                : r.score >= 0.4 ? 'rgb(var(--ds-warn))' : undefined} />
                  </div>
                )}

                {r.summary && (
                  <div style={{ background: 'rgb(var(--ds-workspace))', borderRadius: 6,
                                padding: 12, fontSize: 11, lineHeight: 1.6, marginBottom: 14 }}>
                    <span className="ds-section-label">In its own words</span>
                    <div style={{ marginTop: 6 }}>{r.summary}</div>
                  </div>
                )}

                {d.evidence(r)}

                <details style={{ marginTop: 14 }}>
                  <summary style={{ cursor: 'pointer', fontSize: 10,
                                    color: 'rgb(var(--ds-muted))' }}>
                    Raw response from this service
                  </summary>
                  <pre className="ds-mono ds-scroll" style={{ maxHeight: 260, overflow: 'auto',
                        fontSize: 9.5, lineHeight: 1.5, marginTop: 9, padding: 11,
                        background: 'rgb(var(--ds-workspace))', borderRadius: 6 }}>
                    {JSON.stringify(r.raw, null, 2)}
                  </pre>
                </details>
              </>
            )}
          </Panel>
        )
      })}

      {/* Fusion owns no detector of its own; it owns what happens to all three. */}
      <Panel className="ds-panel-pad">
        <SectionHeading
          label="Reconciles all three"
          title="Fusion engine, retrieval and forensic reporting"
          action={canRunAnalysis
            ? <Link to="/analyzer" className="ds-btn">Open the analyzer →</Link>
            : null}
        />
        <p style={{ fontSize: 10, lineHeight: 1.6, color: 'rgb(var(--ds-muted))',
                    margin: '0 0 12px', maxWidth: 720 }}>
          A meta-classifier combines the three scores above into one calibrated
          probability, applying an uncertainty penalty when a detector abstains.
          The fused profile then retrieves the closest FATF typology, and
          Chain-of-Evidence prompting constrains the report to cite only that
          typology and the scores actually supplied.
        </p>
        <div style={{ display: 'grid', gap: 10,
                      gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
          {/* This page is in the administrator's navigation, and the analyzer
              is not theirs to open. Described either way; linked only when the
              link goes somewhere. */}
          {[
            ['Fused verdict + typology', 'Run a transaction on the Analyzer.', '/analyzer'],
            ['Forensic report and PDF', 'Generated per run; “Save as PDF” prints it.', '/analyzer'],
            ['Grounded vs ungrounded', 'Tick “Also run without retrieval”.', '/analyzer'],
            ['SAR draft', 'Watermarked, never filed, from a scored analysis.', '/analyzer'],
          ].map(([t, sub, to]) => {
            const Tag = canRunAnalysis ? Link : 'div'
            return (
              <Tag key={t} {...(canRunAnalysis ? { to } : {})}
                   style={{ all: 'unset', cursor: canRunAnalysis ? 'pointer' : 'default',
                            background: 'rgb(var(--ds-workspace))', borderRadius: 6, padding: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 600 }}>{t}</div>
                <div style={{ fontSize: 10, color: 'rgb(var(--ds-muted))', marginTop: 5 }}>{sub}</div>
              </Tag>
            )
          })}
        </div>
      </Panel>

      <Footer left="Each detector scored independently." />
    </div>
  )
}
