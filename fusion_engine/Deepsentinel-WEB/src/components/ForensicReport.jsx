import { Fragment, useMemo, useState } from 'react'
import { explainPlainly } from '../services/api'
import { Alert, Badge, Button, Card, CardHeader } from './ui'

/**
 * Renders the generated forensic report as a document rather than a text dump.
 *
 * The report arrives as plain text with `SECTION n — TITLE` headers, a small
 * metadata block, and `**bold**` runs. Rendering it with `{report}` collapsed
 * every newline into a single paragraph, which is what made a genuine LLM
 * output look like filler. This parses the structure and sets it as a case file.
 *
 * Export is `window.print()` against a print stylesheet rather than a canvas
 * screenshot: the result is a real PDF with selectable, searchable text, which
 * is what attaching a report to a case actually requires.
 */

const META_KEYS = ['Transaction ID', 'Classification', 'FATF Typology Match']

function parseReport(raw) {
  if (!raw) return { meta: [], sections: [] }

  const meta = []
  const sections = []
  let current = null

  for (const line of raw.split('\n')) {
    const t = line.trim()
    if (!t || t === '---' || t === 'CASE INVESTIGATION REPORT') continue

    const metaKey = META_KEYS.find((k) => t.startsWith(`${k}:`))
    if (metaKey && !current) {
      meta.push([metaKey, t.slice(metaKey.length + 1).trim()])
      continue
    }

    const header = t.match(/^SECTION\s+(\d+)\s*[—–-]\s*(.+)$/i)
    if (header) {
      current = { n: header[1], title: header[2].trim(), body: [] }
      sections.push(current)
      continue
    }

    if (current) current.body.push(t)
    else {
      current = { n: null, title: null, body: [t] }
      sections.push(current)
    }
  }

  return { meta, sections }
}

/** Renders `**bold**` runs without dangerouslySetInnerHTML. */
function RichText({ text }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean)
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**') ? (
          <strong key={i} className="font-semibold text-slate-200">
            {p.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  )
}

export default function ForensicReport({
  report,
  loading = false,
  grounded = true,
  durationMs,
  transactionId,
  analysisId,
}) {
  const { meta, sections } = useMemo(() => parseReport(report), [report])
  const [plain, setPlain] = useState(null)
  const [explaining, setExplaining] = useState(false)
  const [explainError, setExplainError] = useState(null)

  const explain = async () => {
    setExplaining(true)
    setExplainError(null)
    try {
      setPlain(await explainPlainly(analysisId))
    } catch (e) {
      setExplainError(e?.response?.data?.detail ?? 'Could not produce an explanation.')
    } finally {
      setExplaining(false)
    }
  }

  if (loading) {
    return (
      <Card className="p-5 sm:p-6">
        <CardHeader title="Forensic report" description="Generating the grounded narrative…" />
        <div className="mt-5 space-y-2.5">
          {[92, 100, 78, 96, 64].map((w, i) => (
            <div
              key={i}
              className="h-3 animate-pulse rounded bg-surface-overlay"
              style={{ width: `${w}%` }}
            />
          ))}
        </div>
      </Card>
    )
  }

  if (!report) {
    return (
      <Card className="p-5 sm:p-6">
        <CardHeader
          title="Forensic report"
          description="Generated once the pipeline reaches the report stage."
        />
        <div className="mt-5 rounded-xl border border-dashed border-subtle p-6 text-center text-xs text-slate-500">
          No report yet — run the pipeline.
        </div>
      </Card>
    )
  }

  return (
    <Card className="p-5 sm:p-6">
      <CardHeader
        title="Forensic report"
        description="The model may cite only the retrieved typology and the actual scores from earlier stages."
        action={
          <div className="flex items-center gap-2 print:hidden">
            {typeof durationMs === 'number' && (
              <Badge tone="low">{(durationMs / 1000).toFixed(1)}s</Badge>
            )}
            {analysisId && !plain && (
              <Button size="sm" variant="ghost" loading={explaining} onClick={explain}>
                Explain simply
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => window.print()}>
              Save as PDF
            </Button>
          </div>
        }
      />

      {explainError && <Alert tone="error" className="mt-4">{explainError}</Alert>}

      {plain && (
        <div className="mt-5 rounded-xl border border-accent-500/25 bg-accent-500/[0.06] p-5">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[14px] font-semibold uppercase tracking-wider text-accent-400">
              In plain language
            </p>
            <button
              onClick={() => setPlain(null)}
              className="shrink-0 text-[15px] text-slate-500 hover:text-slate-300 print:hidden"
            >
              hide
            </button>
          </div>
          <p className="ds-prose ds-prose--tight mt-2">
            {plain.plain_english}
          </p>
          {/* Said plainly, because a reader must not mistake this for a second
              opinion that independently agrees with the first. */}
          <p className="mt-3 text-[14px] leading-relaxed text-slate-500">
            A restatement of the report below — same evidence, no new analysis.
          </p>
        </div>
      )}

      <div
        data-print-region="forensic-report"
        className="mt-5 rounded-xl border border-subtle bg-surface-raised p-5 sm:p-6"
      >
        {/* Document header — carries identity into print, where page chrome is gone */}
        <div className="border-b border-subtle pb-4">
          <p className="text-[14px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            DeepSentinel · Case investigation report
          </p>
          <p className="mt-1 break-all font-mono text-xs text-slate-400">
            {transactionId ?? meta.find(([k]) => k === 'Transaction ID')?.[1]}
          </p>
          {!grounded && (
            <p className="mt-2 text-[15px] font-medium text-risk-medium">
              Ungrounded baseline — generated without retrieved context, for
              comparison only.
            </p>
          )}
        </div>

        {meta.length > 0 && (
          <dl className="mt-4 grid gap-x-8 gap-y-2 sm:grid-cols-2">
            {meta.map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="text-[14px] uppercase tracking-wider text-slate-500">{k}</dt>
                <dd className="mt-0.5 break-words text-xs text-slate-200">{v}</dd>
              </div>
            ))}
          </dl>
        )}

        {/* Set as prose, not as UI. This is the longest thing the product
            writes and the one a compliance officer reads end to end; at 14px
            muted grey across a ninety-character measure it was formatted like
            a tooltip. */}
        <div className="ds-prose mt-6">
          {/* Flat rather than wrapped in <section>: the rhythm rules key off
              direct children, so nesting would silently drop the spacing that
              keeps a heading attached to the paragraph it introduces. */}
          {sections.map((s, i) => (
            <Fragment key={i}>
              {s.title && (
                <h3>
                  {s.n && (
                    <span className="mr-2 font-mono text-[0.78em] text-accent-400">
                      {s.n}
                    </span>
                  )}
                  {s.title}
                </h3>
              )}
              {s.body.map((para, j) => (
                <p key={j}>
                  <RichText text={para} />
                </p>
              ))}
            </Fragment>
          ))}
        </div>

        <p className="mt-6 border-t border-subtle pt-3 text-[14px] leading-relaxed text-slate-500">
          Every claim above traces to a pipeline stage that produced it. Scores
          come from the deployed models; the typology comes from the FATF
          retrieval step; the narrative may not introduce facts absent from
          those inputs.
        </p>
      </div>
    </Card>
  )
}
