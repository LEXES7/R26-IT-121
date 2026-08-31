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
function Dot({ ok, warn }) {
  return (
    <span
      className={cx(
        'mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full',
        ok ? 'animate-pulse bg-risk-low' : warn ? 'bg-risk-medium' : 'bg-slate-600',
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
  // British spelling is what the monitor runtime keys on. Getting this wrong
  // reported a live detector as offline three separate times.
  const rows = [
    ['graph', 'Edge-Enhanced GraphSAGE', 'network'],
    ['behavioural', 'Stratified VAE', 'behaviour'],
    ['temporal', 'Transaction-Sequence TCN', 'timing'],
  ]
  const live = rows.filter(([k]) => detectors[k]?.ready).length

  return (
    <section>
      <div className="flex items-baseline justify-between">
        <h3 className="text-xs font-semibold text-slate-200">Model runtime</h3>
        <span className="text-[14px] text-slate-600">{live}/3 reachable</span>
      </div>

      <div className="rows mt-2">
        {rows.map(([key, name, role]) => {
          const d = detectors[key] ?? {}
          const reachable = !!d.reachable
          // Answering a probe is not the same as being able to score. A
          // service that started without its weights replies 200 and returns
          // nothing useful; counting it as live is how a dead detector hides.
          const ready = !!d.ready
          const model = d.model
          const state = !reachable ? 'offline'
            : !ready ? 'no model'
            : d.warming_up ? 'warming up'
            : model?.loaded ? 'weights loaded' : 'serving'
          return (
            <div key={key} className="py-2.5">
              <div className="flex items-baseline gap-2">
                <Dot ok={ready} warn={reachable && !ready} />
                <span className={cx('text-xs', ready ? 'text-slate-200' : 'text-slate-500')}>
                  {name}
                </span>
                <span className={cx('ml-auto text-[14px]',
                  reachable && !ready ? 'text-risk-medium' : 'text-slate-600')}>
                  {state}
                </span>
              </div>
              <p className="mt-0.5 pl-3.5 text-[14px] text-slate-600">{role}</p>

              {reachable && model && (
                <dl className="mt-2 grid grid-cols-3 gap-2 pl-3.5 text-[14px]">
                  <div>
                    <dt className="text-slate-600">params</dt>
                    <dd className="numeric text-slate-400">
                      {model.parameters?.toLocaleString() ?? '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-600">passes</dt>
                    <dd className="numeric text-slate-400">{model.inferences ?? 0}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-600">uptime</dt>
                    <dd className="numeric text-slate-400">{uptime(model.uptime_seconds)}</dd>
                  </div>
                </dl>
              )}

              {!ready && (
                <p className="mt-1 pl-3.5 text-[14px] leading-relaxed text-slate-600">
                  {!reachable
                    ? `Not reachable — this detector abstains, and fusion applies
                       an uncertainty penalty rather than treating silence as
                       innocence.`
                    : d.missing_artifacts?.length
                      ? `Running, but its weights are not on disk, so it cannot
                         score. Missing: ${d.missing_artifacts.join(', ')}.`
                      : `Running, but not ready to score. It abstains until it
                         is.`}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
