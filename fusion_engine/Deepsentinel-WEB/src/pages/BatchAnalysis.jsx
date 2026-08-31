import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { analyzeBatch } from '../services/api'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  SectionLabel,
  cx,
} from '../components/ui'
import { Badge as DsBadge, Footer, Panel, SectionHeading } from '../components/ConsoleShell'

/**
 * Batch analysis of an uploaded transaction file.
 *
 * This is the demonstration the review panel asked for: feed the system a file
 * of transactions and watch it separate fraud from legitimate activity. When
 * the file carries an isFraud column, detection is scored against it and the
 * confusion matrix is shown — including what was missed, which matters more to
 * an evaluator than a headline accuracy figure.
 */

const CLASSIFICATION_TONE = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
}

const CLASSIFICATION_BAR = {
  CRITICAL: 'bg-risk-critical',
  HIGH: 'bg-risk-high',
  MEDIUM: 'bg-risk-medium',
  LOW: 'bg-risk-low',
}

export default function BatchAnalysis() {
  const [file, setFile] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [meta, setMeta] = useState(null)
  // Empty means "use the live monitor's band", which is what the server does
  // when the field is absent. A number here overrides it for this run only.
  const [thresholdInput, setThresholdInput] = useState('')
  const [rows, setRows] = useState([])
  const [summary, setSummary] = useState(null)
  const [narratives, setNarratives] = useState([])
  const [upstreamNotices, setUpstreamNotices] = useState([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('all')
  // Scoring 50 rows takes about three seconds, so every row lands inside one
  // blink and the run reads as a frozen page followed by a finished table.
  // Rows are queued and drained on a timer instead: the scoring is untouched,
  // only the rate at which results are painted.
  const [queue, setQueue] = useState([])
  const [demoPace, setDemoPace] = useState(false)
  // The file is read and checked in the browser the moment it is chosen, so
  // the schema, the row count and whether it carries labels are known before
  // anything is uploaded or any model is asked to score. Running the pipeline
  // is then a separate, deliberate step.
  const [inspect, setInspect] = useState(null)
  const [inspecting, setInspecting] = useState(false)
  const abortRef = useRef(null)
  const inputRef = useRef(null)

  const reset = () => {
    setMeta(null)
    setRows([])
    setQueue([])
    setSummary(null)
    setNarratives([])
    setUpstreamNotices([])
    setError(null)
    setFilter('all')
  }

  const pick = (f) => {
    if (!f) return
    setFile(f)
    reset()
    setInspect(null)
    inspectFile(f)
  }

  /* Validate the file in the browser, against the same rules the server
     enforces, before anything is uploaded or any model is asked to score.

     The rules are deliberately duplicated from backend/batch.py rather than
     inferred: REQUIRED, VALID_TYPES and MAX_ROWS are the server's, so a file
     this page accepts is one the upload will accept. If those change on the
     server they must change here, and the mismatch shows up as a file that
     passes here and fails there.

     Findings are split into blocking and advisory. Blocking means the run
     cannot produce a meaningful result; advisory means it can, with a caveat
     worth stating out loud. */
  const inspectFile = (f) => {
    setInspecting(true)
    const reader = new FileReader()
    reader.onerror = () => {
      setInspecting(false)
      setInspect({ fatal: 'The file could not be read.' })
    }
    reader.onload = () => {
      try {
        setInspect(validateCsv(String(reader.result), f))
      } catch (e) {
        setInspect({ fatal: e.message ?? 'The file could not be read.' })
      } finally {
        setInspecting(false)
      }
    }
    // 4 MB is well past a 5,000-row transaction file and keeps a mistakenly
    // chosen large file from being pulled into memory whole.
    reader.readAsText(f.slice(0, 4 * 1024 * 1024))
  }

  const start = useCallback(() => {
    if (!file) return
    reset()
    setRunning(true)

    const custom = thresholdInput.trim() === '' ? undefined : Number(thresholdInput)
    abortRef.current = analyzeBatch(file, {
      alertThreshold: Number.isFinite(custom) ? custom : undefined,
      onEvent: (name, data) => {
        if (name === 'meta') setMeta(data)
        else if (name === 'progress') setQueue((prev) => [...prev, data])
        else if (name === 'narrative') setNarratives((prev) => [...prev, data])
        else if (name === 'summary') setSummary(data)
        else if (name === 'upstream')
          setUpstreamNotices((prev) =>
            prev.some((n) => n.modality === data.modality) ? prev : [...prev, data],
          )
        else if (name === 'error') setError(data.message)
      },
      onDone: () => setRunning(false),
      onError: (message) => {
        setError(message)
        setRunning(false)
      },
    })
  }, [file])

  const cancel = () => {
    abortRef.current?.()
    setRunning(false)
  }

  // Drain one row per tick. Fast enough to finish promptly, slow enough that
  // a person can see transactions arriving one at a time.
  //
  // The two updates are separate calls on purpose. setRows used to be called
  // *inside* setQueue's updater, which makes that updater impure — and React
  // deliberately invokes updaters twice under StrictMode to catch exactly
  // that. The side effect ran twice per tick, so every row was appended
  // twice: a 100-row file reported "200 of 100 scored", the totals doubled,
  // and each transaction appeared twice in the table. Both updaters below are
  // pure, so a double invocation produces the same state either way.
  useEffect(() => {
    if (queue.length === 0) return undefined
    const head = queue[0]
    const step = demoPace ? 220 : 45
    const t = setTimeout(() => {
      setRows((prev) => [...prev, head])
      setQueue((q) => q.slice(1))
    }, step)
    return () => clearTimeout(t)
  }, [queue, demoPace])

  const scoring = running || queue.length > 0
  const latest = rows[rows.length - 1] ?? null

  // Tallies as the run goes, rather than only in the scorecard at the end.
  const live = rows.reduce((a, r) => {
    if (r.alerted) a.alerted += 1
    if (r.label === 1) a.fraud += 1
    if (r.alerted && r.label === 1) a.caught += 1
    if (!r.alerted && r.label === 1) a.missed += 1
    if (r.alerted && r.label === 0) a.falseAlarm += 1
    return a
  }, { alerted: 0, fraud: 0, caught: 0, missed: 0, falseAlarm: 0 })

  /* What each component contributed, measured on this file.
     The batch already returns every detector's own score per row, so each
     model can be scored on its own against the same labels and compared with
     the fused verdict. That is the difference between "the platform got 74%"
     and "here is what my model did, and here is what fusion added on top". */
  // Each detector is scored at its OWN operating point, not at one shared
  // number. They were all measured at 0.6, which is three times GraphSAGE's
  // critical band of 0.391 — so it was being asked to clear a line it can
  // never reach, and reported 4% recall as though that were its performance.
  //
  // The fused row uses whatever line this run was scored at, which is the
  // live monitor's band unless it was overridden for the run.
  const OWN_THRESHOLD = {
    graph: 0.0915,        // GraphSAGE medium band, from its /health
    behavioural: 0.5,     // the VAE publishes none; 0.5 is its midpoint
    temporal: 0.4545,     // TS-TCN tuned threshold, from its /health
  }
  // The line this run was actually scored at, reported by the backend.
  const fusedAt = meta?.alert_threshold ?? 0.03

  const perModel = useMemo(() => {
    const labelled = rows.filter((r) => r.label === 0 || r.label === 1)
    if (labelled.length === 0) return null
    const score = (get, at) => {
      let tp = 0, fp = 0, fn = 0, alerts = 0, scored = 0
      labelled.forEach((r) => {
        const v = get(r)
        if (v === null || v === undefined) return
        scored += 1
        const flag = v >= at
        if (flag) alerts += 1
        if (flag && r.label === 1) tp += 1
        else if (flag && r.label === 0) fp += 1
        else if (!flag && r.label === 1) fn += 1
      })
      const precision = tp + fp ? tp / (tp + fp) : null
      const recall = tp + fn ? tp / (tp + fn) : null
      const f1 = precision && recall ? (2 * precision * recall) / (precision + recall) : null
      return { alerts, precision, recall, f1, tp, fp, fn, scored, at }
    }
    return [
      { key: 'graph', name: 'Edge-Enhanced GraphSAGE', owner: 'network',
        ...score((r) => r.graph_score, OWN_THRESHOLD.graph) },
      { key: 'behavioural', name: 'Stratified VAE + DSAA', owner: 'behaviour',
        ...score((r) => r.behavioral_score, OWN_THRESHOLD.behavioural) },
      { key: 'temporal', name: 'Transaction-Sequence TCN', owner: 'timing',
        ...score((r) => r.temporal_score, OWN_THRESHOLD.temporal) },
      { key: 'fused', name: 'Fusion engine', owner: 'all three, reconciled',
        ...score((r) => r.score, fusedAt) },
    ]
  }, [rows, fusedAt])

  const progressPct = meta?.rows ? Math.round((rows.length / meta.rows) * 100) : 0

  const visible = useMemo(() => {
    const sorted = [...rows].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    if (filter === 'alerted') return sorted.filter((r) => r.alerted)
    if (filter === 'missed') return sorted.filter((r) => r.label === 1 && !r.alerted)
    if (filter === 'false-positive') return sorted.filter((r) => r.label === 0 && r.alerted)
    return sorted
  }, [rows, filter])

  return (
        <div className="ds-fade-up" style={{ display: 'grid', gap: 15 }}>

      {error && <Alert tone="error" onDismiss={() => setError(null)}>{error}</Alert>}

      {/* ── Upload ── */}
      <Panel className="ds-panel-pad">
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            pick(e.dataTransfer.files?.[0])
          }}
          onClick={() => inputRef.current?.click()}
          className={cx(
            'cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition-colors',
            dragging
              ? 'border-blue-500/60 bg-blue-500/5'
              : 'border-subtle hover:border-strong',
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,.xlsm,.txt,.tsv"
            className="hidden"
            onChange={(e) => pick(e.target.files?.[0])}
          />
          {file ? (
            <>
              <p className="mt-3 font-medium text-slate-200">{file.name}</p>
              <p className="mt-1 text-xs text-slate-500">
                {(file.size / 1024).toFixed(0)} KB · click to choose a different file
              </p>
            </>
          ) : (
            <>
              <p className="mt-3 font-medium text-slate-300">
                Drop a transaction file here, or click to browse
              </p>
              <p className="mt-1 text-xs text-slate-600">
                CSV or Excel, PaySim schema, up to 5,000 rows
              </p>
            </>
          )}
        </div>

        {/* ── step 2: what the file actually contains ── */}
        {inspecting && (
          <p style={{ marginTop: 14, fontSize: 15, color: 'rgb(var(--ds-muted))' }}>
            Reading the file…
          </p>
        )}

        {inspect?.fatal && (
          <div className="ds-fade-up" style={{ marginTop: 16, borderRadius: 6, padding: 13,
                background: 'rgb(var(--ds-signal-soft))', color: 'rgb(var(--ds-signal))',
                fontSize: 15, lineHeight: 1.6 }}>
            <strong>This file cannot be read.</strong> {inspect.fatal}
          </div>
        )}

        {inspect && !inspect.fatal && (
          <div className="ds-fade-up" style={{ marginTop: 16 }}>
            <div className="ds-divider" style={{ marginBottom: 15 }} />
            <SectionHeading
              label="Checked before anything is scored"
              title={inspect.blocked
                ? 'This file cannot be scored yet'
                : inspect.findings.length
                  ? 'Ready, with things worth knowing'
                  : 'Ready for the pipeline'}
              action={<DsBadge tone={inspect.blocked ? 'alert'
                : inspect.findings.length ? 'warn' : 'good'}>
                {inspect.blocked
                  ? `${inspect.findings.filter((x) => x.level === 'block').length} blocking`
                  : inspect.findings.length
                    ? `${inspect.findings.length} to note`
                    : 'all checks pass'}
              </DsBadge>}
            />

            <div style={{ display: 'grid', gap: 12, marginBottom: 15,
                          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
              <div>
                <div className="ds-mono" style={{ fontSize: 26 }}>{inspect.rows.toLocaleString()}</div>
                <div className="ds-section-label" style={{ marginTop: 4 }}>Rows</div>
              </div>
              <div>
                <div className="ds-mono" style={{ fontSize: 26 }}>{inspect.header.length}</div>
                <div className="ds-section-label" style={{ marginTop: 4 }}>Columns</div>
              </div>
              <div>
                <div className="ds-mono" style={{ fontSize: 26,
                      color: inspect.labelCol ? 'rgb(var(--ds-accent-strong))'
                        : 'rgb(var(--ds-faint))' }}>
                  {inspect.labelCol ? inspect.fraudLabelled : '—'}
                </div>
                <div className="ds-section-label" style={{ marginTop: 4 }}>Labelled fraud</div>
              </div>
              <div>
                <div className="ds-mono" style={{ fontSize: 26 }}>
                  {(file.size / 1024).toFixed(0)}<span style={{ fontSize: 15 }}> KB</span>
                </div>
                <div className="ds-section-label" style={{ marginTop: 4 }}>Size</div>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 8, marginBottom: 14,
                          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
              {inspect.mapped.map((m) => (
                <div key={m.label} style={{ display: 'flex', gap: 8, alignItems: 'baseline',
                      fontSize: 14, padding: '7px 9px', borderRadius: 5,
                      background: 'rgb(var(--ds-workspace))' }}>
                  <span className="ds-mono" style={{ flex: 1 }}>{m.label}</span>
                  <span style={{ color: m.found ? 'rgb(var(--ds-accent-strong))'
                                                : 'rgb(var(--ds-sev-critical))' }}>
                    {m.found ? `→ ${m.found}` : 'missing'}
                  </span>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 14,
                    padding: '7px 9px', borderRadius: 5, background: 'rgb(var(--ds-workspace))' }}>
                <span className="ds-mono" style={{ flex: 1 }}>isFraud</span>
                <span style={{ color: inspect.labelCol ? 'rgb(var(--ds-accent-strong))'
                                                       : 'rgb(var(--ds-warn))' }}>
                  {inspect.labelCol ? `→ ${inspect.labelCol}` : 'not present'}
                </span>
              </div>
            </div>

            {inspect.findings.length > 0 && (
              <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
                {inspect.findings.map((x, i) => {
                  const bad = x.level === 'block'
                  return (
                    <div key={i} style={{ borderRadius: 6, padding: '10px 12px',
                          borderLeft: `2px solid ${bad ? 'rgb(var(--ds-signal))'
                            : 'rgb(var(--ds-warn))'}`,
                          background: 'rgb(var(--ds-workspace))' }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                        <span className="ds-section-label" style={{
                              color: bad ? 'rgb(var(--ds-signal))' : 'rgb(var(--ds-warn))' }}>
                          {bad ? 'blocking' : 'advisory'}
                        </span>
                        <span style={{ fontSize: 15, fontWeight: 600 }}>{x.title}</span>
                      </div>
                      <div style={{ fontSize: 14, lineHeight: 1.6, marginTop: 5,
                                    color: 'rgb(var(--ds-muted))' }}>
                        {x.detail}
                      </div>
                      {x.rows?.length > 0 && (
                        <div className="ds-mono" style={{ fontSize: 13, marginTop: 6,
                              color: 'rgb(var(--ds-faint))' }}>
                          row {x.rows.join(' · row ')}
                          {x.rows.length >= 6 ? ' · …' : ''}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            <p style={{ fontSize: 14, lineHeight: 1.6, color: 'rgb(var(--ds-muted))',
                        marginBottom: 14 }}>
              {inspect.missing.length
                ? `Add ${inspect.missing.join(', ')} and choose the file again.`
                : inspect.labelCol
                  ? `${inspect.fraudLabelled} of ${inspect.rows} rows are labelled fraud. `
                    + 'Labels are read as ground truth to score detection — they are '
                    + 'never given to the models.'
                  : 'No isFraud column, so alert volume can be measured but accuracy cannot.'}
            </p>

            <div style={{ overflowX: 'auto', marginBottom: 4 }}>
              <table className="ds-table">
                <thead>
                  <tr>{inspect.header.slice(0, 7).map((h) => <th key={h}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {inspect.preview.map((r, i) => (
                    <tr key={i}>
                      {inspect.header.slice(0, 7).map((h) => (
                        <td key={h} className="ds-mono" style={{ fontSize: 14 }}>{r[h]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: 13, color: 'rgb(var(--ds-faint))' }}>
              First {inspect.preview.length} rows, read locally. Nothing has been
              uploaded or scored yet.
            </p>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={start}
                  disabled={!file || scoring || !inspect || inspect.fatal || inspect.blocked}
                  loading={scoring}>
            {scoring ? 'Scoring…' : 'Run the pipeline'}
          </Button>

          <label className="flex items-center gap-2 text-[16px] text-[rgb(var(--ds-muted))]">
            Alert at
            <input
              type="number" step="0.001" min="0" max="1"
              value={thresholdInput}
              onChange={(e) => setThresholdInput(e.target.value)}
              placeholder="live band"
              disabled={scoring}
              className="numeric w-24 rounded-md border px-2 py-1 text-[16px]"
              style={{ borderColor: 'rgb(var(--ds-line))',
                       background: 'rgb(var(--ds-surface))',
                       color: 'rgb(var(--ds-ink))' }}
            />
            <span className="text-[15px] text-[rgb(var(--ds-faint))]">
              {thresholdInput.trim() === ''
                ? 'blank uses whatever the live monitor alerts on'
                : 'this run only — the monitor is unchanged'}
            </span>
          </label>
          {scoring && (
            <Button variant="ghost" onClick={cancel} size="sm">
              Cancel
            </Button>
          )}
          {file && !scoring && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFile(null)
            setInspect(null)
                reset()
              }}
            >
              Clear
            </Button>
          )}
        </div>

        {/* The checks, stated up front rather than only when one trips. A
            reviewer should be able to read what the file will be held to
            before choosing one — and it makes the rules auditable, which
            "we validate the input" on a slide does not. */}
        <div style={{ marginTop: 18 }}>
          <div className="ds-divider" style={{ marginBottom: 14 }} />
          <SectionHeading
            label="Applied in the browser the moment a file is chosen"
            title="What every file is checked against"
            action={<span className="ds-mono" style={{ fontSize: 13,
                    color: 'rgb(var(--ds-faint))' }}>
              mirrors backend/batch.py
            </span>}
          />

          <div style={{ display: 'grid', gap: 14,
                        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' }}>
            <div>
              <div className="ds-section-label" style={{ color: 'rgb(var(--ds-signal))',
                    marginBottom: 8 }}>
                Blocking — the run is prevented
              </div>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none',
                           display: 'grid', gap: 7 }}>
                {[
                  ['Required columns present',
                   'step, type, amount, nameOrig, nameDest'],
                  ['No empty required values',
                   'a transaction with no amount or counterparty cannot be scored, and imputing one would invent evidence'],
                  ['Numeric columns are numeric',
                   'amount and the four balance columns must parse as numbers'],
                  ['Known transaction type',
                   'TRANSFER, CASH_OUT, CASH_IN, PAYMENT, DEBIT — the behavioural model is trained per type'],
                  ['Rows match the header',
                   'one stray comma shifts every value after it'],
                  ['At most 5,000 rows', 'larger files are split into batches'],
                ].map(([t, d]) => (
                  <li key={t} style={{ fontSize: 14, lineHeight: 1.55 }}>
                    <span style={{ color: 'rgb(var(--ds-signal))', marginRight: 6 }}>✗</span>
                    <span style={{ fontWeight: 600 }}>{t}</span>
                    <div style={{ color: 'rgb(var(--ds-muted))', marginLeft: 16 }}>{d}</div>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <div className="ds-section-label" style={{ color: 'rgb(var(--ds-warn))',
                    marginBottom: 8 }}>
                Advisory — it runs, and says so
              </div>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none',
                           display: 'grid', gap: 7 }}>
                {[
                  ['isFraud column present',
                   'without it alert volume can be measured but accuracy cannot'],
                  ['Labels are readable',
                   '0/1 or true/false; anything else is ignored when scoring'],
                  ['At least one positive label',
                   'with none, recall cannot exist — there is nothing to recall'],
                  ['No negative amounts',
                   'usually a reversal or an export artefact'],
                  ['No duplicate transaction ids',
                   'repeats are each scored separately'],
                ].map(([t, d]) => (
                  <li key={t} style={{ fontSize: 14, lineHeight: 1.55 }}>
                    <span style={{ color: 'rgb(var(--ds-warn))', marginRight: 6 }}>!</span>
                    <span style={{ fontWeight: 600 }}>{t}</span>
                    <div style={{ color: 'rgb(var(--ds-muted))', marginLeft: 16 }}>{d}</div>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <p style={{ fontSize: 13, lineHeight: 1.6, color: 'rgb(var(--ds-faint))',
                      marginTop: 14 }}>
            Header names are matched case-insensitively. Findings name the
            offending rows. The upload is validated again server-side.
          </p>
        </div>
      </Panel>

      {/* ── Progress ── */}
      {meta && (
        <Panel className="ds-panel-pad">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-200">{meta.filename}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {meta.rows.toLocaleString()} transactions
                {meta.has_labels
                  ? ` · ${meta.labelled.toLocaleString()} labelled for scoring`
                  : ' · no labels, detection cannot be scored'}
              </p>
            </div>
            <Badge tone={scoring ? 'warn' : 'good'}>
              {scoring ? `${progressPct}%` : 'Complete'}
            </Badge>
          </div>

          <div className="ds-progress" style={{ marginTop: 12, height: 8 }}>
            <span style={{ width: `${progressPct}%` }} />
          </div>

          {/* The transaction being scored right now. Without this the run is a
              bar filling and a table appearing — nothing shows the system
              actually working through the file one record at a time. */}
          {scoring && latest && (
            <div className="ds-fade-up" style={{ display: 'flex', flexWrap: 'wrap', gap: 14,
                  alignItems: 'center', marginTop: 14, padding: '11px 13px', borderRadius: 6,
                  background: 'rgb(var(--ds-workspace))' }}>
              <span className="ds-section-label" style={{ flex: '0 0 auto' }}>Scoring</span>
              <span className="ds-mono" style={{ fontSize: 15, flex: '1 1 220px', minWidth: 0 }}>
                {latest.nameOrig} → {latest.nameDest}
              </span>
              <span style={{ fontSize: 14, color: 'rgb(var(--ds-muted))' }}>{latest.type}</span>
              <span className="ds-mono" style={{ fontSize: 15 }}>
                {Number(latest.amount).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
              <span className="ds-mono" style={{ fontSize: 17, minWidth: 52, textAlign: 'right',
                    color: latest.alerted ? 'rgb(var(--ds-sev-critical))'
                      : 'rgb(var(--ds-accent-strong))' }}>
                {typeof latest.score === 'number' ? latest.score.toFixed(3) : '—'}
              </span>
              <span className="ds-mono" style={{ fontSize: 14, color: 'rgb(var(--ds-faint))' }}>
                {latest.modalities_used}/3
              </span>
            </div>
          )}

          {/* Tallies that move while the file runs, not only in the scorecard. */}
          {rows.length > 0 && (
            <div style={{ display: 'grid', gap: 12, marginTop: 14,
                          gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))' }}>
              {[
                ['Alerted', live.alerted, 'rgb(var(--ds-sev-critical))'],
                ['Caught', live.caught, 'rgb(var(--ds-sev-low))'],
                ['Missed', live.missed, 'rgb(var(--ds-sev-high))'],
                ['False alarms', live.falseAlarm, 'rgb(var(--ds-sev-medium))'],
              ].map(([label, value, colour]) => (
                <div key={label}>
                  <div className="ds-mono" style={{ fontSize: 26, color: colour }}>{value}</div>
                  <div className="ds-section-label" style={{ marginTop: 4 }}>{label}</div>
                </div>
              ))}
            </div>
          )}

          <p className="mt-2 text-xs text-slate-600">
            {rows.length.toLocaleString()} of {meta.rows.toLocaleString()} scored
            {summary?.elapsed_ms != null &&
              ` · ${(summary.elapsed_ms / 1000).toFixed(1)}s`}
          </p>
        </Panel>
      )}

      {/* Model availability — shown prominently, because results computed with
          models missing must not be mistaken for a clean run. */}
      {upstreamNotices.length > 0 && (
        <Alert
          tone={upstreamNotices.length === 3 ? 'error' : 'warning'}
          title={
            upstreamNotices.length === 3
              ? 'No detection model responded'
              : `${upstreamNotices.length} of 3 models unavailable`
          }
        >
          {upstreamNotices.length === 3 ? (
            <p className="leading-relaxed">
              None of the three model APIs could be reached, so no transaction in
              this file could be scored. Start the model services and run the
              file again. Nothing below is a detection result.
            </p>
          ) : (
            <ul className="mt-1 space-y-1">
              {upstreamNotices.map((n) => (
                <li key={n.modality} className="leading-relaxed">
                  {n.message}
                </li>
              ))}
            </ul>
          )}
        </Alert>
      )}

      {summary?.unscored > 0 && summary.unscored === summary.analysed && (
        <Panel className="ds-panel-pad">
          <CardHeader
            title="No results"
            description={`All ${summary.analysed.toLocaleString()} rows were read and validated successfully, but none could be scored because no model was reachable.`}
          />
          <p className="mt-4 text-xs leading-relaxed text-slate-500">
            The file parsed correctly, so nothing needs changing about it. Bring
            the model APIs up and upload it again.
          </p>
        </Panel>
      )}

      {/* ── Detection scorecard ── */}
      {summary?.has_labels && summary.metrics && summary.unscored !== summary.analysed && (
        <Scorecard metrics={summary.metrics} summary={summary} />
      )}

      {summary && !summary.has_labels && summary.unscored !== summary.analysed && (
        <Panel className="ds-panel-pad">
          <CardHeader
            title="Results"
            description="This file carried no isFraud column, so detection cannot be scored against ground truth."
          />
          <div className="mt-4 flex flex-wrap gap-6">
            <Stat label="Transactions" value={summary.analysed.toLocaleString()} />
            <Stat label="Alerts raised" value={summary.alerts.toLocaleString()} tone="high" />
            {Object.entries(summary.by_classification).map(([k, v]) => (
              <Stat key={k} label={k.toLowerCase()} value={v} />
            ))}
          </div>
        </Panel>
      )}

      {/* ── What each component contributed ── */}
      {perModel && !scoring && (
        <Panel className="ds-panel-pad">
          <SectionHeading
            label="Each detector scored at its own operating point"
            title="What each part of the system contributed"
            action={<span className="ds-mono" style={{ fontSize: 14,
                    color: 'rgb(var(--ds-muted))' }}>this file only</span>}
          />
          <div style={{ overflowX: 'auto' }}>
            <table className="ds-table">
              <thead>
                <tr>
                  <th>Component</th><th>Reads</th><th>Scored</th>
                  <th>Alerts</th><th>Precision</th><th>Recall</th><th>F1</th>
                </tr>
              </thead>
              <tbody>
                {perModel.map((m) => (
                  <tr key={m.key} style={{ background: m.key === 'fused'
                        ? 'rgb(var(--ds-surface-2))' : undefined }}>
                    <td style={{ fontWeight: m.key === 'fused' ? 600 : 400 }}>{m.name}</td>
                    <td style={{ color: 'rgb(var(--ds-muted))' }}>{m.owner}</td>
                    <td className="ds-mono">
                      {m.scored ? m.scored : <span style={{ color: 'rgb(var(--ds-faint))' }}>
                        did not answer</span>}
                    </td>
                    <td className="ds-mono">{m.scored ? m.alerts : '—'}</td>
                    <td className="ds-mono">{pctOrDash(m.precision)}</td>
                    <td className="ds-mono">{pctOrDash(m.recall)}</td>
                    <td className="ds-mono" style={{ color: m.key === 'fused'
                          ? 'rgb(var(--ds-accent-strong))' : undefined }}>
                      {pctOrDash(m.f1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: 'rgb(var(--ds-muted))',
                      marginTop: 12 }}>
            {(() => {
              const singles = perModel.filter((m) => m.key !== 'fused' && m.f1 !== null)
              const fused = perModel.find((m) => m.key === 'fused')
              if (!singles.length || !fused?.f1) {
                return 'Not enough labelled rows answered by more than one detector to '
                     + 'compare fusion against the individual models on this file.'
              }
              const best = singles.reduce((a, b) => (b.f1 > a.f1 ? b : a))
              const delta = (fused.f1 - best.f1) * 100
              return delta > 0.5
                ? `Fusion scored ${delta.toFixed(1)} F1 points above the best single `
                  + `detector (${best.name}) on this file.`
                : delta < -0.5
                  ? `${best.name} alone scored ${Math.abs(delta).toFixed(1)} F1 points `
                    + 'above the fused verdict on this file. Fusion is conservative '
                    + 'while a detector is missing.'
                  : `Fusion and ${best.name} are within half an F1 point on this file.`
            })()}
          </p>
          <p style={{ fontSize: 13, lineHeight: 1.6, color: 'rgb(var(--ds-faint))',
                      marginTop: 8 }}>
            Each detector is measured at its own threshold — graph{' '}
            {OWN_THRESHOLD.graph}, behaviour {OWN_THRESHOLD.behavioural},
            timing {OWN_THRESHOLD.temporal} — and the fused row at {fusedAt},
            the line this run was scored at. Measuring all four at one shared
            number asked GraphSAGE to clear a line above its own critical band.
              Figures describe this file only.
          </p>
        </Panel>
      )}

      {/* ── Narratives ── */}
      {narratives.length > 0 && (
        <Panel className="ds-panel-pad" data-print-region="forensic-report">
          <SectionHeading
            label="Retrieval-grounded, generated during this run"
            title="Forensic narratives"
            action={
              <span className="print:hidden" style={{ display: 'flex', gap: 8 }}>
                <DsBadge tone="good">{narratives.length} generated</DsBadge>
                <button className="ds-btn" onClick={() => window.print()}>Save as PDF</button>
              </span>
            }
          />
          <p style={{ fontSize: 14, lineHeight: 1.6, color: 'rgb(var(--ds-muted))',
                      marginBottom: 14 }}>
            Written only for the highest-scoring rows — one per row would cost
            seconds each. Each is constrained by Chain-of-Evidence prompting to
            cite only the scores supplied and the one retrieved FATF typology,
            so every figure below traces back to this run.
          </p>
          <div style={{ display: 'grid', gap: 12 }}>
            {narratives.map((n) => (
              <div key={n.index} style={{ background: 'rgb(var(--ds-workspace))',
                    borderRadius: 7, padding: 15 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10,
                              alignItems: 'center', marginBottom: 10 }}>
                  <span className="ds-mono" style={{ fontSize: 14,
                        color: 'rgb(var(--ds-muted))' }}>row {n.index}</span>
                  <span className="ds-mono" style={{ fontSize: 17,
                        color: 'rgb(var(--ds-sev-critical))' }}>
                    {n.score.toFixed(3)}
                  </span>
                  {n.typology && <DsBadge tone="warn">{n.typology}</DsBadge>}
                  <span style={{ fontSize: 13, color: 'rgb(var(--ds-faint))',
                                 marginLeft: 'auto' }}>
                    cited, not invented
                  </span>
                </div>
                <p style={{ fontSize: 15, lineHeight: 1.7, whiteSpace: 'pre-wrap',
                            margin: 0 }}>{n.report}</p>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* ── Transactions ── */}
      {rows.length > 0 && (
        <Panel style={{ overflow: 'hidden' }}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-subtle p-5">
            <SectionLabel>Transactions</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {[
                ['all', `All ${rows.length}`],
                ['alerted', `Alerted ${rows.filter((r) => r.alerted).length}`],
                summary?.has_labels && [
                  'missed',
                  `Missed ${rows.filter((r) => r.label === 1 && !r.alerted).length}`,
                ],
                summary?.has_labels && [
                  'false-positive',
                  `False alarms ${rows.filter((r) => r.label === 0 && r.alerted).length}`,
                ],
              ]
                .filter(Boolean)
                .map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setFilter(value)}
                    className={cx(
                      'rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
                      filter === value
                        ? 'bg-surface-overlay text-slate-200'
                        : 'text-slate-500 hover:bg-surface-raised hover:text-slate-300',
                    )}
                  >
                    {label}
                  </button>
                ))}
            </div>
          </div>

          {visible.length === 0 ? (
            <EmptyState icon="✓" title="Nothing in this category" />
          ) : (
            <div className="max-h-[32rem] overflow-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="sticky top-0 z-10 bg-sentinel-900">
                  <tr className="border-b border-subtle text-left">
                    {['Row', 'From → To', 'Type', 'Amount', 'Score', 'Verdict'].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-2.5 text-[14px] font-semibold uppercase tracking-wider text-slate-500"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {visible.map((r) => (
                    <TransactionRow key={r.index} row={r} hasLabels={summary?.has_labels} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {!meta && !scoring && (
        <EmptyState
          icon="—"
          title="No file analysed yet"
          description="Upload a transaction file above to score it."
        />
      )}
    </div>
  )
}

function TransactionRow({ row, hasLabels }) {
  const verdict = !hasLabels
    ? null
    : row.label === 1 && row.alerted
      ? { label: 'caught', tone: 'low' }
      : row.label === 1 && !row.alerted
        ? { label: 'missed', tone: 'critical' }
        : row.label === 0 && row.alerted
          ? { label: 'false alarm', tone: 'high' }
          : { label: 'clear', tone: 'neutral' }

  return (
    <tr
      className={cx(
        'transition-colors hover:bg-surface',
        row.label === 1 && !row.alerted && 'bg-risk-critical/5',
      )}
    >
      <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{row.index}</td>
      <td className="px-4 py-2.5">
        <span className="font-mono text-xs text-slate-400">{row.nameOrig}</span>
        <span className="mx-1.5 text-slate-700">→</span>
        <span className="font-mono text-xs text-slate-400">{row.nameDest}</span>
        {row.typology_label && (
          <span className="ml-2 text-[14px] text-slate-600">{row.typology_label}</span>
        )}
      </td>
      <td className="px-4 py-2.5 text-xs text-slate-500">{row.type}</td>
      <td className="px-4 py-2.5 text-right font-mono text-xs text-slate-400">
        {row.amount?.toLocaleString(undefined, { maximumFractionDigits: 0 })}
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-raised">
            <div
              className={cx('h-full rounded-full', CLASSIFICATION_BAR[row.classification])}
              style={{ width: `${Math.round((row.score ?? 0) * 100)}%` }}
            />
          </div>
          <span className="font-mono text-xs text-slate-400">
            {row.score != null ? row.score.toFixed(2) : '—'}
          </span>
        </div>
      </td>
      <td className="px-4 py-2.5">
        {verdict ? (
          <Badge tone={verdict.tone}>{verdict.label}</Badge>
        ) : (
          <Badge tone={CLASSIFICATION_TONE[row.classification]}>
            {row.classification?.toLowerCase()}
          </Badge>
        )}
      </td>
    </tr>
  )
}

function Scorecard({ metrics, summary }) {
  const pct = (v) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`)

  return (
    <Panel className="ds-panel-pad">
      <CardHeader
        title="Detection scorecard"
        description="Measured against the isFraud labels in the uploaded file."
      />

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Recall" value={pct(metrics.recall)} hint="of actual frauds, caught" emphasis />
        <Metric label="Precision" value={pct(metrics.precision)} hint="of alerts, genuine" emphasis />
        <Metric label="F1" value={pct(metrics.f1)} hint="harmonic mean" />
        <Metric label="Accuracy" value={pct(metrics.accuracy)} hint="all rows" />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        <Confusion label="Caught" value={metrics.true_positive} tone="low"
          hint="fraud, alerted" />
        <Confusion label="Missed" value={metrics.false_negative} tone="critical"
          hint="fraud, no alert" />
        <Confusion label="False alarms" value={metrics.false_positive} tone="high"
          hint="legitimate, alerted" />
        <Confusion label="Correctly clear" value={metrics.true_negative} tone="neutral"
          hint="legitimate, no alert" />
      </div>

      {metrics.false_negative > 0 && (
        <Alert tone="warning" className="mt-5">
          {metrics.false_negative} fraudulent transaction
          {metrics.false_negative === 1 ? ' was' : 's were'} not flagged. Filter to
          <span className="font-medium"> Missed</span> below to see which.
        </Alert>
      )}

      {metrics.false_positive === 0 && metrics.true_negative > 0 && (
        <Alert tone="success" className="mt-5">
          No legitimate transaction was flagged — {metrics.true_negative} clean
          rows passed without a false alarm.
        </Alert>
      )}

      <p className="mt-5 text-xs leading-relaxed text-slate-600">
        These figures describe this file only. They are not a general accuracy
        claim, which belongs to each model's held-out evaluation.
      </p>
    </Panel>
  )
}

function Metric({ label, value, hint, emphasis }) {
  return (
    <div className={cx('rounded-xl border p-4', emphasis ? 'border-strong bg-surface-raised' : 'border-subtle bg-surface')}>
      <p className="text-[14px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1.5 font-mono text-2xl font-bold text-slate-200">{value}</p>
      <p className="mt-0.5 text-[14px] text-slate-600">{hint}</p>
    </div>
  )
}

function Confusion({ label, value, tone, hint }) {
  const colour = {
    low: 'text-risk-low',
    critical: 'text-risk-critical',
    high: 'text-risk-high',
    neutral: 'text-slate-400',
  }[tone]

  return (
    <div className="rounded-xl border border-subtle bg-surface p-4">
      <p className="text-[14px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={cx('mt-1.5 font-mono text-2xl font-bold', colour)}>{value}</p>
      <p className="mt-0.5 text-[14px] text-slate-600">{hint}</p>
    </div>
  )
}

function Stat({ label, value, tone }) {
  return (
    <div>
      <p className={cx('font-mono text-2xl font-bold', tone === 'high' ? 'text-risk-high' : 'text-slate-200')}>
        {value}
      </p>
      <p className="mt-0.5 text-xs capitalize text-slate-500">{label}</p>
    </div>
  )
}

/** A percentage, or an em dash when the figure could not be computed. */
function pctOrDash(v) {
  return typeof v === 'number' ? `${(v * 100).toFixed(1)}%` : '—'
}


/* ── file validation ──────────────────────────────────────────────────────
   Mirrors backend/batch.py. Kept in one function so the rules can be read in
   one sitting and compared against the server's. */

const REQUIRED = [
  ['step', 'step'], ['type', 'type'], ['amount', 'amount'],
  ['nameOrig', 'nameorig'], ['nameDest', 'namedest'],
]
const VALID_TYPES = ['TRANSFER', 'CASH_OUT', 'CASH_IN', 'PAYMENT', 'DEBIT']
const MAX_ROWS = 5000
const NUMERIC = ['amount', 'oldbalanceorg', 'newbalanceorig',
                 'oldbalancedest', 'newbalancedest']

function validateCsv(text, file) {
  const findings = []
  const block = (title, detail, rows) =>
    findings.push({ level: 'block', title, detail, rows })
  const warn = (title, detail, rows) =>
    findings.push({ level: 'warn', title, detail, rows })

  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length === 0) throw new Error('The file is empty.')
  if (lines.length === 1) throw new Error('The file has a header but no data rows.')

  // Tab or comma, whichever the header uses more of.
  const delim = (lines[0].match(/\t/g) || []).length
    > (lines[0].match(/,/g) || []).length ? '\t' : ','
  const cut = (l) => l.split(delim).map((c) => c.trim().replace(/^"|"$/g, ''))

  const header = cut(lines[0])
  const key = header.map((h) => h.toLowerCase().replace(/[\s_]/g, ''))
  if (header.length < 3 || key.every((k) => !k)) {
    throw new Error('This does not look like a transaction file — no usable header row.')
  }

  const mapped = REQUIRED.map(([label, k]) => ({
    label, k, idx: key.indexOf(k), found: header[key.indexOf(k)] ?? null,
  }))
  const missing = mapped.filter((m) => m.idx === -1)
  if (missing.length) {
    block('Required columns are missing',
      `${missing.map((m) => m.label).join(', ')} — the models cannot score a `
      + 'transaction without them.')
  }

  const labelIdx = key.indexOf('isfraud')
  const body = lines.slice(1)

  if (body.length > MAX_ROWS) {
    block('Too many rows',
      `${body.length.toLocaleString()} rows; the limit is ${MAX_ROWS.toLocaleString()}. `
      + 'Split it into smaller batches.')
  }

  // ── row-level checks ──
  const ragged = [], badType = [], badNum = [], blank = [], negative = [], dupes = []
  const seen = new Set()
  const typeIdx = key.indexOf('type')
  const amtIdx = key.indexOf('amount')
  const numIdx = NUMERIC.map((n) => [n, key.indexOf(n)]).filter(([, i]) => i !== -1)
  const idIdx = key.indexOf('transactionid')

  body.forEach((line, i) => {
    const rowNo = i + 2                       // 1-indexed, header is row 1
    const cells = cut(line)
    if (cells.length !== header.length) { ragged.push(rowNo); return }

    mapped.forEach((m) => {
      if (m.idx !== -1 && !cells[m.idx]) blank.push(`${rowNo}:${m.label}`)
    })
    if (typeIdx !== -1) {
      const t = (cells[typeIdx] || '').toUpperCase()
      if (t && !VALID_TYPES.includes(t)) badType.push(`${rowNo}:${cells[typeIdx]}`)
    }
    numIdx.forEach(([name, idx]) => {
      const raw = cells[idx]
      if (raw === '' || raw === undefined) return
      const v = Number(raw)
      if (Number.isNaN(v)) badNum.push(`${rowNo}:${name}`)
      else if (name === 'amount' && v < 0) negative.push(String(rowNo))
    })
    if (idIdx !== -1 && cells[idIdx]) {
      if (seen.has(cells[idIdx])) dupes.push(String(rowNo))
      else seen.add(cells[idIdx])
    }
  })

  const some = (a, n = 6) => a.slice(0, n)

  if (ragged.length) {
    block('Rows do not match the header',
      `${ragged.length} row(s) have a different number of cells than the header `
      + `(${header.length}). An extra or missing comma shifts every value after it.`,
      some(ragged))
  }
  if (blank.length) {
    block('Required values are empty',
      `${blank.length} required cell(s) are blank. A transaction with no amount or `
      + 'no counterparty cannot be scored, and imputing one would invent evidence.',
      some(blank))
  }
  if (badNum.length) {
    block('Numeric columns contain text',
      `${badNum.length} cell(s) could not be read as a number.`, some(badNum))
  }
  if (badType.length) {
    block('Unrecognised transaction type',
      `${badType.length} row(s) use a type outside ${VALID_TYPES.join(', ')}. `
      + 'The behavioural model is trained per type and has no stratum for these.',
      some(badType))
  }
  if (negative.length) {
    warn('Negative amounts',
      `${negative.length} row(s) have a negative amount. These will score, but a `
      + 'negative transfer is usually a reversal or an export artefact.',
      some(negative))
  }
  if (dupes.length) {
    warn('Duplicate transaction ids',
      `${dupes.length} row(s) repeat an id seen earlier. They will each be scored.`,
      some(dupes))
  }

  // ── labels ──
  let fraudLabelled = 0, badLabel = 0
  if (labelIdx !== -1) {
    body.forEach((l) => {
      const v = (cut(l)[labelIdx] ?? '').trim().toLowerCase()
      if (v === '1' || v === 'true') fraudLabelled += 1
      else if (v !== '0' && v !== 'false' && v !== '') badLabel += 1
    })
    if (badLabel) {
      warn('Unreadable labels',
        `${badLabel} isFraud value(s) are neither 0/1 nor true/false and will be `
        + 'ignored when scoring accuracy.')
    }
    if (fraudLabelled === 0) {
      warn('No positive labels',
        'Every row is labelled not-fraud, so recall cannot be computed — there is '
        + 'nothing to recall.')
    }
  } else {
    warn('No isFraud column',
      'Alert volume can be measured but accuracy cannot. Add an isFraud column to '
      + 'score detection against ground truth.')
  }

  const preview = body.slice(0, 5).map((l) => {
    const cells = cut(l)
    return Object.fromEntries(header.map((h, i) => [h, cells[i]]))
  })

  return {
    rows: body.length,
    header,
    mapped: mapped.map((m) => ({ label: m.label, found: m.found })),
    missing: missing.map((m) => m.label),
    labelCol: labelIdx !== -1 ? header[labelIdx] : null,
    fraudLabelled,
    preview,
    findings,
    blocked: findings.some((x) => x.level === 'block'),
  }
}
