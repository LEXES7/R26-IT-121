import { Link, useLocation } from 'react-router-dom'

/**
 * A page that says what happened.
 *
 * Unknown routes used to redirect silently to the home page. That is worse
 * than it sounds: a mistyped or stale link dumps the reader somewhere else
 * with no explanation, and they conclude the link was right and the site is
 * broken. Saying so costs one screen.
 */
export default function NotFound() {
  const { pathname } = useLocation()
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col justify-center px-5 py-20 sm:px-8">
      <p className="font-mono text-[15px] uppercase tracking-[0.18em] text-slate-500">
        404 · page not found
      </p>
      <h1 className="display mt-4 text-[2.6rem] leading-[1.05] text-slate-100">
        There is nothing at this address.
      </h1>
      <p className="ds-prose mt-5">
        <code>{pathname}</code> does not match any page. It may have been renamed,
        or the link that brought you here may be out of date.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          to="/"
          className="rounded-lg bg-accent-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-400"
        >
          Back to the start
        </Link>
        <Link
          to="/dashboard"
          className="rounded-lg border border-subtle px-4 py-2 text-sm text-slate-300 transition-colors hover:border-slate-600 hover:text-slate-100"
        >
          Open the console
        </Link>
      </div>
    </div>
  )
}
