import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getBriefing, getCase, listCases, reviewCase, sendBriefing } from '../services/api'
import NetworkGraph from '../components/NetworkGraph'
import GraphEvidence from '../components/GraphEvidence'
import BehaviouralEvidence from '../components/BehaviouralEvidence'
import TemporalEvidence from '../components/TemporalEvidence'
import ModalityVerdict from '../components/ModalityVerdict'
import CaseMechanism from '../components/CaseMechanism'
import { Alert, Severity, cx } from '../components/ui'
import { Badge, Footer, Metric, Panel, SectionHeading } from '../components/ConsoleShell'

/**
 * The case desk.
 *
 * Two things an analyst does all day: work through what is waiting, and decide
 * on one case. Both happen on one screen — the queue on the left, the case
 * under the cursor rendered in full on the right — because a triage tool that
 * makes you navigate away to see the evidence is a tool that gets guessed at
 * instead of read.
 *
 * Keyboard first. A queue of a hundred is worked with hands on keys: j/k to
 * move, f/d/i to decide. The verdict feeds the retraining set, so it is
 * attributed and audited rather than being a local UI state.
 *
 * A case is addressable at /cases/CASE-2026-08-26-A3F9, so it can be sent to a
 * colleague. Access is still authenticated; the link is a pointer, not a key.
 */

const SEV = {
  CRITICAL: { hex: 'rgb(var(--ds-sev-critical))', label: 'Critical', rank: 4 },
  HIGH:     { hex: 'rgb(var(--ds-sev-high))', label: 'High',     rank: 3 },
  MEDIUM:   { hex: 'rgb(var(--ds-sev-medium))', label: 'Medium',   rank: 2 },
  LOW:      { hex: 'rgb(var(--ds-sev-low))', label: 'Low',      rank: 1 },
}
const ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']

const REVIEW_LABEL = {
  open: 'Open', investigating: 'Investigating',
  confirmed_fraud: 'Confirmed fraud', false_positive: 'False positive',
  closed: 'Closed',
}
const FILTERS = [
  ['open', 'Open'], ['investigating', 'Investigating'],
  ['confirmed_fraud', 'Confirmed'], ['false_positive', 'False positive'],
  ['all', 'All'],
]

const score = (v) => (typeof v === 'number' ? v.toFixed(3) : '—')
const when = (s) => (s ? String(s).slice(0, 19).replace('T', ' ') : '—')
const tidy = (s) => (s ? String(s).toLowerCase().replace(/_/g, ' ') : null)
const since = (iso) => {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const m = Math.round((Date.now() - t) / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`
}

export default function Cases() {
  const { caseRef } = useParams()
  return caseRef ? <CaseDetail caseRef={caseRef} /> : <CaseQueue />
}

/* ═══════════════════════════ the queue ═══════════════════════════ */

function CaseQueue() {
  const navigate = useNavigate()
  const [cases, setCases] = useState([])
  const [filter, setFilter] = useState('open')
  const [error, setError] = useState(null)
  const [cursor, setCursor] = useState(0)
  const [busy, setBusy] = useState(false)
  const [brief, setBrief] = useState(null)
  const [briefOpen, setBriefOpen] = useState(false)
  const rowsRef = useRef(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const d = await listCases(filter === 'all' ? { limit: 200 } : { review_status: filter, limit: 200 })
      setCases(d.cases ?? [])
      setCursor(0)
    } catch (e) {
      setError(e?.response?.data?.detail ?? 'Could not load cases.')
    }
  }, [filter])

  useEffect(() => { load() }, [load])

  const decide = useCallback(async (verdict) => {
    const c = cases[cursor]
    if (!c || busy) return
    setBusy(true)
    try {
      await reviewCase(c.case_ref, verdict)
      // Drop it from the list rather than refetching: the analyst's place in
      // the queue is the thing being preserved.
      setCases((list) => list.filter((x) => x.case_ref !== c.case_ref))
      setCursor((i) => Math.min(i, Math.max(cases.length - 2, 0)))
    } catch (e) {
      setError(e?.response?.data?.detail ?? 'Could not record that decision.')
    } finally {
      setBusy(false)
    }
  }, [cases, cursor, busy])

  // Keyboard triage. Ignored while typing so it cannot fire from a text field.
  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return
      if (e.key === 'j' || e.key === 'ArrowDown') setCursor((i) => Math.min(i + 1, cases.length - 1))
      else if (e.key === 'k' || e.key === 'ArrowUp') setCursor((i) => Math.max(i - 1, 0))
      else if (e.key === 'f') decide('confirmed_fraud')
      else if (e.key === 'd') decide('false_positive')
      else if (e.key === 'i') decide('investigating')
      else if (e.key === 'Enter' && cases[cursor]) navigate(`/cases/${cases[cursor].case_ref}`)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cases, cursor, decide, navigate])

  // Keep the cursor in view when it is driven from the keyboard.
  useEffect(() => {
    rowsRef.current?.children?.[cursor]?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  const selected = cases[cursor] ?? null

  const stats = useMemo(() => {
    const acc = { sev: {}, urgent: 0, labelled: 0 }
    cases.forEach((x) => {
      acc.sev[x.classification] = (acc.sev[x.classification] || 0) + 1
      if (x.classification === 'CRITICAL' || x.classification === 'HIGH') acc.urgent += 1
      if (x.label_is_fraud !== null && x.label_is_fraud !== undefined) acc.labelled += 1
    })
    return acc
  }, [cases])

  return (
    <div className="ds-fade-up" style={{ display: 'grid', gap: 15 }}>

      {/* ── the figures, then the queue ── */}
      <div style={{ display: 'grid', gap: 11,
                    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <Metric label={filter === 'all' ? 'All cases' : REVIEW_LABEL[filter]}
                value={cases.length} meta="in this view" tone="accent" />
        {ORDER.map((k) => (
          <Metric key={k} label={SEV[k].label} value={stats.sev[k] ?? 0}
                  meta={stats.sev[k] ? 'awaiting a decision' : 'none'}
                  tone={k === 'CRITICAL' && stats.sev[k] ? 'alert' : ''} />
        ))}
        <Metric label="Ground truth" value={stats.labelled} meta="labelled by the source file" />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between',
                    gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {FILTERS.map(([f, label]) => (
            <button key={f} onClick={() => setFilter(f)}
                    className={`ds-btn ${filter === f ? 'ds-btn-primary' : 'ds-btn-quiet'}`}>
              {label}
            </button>
          ))}
        </div>
        <button className="ds-btn" onClick={() => {
          setBriefOpen((o) => !o)
          if (!brief) getBriefing().then(setBrief).catch(() => {})
        }}>
          Daily briefing {briefOpen ? '↑' : '↓'}
        </button>
      </div>

      {/* ── briefing, folded away until asked for ── */}
      {briefOpen && (
        <Panel className="ds-panel-pad">
          <SectionHeading
            label="Last 24 hours" title="What was caught, and what is still waiting"
            action={<button className="ds-btn ds-btn-quiet"
              onClick={() => sendBriefing()
                .then(() => setBrief((b) => ({ ...(b || {}), sent: true })))
                .catch((e) => setError(e?.response?.data?.detail ?? 'Send failed.'))}>
              Email it →
            </button>}
          />
          {brief?.sent && (
            <div style={{ fontSize: 10, color: 'rgb(var(--ds-accent-strong))', marginBottom: 8 }}>
              Briefing sent.
            </div>
          )}
          <pre className="ds-mono ds-scroll" style={{ maxHeight: 240, overflow: 'auto',
                whiteSpace: 'pre-wrap', fontSize: 10, lineHeight: 1.6, margin: 0,
                color: 'rgb(var(--ds-muted))' }}>
            {brief?.text ?? 'Loading…'}
          </pre>
        </Panel>
      )}

      {error && (
        <div style={{ background: 'rgb(var(--ds-signal-soft))', color: 'rgb(var(--ds-signal))',
                      borderRadius: 6, padding: 11, fontSize: 11 }}>{error}</div>
      )}

      {/* ═══ list · preview ══════════════════════════════════════════ */}
      <div style={{ display: 'grid', gap: 12,
                    gridTemplateColumns: 'minmax(0, 24rem) minmax(0, 1fr)' }}>

        {/* ── the queue itself ── */}
        <Panel style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '17px 17px 0' }}>
            <SectionHeading label="Queue" title={`${cases.length} in view`}
              action={<span className="ds-mono" style={{ fontSize: 10,
                      color: 'rgb(var(--ds-muted))' }}>newest first</span>} />
          </div>
          <div style={{ padding: '0 10px 12px' }}>
          {cases.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">
              {filter === 'open' ? 'No cases are waiting for review.' : 'No cases with that status.'}
            </p>
          ) : (
            <div ref={rowsRef} className="rows mt-1 max-h-[36rem] overflow-y-auto lg:max-h-[46rem]">
              {cases.map((c, i) => (
                <button
                  key={c.case_ref}
                  onClick={() => setCursor(i)}
                  onDoubleClick={() => navigate(`/cases/${c.case_ref}`)}
                  className={cx(
                    'flex w-full items-center gap-3 py-2.5 pl-2 pr-1 text-left transition-colors',
                    i === cursor ? 'bg-surface-raised' : 'hover:bg-surface',
                  )}
                >
                  {/* Rank, not just hue. The stripe alone was invisible on a
                      projector and gone entirely in a printed case list. */}
                  <Severity level={c.classification} showLabel={false}
                            className="shrink-0" />
                  {/* The selected row used a fixed near-white ink, which is
                      invisible on the light theme's paper ground. */}
                  <span className="numeric w-12 shrink-0 text-sm"
                        style={{ color: i === cursor
                          ? 'rgb(var(--ds-ink))' : 'rgb(var(--ds-muted))' }}>
                    {score(c.fused_score)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs text-slate-400">
                      {tidy(c.graph_pattern) ?? tidy(c.typology_name) ?? 'no typology matched'}
                    </span>
                    <span className="numeric block truncate text-[10px] text-slate-600">
                      {c.case_ref}
                    </span>
                  </span>
                  {c.label_is_fraud !== null && c.label_is_fraud !== undefined && (
                    <span className={cx('h-1.5 w-1.5 shrink-0 rounded-full',
                      c.label_is_fraud ? 'bg-risk-critical' : 'bg-slate-700')}
                      title={c.label_is_fraud ? 'labelled fraud' : 'labelled clean'} />
                  )}
                  <span className="w-8 shrink-0 text-right text-[10px] text-slate-600">
                    {since(c.detected_at)}
                  </span>
                </button>
              ))}
            </div>
          )}

          </div>
          <div style={{ padding: '11px 17px 15px', borderTop: '1px solid rgb(var(--ds-line))',
                        fontSize: 9, color: 'rgb(var(--ds-faint))', lineHeight: 1.7 }}>
            <Key>j</Key><Key>k</Key> move · <Key>f</Key> confirm fraud ·{' '}
            <Key>d</Key> false positive · <Key>i</Key> investigating · <Key>↵</Key> open in full
          </div>
        </Panel>

        {/* ── the case under the cursor ── */}
        <Panel className="ds-panel-pad" style={{ minWidth: 0 }}>
          {selected
            ? <Preview key={selected.case_ref} c={selected} busy={busy} onDecide={decide} />
            : (
              <div className="hair flex h-full min-h-[24rem] items-center justify-center rounded-xl border border-dashed px-8 text-center">
                <div>
                  <p className="display text-2xl text-slate-300">Nothing selected.</p>
                  <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-500">
                    Cases appear here as the monitor screens the ingestion queue.
                  </p>
                </div>
              </div>
            )}
        </Panel>
      </div>

      <Footer left="Decisions are attributed and audited." />
    </div>
  )
}

/* ── the preview pane ─────────────────────────────────────────────── */

function Preview({ c, busy, onDecide }) {
  const navigate = useNavigate()
  const sev = SEV[c.classification] ?? { hex: 'rgb(var(--ds-faint))', label: c.classification }

  return (
    <div>
      <div className="hair-b flex flex-wrap items-end justify-between gap-4 pb-4">
        <div className="min-w-0">
          <p className="eyebrow flex items-center gap-2 text-slate-500">
            <Severity level={c.classification} />
            <span className="text-slate-600">· {when(c.detected_at)}</span>
          </p>
          <p className="display mt-2 text-[2rem] leading-none text-slate-100">
            {score(c.fused_score)}
            <span className="ml-3 align-middle text-base text-slate-500">
              {tidy(c.graph_pattern) ?? tidy(c.typology_name) ?? 'no typology matched'}
            </span>
          </p>
          <p className="numeric mt-2 text-[11px] text-slate-600">{c.case_ref}</p>
        </div>
        <button
          onClick={() => navigate(`/cases/${c.case_ref}`)}
          className="text-xs text-accent-400 transition-colors hover:text-accent-300"
        >
          Full case →
        </button>
      </div>

      <ModalityStrip c={c} />

      {c.graph_evidence?.nodes?.length ? (
        <div className="mt-5">
          <NetworkGraph evidence={c.graph_evidence} height={320} />
        </div>
      ) : (
        <p className="hair mt-5 rounded-xl border border-dashed px-6 py-10 text-center text-xs text-slate-600">
          No network was recorded for this case.
        </p>
      )}

      {c.forensic_report && (
        <section className="mt-6">
          <h3 className="hair-b pb-2 text-xs font-semibold text-slate-200">Forensic report</h3>
          <p className="mt-3 max-h-40 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-slate-400">
            {c.forensic_report}
          </p>
        </section>
      )}

      {/* the decision */}
      <div className="hair-t mt-6 flex flex-wrap items-center gap-2 pt-5">
        <span className="eyebrow mr-2 text-slate-500">Decide</span>
        <Verdict onClick={() => onDecide('confirmed_fraud')} disabled={busy} k="f" primary>
          Confirm fraud
        </Verdict>
        <Verdict onClick={() => onDecide('false_positive')} disabled={busy} k="d">
          False positive
        </Verdict>
        <Verdict onClick={() => onDecide('investigating')} disabled={busy} k="i">
          Investigating
        </Verdict>
        {c.label_is_fraud !== null && c.label_is_fraud !== undefined && (
          <span className="ml-auto text-[11px] text-slate-500">
            Source file says{' '}
            <b style={{ color: c.label_is_fraud ? SEV.CRITICAL.hex : undefined }}
               className={c.label_is_fraud ? '' : 'text-slate-300'}>
              {c.label_is_fraud ? 'fraud' : 'not fraud'}
            </b>
          </span>
        )}
      </div>
    </div>
  )
}

/** The three detectors as bars, so a missing one is visibly missing. */
function ModalityStrip({ c }) {
  const rows = [
    ['Relational', c.graph_score, c.graph_available, 'var(--modality-graph)'],
    ['Behavioural', c.behavioral_score, c.behavioral_available, 'var(--modality-behavioral)'],
    ['Temporal', c.temporal_score, c.temporal_available, 'var(--modality-temporal)'],
  ]
  return (
    <div className="mt-5 grid gap-4 sm:grid-cols-3">
      {rows.map(([label, v, ok, hue]) => (
        <div key={label}>
          <div className="flex items-baseline justify-between">
            <span className="eyebrow text-slate-500">{label}</span>
            <span className={cx('numeric text-xs', ok ? 'text-slate-200' : 'text-slate-600')}>
              {ok && typeof v === 'number' ? v.toFixed(3) : '—'}
            </span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-overlay">
            {ok && typeof v === 'number' && (
              <div className="h-full rounded-full"
                   style={{ width: `${Math.max(2, v * 100)}%`, background: `rgb(${hue})` }} />
            )}
          </div>
          <p className="mt-1.5 text-[10px] text-slate-600">
            {ok ? 'contributed' : 'not deployed'}
          </p>
        </div>
      ))}
      {c.uncertainty_penalty_applied && (
        <p className="text-[10px] leading-relaxed text-slate-500 sm:col-span-3">
          Only {c.modalities_used} of 3 detectors contributed, so an uncertainty
          penalty was applied.
        </p>
      )}
    </div>
  )
}

/* ═══════════════════════════ one case ════════════════════════════ */

function CaseDetail({ caseRef }) {
  const navigate = useNavigate()
  const [c, setC] = useState(null)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)

  const load = useCallback(() => {
    getCase(caseRef).then(setC)
      .catch((e) => setError(e?.response?.data?.detail ?? 'Case not found.'))
  }, [caseRef])
  useEffect(load, [load])

  const decide = async (verdict) => {
    try {
      setC(await reviewCase(caseRef, verdict))
      load()
    } catch (e) {
      setError(e?.response?.data?.detail ?? 'Could not record that decision.')
    }
  }

  if (error) return <div className="mx-auto max-w-3xl px-5 py-10"><Alert tone="error">{error}</Alert></div>
  if (!c) return <div className="mx-auto max-w-3xl px-5 py-10 text-sm text-slate-500">Loading…</div>

  const sev = SEV[c.classification] ?? { hex: 'rgb(var(--ds-faint))', label: c.classification }
  const nodes = c.graph_evidence?.nodes?.length ?? 0

  return (
    <div className="mx-auto max-w-[88rem] px-5 pb-16 pt-8 sm:px-8">

      <div className="flex items-center justify-between gap-3 print:hidden">
        <button onClick={() => navigate('/cases')}
                className="text-xs text-slate-500 transition-colors hover:text-slate-300">
          ← All cases
        </button>
        <button
          onClick={() => {
            navigator.clipboard?.writeText(window.location.href)
            setCopied(true); setTimeout(() => setCopied(false), 2000)
          }}
          className="text-xs text-slate-500 transition-colors hover:text-slate-300"
        >
          {copied ? 'Link copied' : 'Copy link'}
        </button>
      </div>

      {/* ═══ the statement ═══ */}
      <header className="hair-b mt-5 pb-7">
        <p className="eyebrow text-slate-500">
          <span className="numeric normal-case tracking-normal">{c.case_ref}</span>
          <span className="text-slate-600"> · detected {when(c.detected_at)}</span>
        </p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-6">
          <h1 className="display max-w-2xl text-[2.75rem] text-slate-100 sm:text-[3.5rem]">
            <span style={{ color: sev.hex }}>{sev.label}.</span>{' '}
            <span className="display-italic text-slate-400">
              {nodes >= 2
                ? `${nodes} accounts, one destination.`
                : tidy(c.graph_pattern) ?? tidy(c.typology_name) ?? 'No typology matched.'}
            </span>
          </h1>
          <div>
            <p className="eyebrow text-slate-500">Fused confidence</p>
            <p className="numeric mt-2 text-[2.5rem] leading-none text-slate-100">
              {score(c.fused_score)}
            </p>
          </div>
        </div>

        <dl className="mt-7 grid grid-cols-2 gap-y-5 sm:grid-cols-3 lg:grid-cols-6">
          <Figure value={c.graph_available ? c.graph_score : null} label="Relational" decimals />
          <Figure value={c.behavioral_available ? c.behavioral_score : null} label="Behavioural" decimals />
          <Figure value={c.temporal_available ? c.temporal_score : null} label="Temporal" decimals />
          <Figure value={c.modalities_used} suffix="/3" label="Detectors" />
          <Figure value={c.screening_ms} suffix="ms" label="Screening" />
          <Figure value={c.total_ms} suffix="ms" label="End to end" />
        </dl>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-8">

          <ModalityVerdict c={c} />

          <CaseMechanism c={c} />

          {nodes >= 2 ? (
            <section>
              <div className="hair-b flex flex-wrap items-baseline gap-3 pb-2.5">
                <h2 className="text-sm font-semibold text-slate-100">The network</h2>
                <span className="text-[11px] text-slate-500">
                  edge thickness is the attention the model paid
                </span>
                {c.sink_account && (
                  <span className="numeric ml-auto text-[11px] text-slate-600">
                    sink {c.sink_account}
                  </span>
                )}
              </div>
              <div className="mt-4">
                <NetworkGraph evidence={c.graph_evidence} height={420} />
              </div>
            </section>
          ) : (
            <section className="hair rounded-xl border border-dashed px-8 py-14 text-center">
              <p className="display text-2xl text-slate-300">No network was recorded.</p>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-500">
                The relational detector either did not run or found nothing
                structurally connected to this transaction.
              </p>
            </section>
          )}

          {/* Each detector's own evidence, in the modality order used
              everywhere else. The drawing above is the relational model's
              subgraph; this is what it read off it — pattern, sink, the
              transfers ranked by attention, the accounts implicated and their
              roles. Without it the case gives the behavioural model a full
              account of itself and the other two a picture. */}
          {c.graph_evidence && <GraphEvidence evidence={c.graph_evidence} />}

          {c.behavioral_evidence ? (
            <BehaviouralEvidence evidence={c.behavioral_evidence} />
          ) : c.behavioral_available ? (
            <section className="hair rounded-xl border border-dashed px-6 py-8 text-center">
              <p className="text-sm text-slate-400">
                The behavioural detector scored this case, but no attribution was
                recorded with it.
              </p>
              <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-slate-600">
                Cases written before the attribution was stored show the score
                alone.
              </p>
            </section>
          ) : null}

          {c.temporal_evidence ? (
            <TemporalEvidence evidence={c.temporal_evidence} />
          ) : (
            // Rendered rather than omitted: a case that simply stops after two
            // detectors reads as though there were only ever two. Saying the
            // third has not shipped is a different statement from saying it
            // found nothing, and only one of them is true.
            <section className="hair rounded-xl border border-dashed px-8 py-12 text-center">
              <p className="display text-2xl text-slate-300">
                {c.temporal_available
                  ? 'The temporal detector left no working.'
                  : 'The temporal detector has not shipped.'}
              </p>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-500">
                {c.temporal_available
                  ? 'It scored this case but recorded no evidence with the score.'
                  : 'When it does, this is where the 32-transaction window ending '
                    + 'here will appear, with the one earlier transaction it '
                    + 'weighted most heavily.'}
              </p>
            </section>
          )}

          {c.forensic_report && (
            <section>
              <div className="hair-b flex items-baseline justify-between pb-2.5">
                <h2 className="text-sm font-semibold text-slate-100">Forensic report</h2>
                <span className="text-[11px] text-slate-500">generated at detection time</span>
              </div>
              <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-slate-400">
                {c.forensic_report}
              </p>
            </section>
          )}

          <section>
            <div className="hair-b flex items-baseline justify-between pb-2.5">
              <h2 className="text-sm font-semibold text-slate-100">What happened</h2>
              <span className="text-[11px] text-slate-500">from the recorded timestamps</span>
            </div>
            <ol className="mt-5 space-y-0">
              {(c.timeline ?? []).map((t, i, arr) => (
                <li key={i} className="relative flex gap-4 pb-5 last:pb-0">
                  <div className="flex flex-col items-center">
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-accent-500" />
                    {i < arr.length - 1 && <span className="mt-1 w-px flex-1" style={{ background: 'var(--hair-strong)' }} />}
                  </div>
                  <div className="min-w-0 pb-1">
                    <p className="text-sm font-medium text-slate-200">{t.stage}</p>
                    <p className="mt-0.5 text-xs text-slate-400">{t.detail}</p>
                    <p className="numeric mt-0.5 text-[10px] text-slate-600">{when(t.at)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        {/* ═══ the rail ═══ */}
        <aside className="space-y-7 lg:hair-l lg:pl-7">
          <section className="print:hidden">
            <div className="flex items-baseline justify-between">
              <h3 className="text-xs font-semibold text-slate-200">Review</h3>
              <span className="text-[10px] text-slate-600">
                {REVIEW_LABEL[c.review_status] ?? c.review_status}
              </span>
            </div>
            {c.reviewed_by && (
              <p className="mt-2 text-[11px] text-slate-500">
                {c.reviewed_by} · {when(c.reviewed_at)}
              </p>
            )}
            <div className="mt-3 flex flex-col gap-2">
              <Verdict onClick={() => decide('confirmed_fraud')} k="" primary block>
                Confirm fraud
              </Verdict>
              <Verdict onClick={() => decide('false_positive')} k="" block>False positive</Verdict>
              <Verdict onClick={() => decide('investigating')} k="" block>Investigating</Verdict>
              <Verdict onClick={() => decide('closed')} k="" block>Close</Verdict>
            </div>
            <p className="mt-3 text-[10px] leading-relaxed text-slate-600">
              Recorded against your name and used to build the retraining set.
            </p>
          </section>

          <section>
            <h3 className="text-xs font-semibold text-slate-200">Typology</h3>
            <p className="mt-2 text-xs text-slate-400">
              {c.typology_name ?? 'None matched'}
            </p>
            {c.typology_id && (
              <p className="numeric mt-1 text-[10px] text-slate-600">{c.typology_id}</p>
            )}
          </section>

          <section>
            <h3 className="text-xs font-semibold text-slate-200">Alert</h3>
            {c.alert_sent ? (
              <>
                <p className="mt-2 text-xs text-slate-400">Sent {when(c.alerted_at)}</p>
                <p className="mt-1 text-[10px] text-slate-600">
                  {(c.recipients ?? []).length} recipient
                  {(c.recipients ?? []).length === 1 ? '' : 's'}
                </p>
              </>
            ) : (
              <p className="mt-2 text-xs text-slate-500">
                Below the alerting threshold — recorded, not escalated.
              </p>
            )}
          </section>

          {c.label_is_fraud !== null && c.label_is_fraud !== undefined && (
            <section>
              <h3 className="text-xs font-semibold text-slate-200">Ground truth</h3>
              <p className="mt-2 text-xs" style={{ color: c.label_is_fraud ? SEV.CRITICAL.hex : undefined }}>
                <span className={c.label_is_fraud ? '' : 'text-slate-300'}>
                  {c.label_is_fraud ? 'Fraud' : 'Not fraud'}
                </span>
              </p>
              <p className="mt-1.5 text-[10px] leading-relaxed text-slate-600">
                From the source file. Shown for measuring the system after the
                fact — it was not available to any model at scoring time.
              </p>
            </section>
          )}
        </aside>
      </div>
    </div>
  )
}

/* ── pieces ───────────────────────────────────────────────────────── */

function Figure({ value, label, suffix, hex, decimals }) {
  const shown = typeof value === 'number'
    ? (decimals ? value.toFixed(3) : value)
    : '—'
  return (
    <div>
      <dd className="numeric text-[1.75rem] leading-none"
          style={{ color: hex }}>
        <span className={hex ? '' : typeof value === 'number' ? 'text-slate-100' : 'text-slate-600'}>
          {shown}
        </span>
        {suffix && typeof value === 'number' && <span className="text-slate-600">{suffix}</span>}
      </dd>
      <dt className="eyebrow mt-2 text-slate-500">{label}</dt>
    </div>
  )
}

function Verdict({ onClick, disabled, k, primary, block, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cx(
        'inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50',
        block && 'w-full justify-between',
        primary
          ? 'bg-accent-500 text-[#04231f] hover:bg-accent-400'
          : 'bg-surface-raised text-slate-300 hover:bg-surface-hover hover:text-slate-100',
      )}
    >
      {children}
      {k && (
        <kbd className={cx('numeric rounded px-1 text-[10px]',
          primary ? 'bg-black/20' : 'bg-surface-overlay text-slate-500')}>
          {k}
        </kbd>
      )}
    </button>
  )
}

function Key({ children }) {
  return (
    <kbd className="ds-mono" style={{ margin: '0 2px', borderRadius: 3, padding: '1px 4px',
          background: 'rgb(var(--ds-surface-3))', color: 'rgb(var(--ds-muted))', fontSize: 9 }}>
      {children}
    </kbd>
  )
}
