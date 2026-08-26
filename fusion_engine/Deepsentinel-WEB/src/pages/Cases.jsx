import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getBriefing, getCase, listCases, reviewCase, sendBriefing } from '../services/api'
import NetworkGraph from '../components/NetworkGraph'
import {
  Alert, Badge, Button, Card, CardHeader, PageHeader, SectionLabel, cx,
} from '../components/ui'

/**
 * The case queue, and one case in full.
 *
 * Two things an analyst does all day: work through what is waiting, and decide
 * on one case. Triage is keyboard-driven because a queue of a hundred is worked
 * with hands on keys, not a mouse — and the verdict feeds the retraining set,
 * so it is attributed and audited rather than being a local UI state.
 *
 * A case is addressable at /cases/CASE-2026-08-26-A3F9, so it can be sent to a
 * colleague. Access is still authenticated; the link is a pointer, not a key.
 */

const TONE = {
  CRITICAL: 'critical', HIGH: 'high', MEDIUM: 'medium', LOW: 'low',
}
const REVIEW_LABEL = {
  open: 'Open', investigating: 'Investigating',
  confirmed_fraud: 'Confirmed fraud', false_positive: 'False positive',
  closed: 'Closed',
}

const score = (v) => (typeof v === 'number' ? v.toFixed(3) : '—')
const when = (s) => (s ? String(s).slice(0, 19).replace('T', ' ') : '—')

export default function Cases() {
  const { caseRef } = useParams()
  return caseRef ? <CaseDetail caseRef={caseRef} /> : <CaseQueue />
}

/* ────────────────────────── the queue ────────────────────────── */

function CaseQueue() {
  const navigate = useNavigate()
  const [cases, setCases] = useState([])
  const [filter, setFilter] = useState('open')
  const [error, setError] = useState(null)
  const [cursor, setCursor] = useState(0)
  const [busy, setBusy] = useState(false)
  const [brief, setBrief] = useState(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const d = await listCases(filter === 'all' ? {} : { review_status: filter })
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
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cases, cursor, decide, navigate])

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-10 sm:px-6">
      <PageHeader
        title="Cases"
        description="What the models caught. Decisions here feed the retraining set, so they are attributed."
      />

      {error && <Alert tone="error">{error}</Alert>}

      {/* ── briefing ── */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-200">Daily briefing</p>
            <p className="mt-0.5 text-xs text-slate-500">
              What was caught in the last 24 hours, and what is still waiting.
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary"
                    onClick={() => getBriefing().then(setBrief).catch(() => {})}>
              Preview
            </Button>
            <Button size="sm" variant="ghost"
                    onClick={() => sendBriefing()
                      .then(() => setBrief((b) => ({ ...(b || {}), sent: true })))
                      .catch((e) => setError(e?.response?.data?.detail ?? 'Send failed.'))}>
              Email it
            </Button>
          </div>
        </div>
        {brief?.sent && <Alert tone="success" className="mt-3">Briefing sent.</Alert>}
        {brief?.text && (
          <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-subtle bg-surface-raised p-4 font-mono text-[11px] leading-relaxed text-slate-300">
            {brief.text}
          </pre>
        )}
      </Card>

      {/* ── filter ── */}
      <div className="flex flex-wrap gap-1 rounded-lg border border-subtle bg-surface p-1">
        {['open', 'investigating', 'confirmed_fraud', 'false_positive', 'all'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cx(
              'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              filter === f ? 'bg-surface-overlay text-slate-200'
                           : 'text-slate-500 hover:text-slate-300',
            )}
          >
            {f === 'all' ? 'All' : REVIEW_LABEL[f]}
          </button>
        ))}
      </div>

      {cases.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-sm text-slate-300">Nothing here.</p>
          <p className="mt-1 text-xs text-slate-500">
            {filter === 'open'
              ? 'No cases are waiting for review.'
              : 'No cases with that status.'}
          </p>
        </Card>
      ) : (
        <>
          <p className="text-[11px] text-slate-500">
            <kbd className="rounded bg-surface-overlay px-1">j</kbd>/
            <kbd className="rounded bg-surface-overlay px-1">k</kbd> move ·
            <kbd className="ml-1 rounded bg-surface-overlay px-1">f</kbd> confirm fraud ·
            <kbd className="ml-1 rounded bg-surface-overlay px-1">d</kbd> false positive ·
            <kbd className="ml-1 rounded bg-surface-overlay px-1">i</kbd> investigating ·
            <kbd className="ml-1 rounded bg-surface-overlay px-1">↵</kbd> open
          </p>

          <div className="space-y-2">
            {cases.map((c, i) => (
              <Card
                key={c.case_ref}
                className={cx(
                  'cursor-pointer p-4 transition-all',
                  i === cursor && 'ring-1 ring-accent-500/50',
                )}
                onClick={() => setCursor(i)}
                onDoubleClick={() => navigate(`/cases/${c.case_ref}`)}
              >
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <Badge tone={TONE[c.classification] ?? 'low'}>{c.classification}</Badge>
                  <span className="font-mono text-sm font-semibold text-slate-200">
                    {score(c.fused_score)}
                  </span>
                  <span className="font-mono text-[11px] text-slate-500">{c.case_ref}</span>
                  {c.graph_pattern && (
                    <span className="text-[11px] text-slate-400">{c.graph_pattern}</span>
                  )}
                  <span className="text-[11px] text-slate-600">
                    {c.modalities_used}/3 detectors
                  </span>
                  {c.label_is_fraud !== null && c.label_is_fraud !== undefined && (
                    <Badge tone={c.label_is_fraud ? 'critical' : 'low'}>
                      label: {c.label_is_fraud ? 'fraud' : 'clean'}
                    </Badge>
                  )}
                  <span className="ml-auto text-[11px] text-slate-600">{when(c.detected_at)}</span>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/* ────────────────────────── one case ────────────────────────── */

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

  if (error) return <div className="mx-auto max-w-4xl px-4 py-10"><Alert tone="error">{error}</Alert></div>
  if (!c) return <div className="mx-auto max-w-4xl px-4 py-10 text-sm text-slate-500">Loading…</div>

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <button onClick={() => navigate('/cases')}
                className="text-xs text-slate-500 hover:text-slate-300">
          ← All cases
        </button>
        <Button size="sm" variant="ghost" onClick={() => {
          navigator.clipboard?.writeText(window.location.href)
          setCopied(true); setTimeout(() => setCopied(false), 2000)
        }}>
          {copied ? 'Link copied' : 'Copy link'}
        </Button>
      </div>

      <PageHeader
        title={c.case_ref}
        description={`${c.classification} · detected ${when(c.detected_at)}`}
      />

      {/* ── headline ── */}
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Fused confidence</p>
            <p className="font-mono text-3xl font-semibold text-slate-200">{score(c.fused_score)}</p>
          </div>
          {[['Graph', c.graph_score, c.graph_available],
            ['Behavioural', c.behavioral_score, c.behavioral_available],
            ['Temporal', c.temporal_score, c.temporal_available]].map(([label, v, ok]) => (
            <div key={label}>
              <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
              <p className={cx('font-mono text-lg', ok ? 'text-slate-300' : 'text-slate-600')}>
                {ok ? score(v) : 'not deployed'}
              </p>
            </div>
          ))}
          <div className="ml-auto">
            <Badge tone={TONE[c.classification] ?? 'low'}>{c.classification}</Badge>
          </div>
        </div>
        {c.uncertainty_penalty_applied && (
          <p className="mt-4 text-xs leading-relaxed text-slate-500">
            Only {c.modalities_used} of 3 detectors contributed, so an uncertainty
            penalty was applied — this confidence is deliberately conservative.
          </p>
        )}
      </Card>

      {c.graph_evidence && <NetworkGraph evidence={c.graph_evidence} height={360} />}

      {/* ── timeline ── */}
      <Card className="p-5 sm:p-6">
        <CardHeader title="What happened" description="Derived from the timestamps recorded at the time." />
        <ol className="mt-5 space-y-0">
          {(c.timeline ?? []).map((t, i, arr) => (
            <li key={i} className="relative flex gap-4 pb-5 last:pb-0">
              <div className="flex flex-col items-center">
                <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-accent-500" />
                {i < arr.length - 1 && <span className="mt-1 w-px flex-1 bg-subtle" />}
              </div>
              <div className="min-w-0 pb-1">
                <p className="text-sm font-medium text-slate-200">{t.stage}</p>
                <p className="mt-0.5 text-xs text-slate-400">{t.detail}</p>
                <p className="mt-0.5 font-mono text-[10px] text-slate-600">{when(t.at)}</p>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      {c.forensic_report && (
        <Card className="p-5 sm:p-6">
          <CardHeader title="Forensic report" description="Generated at detection time." />
          <pre className="mt-4 whitespace-pre-wrap rounded-xl border border-subtle bg-surface-raised p-4 text-sm leading-relaxed text-slate-400">
            {c.forensic_report}
          </pre>
        </Card>
      )}

      {/* ── verdict ── */}
      <Card className="p-5 sm:p-6 print:hidden">
        <CardHeader
          title="Review"
          description="Recorded against your name, and used to build the retraining set."
        />
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge tone="low">{REVIEW_LABEL[c.review_status] ?? c.review_status}</Badge>
          {c.reviewed_by && (
            <span className="text-[11px] text-slate-500">
              by {c.reviewed_by} · {when(c.reviewed_at)}
            </span>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => decide('confirmed_fraud')}>Confirm fraud</Button>
          <Button variant="secondary" onClick={() => decide('false_positive')}>False positive</Button>
          <Button variant="ghost" onClick={() => decide('investigating')}>Investigating</Button>
          <Button variant="ghost" onClick={() => decide('closed')}>Close</Button>
        </div>
        {c.label_is_fraud !== null && c.label_is_fraud !== undefined && (
          <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
            The source file labelled this transaction{' '}
            <b className="text-slate-400">{c.label_is_fraud ? 'fraud' : 'not fraud'}</b>.
            Shown for measuring the system after the fact — it was not available
            to any model at scoring time.
          </p>
        )}
      </Card>
    </div>
  )
}
