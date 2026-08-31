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
export default function Logo({ className = '', showWord = true }) {
  const { theme } = useTheme()
  const mark = theme === 'light' ? markDark : markLight

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <img
        src={mark}
        alt=""
        aria-hidden
        width={32}
        height={32}
        className="h-8 w-8 shrink-0 select-none object-contain"
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
