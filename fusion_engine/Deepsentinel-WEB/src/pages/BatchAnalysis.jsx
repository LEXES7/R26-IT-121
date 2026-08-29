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

  /* Read the header and a sample of rows locally. The same required columns
     the server enforces, matched case-insensitively, so what the page reports
     here is what the upload will actually accept. */
  const inspectFile = (f) => {
    setInspecting(true)
    const reader = new FileReader()
    reader.onerror = () => {
      setInspecting(false)
      setError('Could not read that file.')
    }
    reader.onload = () => {
      try {
        const text = String(reader.result)
        const lines = text.split(/\r?\n/).filter((l) => l.trim())
        if (lines.length < 2) throw new Error('The file has no data rows.')
        const delim = (lines[0].match(/\t/g) || []).length
          > (lines[0].match(/,/g) || []).length ? '\t' : ','
        const header = lines[0].split(delim).map((h) => h.trim().replace(/^"|"$/g, ''))
        const key = header.map((h) => h.toLowerCase().replace(/[\s_]/g, ''))

        const need = [
          ['step', 'step'], ['type', 'type'], ['amount', 'amount'],
          ['nameOrig', 'nameorig'], ['nameDest', 'namedest'],
        ]
        const mapped = need.map(([label, k]) => ({
          label, found: header[key.indexOf(k)] ?? null,
        }))
        const labelCol = header[key.indexOf('isfraud')] ?? null

        const body = lines.slice(1)
        const preview = body.slice(0, 5).map((l) => {
          const cells = l.split(delim).map((c) => c.trim().replace(/^"|"$/g, ''))
          return Object.fromEntries(header.map((h, i) => [h, cells[i]]))
        })
        let labelled = 0
        if (labelCol) {
          const li = header.indexOf(labelCol)
          body.forEach((l) => {
            const v = (l.split(delim)[li] ?? '').trim()
            if (v === '1' || v.toLowerCase() === 'true') labelled += 1
          })
        }

        setInspect({
          rows: body.length,
          header,
          mapped,
          missing: mapped.filter((m) => !m.found).map((m) => m.label),
          labelCol,
          fraudLabelled: labelled,
          preview,
        })
      } catch (e) {
        setError(e.message ?? 'Could not read that file.')
      } finally {
        setInspecting(false)
      }
    }
    // Only the head is needed to validate a schema; a large file should not be
    // pulled into memory just to read its first six lines.
    reader.readAsText(f.slice(0, 256 * 1024))
  }

  const start = useCallback(() => {
    if (!file) return
    reset()
    setRunning(true)

    abortRef.current = analyzeBatch(file, {
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
  useEffect(() => {
    if (queue.length === 0) return undefined
    const step = demoPace ? 220 : 45
    const t = setTimeout(() => {
      setQueue((q) => {
        if (q.length === 0) return q
        const [head, ...rest] = q
        setRows((prev) => [...prev, head])
        return rest
      })
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
          <p style={{ marginTop: 14, fontSize: 11, color: 'rgb(var(--ds-muted))' }}>
            Reading the file…
          </p>
        )}

        {inspect && (
          <div className="ds-fade-up" style={{ marginTop: 16 }}>
            <div className="ds-divider" style={{ marginBottom: 15 }} />
            <SectionHeading
              label="Checked before anything is scored"
              title={inspect.missing.length
                ? 'This file cannot be scored yet'
                : 'Ready for the pipeline'}
              action={<DsBadge tone={inspect.missing.length ? 'alert' : 'good'}>
                {inspect.missing.length
                  ? `${inspect.missing.length} column${inspect.missing.length === 1 ? '' : 's'} missing`
                  : 'schema ok'}
              </DsBadge>}
            />

            <div style={{ display: 'grid', gap: 12, marginBottom: 15,
                          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
              <div>
                <div className="ds-mono" style={{ fontSize: 19 }}>{inspect.rows.toLocaleString()}</div>
                <div className="ds-section-label" style={{ marginTop: 4 }}>Rows</div>
              </div>
              <div>
                <div className="ds-mono" style={{ fontSize: 19 }}>{inspect.header.length}</div>
                <div className="ds-section-label" style={{ marginTop: 4 }}>Columns</div>
              </div>
              <div>
                <div className="ds-mono" style={{ fontSize: 19,
                      color: inspect.labelCol ? 'rgb(var(--ds-accent-strong))'
                        : 'rgb(var(--ds-faint))' }}>
                  {inspect.labelCol ? inspect.fraudLabelled : '—'}
                </div>
                <div className="ds-section-label" style={{ marginTop: 4 }}>Labelled fraud</div>
              </div>
              <div>
                <div className="ds-mono" style={{ fontSize: 19 }}>
                  {(file.size / 1024).toFixed(0)}<span style={{ fontSize: 11 }}> KB</span>
                </div>
                <div className="ds-section-label" style={{ marginTop: 4 }}>Size</div>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 8, marginBottom: 14,
                          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
              {inspect.mapped.map((m) => (
                <div key={m.label} style={{ display: 'flex', gap: 8, alignItems: 'baseline',
                      fontSize: 10, padding: '7px 9px', borderRadius: 5,
                      background: 'rgb(var(--ds-workspace))' }}>
                  <span className="ds-mono" style={{ flex: 1 }}>{m.label}</span>
                  <span style={{ color: m.found ? 'rgb(var(--ds-accent-strong))'
                                                : 'rgb(var(--ds-sev-critical))' }}>
                    {m.found ? `→ ${m.found}` : 'missing'}
                  </span>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 10,
                    padding: '7px 9px', borderRadius: 5, background: 'rgb(var(--ds-workspace))' }}>
                <span className="ds-mono" style={{ flex: 1 }}>isFraud</span>
                <span style={{ color: inspect.labelCol ? 'rgb(var(--ds-accent-strong))'
                                                       : 'rgb(var(--ds-warn))' }}>
                  {inspect.labelCol ? `→ ${inspect.labelCol}` : 'not present'}
                </span>
              </div>
            </div>

            <p style={{ fontSize: 10, lineHeight: 1.6, color: 'rgb(var(--ds-muted))',
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
                        <td key={h} className="ds-mono" style={{ fontSize: 10 }}>{r[h]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: 9, color: 'rgb(var(--ds-faint))' }}>
              First {inspect.preview.length} rows, read locally. Nothing has been
              uploaded or scored yet.
            </p>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={start}
                  disabled={!file || scoring || !inspect || inspect.missing.length > 0}
                  loading={scoring}>
            {scoring ? 'Scoring…' : 'Run the pipeline'}
          </Button>
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

        <details className="mt-5">
          <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-300">
            Required columns
          </summary>
          <div className="mt-2.5 rounded-lg border border-subtle bg-surface p-3">
            <p className="text-xs leading-relaxed text-slate-500">
              <span className="text-slate-400">Required:</span>{' '}
              <code className="font-mono text-[11px]">
                step, type, amount, nameOrig, nameDest
              </code>
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
              <span className="text-slate-400">Recommended:</span>{' '}
              <code className="font-mono text-[11px]">
                oldbalanceOrg, newbalanceOrig, oldbalanceDest, newbalanceDest
              </code>
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
              <span className="text-slate-400">Optional:</span>{' '}
              <code className="font-mono text-[11px]">isFraud</code> — read as
              ground truth to score detection. It is never given to the models.
            </p>
            <p className="mt-2 text-[11px] text-slate-600">
              Header names are matched case-insensitively, so name_orig and
              nameOrig both work.
            </p>
          </div>
        </details>
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
              <span className="ds-mono" style={{ fontSize: 11, flex: '1 1 220px', minWidth: 0 }}>
                {latest.nameOrig} → {latest.nameDest}
              </span>
              <span style={{ fontSize: 10, color: 'rgb(var(--ds-muted))' }}>{latest.type}</span>
              <span className="ds-mono" style={{ fontSize: 11 }}>
                {Number(latest.amount).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
              <span className="ds-mono" style={{ fontSize: 13, minWidth: 52, textAlign: 'right',
                    color: latest.alerted ? 'rgb(var(--ds-sev-critical))'
                      : 'rgb(var(--ds-accent-strong))' }}>
                {typeof latest.score === 'number' ? latest.score.toFixed(3) : '—'}
              </span>
              <span className="ds-mono" style={{ fontSize: 10, color: 'rgb(var(--ds-faint))' }}>
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
                  <div className="ds-mono" style={{ fontSize: 19, color: colour }}>{value}</div>
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

      {/* ── Narratives ── */}
      {narratives.length > 0 && (
        <Panel className="ds-panel-pad">
          <CardHeader
            title="Forensic narratives"
            description="Generated for the highest-scoring transactions only. Producing one per row would take seconds each."
          />
          <div className="mt-4 space-y-3">
            {narratives.map((n) => (
              <div key={n.index} className="rounded-xl border border-subtle bg-surface p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-slate-500">row {n.index}</span>
                  <Badge tone="critical">{(n.score * 100).toFixed(0)}%</Badge>
                  <span className="text-xs text-slate-500">{n.typology}</span>
                </div>
                <p className="mt-2.5 text-sm leading-relaxed text-slate-300">{n.report}</p>
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
                        className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500"
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
          <span className="ml-2 text-[10px] text-slate-600">{row.typology_label}</span>
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
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1.5 font-mono text-2xl font-bold text-slate-200">{value}</p>
      <p className="mt-0.5 text-[10px] text-slate-600">{hint}</p>
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
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={cx('mt-1.5 font-mono text-2xl font-bold', colour)}>{value}</p>
      <p className="mt-0.5 text-[10px] text-slate-600">{hint}</p>
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
