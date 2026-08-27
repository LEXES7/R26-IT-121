import { Card, cx } from './ui'

/**
 * Renders `children` when the package unlocks `feature`, and an explanation
 * when it does not.
 *
 * A locked feature that simply vanishes teaches the operator nothing and looks
 * like a bug. One that says which package includes it is the difference
 * between a missing button and an upgrade path.
 */
export default function Locked({ feature, has, upsells = {}, title, children, className }) {
  if (has(feature)) return children

  return (
    <Card className={cx('p-5 sm:p-6', className)}>
      <div className="flex items-start gap-4">
        <span
          aria-hidden="true"
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-subtle bg-surface-raised text-slate-500"
        >
          {/* A padlock, drawn rather than an emoji so it inherits theme colour */}
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="4" y="10" width="16" height="10" rx="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </svg>
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-200">
            {title ?? 'Not included in your package'}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            {upsells[feature] ?? 'Ask your administrator to enable this feature.'}
          </p>
        </div>
      </div>
    </Card>
  )
}
