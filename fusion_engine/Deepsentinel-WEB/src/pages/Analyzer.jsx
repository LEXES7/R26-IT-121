import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import AblationComparison from '../components/AblationComparison'
import TransactionForm from '../components/TransactionForm'
import GraphEvidence from '../components/GraphEvidence'
import NetworkGraph from '../components/NetworkGraph'
import BehaviouralEvidence from '../components/BehaviouralEvidence'
import TemporalEvidence from '../components/TemporalEvidence'
import ForensicReport from '../components/ForensicReport'
import SarDraft from '../components/SarDraft'
import Locked from '../components/Locked'
import PipelineDiagram from '../components/PipelineDiagram'
import ConsoleShell, { Footer } from '../components/ConsoleShell'
import { Gauge } from './FusionLab'
import { usePackage } from '../hooks/usePackage'
import { STAGE_IDS, useAnalysisStream } from '../hooks/useAnalysisStream'
import {
  downloadAnalysisReport, getSampleTransaction, getStoredTransaction, getThresholds,
  searchTransactions,
} from '../services/api'

/**
 * One transaction, through every stage.
 *
 * Laid out as a run sheet: what to analyse across the top, the five stages
 * as they run, then the payment beside the verdict, the evidence each
 * detector returned, and the report. Nothing here is illustrative — a figure
 * appears only once a run has produced it, and a detector that did not answer
 * says so rather than showing a neutral score that looks like a measurement.
 */

const SCENARIOS = [
  { value: 'mule_network', label: 'Mule network', short: 'Hub-and-spoke fund routing' },
  { value: 'layering', label: 'Layering', short: 'Multi-hop transfer chain' },
  { value: 'smurfing', label: 'Smurfing', short: 'Below-threshold structuring' },
  { value: 'account_takeover', label: 'Account takeover', short: 'Unauthorised drain' },
  { value: 'velocity_fraud', label: 'Velocity fraud', short: 'Automated rapid transfers' },
  { value: 'legitimate', label: 'Legitimate', short: 'Normal customer activity' },
]

const MODES = [['pick', 'Choose'], ['live', 'Random'], ['manual', 'Manual'], ['scenario', 'Scenario']]

const STAGES = {
  input: ['Transaction', 'record in'],
  models: ['Three models', 'in parallel'],
  fusion: ['Fusion', 'meta-classifier'],
  retrieval: ['Typology', 'FATF retrieval'],
  report: ['Forensic report', 'chain of evidence'],
}

const SEV = {
  CRITICAL: 'rgb(var(--ds-sev-critical))',
  HIGH: 'rgb(var(--ds-sev-high))',
  MEDIUM: 'rgb(var(--ds-sev-medium))',
  LOW: 'rgb(var(--ds-sev-low))',
}

// label, contributions key, result field prefix, colour, model
const DETECTORS = [
  ['Network', 'graph', 'graph', 'rgb(var(--modality-graph))', 'Edge-Enhanced GraphSAGE'],
  ['Behaviour', 'behavioural', 'behavioral', 'rgb(var(--modality-behavioral))', 'Stratified VAE, dual-signal'],
  ['Timing', 'temporal', 'temporal', 'rgb(var(--modality-temporal))', 'Transaction-Sequence TCN'],
]

const money = (n) =>
  typeof n === 'number' ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '-'
const ms = (v) => (typeof v !== 'number' ? null : v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${Math.round(v)} ms`)
const pct = (v) => (typeof v === 'number' ? `${(v * 100).toFixed(0)}%` : null)

export default function Analyzer() {
  const [mode, setMode] = useState('pick')
  const [scenario, setScenario] = useState('mule_network')
  const [includeBaseline, setIncludeBaseline] = useState(false)
  const [txn, setTxn] = useState(null)
  const [pulling, setPulling] = useState(false)
  const [error, setError] = useState(null)
  // A search started elsewhere (the dashboard, the Network page) arrives as ?q=.
  const [params] = useSearchParams()
  const [query, setQuery] = useState(() => params.get('q') ?? '')
  const [hits, setHits] = useState([])
  const [listOpen, setListOpen] = useState(() => Boolean(params.get('q')))
  const [bands, setBands] = useState(null)
  const [saving, setSaving] = useState(false)
  const [lastRun, setLastRun] = useState(null)
  const sarRef = useRef(null)

  const { stages, result, running, error: runError, run } = useAnalysisStream()
  const { has, upsells } = usePackage()

  useEffect(() => {
    getThresholds().then((t) => setBands(t?.bands ?? null)).catch(() => setBands(null))
  }, [])

  useEffect(() => {
    if (mode !== 'pick') return undefined
    let dead = false
    const t = setTimeout(() => {
      searchTransactions(query)
        .then((d) => !dead && (setHits(d.transactions ?? []), setError(null)))
        .catch((e) => !dead && setError(e?.response?.data?.detail ?? 'Could not read stored transactions.'))
    }, 250)
    return () => { dead = true; clearTimeout(t) }
  }, [query, mode])

  const choose = useCallback(async (id) => {
    setError(null)
    try {
      const { transaction } = await getStoredTransaction(id)
      setTxn(transaction)
      setListOpen(false)
    } catch (e) {
      setError(e?.response?.data?.detail ?? 'Could not load that transaction.')
    }
  }, [])

  const pull = useCallback(async () => {
    setPulling(true); setError(null)
    try {
      const { transaction } = await getSampleTransaction()
      setTxn(transaction)
    } catch (e) {
      setError(e?.response?.data?.detail ?? 'Could not reach the graph service.')
    } finally { setPulling(false) }
  }, [])

  // Every way of starting a run goes through here, so Run again repeats
  // exactly what was last sent, whichever mode sent it.
  const start = useCallback((body) => {
    setLastRun(body)
    run(body)
  }, [run])

  const go = () => {
    if (mode === 'scenario') {
      start({ use_mock: true, mock_scenario: scenario, include_baseline: includeBaseline })
    } else if (txn) {
      start({ transaction: txn, include_baseline: includeBaseline })
    }
  }

  const download = async () => {
    if (result?.analysis_id == null) return
    setSaving(true); setError(null)
    try {
      await downloadAnalysisReport(result.analysis_id)
    } catch (e) {
      setError(e?.userMessage ?? 'That report could not be rendered as a PDF.')
    } finally { setSaving(false) }
  }

  const hasRun = Boolean(result) || running || Object.values(stages).some((s) => s.status !== 'idle')
  const sevColour = result ? (SEV[result.classification] ?? SEV.LOW) : null
  const contrib = result?.contributions ?? {}
  const rows = DETECTORS.map(([label, key, field, colour, model]) => ({
    label, colour, model,
    score: result?.[`${field}_score`],
    available: result?.[`${field}_available`],
    signal: result?.[`${field}_signal`],
    push: contrib[key],
  }))
  // Manual runs come from the form, so the slip shows what was submitted;
  // otherwise it shows what is loaded. A scenario brings no real payment.
  const shownTxn = mode === 'manual' ? lastRun?.transaction ?? null
    : mode === 'scenario' ? null : txn
  // A payment loaded after the last run has not been through it yet, and
  // the verdict beside it belongs to something else; say so.
  const unrun = Boolean(result && shownTxn && lastRun?.transaction?.transaction_id !== shownTxn.transaction_id)
  const anyEvidence = result?.graph_evidence || result?.behavioral_evidence || result?.temporal_evidence
  const canGo = mode === 'scenario' || (mode !== 'manual' && Boolean(txn))
  const card = 'dash-card'

  return (
    <ConsoleShell
      eyebrow="Workspace · Observe"
      title={<>One payment. <em>Every stage.</em></>}
      subtitle="Pick a transaction, run it, and read why."
      actions={
        <>
          <button className="ds-btn" disabled={!lastRun || running} onClick={() => lastRun && run(lastRun)}>
            Run again
          </button>
          <button className="ds-btn" disabled={!result?.analysis_id || !has('sar_draft')}
                  onClick={() => sarRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
            Draft SAR
          </button>
          <button className="ds-btn ds-btn-primary" onClick={download}
                  disabled={result?.analysis_id == null || saving}>
            {saving ? 'Preparing…' : 'Download PDF'}
          </button>
        </>
      }
    >
      <div className="dash" style={{ gap: 18 }}>

        {/* ── what to analyse ── */}
        <section className={card} style={{ padding: '14px 16px', display: 'flex', gap: 12,
                                           alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="dash-chip" role="group" aria-label="Source" style={{ padding: 4, gap: 2 }}>
            {MODES.map(([v, label]) => (
              <button key={v} type="button" aria-pressed={mode === v} onClick={() => setMode(v)}
                      style={{ border: 0, cursor: 'pointer', borderRadius: 12, padding: '8px 14px', fontSize: 13,
                               fontWeight: mode === v ? 600 : 500,
                               background: mode === v ? 'rgb(var(--dash-mint))' : 'transparent',
                               color: mode === v ? 'rgb(var(--dash-on-mint))' : 'rgb(var(--ds-muted))' }}>
                {label}
              </button>
            ))}
          </span>

          {mode === 'pick' && (
            <div className="dash-chip dash-search" style={{ flex: 1, minWidth: 260 }}>
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor"
                   strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
                <path d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.35-4.35" />
              </svg>
              <input value={query} placeholder="Transaction id or account" aria-label="Transaction id or account"
                     className="ds-mono" onFocus={() => setListOpen(true)}
                     onChange={(e) => { setQuery(e.target.value); setListOpen(true) }} />
              <span style={{ fontSize: 12, color: 'rgb(var(--ds-faint))', whiteSpace: 'nowrap' }}>
                {hits.length ? `${hits.length} stored` : query ? 'no match' : ''}
              </span>
            </div>
          )}
          {mode === 'live' && (
            <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, minWidth: 260 }}>
              <button className="ds-btn" onClick={pull} disabled={pulling}>
                {pulling ? 'Pulling…' : txn ? 'Pull another' : 'Pull a transaction'}
              </button>
              <span style={{ fontSize: 13, color: 'rgb(var(--ds-muted))' }}>A real payment from the graph.</span>
            </span>
          )}
          {mode === 'manual' && (
            <span style={{ flex: 1, minWidth: 260, fontSize: 13, color: 'rgb(var(--ds-muted))' }}>
              Fill in the payment below and run it from the form.
            </span>
          )}
          {mode === 'scenario' && (
            <span style={{ flex: 1, minWidth: 260, fontSize: 13, color: 'rgb(var(--ds-sev-medium))' }}>
              Simulated detector scores. Fusion, retrieval and the report are real.
            </span>
          )}

          <label className="dash-chip" style={{ gap: 10, cursor: 'pointer', position: 'relative' }}>
            <input type="checkbox" role="switch" checked={includeBaseline}
                   onChange={(e) => setIncludeBaseline(e.target.checked)}
                   style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }} />
            <span aria-hidden="true" style={{
              width: 40, height: 22, borderRadius: 99, padding: 3, display: 'flex', boxSizing: 'border-box',
              justifyContent: includeBaseline ? 'flex-end' : 'flex-start',
              background: includeBaseline ? 'rgb(var(--dash-line))' : 'rgb(var(--ds-line))' }}>
              <span style={{ width: 16, height: 16, borderRadius: 99, background: '#fff' }} />
            </span>
            Also run without retrieval
          </label>

          {mode !== 'manual' && (
            <button className="ds-btn ds-btn-primary" onClick={go} disabled={!canGo || running}>
              {running ? 'Running…' : mode === 'scenario' ? 'Run scenario' : 'Analyse'}
            </button>
          )}

          {/* Stored matches drop down from the search, and fold away once one is chosen. */}
          {mode === 'pick' && listOpen && (
            <div style={{ flexBasis: '100%', maxHeight: 236, overflowY: 'auto',
                          borderTop: '1px solid rgb(var(--ds-line))', paddingTop: 6 }}>
              {hits.length === 0 ? (
                <div style={{ fontSize: 14, color: 'rgb(var(--ds-faint))', padding: '8px 6px' }}>
                  {query ? 'Nothing matches that.' : 'No transactions yet. Upload a file first.'}
                </div>
              ) : hits.map((t) => (
                <button key={t.transaction_id} type="button" onClick={() => choose(t.transaction_id)}
                        style={{ all: 'unset', cursor: 'pointer', display: 'flex', width: '100%', boxSizing: 'border-box',
                                 gap: 12, alignItems: 'center', padding: '9px 10px', borderRadius: 12,
                                 background: txn?.transaction_id === t.transaction_id ? 'rgb(var(--ds-surface-2))' : undefined }}>
                  <span style={{ width: 8, height: 8, borderRadius: 99, flex: 'none',
                                 background: t.case_ref ? 'rgb(var(--ds-sev-critical))'
                                   : typeof t.fused_score === 'number' ? 'rgb(var(--ds-sev-low))' : 'rgb(var(--ds-faint))' }} />
                  <span className="ds-mono" style={{ fontSize: 14, flex: 1, minWidth: 0,
                                                     overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {t.transaction_id}
                  </span>
                  <span style={{ fontSize: 13, color: 'rgb(var(--ds-muted))' }}>{t.type} · {money(t.amount)}</span>
                  <span className="ds-mono" style={{ fontSize: 13, minWidth: 70, textAlign: 'right', whiteSpace: 'nowrap',
                          color: t.case_ref ? 'rgb(var(--ds-sev-critical))' : 'rgb(var(--ds-faint))' }}>
                    {typeof t.fused_score === 'number' ? t.fused_score.toFixed(3) : 'not scored'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        {(error || runError) && (
          <div role="alert" style={{ background: 'color-mix(in srgb, rgb(var(--ds-sev-critical)) 12%, transparent)',
                                     color: 'rgb(var(--ds-sev-critical))', borderRadius: 16, padding: '12px 16px',
                                     fontSize: 14 }}>
            {error || runError}
          </div>
        )}

        {mode === 'manual' && (
          <section className={card} style={{ padding: 22 }}>
            <h2 className="dash-h dash-h-sm" style={{ marginBottom: 12 }}>Your payment</h2>
            <TransactionForm onSubmit={(t) => start({ transaction: t, include_baseline: includeBaseline })}
                             loading={running} />
          </section>
        )}

        {mode === 'scenario' && (
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
            {SCENARIOS.map((s) => (
              <button key={s.value} type="button" aria-pressed={scenario === s.value} onClick={() => setScenario(s.value)}
                      className="dash-card"
                      style={{ cursor: 'pointer', textAlign: 'left', padding: '14px 16px', font: 'inherit', color: 'inherit',
                               borderColor: scenario === s.value ? 'rgb(var(--dash-line))' : undefined,
                               background: scenario === s.value ? 'color-mix(in srgb, rgb(var(--dash-line)) 10%, transparent)' : undefined }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{s.label}</div>
                <div style={{ fontSize: 13, color: 'rgb(var(--ds-muted))', marginTop: 3 }}>{s.short}</div>
              </button>
            ))}
          </div>
        )}

        {/* ── the five stages, as they run ── */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', overflowX: 'auto' }}>
          {STAGE_IDS.map((id, i) => {
            const s = stages[id] ?? {}
            const [title, sub] = STAGES[id] ?? [id, '']
            const live = s.status === 'running'
            const tone = s.status === 'done' ? 'rgb(var(--ds-sev-low))'
              : s.status === 'error' ? 'rgb(var(--ds-sev-critical))'
                : live ? 'rgb(var(--dash-line))' : 'rgb(var(--ds-faint))'
            return (
              <div key={id} style={{ display: 'contents' }}>
                {i > 0 && <span aria-hidden="true" style={{ alignSelf: 'center', color: 'rgb(var(--ds-faint))' }}>→</span>}
                <div className="dash-card" title={s.message ?? undefined}
                     style={{ flex: 1, minWidth: 150, padding: '12px 14px',
                              borderColor: live ? 'rgb(var(--dash-line) / .7)' : undefined }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="ds-mono" style={{ fontSize: 11, color: 'rgb(var(--ds-faint))' }}>0{i + 1}</span>
                    <span aria-label={s.status ?? 'idle'} style={{
                      width: 18, height: 18, borderRadius: 99, display: 'grid', placeItems: 'center',
                      fontSize: 11, fontWeight: 800, color: tone,
                      background: `color-mix(in srgb, ${tone} 18%, transparent)` }}>
                      {s.status === 'done' ? '✓' : s.status === 'error' ? '×' : s.status === 'skipped' ? '-' : live ? '•' : ''}
                    </span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginTop: 6 }}>{title}</div>
                  <div style={{ fontSize: 12, color: 'rgb(var(--ds-muted))' }}>{sub}</div>
                  <div className="ds-mono" style={{ fontSize: 12, marginTop: 8,
                                                    color: live ? 'rgb(var(--dash-line-ink))' : 'rgb(var(--ds-muted))' }}>
                    {live ? 'running' : s.status === 'skipped' ? 'skipped'
                      : s.status === 'error' ? 'failed' : ms(s.durationMs) ?? (hasRun ? 'waiting' : '-')}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* ── the payment beside the verdict ── */}
        <div className="ds-split" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(320px, 400px)',
                                           gap: 18, alignItems: 'stretch' }}>
          <section className={card} style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
              <h2 className="dash-h dash-h-sm">The payment</h2>
              <span className="ds-mono" style={{ fontSize: 13, color: 'rgb(var(--ds-muted))' }}>
                {shownTxn?.transaction_id ?? result?.transaction_id ?? ''}
              </span>
            </div>
            {unrun && (
              <p style={{ fontSize: 13, color: 'rgb(var(--ds-sev-medium))', margin: '8px 0 0' }}>
                Loaded, not analysed yet. The verdict and evidence below are for{' '}
                <span className="ds-mono">{result.transaction_id}</span>.
              </p>
            )}
            {shownTxn ? <Slip t={shownTxn} /> : (
              <div style={{ marginTop: 14, border: '1.5px dashed rgb(var(--ds-line))', borderRadius: 20,
                            padding: '34px 16px', textAlign: 'center', fontSize: 14, color: 'rgb(var(--ds-muted))' }}>
                {mode === 'scenario' ? 'A scenario brings its own payment. Run it to see the verdict.'
                  : 'No transaction loaded. Choose one above.'}
              </div>
            )}
            {result && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginTop: 16 }}>
                  {rows.map((r) => (
                    <div key={r.label} style={{ border: '1px solid rgb(var(--ds-line))', borderRadius: 18, padding: '12px 14px',
                                                display: 'flex', gap: 12, alignItems: 'center' }}>
                      <Ring value={r.available ? r.score : null} colour={r.colour} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 600 }}>{r.label}</div>
                        <div style={{ fontSize: 13, color: 'rgb(var(--ds-muted))', whiteSpace: 'nowrap',
                                      overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {!r.available ? 'not deployed'
                            : typeof r.push === 'number'
                              ? <>pushed <b className="ds-mono" style={{ color: 'rgb(var(--ds-ink))' }}>
                                  {r.push >= 0 ? '+' : ''}{r.push.toFixed(2)}</b></>
                              : r.model}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: 13, color: 'rgb(var(--ds-muted))', margin: '14px 0 0' }}>
                  {result.modalities_used < 3
                    ? `Only ${result.modalities_used} of 3 detectors answered, so this is less certain.`
                    : 'All three detectors answered. Their evidence is below, and the report cites each score.'}
                </p>
              </>
            )}
          </section>

          <section className={card} style={{ padding: 24, textAlign: 'center' }}>
            <div className="ds-section-label" style={{ textAlign: 'left' }}>Fused verdict</div>
            {result ? (
              <>
                <div style={{ marginTop: 4 }}>
                  <Gauge value={Number(result.fraud_confidence_score ?? 0)} bands={bands} />
                </div>
                <div style={{ fontSize: 52, fontWeight: 700, letterSpacing: '-.05em', lineHeight: 1, marginTop: -6 }}>
                  {Number(result.fraud_confidence_score ?? 0).toFixed(3)}
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  <span className="ds-badge" style={{ color: sevColour, borderColor: 'transparent',
                                                      background: `color-mix(in srgb, ${sevColour} 16%, transparent)` }}>
                    <span style={{ width: 7, height: 7, borderRadius: 99, background: sevColour }} />
                    {result.classification}
                  </span>
                  <span className="ds-badge" style={{ borderColor: 'transparent' }}>
                    {result.modalities_used} of 3 answered
                  </span>
                </div>
                <div style={{ textAlign: 'left', marginTop: 18 }}>
                  {[['Matched typology', result.retrieval?.typology_name],
                    ['FATF id', result.retrieval?.typology_id, true],
                    ['Similarity', typeof result.retrieval?.similarity_score === 'number'
                      ? `${(result.retrieval.similarity_score * 100).toFixed(1)}%, retrieved` : null, true]]
                    .filter(([, v]) => v)
                    .map(([k, v, mono]) => <Fact key={k} k={k} v={v} mono={mono} />)}
                  {!result.retrieval?.typology_name && (
                    <p style={{ fontSize: 13, color: 'rgb(var(--ds-muted))', margin: '10px 0 0' }}>No typology matched.</p>
                  )}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 15, color: 'rgb(var(--ds-muted))', padding: '60px 0' }}>
                {running ? 'Scoring…' : 'No verdict yet.'}
              </div>
            )}
          </section>
        </div>

        {/* ── what each detector found ── */}
        {anyEvidence && (
          <Locked feature="attribution_panels" has={has} upsells={upsells}
                  title="Detailed attribution is not included in your package">
            <div style={{ display: 'grid', gap: 18 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 18 }}>
                <NetworkCard row={rows[0]} ev={result.graph_evidence} />
                <BehaviourCard row={rows[1]} ev={result.behavioral_evidence} />
                <TimingCard row={rows[2]} ev={result.temporal_evidence} />
              </div>
              <details className={card} style={{ padding: '16px 22px' }}>
                <summary style={{ cursor: 'pointer', fontSize: 15, fontWeight: 600 }}>Full evidence from each detector</summary>
                <div style={{ display: 'grid', gap: 14, marginTop: 14 }}>
                  {result.graph_evidence && <NetworkGraph evidence={result.graph_evidence} />}
                  {result.graph_evidence && <GraphEvidence evidence={result.graph_evidence} />}
                  {result.behavioral_evidence && <BehaviouralEvidence evidence={result.behavioral_evidence} />}
                  {result.temporal_evidence && <TemporalEvidence evidence={result.temporal_evidence} />}
                </div>
              </details>
            </div>
          </Locked>
        )}

        {/* ── the report, and what follows from it ── */}
        {(result || running) && (
          <div className="ds-split" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)',
                                             gap: 18, alignItems: 'start' }}>
            <Locked feature="forensic_report" has={has} upsells={upsells}
                    title="Forensic reporting is not included in your package">
              <ForensicReport
                report={result?.forensic_report}
                loading={running && !result?.forensic_report}
                durationMs={stages?.report?.durationMs}
                transactionId={result?.transaction_id}
                analysisId={result?.analysis_id}
              />
            </Locked>
            <div ref={sarRef} style={{ display: 'grid', gap: 18, scrollMarginTop: 20 }}>
              {result?.analysis_id ? (
                <Locked feature="sar_draft" has={has} upsells={upsells}
                        title="SAR drafting is not included in your package">
                  <SarDraft analysisId={result.analysis_id} classification={result.classification} />
                </Locked>
              ) : (
                <section className={card} style={{ padding: 22 }}>
                  <h2 className="dash-h dash-h-sm">Regulatory report</h2>
                  <p style={{ fontSize: 14, color: 'rgb(var(--ds-muted))', margin: '6px 0 0' }}>
                    {running ? 'Available once the run is saved.' : 'This run was not saved, so there is nothing to draft from.'}
                  </p>
                </section>
              )}
              {!result?.baseline_report && (
                <section className={card} style={{ padding: '16px 20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                    <b style={{ fontSize: 14 }}>Grounded vs ungrounded</b>
                    <span className="ds-badge" style={{ borderColor: 'transparent' }}>{includeBaseline ? 'on next run' : 'off'}</span>
                  </div>
                  <p style={{ fontSize: 13, color: 'rgb(var(--ds-muted))', margin: '6px 0 0', lineHeight: 1.5 }}>
                    Turn on "Also run without retrieval" to compare this report with one written without the knowledge base.
                  </p>
                </section>
              )}
            </div>
          </div>
        )}

        {result?.baseline_report && (
          <section className={card} style={{ padding: 22 }}>
            <AblationComparison groundedReport={result.forensic_report} baselineReport={result.baseline_report} />
          </section>
        )}

        {/* The full stage-by-stage readout, for whoever wants the detail behind the strip. */}
        <details className={card} style={{ padding: '16px 22px' }}>
          <summary style={{ cursor: 'pointer', fontSize: 15, fontWeight: 600 }}>
            {hasRun ? 'Stages, as they ran' : 'The five stages, input to report'}
          </summary>
          <div style={{ overflowX: 'auto', marginTop: 14 }}>
            <PipelineDiagram stages={hasRun ? stages : null} running={running} live={hasRun} />
          </div>
        </details>

        <Footer left="Model versions and citations travel with every verdict." />
      </div>
    </ConsoleShell>
  )
}

function Fact({ k, v, mono }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '9px 0',
                  borderTop: '1px solid rgb(var(--ds-line))', fontSize: 14 }}>
      <span style={{ color: 'rgb(var(--ds-muted))' }}>{k}</span>
      <span className={mono ? 'ds-mono' : undefined} style={{ textAlign: 'right' }}>{v}</span>
    </div>
  )
}

function Ring({ value, colour, size = 56 }) {
  const has = typeof value === 'number'
  return (
    <div style={{ width: size, height: size, borderRadius: 99, flex: 'none', display: 'grid', placeItems: 'center',
                  background: has ? `conic-gradient(${colour} 0 ${value * 100}%, rgb(var(--ds-surface-3)) 0 100%)`
                    : 'rgb(var(--ds-surface-3))' }}>
      <div style={{ width: size - 12, height: size - 12, borderRadius: 99, display: 'grid', placeItems: 'center',
                    background: 'rgb(var(--dash-card-top))', fontSize: 14, fontWeight: 700, letterSpacing: '-.02em' }}>
        {has ? value.toFixed(2) : '-'}
      </div>
    </div>
  )
}

/** The payment as a slip: amount, then who paid whom and what it did to their balances. */
function Slip({ t }) {
  return (
    <div style={{ marginTop: 14, border: '1px dashed rgb(var(--ds-line))', borderRadius: 22, padding: '18px 20px',
                  background: 'rgb(var(--ds-surface-2) / .5)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <span className="ds-section-label">Payment</span>
        <span className="ds-mono" style={{ fontSize: 12, color: 'rgb(var(--ds-muted))' }}>
          step {t.step ?? '-'} · {t.type ?? '-'}
        </span>
      </div>
      <div style={{ fontSize: 42, fontWeight: 700, letterSpacing: '-.04em', marginTop: 8 }}>{money(t.amount)}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)', gap: 12,
                    alignItems: 'center', marginTop: 14 }}>
        <Party label="Sender" id={t.nameOrig} before={t.oldbalanceOrg} after={t.newbalanceOrig} />
        <span aria-hidden="true" style={{ width: 38, height: 38, borderRadius: 99, display: 'grid', placeItems: 'center',
                                          background: 'rgb(var(--ds-surface-3))' }}>→</span>
        <Party label="Beneficiary" id={t.nameDest} before={t.oldbalanceDest} after={t.newbalanceDest} />
      </div>
    </div>
  )
}

function Party({ label, id, before, after }) {
  const drained = typeof before === 'number' && before > 0 && after === 0
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 12, color: 'rgb(var(--ds-muted))' }}>{label}</div>
      <div className="ds-mono" style={{ fontSize: 14, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis' }}>{id ?? '-'}</div>
      {(typeof before === 'number' || typeof after === 'number') && (
        <div className="ds-mono" style={{ fontSize: 12, color: 'rgb(var(--ds-muted))', marginTop: 4 }}>
          {money(before)} → <b style={{ color: drained ? 'rgb(var(--ds-sev-critical))' : undefined }}>{money(after)}</b>
        </div>
      )}
    </div>
  )
}

function DetectorHead({ row, note }) {
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
        <h2 className="dash-h dash-h-sm">{row.label}</h2>
        <span className="ds-mono" style={{ color: row.available ? row.colour : 'rgb(var(--ds-faint))' }}>
          {row.available && typeof row.score === 'number' ? row.score.toFixed(3) : 'not deployed'}
        </span>
      </div>
      <div style={{ fontSize: 13, color: 'rgb(var(--ds-muted))', marginTop: 2 }}>{note}</div>
    </>
  )
}

function NoEvidence({ row }) {
  return (
    <p style={{ fontSize: 14, color: 'rgb(var(--ds-muted))', lineHeight: 1.5, margin: '14px 0 0' }}>
      {row.available ? (row.signal ?? 'No evidence came back with this score.')
        : 'No answer, so it was left out and the result marked less certain.'}
    </p>
  )
}

/** The money's neighbourhood: the receiving account in the middle, the transfers that triggered it in red. */
function NetworkCard({ row, ev }) {
  const sink = ev?.sink_account
  const nodes = (ev?.nodes ?? []).slice(0, 24)
  const edges = ev?.edges ?? []
  const W = 330, H = 190, cx = W / 2, cy = H / 2 - 6
  const others = nodes.filter((n) => n.account_id !== sink)
  const pos = new Map([[sink, [cx, cy]]])
  others.forEach((n, i) => {
    const a = (i / Math.max(1, others.length)) * Math.PI * 2 - Math.PI / 2
    const r = i % 2 ? 72 : 60
    pos.set(n.account_id, [cx + Math.cos(a) * r * 1.7, cy + Math.sin(a) * r])
  })
  const hot = new Set(edges.filter((e) => e.is_trigger_edge).map((e) => e.src))
  const struct = ev?.structural_evidence ?? {}
  return (
    <section className="dash-card" style={{ padding: 22 }}>
      <DetectorHead row={row} note={sink
        ? <>Funds converge on <span className="ds-mono" style={{ color: 'rgb(var(--ds-ink))' }}>{sink}</span></>
        : row.model} />
      {!ev ? <NoEvidence row={row} /> : (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" style={{ display: 'block', marginTop: 8 }}
               aria-label={`${nodes.length} accounts around ${sink ?? 'the account'}`}>
            {edges.map((e, i) => {
              const a = pos.get(e.src), b = pos.get(e.dst)
              if (!a || !b) return null
              return <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]}
                           stroke={e.is_trigger_edge ? 'rgb(var(--ds-sev-critical))' : 'rgb(var(--ds-line))'}
                           strokeWidth={e.is_trigger_edge ? 2.6 : 1.2} strokeOpacity={e.is_trigger_edge ? 0.85 : 1} />
            })}
            {others.map((n) => {
              const [x, y] = pos.get(n.account_id)
              return <circle key={n.account_id} cx={x} cy={y} r={hot.has(n.account_id) ? 7 : 5}
                             fill={hot.has(n.account_id) ? 'rgb(var(--ds-sev-critical))' : 'rgb(var(--dash-mint))'} />
            })}
            {sink && (
              <>
                <circle cx={cx} cy={cy} r="15" fill="rgb(var(--ds-sev-critical))" />
                <circle cx={cx} cy={cy} r="21" fill="none" stroke="rgb(var(--dash-line))" strokeWidth="2" />
              </>
            )}
          </svg>
          <div>
            {[['Accounts', ev.node_count ?? nodes.length], ['Transfers', ev.edge_count ?? edges.length],
              ['Converging senders', struct.convergence_count], ['Known mules', struct.mules_in_subgraph]]
              .filter(([, v]) => v != null)
              .map(([k, v]) => <Fact key={k} k={k} v={v} mono />)}
          </div>
        </>
      )}
    </section>
  )
}

/** Which features the VAE could not rebuild, as shares of the reconstruction error. */
function BehaviourCard({ row, ev }) {
  const diag = ev?.vae_diagnostics ?? {}
  const shares = [...(ev?.fingerprint?.signal_1_reconstruction_error?.shares ?? [])]
    .sort((a, b) => (b.share ?? 0) - (a.share ?? 0)).slice(0, 4)
  const top = Math.max(...shares.map((s) => s.share ?? 0), 0.0001)
  const threshold = diag.calibrated_threshold ?? diag.threshold
  const typology = ev?.fraud_typology?.typology_label
  return (
    <section className="dash-card" style={{ padding: 22 }}>
      <DetectorHead row={row} note={shares.length ? 'What drove the score' : row.model} />
      {!ev ? <NoEvidence row={row} /> : (
        <>
          {shares.map((s) => (
            <div key={s.feature} style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, gap: 10 }}>
                <span className="ds-mono">{s.feature}</span>
                <span className="ds-mono" style={{ color: 'rgb(var(--ds-muted))' }}>{pct(s.share)}</span>
              </div>
              <div className="ds-progress" style={{ marginTop: 6 }}>
                <span style={{ width: `${Math.max(3, ((s.share ?? 0) / top) * 100)}%`, background: row.colour }} />
              </div>
            </div>
          ))}
          <div style={{ marginTop: 14 }}>
            {[['Scored by', diag.stratum ? `${diag.stratum} model` : null],
              ['Anomaly score', typeof diag.raw_score === 'number' ? diag.raw_score.toFixed(3) : null, true],
              ['Threshold', typeof threshold === 'number' ? threshold.toFixed(3) : null, true],
              ['Nearest typology', typology && typology !== 'UNASSIGNED' ? typology : null]]
              .filter(([, v]) => v != null)
              .map(([k, v, mono]) => <Fact key={k} k={k} v={v} mono={mono} />)}
          </div>
        </>
      )}
    </section>
  )
}

/** The earlier payment the TCN leaned on most, and how hard. */
function TimingCard({ row, ev }) {
  const p = ev?.triggering_predecessor
  const current = ev?.current_transaction ?? {}
  const back = typeof p?.offset_from_current === 'number' ? Math.abs(p.offset_from_current) : null
  return (
    <section className="dash-card" style={{ padding: 22 }}>
      <DetectorHead row={row} note={p ? 'The earlier payment it leaned on' : row.model} />
      {!ev ? <NoEvidence row={row} /> : (
        <>
          {p ? (
            <div style={{ marginTop: 14, border: '1px solid rgb(var(--ds-line))', borderRadius: 18, padding: '14px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13 }}>
                <span className="ds-mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {p.composite_id ?? p.nameOrig ?? 'Predecessor'}
                </span>
                {back != null && (
                  <span style={{ color: 'rgb(var(--ds-muted))', whiteSpace: 'nowrap' }}>
                    {back} payment{back === 1 ? '' : 's'} earlier
                  </span>
                )}
              </div>
              {typeof p.attention_weight === 'number' && (
                <>
                  <div className="ds-progress" style={{ marginTop: 10 }}>
                    <span style={{ width: `${Math.max(3, Math.min(100, p.attention_weight * 100))}%`, background: row.colour }} />
                  </div>
                  <div className="ds-mono" style={{ fontSize: 12, color: 'rgb(var(--ds-muted))', marginTop: 6 }}>
                    attention {p.attention_weight.toFixed(3)}
                  </div>
                </>
              )}
              {p.predecessor_signal && (
                <p style={{ fontSize: 13, lineHeight: 1.5, margin: '10px 0 0' }}>{p.predecessor_signal}</p>
              )}
            </div>
          ) : <NoEvidence row={row} />}
          {current.fraud_signal_summary && (
            <p style={{ fontSize: 13, lineHeight: 1.5, color: 'rgb(var(--ds-muted))', margin: '14px 0 0' }}>
              {current.fraud_signal_summary}
            </p>
          )}
          <div style={{ marginTop: 10 }}>
            {[['Drain ratio', current.drain_ratio], ['Destination was empty', current.dest_was_empty],
              ['Risk level', ev.risk_level]]
              .filter(([, v]) => v != null)
              .map(([k, v]) => (
                <Fact key={k} k={k} mono
                      v={typeof v === 'boolean' ? (v ? 'yes' : 'no') : typeof v === 'number' ? v.toFixed(3) : v} />
              ))}
          </div>
        </>
      )}
    </section>
  )
}
