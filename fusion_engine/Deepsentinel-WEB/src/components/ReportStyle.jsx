import { useCallback, useEffect, useRef, useState } from 'react'
import { getReportStyles, chooseReportStyle, reportStylePreviewUrl } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { Alert, cx } from './ui'

/**
 * Pick how the forensic report looks, having actually seen it.
 *
 * The preview is the real PDF, rendered by the same function that builds the
 * attachment — not a picture of one and not an HTML approximation. A preview
 * that only resembles the artefact is the kind that gets believed and then
 * turns out to be wrong, which is exactly what happened with the email
 * template before it was pointed at the shipping code.
 *
 * Every signed-in role can look. Choosing is for administrators and risk
 * managers, because the setting is shared — one person's pick becomes the
 * document everybody's alerts carry. The buttons are hidden for an analyst as
 * a courtesy; require_manager on the route is the actual control.
 *
 * The PDF is fetched through the API client and turned into a blob URL: the
 * endpoint needs a bearer token and an <iframe src> cannot carry one. Object
 * URLs are revoked on unmount and on every re-fetch, or a few minutes of
 * clicking between styles leaks a PDF per click.
 */
export default function ReportStyle() {
  const { canManageAlerts } = useAuth()
  const [styles, setStyles] = useState([])
  const [selected, setSelected] = useState(null)
  const [showing, setShowing] = useState(null)
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const urlRef = useRef(null)

  const revoke = useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current)
      urlRef.current = null
    }
  }, [])

  const load = useCallback(async () => {
    try {
      const d = await getReportStyles()
      setStyles(d.styles ?? [])
      setSelected(d.selected ?? null)
      setShowing((s) => s ?? d.selected ?? d.styles?.[0]?.name ?? null)
    } catch (err) {
      setError(err?.userMessage ?? 'Could not load the report styles.')
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => revoke, [revoke])

  // Fetch the PDF for whichever style is being shown.
  useEffect(() => {
    if (!showing) return
    let stale = false
    setPreview(null)
    reportStylePreviewUrl(showing)
      .then((url) => {
        if (stale) { URL.revokeObjectURL(url); return }
        revoke()
        urlRef.current = url
        setPreview(url)
      })
      .catch((err) => setError(err?.userMessage ?? 'Could not render the preview.'))
    return () => { stale = true }
  }, [showing, revoke])

  const pick = async (name) => {
    setBusy(true)
    setError(null)
    try {
      await chooseReportStyle(name)
      setSelected(name)
      await load()
    } catch (err) {
      setError(err?.userMessage ?? 'Could not change the report style.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section style={{ display: 'grid', gap: 14 }}>
      <div>
        <h2 className="text-sm font-semibold text-slate-100">Forensic report style</h2>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-400">
          How the PDF attached to every alert looks. The styles differ in
          appearance only — the same facts, in the same order, in the same
          words. {canManageAlerts
            ? 'Your choice applies to every report the system sends from now on.'
            : 'An administrator or risk manager sets which one is used.'}
        </p>
      </div>

      {error && <Alert tone="danger">{error}</Alert>}

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'minmax(0,260px) 1fr' }}>
        <div style={{ display: 'grid', gap: 8, alignContent: 'start' }}>
          {styles.map((s) => {
            const active = s.name === showing
            const inUse = s.name === selected
            return (
              <button
                key={s.name}
                onClick={() => setShowing(s.name)}
                className={cx(
                  'rounded-lg border p-3 text-left transition-colors',
                  active
                    ? 'border-accent-400/60 bg-accent-400/5'
                    : 'border-slate-800 hover:border-slate-700',
                )}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-slate-100">{s.label}</span>
                  {inUse && (
                    <span className="numeric shrink-0 text-[10px] uppercase tracking-wider text-accent-400">
                      in use
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{s.blurb}</p>
                {canManageAlerts && !inUse && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); if (!busy) pick(s.name) }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault(); e.stopPropagation(); if (!busy) pick(s.name)
                      }
                    }}
                    className="mt-2 inline-block text-[11px] text-slate-300 underline
                               decoration-slate-600 underline-offset-2 hover:text-slate-100"
                  >
                    {busy ? 'Applying…' : 'Use this one'}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950/40">
          {preview ? (
            <iframe
              key={preview}
              src={preview}
              title={`Forensic report preview — ${showing}`}
              style={{ width: '100%', height: 620, border: 0, display: 'block' }}
            />
          ) : (
            <p className="py-24 text-center text-xs text-slate-500">
              Rendering the report…
            </p>
          )}
        </div>
      </div>

      <p className="text-[11px] text-slate-500">
        This is the real PDF, produced by the same code that builds the
        attachment — not a mock-up of it.
      </p>
    </section>
  )
}
