import { useTheme } from '../context/ThemeContext'
import markLight from '../assets/deepsentinel-mark.png'
import markDark from '../assets/deepsentinel-mark-dark.png'

/**
 * Wordmark.
 *
 * The glyph used to be drawn here as SVG — a shield with three strokes
 * converging on a point, standing for the three detectors resolving into one
 * verdict. It was a fair illustration of the architecture and it was not the
 * brand mark: the real one is a shield holding a globe with an eye at its
 * centre, and that is what the console's sidebar, the opening curtain and
 * every published document carry. One product with two marks is worse than
 * either mark on its own.
 *
 * Two assets rather than one and a CSS filter. The artwork is navy strokes
 * around an opaque near-white interior, so lightening it with
 * `brightness(0) invert(1)` drives both to white and the globe and the eye
 * vanish into the shield. The dark asset is the same drawing with that
 * interior made genuinely transparent.
 *
 * The wordmark itself is unchanged.
 */
export default function Logo({ className = '', showWord = true, size = 50 }) {
  const { theme } = useTheme()

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      {/* Sized in a style rather than a Tailwind class: the value is a prop, and
          a class name assembled from a variable is not in the source for the
          compiler to find, so it would be purged from the build and the mark
          would come out unsized in production while looking right in dev.

          50px inside the navbar's 60px row leaves five pixels top and bottom.
          Anything larger needs that row to grow with it. */}
      <img
        src={theme === 'light' ? markLight : markDark}
        alt=""
        className="shrink-0"
        style={{ width: size, height: size }}
        aria-hidden
      />
      {showWord && (
        <span className="hidden text-base font-semibold tracking-tight text-slate-200 sm:block">
          Deep<span className="text-accent-500">Sentinel</span>
        </span>
      )}
    </span>
  )
}
