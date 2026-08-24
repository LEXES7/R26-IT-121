import { Link } from 'react-router-dom'
import Logo from './Logo'
import Globe from './Globe'
import { Eyebrow } from './Editorial'

/**
 * Split layout shared by sign in and sign up.
 *
 * The left panel carries the product argument so the page still says what
 * DeepSentinel is to someone who arrived on a deep link; the right holds the
 * form. Below `lg` the panel drops away entirely rather than stacking — on a
 * phone, marketing copy above a login form is just something to scroll past.
 */
export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="grid min-h-[calc(100vh-4rem)] lg:grid-cols-2">
      {/* Argument */}
      <aside className="relative hidden overflow-hidden border-r border-subtle bg-sentinel-900 lg:block">
        <div aria-hidden className="pointer-events-none absolute inset-0 grid-bg" />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-40 [mask-image:radial-gradient(circle,black_35%,transparent_70%)]"
        >
          <div className="h-[34rem] w-[34rem]">
            <Globe />
          </div>
        </div>

        <div className="relative flex h-full flex-col justify-between p-12">
          <Link to="/" aria-label="DeepSentinel home">
            <Logo />
          </Link>

          <div className="max-w-md">
            <Eyebrow>Multi-modal fraud detection</Eyebrow>
            <p className="mt-4 text-3xl font-bold leading-tight tracking-tight text-slate-200">
              Detect the fraud.
              <br />
              <span className="text-accent-500">Then prove it.</span>
            </p>
            <p className="mt-5 text-sm leading-relaxed text-slate-400">
              Three detectors, one fused verdict, and a forensic narrative where
              every claim traces back to a model output or a retrieved typology.
            </p>
          </div>

          <dl className="flex gap-10">
            {[
              ['0.406', 'Network F1'],
              ['3', 'Detectors'],
              ['<150ms', 'Response'],
            ].map(([v, l]) => (
              <div key={l}>
                <dd className="text-2xl font-bold tabular-nums text-slate-200">{v}</dd>
                <dt className="mt-1 text-[11px] text-slate-600">{l}</dt>
              </div>
            ))}
          </dl>
        </div>
      </aside>

      {/* Form */}
      <main className="flex items-center justify-center px-4 py-16 sm:px-6">
        <div className="w-full max-w-sm">
          <Link to="/" className="mb-10 inline-block lg:hidden" aria-label="DeepSentinel home">
            <Logo />
          </Link>

          <h1 className="text-2xl font-bold tracking-tight text-slate-200">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-slate-500">{subtitle}</p>}

          <div className="mt-8">{children}</div>

          {footer && <div className="mt-8 text-sm text-slate-500">{footer}</div>}
        </div>
      </main>
    </div>
  )
}
