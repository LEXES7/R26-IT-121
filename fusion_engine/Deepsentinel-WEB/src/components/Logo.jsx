import { useTheme } from '../context/ThemeContext'
import markDark from '../assets/deepsentinel-logo.png'
import markLight from '../assets/deepsentinel-logo-light.png'

/**
 * Wordmark.
 *
 * The mark is a supplied image rather than the SVG this used to draw, so the
 * artwork is whatever the brand file says it is.
 *
 * Two files, swapped on theme. The supplied artwork is navy line-work on a
 * near-white plate, which disappears on a near-black ground — so the dark
 * variant drops the plate to transparent and lifts the line-work, leaving the
 * drawing itself. Tinting one file with a CSS filter would have flattened the
 * inner detail; two files keep it.
 */
export default function Logo({ className = '', showWord = true, size = 50 }) {
  const { theme } = useTheme()
  const mark = theme === 'light' ? markDark : markLight

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      {/* Sized from a prop through `style` rather than a Tailwind class. A class
          name built from a variable is not in the source for the compiler to
          find, so it is purged from the production build — the mark then looks
          right in dev and comes out unsized once built. 50px sits inside the
          navbar's 60px row with five pixels above and below. */}
      <img
        src={mark}
        alt=""
        aria-hidden
        width={size}
        height={size}
        className="shrink-0 select-none object-contain"
        style={{ width: size, height: size }}
        draggable={false}
      />
      {showWord && (
        <span className="hidden text-base font-semibold tracking-tight text-slate-200 sm:block">
          Deep<span className="text-accent-500">Sentinel</span>
        </span>
      )}
    </span>
  )
}
