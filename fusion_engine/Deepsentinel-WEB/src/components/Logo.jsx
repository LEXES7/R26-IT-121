/**
 * Wordmark.
 *
 * The glyph is a shield built from three converging strokes — the three
 * detectors resolving into one verdict, which is the whole product in one
 * mark. Drawn as SVG rather than set as "DS" in a gradient box so it stays
 * crisp at any size and inherits the theme.
 */
export default function Logo({ className = '', showWord = true }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden>
        <path
          d="M16 3 5 7v9.2C5 22.6 9.6 27.6 16 29c6.4-1.4 11-6.4 11-12.8V7Z"
          className="fill-accent-500/10 stroke-accent-500"
          strokeWidth="1.6"
        />
        {/* Three signals converging on a single point */}
        <path
          d="M10.5 11.5 16 17M21.5 11.5 16 17M16 9.5V17"
          className="stroke-accent-500"
          strokeWidth="1.6"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="16" cy="18.6" r="2.1" className="fill-accent-500" />
      </svg>
      {showWord && (
        <span className="hidden text-base font-semibold tracking-tight text-slate-200 sm:block">
          Deep<span className="text-accent-500">Sentinel</span>
        </span>
      )}
    </span>
  )
}
