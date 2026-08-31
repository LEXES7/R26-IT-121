import { useEffect, useState } from 'react'
import { getGraphModel } from '../services/api'

/**
 * What the network detector is serving, and what its numbers are worth.
 *
 * Every figure here comes from the detector's own /health rather than being
 * restated in this file. That is deliberate: a page that hardcodes a model's
 * accuracy will still be quoting it long after the model changed, and this
 * project has already had to withdraw a number that was measured on the wrong
 * window. The service reports what it is actually serving; the page shows it.
 *
 * The protocol line is the most important thing on the panel and the least
 * eye-catching. A score without knowing whether the window it was measured on
 * was held out is not a result.
 */
export default function GraphModelPanel() {
  const [m, setM] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    getGraphModel()
      .then((r) => { if (alive) setM(r) })
      .catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [])

  if (failed || !m) return null

  const meta = m.model_meta ?? {}
  const rt = m.runtime ?? {}
  const bands = m.risk_bands ?? {}
  const perf = m.performance
  const n = (v) => (v == null ? '—' : Number(v).toLocaleString())

  return (
    <section className="rounded-xl border p-5"
             style={{ borderColor: 'rgb(var(--ds-line))' }}>
      <h2 className="text-[19px] font-semibold">How the network detector is doing</h2>

      <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Accounts', n(m.num_nodes), 'in the served graph'],
          ['Transfers', n(m.num_edges), 'between them'],
          ['Parameters', n(rt.model?.parameters), `${rt.model?.k_hop ?? 2} hops · ${rt.model?.in_dim ?? '—'} features`],
          ['Forward passes', n(rt.model?.inferences), rt.serving_mode === 'live_inference'
            ? 'weights loaded, scoring live' : 'answering from precomputed scores'],
        ].map(([k, v, note]) => (
          <div key={k} className="min-w-0">
            <p className="ds-mono text-[11px] uppercase tracking-[.13em]"
               style={{ color: 'rgb(var(--ds-faint))' }}>{k}</p>
            <p className="numeric mt-1 truncate text-[24px] leading-none">{v}</p>
            <p className="mt-1 truncate text-[13px]"
               style={{ color: 'rgb(var(--ds-muted))' }}>{note}</p>
          </div>
        ))}
      </div>

      {/* How well it scores, on the window it was never trained on. */}
      {perf && (
        <div className="mt-6" style={{ borderTop: '1px solid rgb(var(--ds-line))',
                                       paddingTop: 20 }}>
          <p className="ds-mono text-[11px] uppercase tracking-[.13em]"
             style={{ color: 'rgb(var(--ds-faint))' }}>
            On the held-out window · steps {perf.window?.from_step}–{perf.window?.to_step}
          </p>
          <div className="mt-3 grid gap-5 sm:grid-cols-3 lg:grid-cols-5">
            {[
              ['Precision', perf.metrics?.precision, 'of those it flags, this share are mules'],
              ['Recall', perf.metrics?.recall, 'of the mules present, this share are found'],
              ['F1', perf.metrics?.f1, 'the balance of the two'],
              ['AUROC', perf.metrics?.auroc, 'how well it ranks mules above the rest'],
              ['Accuracy', perf.metrics?.accuracy, 'see the note below'],
            ].map(([k, v, note]) => (
              <div key={k} className="min-w-0">
                <p className="ds-mono text-[11px] uppercase tracking-[.13em]"
                   style={{ color: 'rgb(var(--ds-faint))' }}>{k}</p>
                <p className="numeric mt-1 text-[24px] leading-none">
                  {v != null ? Number(v).toFixed(3) : '—'}
                </p>
                <p className="mt-1 text-[13px] leading-snug"
                   style={{ color: 'rgb(var(--ds-muted))' }}>{note}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-[13px]"
               style={{ color: 'rgb(var(--ds-muted))' }}>
            <span>{Number(perf.evaluated_accounts ?? 0).toLocaleString()} accounts evaluated</span>
            <span>{Number(perf.actual_mules ?? 0).toLocaleString()} were mules</span>
            <span className="ds-mono">
              tp {perf.confusion?.tp} · fp {perf.confusion?.fp}
              {' · '}fn {perf.confusion?.fn} · tn {perf.confusion?.tn}
            </span>
          </div>

          <p className="mt-3 text-[13px] leading-relaxed"
             style={{ color: 'rgb(var(--ds-sev-high))' }}>
            Accuracy is the misleading one here and is shown only so it cannot
            be quoted out of context: mules are {perf.actual_mules && perf.evaluated_accounts
              ? `${((perf.actual_mules / perf.evaluated_accounts) * 100).toFixed(1)}%`
              : 'a small share'} of this population, so a model that flagged
            nothing at all would score about{' '}
            {perf.actual_mules && perf.evaluated_accounts
              ? (1 - perf.actual_mules / perf.evaluated_accounts).toFixed(3) : '—'}.
            Precision and recall are the figures that mean something.
          </p>
        </div>
      )}

      {/* The operating point, and where it came from. */}
      <div className="mt-6 grid gap-5 sm:grid-cols-3"
           style={{ borderTop: '1px solid rgb(var(--ds-line))', paddingTop: 20 }}>
        {[
          ['Flags at', bands.high != null ? Number(bands.high).toFixed(4) : '—',
            'the tuned decision threshold'],
          ['Critical at', bands.critical != null ? Number(bands.critical).toFixed(4) : '—',
            'the extreme tail of scored accounts'],
          ['Validation F1', meta.val_f1_at_tuned_threshold != null
            ? Number(meta.val_f1_at_tuned_threshold).toFixed(3) : '—',
            'what the threshold was chosen on'],
        ].map(([k, v, note]) => (
          <div key={k} className="min-w-0">
            <p className="ds-mono text-[11px] uppercase tracking-[.13em]"
               style={{ color: 'rgb(var(--ds-faint))' }}>{k}</p>
            <p className="numeric mt-1 text-[21px] leading-none">{v}</p>
            <p className="mt-1 text-[13px]" style={{ color: 'rgb(var(--ds-muted))' }}>{note}</p>
          </div>
        ))}
      </div>

      <dl className="mt-6 grid gap-2 text-[14px]"
          style={{ borderTop: '1px solid rgb(var(--ds-line))', paddingTop: 18 }}>
        {[
          ['Protocol', meta.protocol ?? '—'],
          ['Calibration', meta.calibration ?? '—'],
          ['Graph version', m.graph_version ?? '—'],
          ['Edge attention', meta.has_edge_attention ? 'on' : 'off'],
        ].map(([k, v]) => (
          <div key={k} className="flex flex-wrap justify-between gap-x-6">
            <dt style={{ color: 'rgb(var(--ds-muted))' }}>{k}</dt>
            <dd className="ds-mono" style={{ color: 'rgb(var(--ds-ink))' }}>{v}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-4 text-[13px] leading-relaxed" style={{ color: 'rgb(var(--ds-faint))' }}>
        Trained and evaluated on separate time windows, so nothing above was
        measured on data the model had already learned from. The F1 is the
        validation figure the threshold was chosen on — it is not a test score,
        and is shown as what it is.
      </p>
    </section>
  )
}
