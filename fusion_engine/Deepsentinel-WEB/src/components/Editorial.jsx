import { cx } from './ui'

/**
 * Editorial primitives.
 *
 * A small shared vocabulary for marketing-style pages: slashed section labels,
 * two-tone display headings, and arrow links. Kept here rather than repeated
 * inline so the voice stays consistent as pages are added.
 */

/** The small spaced label above a display heading. */
export function Eyebrow({ children, className }) {
  return (
    <p className={cx('eyebrow text-slate-500', className)}>{children}</p>
  )
}

/**
 * Display heading.
 *
 * Set in the display serif, with the second line italic and accented, so the
 * eye lands on the specific claim rather than the generic opener. This was a
 * bold sans heading — which is what every generated dashboard uses, and which
 * made each page that composes it read as one. Changing it here converts every
 * page that still uses the primitive.
 */
export function Display({ lead, accent, className, as: Tag = 'h2', stack = false }) {
  return (
    <Tag
      className={cx(
        'display text-[2.5rem] text-slate-100 sm:text-[3.25rem]',
        className,
      )}
    >
      {lead}
      {accent && (
        <>
          {/* Inline when the two halves are one sentence — "Four models, one
              verdict." Stacked when they are two separate ideas, as on a
              component page, where running a product name straight into its
              tagline reads as a layout fault. */}
          {stack ? <br /> : ' '}
          <span className="display-italic text-accent-400">{accent}</span>
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
