import { cx } from './ui'

/**
 * Editorial primitives.
 *
 * A small shared vocabulary for marketing-style pages: slashed section labels,
 * two-tone display headings, and arrow links. Kept here rather than repeated
 * inline so the voice stays consistent as pages are added.
 */

/** `// Section label //` — the eyebrow above a display heading. */
export function Eyebrow({ children, className }) {
  return (
    <p className={cx('text-xs font-medium tracking-wide text-accent-500', className)}>
      <span aria-hidden className="opacity-50">//</span> {children}{' '}
      <span aria-hidden className="opacity-50">//</span>
    </p>
  )
}

/**
 * Display heading. The second line carries the accent, so the eye lands on the
 * specific claim rather than the generic opener.
 */
export function Display({ lead, accent, className, as: Tag = 'h2' }) {
  return (
    <Tag
      className={cx(
        'text-4xl font-bold leading-[1.05] tracking-tight text-slate-200 sm:text-5xl',
        className,
      )}
    >
      {lead}
      {accent && (
        <>
          <br />
          <span className="text-accent-500">{accent}</span>
        </>
      )}
    </Tag>
  )
}

/** Solid accent pill, used for categories and modality tags. */
export function Tag({ children, className }) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-lg bg-accent-500 px-3 py-1.5 text-xs font-semibold text-white',
        className,
      )}
    >
      {children}
    </span>
  )
}

/** Text link with a nudging arrow. */
export function ArrowLink({ children, className, as: Tag = 'span', ...props }) {
  return (
    <Tag
      className={cx(
        'group inline-flex items-center gap-2 text-sm font-semibold text-slate-200 transition hover:text-accent-400',
        className,
      )}
      {...props}
    >
      {children}
      <span aria-hidden className="transition-transform group-hover:translate-x-1">
        →
      </span>
    </Tag>
  )
}
