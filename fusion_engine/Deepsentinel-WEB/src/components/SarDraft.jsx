import { Fragment, useCallback, useEffect, useState } from 'react'
import {
  createSarDraft,
  decideSarDraft,
  getSarDraft,
  reviseSarDraft,
} from '../services/api'
import { Alert, Badge, Button, Card, CardHeader, SectionLabel, cx } from './ui'

/**
 * Draft a Suspicious Activity Report from a stored alert, and carry it through
 * review.
 *
 * A SAR is a legal statement made by a named officer. This component drafts
 * one and never does more than that: the banner is always present, the
 * generated text is kept beside whatever the officer edits, approval is
 * attributed, and nothing here submits anything to anyone. The "Save as PDF"
 * output carries the same banner, because a printed page outlives the screen
 * that explained it.
 */

const STATUS_TONE = {
  draft: { label: 'Draft', tone: 'medium' },
  under_review: { label: 'Under review', tone: 'medium' },
  approved: { label: 'Approved', tone: 'low' },
  rejected: { label: 'Rejected', tone: 'high' },
}

/** Splits `SECTION n — TITLE` blocks, same shape the forensic report uses. */
function parseSections(raw) {
  if (!raw) return []
  const sections = []
  let current = null
  for (const line of raw.split('\n')) {
    const t = line.trim()
    if (!t) continue
    const header = t.match(/^SECTION\s+(\d+)\s*[—–-]\s*(.+)$/i)
    if (header) {
      current = { n: header[1], title: header[2].trim(), body: [] }
      sections.push(current)
    } else if (current) {
      current.body.push(t)
    } else {
      current = { n: null, title: null, body: [t] }
      sections.push(current)
    }
  }
  return sections
}

export default function SarDraft({ analysisId, classification }) {
  const [draft, setDraft] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')

  const load = useCallback(async () => {
    if (!analysisId) return
    try {
      setDraft(await getSarDraft(analysisId))
    } catch {
      setDraft(null)      // 404 simply means none drafted yet
    }
  }, [analysisId])

  useEffect(() => {
    load()
  }, [load])

  const run = async (fn) => {
    setLoading(true)
    setError(null)
    try {
      const next = await fn()
      setDraft(next)
      setEditing(false)
      return next
    } catch (e) {
      setError(e?.response?.data?.detail ?? 'The request failed.')
    } finally {
      setLoading(false)
    }
  }

  if (!analysisId) return null

  const status = STATUS_TONE[draft?.status] ?? STATUS_TONE.draft
  const body = draft?.edited_text || draft?.generated_text || ''
  const sections = parseSections(body)

  return (
    <Card className="p-5 sm:p-6">
      <CardHeader
        title="Regulatory report"
        description="A draft for a compliance officer to review. This system does not file reports."
        action={
          <div className="flex items-center gap-2 print:hidden">
            {draft && <Badge tone={status.tone}>{status.label}</Badge>}
            {draft && (
              <Button size="sm" variant="ghost" onClick={() => window.print()}>
                Save as PDF
              </Button>
            )}
          </div>
        }
      />

      {error && (
        <Alert tone="error" className="mt-4">
          {error}
        </Alert>
      )}

      {!draft && (
        <div className="mt-5">
          <p className="text-xs leading-relaxed text-slate-400">
            Drafts a suspicious activity report from this alert&rsquo;s stored
            evidence — the accounts, the model scores, the matched typology and
            the forensic narrative. It cites only what is already on the record.
          </p>
          <Button
            className="mt-4"
            loading={loading}
            onClick={() => run(() => createSarDraft(analysisId))}
          >
            Draft report
          </Button>
          {classification === 'LOW' && (
            <p className="mt-2 text-[11px] text-slate-500">
              This alert is classified LOW. A report is usually drafted for
              escalated cases.
            </p>
          )}
        </div>
      )}

      {draft && (
        <>
          {/* The banner is not dismissable and prints with the document. */}
          <div
            className={cx(
              'mt-5 rounded-xl border p-3',
              draft.status === 'approved'
                ? 'border-risk-low/30 bg-risk-low/[0.07]'
                : 'border-risk-medium/30 bg-risk-medium/[0.07]',
            )}
          >
            <p
              className={cx(
                'text-[11px] font-semibold uppercase tracking-wide',
                draft.status === 'approved' ? 'text-risk-low' : 'text-risk-medium',
              )}
            >
              {draft.watermark}
            </p>
          </div>

          <div
            data-print-region="forensic-report"
            className="mt-4 rounded-xl border border-subtle bg-surface-raised p-5 sm:p-6"
          >
            <div className="border-b border-subtle pb-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Suspicious Activity Report · draft
              </p>
              <p className="mt-1 text-[10px] text-slate-500">{draft.watermark}</p>
            </div>

            {editing ? (
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={22}
                className="mt-4 w-full rounded-lg border border-subtle bg-surface p-3 font-mono text-xs leading-relaxed text-slate-200"
              />
            ) : (
              <div className="ds-prose mt-5">
                {/* A regulatory filing, set as one. Flat children so the
                    prose rhythm applies — the spacing rules key off direct
                    children, so a <section> wrapper would drop them. */}
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
                      <p key={j}>{para}</p>
                    ))}
                  </Fragment>
                ))}
              </div>
            )}

            <div className="mt-5 border-t border-subtle pt-3">
              <SectionLabel>Provenance</SectionLabel>
              <dl className="mt-2 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                <Fact label="Drafted by" value={draft.generated_by ?? '—'} />
                <Fact label="Model" value={draft.model_version ?? '—'} />
                <Fact
                  label="Reviewed by"
                  value={draft.reviewed_by ?? 'Not yet reviewed'}
                />
                <Fact
                  label="Edited from original"
                  value={draft.was_edited ? 'Yes' : 'No'}
                />
              </dl>
              {draft.was_edited && (
                <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
                  The originally generated text is retained unchanged alongside
                  these edits, so what the model wrote can always be compared
                  with what was approved.
                </p>
              )}
            </div>
          </div>

          {/* ── Review actions ── */}
          <div className="mt-4 flex flex-wrap gap-2 print:hidden">
            {editing ? (
              <>
                <Button
                  loading={loading}
                  onClick={() => run(() => reviseSarDraft(draft.id, text))}
                >
                  Save edits
                </Button>
                <Button variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              draft.status !== 'approved' && (
                <>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setText(body)
                      setEditing(true)
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    loading={loading}
                    onClick={() => run(() => decideSarDraft(draft.id, true))}
                  >
                    Approve
                  </Button>
                  <Button
                    variant="ghost"
                    loading={loading}
                    onClick={() => run(() => decideSarDraft(draft.id, false))}
                  >
                    Reject
                  </Button>
                </>
              )
            )}
          </div>

          <p className="mt-3 text-[10px] leading-relaxed text-slate-500 print:hidden">
            Approving records that you accepted this text. It does not submit
            anything — filing remains a separate action in your own system of
            record.
          </p>
        </>
      )}
    </Card>
  )
}

function Fact({ label, value }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-xs text-slate-300">{value}</dd>
    </div>
  )
}
