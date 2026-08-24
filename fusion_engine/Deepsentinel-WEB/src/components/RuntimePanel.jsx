import { cx } from './ui'

/**
 * Proof the models are actually running.
 *
 * "Is it live?" is the first question an operator asks and the hardest to
 * answer from a dashboard of numbers, which look identical whether they are
 * streaming or frozen. This shows the thing itself: which detectors respond,
 * whether each has weights loaded, how many forward passes it has done and how
 * long it has been up.
 */
function Dot({ ok }) {
  return (
    <span
      className={cx(
        'inline-block h-1.5 w-1.5 shrink-0 rounded-full',
        ok ? 'animate-pulse bg-risk-low' : 'bg-slate-600',
      )}
    />
  )
}

function uptime(sec) {
  if (sec == null) return '—'
  const s = Math.floor(sec)
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
}

export default function RuntimePanel({ runtime }) {
  const detectors = runtime?.detectors ?? {}
  const rows = [
    ['graph', 'GraphSAGE', 'network'],
    ['behavioural', 'Stratified VAE', 'behaviour'],
    ['temporal', 'Temporal CNN', 'timing'],
  ]

  return (
    <section className="rounded-2xl border border-subtle bg-surface p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-slate-200">Model runtime</h2>
        <span className="text-[10px] text-slate-600">
          fusion: {runtime?.monitor?.fusion ?? '—'}
        </span>
      </div>

      <ul className="mt-4 space-y-2">
        {rows.map(([key, name, role]) => {
          const d = detectors[key] ?? {}
          const reachable = !!d.reachable
          const model = d.model
          const live = model?.loaded
          return (
            <li
              key={key}
              className="rounded-xl border border-subtle bg-sentinel-950 p-3"
            >
              <div className="flex items-center gap-2">
                <Dot ok={reachable} />
                <span className="text-xs font-semibold text-slate-200">{name}</span>
                <span className="text-[10px] text-slate-600">{role}</span>
                <span
                  className={cx(
                    'ml-auto rounded px-1.5 py-0.5 text-[10px] font-medium',
                    reachable
                      ? 'bg-risk-low/10 text-risk-low'
                      : 'bg-surface-raised text-slate-600',
                  )}
                >
                  {reachable ? (live ? 'weights loaded' : 'serving') : 'not deployed'}
                </span>
              </div>

              {reachable && model && (
                <dl className="mt-2 grid grid-cols-3 gap-2 text-[10px]">
                  <div>
                    <dt className="text-slate-600">params</dt>
                    <dd className="font-mono text-slate-400">
                      {model.parameters?.toLocaleString() ?? '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-600">forward passes</dt>
                    <dd className="font-mono text-slate-400">{model.inferences ?? 0}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-600">uptime</dt>
                    <dd className="font-mono text-slate-400">{uptime(model.uptime_seconds)}</dd>
                  </div>
                </dl>
              )}

              {!reachable && (
                <p className="mt-1.5 text-[10px] leading-relaxed text-slate-600">
                  Not reachable — this detector abstains, and fusion applies an
                  uncertainty penalty rather than treating silence as innocence.
                </p>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
