import { useTheme } from '../context/ThemeContext'
import { cx } from './ui'

/** Sun/moon toggle. Labelled for screen readers; the icon alone is not a name. */
export default function ThemeToggle({ className }) {
  const { theme, toggle } = useTheme()
  const dark = theme === 'dark'

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${dark ? 'light' : 'dark'} mode`}
      title={`Switch to ${dark ? 'light' : 'dark'} mode`}
      className={cx(
        'inline-flex h-9 w-9 items-center justify-center rounded-lg border border-subtle text-slate-400',
        'transition-colors hover:border-strong hover:text-slate-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500',
        className,
      )}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        aria-hidden
      >
        {dark ? (
          <path d="M20 13.5A8.2 8.2 0 0 1 10.5 4a8.5 8.5 0 1 0 9.5 9.5Z" />
        ) : (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.5 1.5m11.2 11.2 1.5 1.5M19.1 4.9l-1.5 1.5M6.4 17.6l-1.5 1.5" />
          </>
        )}
      </svg>
    </button>
  )
}
