import Logo from './Logo'
import FooterScene from './FooterScene'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { cx } from './ui'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const REPO = 'https://github.com/LEXES7/R26-IT-121'

/**
 * Footer.
 *
 * Doubles as a site map. Links gated on a capability are filtered out rather
 * than shown and refused, matching the navigation.
 */
export default function Footer() {
  const auth = useAuth()

  const columns = [
    {
      heading: 'Platform',
      links: [
        { to: '/', label: 'Overview' },
        { to: '/about', label: 'Architecture' },
        { to: '/faq', label: 'FAQ' },
        auth.isAuthenticated && { to: '/analyzer', label: 'Transaction analyzer' },
        auth.isAuthenticated && { to: '/batch', label: 'Batch upload' },
        !auth.isAuthenticated && { to: '/login', label: 'Sign in' },
      ].filter(Boolean),
    },
    {
      heading: 'Administration',
      links: [
        auth.canManageAlerts && { to: '/settings', label: 'Alert settings' },
        auth.canManageUsers && { to: '/users', label: 'User management' },
        auth.canViewAuditLog && { to: '/audit-log', label: 'Audit log' },
        auth.isAuthenticated && { to: '/account', label: 'Your account' },
      ].filter(Boolean),
    },
    {
      heading: 'Detection models',
      items: [
        { label: 'Edge-Enhanced GraphSAGE', detail: 'Network topology' },
        { label: 'Stratified VAE + DSAA', detail: 'Behavioural baseline' },
        { label: 'System-Context TCN', detail: 'Temporal rhythm' },
        { label: 'Logistic meta-classifier', detail: 'Score fusion' },
      ],
    },
    {
      heading: 'Developers',
      external: [
        { href: `${API_BASE}/docs`, label: 'API reference' },
        { href: `${API_BASE}/health`, label: 'Service health' },
        { href: REPO, label: 'Source repository' },
        { href: `${REPO}/tree/feature/fusion_engine`, label: 'Fusion engine' },
      ],
    },
  ].filter((c) => (c.links?.length ?? c.items?.length ?? c.external?.length) > 0)

  return (
    <footer className="relative mt-20 overflow-hidden border-t border-subtle">
      {/* Scenery sits behind and below the columns, bleeding to both edges. */}
      <FooterScene className="pointer-events-none absolute inset-x-0 bottom-0 h-56 w-full" />

      <div className="relative mx-auto max-w-7xl px-4 pb-40 pt-12 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_repeat(4,1fr)]">
          {/* Identity */}
          <div className="space-y-4">
            <div className="flex items-center gap-2.5">
              <Logo />
            </div>
            <p className="max-w-xs text-xs leading-relaxed text-slate-500">
              A multi-modal AI platform for explainable financial fraud detection.
              Combines graph, behavioural and temporal models with retrieval-grounded
              forensic reporting.
            </p>
            <a
              href="mailto:hello@deepsentinel.io"
              className="inline-block text-sm text-slate-400 transition-colors hover:text-accent-500"
            >
              hello@deepsentinel.io
            </a>

            <div>
              <Link
                to="/signup"
                className="inline-flex items-center gap-2 rounded-full border border-subtle bg-surface px-4 py-2 text-xs font-medium text-slate-300 transition-colors hover:border-accent-500/40 hover:text-slate-200"
              >
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 rounded-full bg-accent-500"
                />
                Talk to our team
              </Link>
            </div>

            <div className="flex flex-wrap gap-1.5 pt-1">
              {['FastAPI', 'PostgreSQL', 'ChromaDB', 'PyTorch', 'React'].map((t) => (
                <span
                  key={t}
                  className="rounded border border-subtle bg-surface px-1.5 py-0.5 font-mono text-[10px] text-slate-600"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {columns.map((col) => (
            <div key={col.heading} className="space-y-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                {col.heading}
              </p>

              <ul className="space-y-2 text-xs">
                {col.links?.map((l) => (
                  <li key={l.to}>
                    <Link to={l.to} className="text-slate-500 transition-colors hover:text-slate-300">
                      {l.label}
                    </Link>
                  </li>
                ))}

                {col.external?.map((l) => (
                  <li key={l.href}>
                    <a
                      href={l.href}
                      target="_blank"
                      rel="noreferrer"
                      className="text-slate-500 transition-colors hover:text-slate-300"
                    >
                      {l.label} <span className="text-slate-700">↗</span>
                    </a>
                  </li>
                ))}

                {col.items?.map((it) => (
                  <li key={it.label} className="leading-snug">
                    <span className="block text-slate-500">{it.label}</span>
                    <span className="block text-[10px] text-slate-700">{it.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Research provenance */}
        <div className="mt-10 grid gap-4 border-t border-subtle pt-8 sm:grid-cols-3">
          {[
            {
              label: 'Institution',
              value: 'Sri Lanka Institute of Information Technology',
              detail: 'Final Year Research Project 2026',
            },
            {
              label: 'Alignment',
              value: 'UN SDG 16 · SDG 9',
              detail: 'Strong institutions · Industry and innovation',
            },
          ].map((b) => (
            <div key={b.label}>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                {b.label}
              </p>
              <p className="mt-1 text-xs text-slate-400">{b.value}</p>
              <p className="mt-0.5 text-[10px] text-slate-700">{b.detail}</p>
            </div>
          ))}
        </div>

        <div
          className={cx(
            'mt-8 flex flex-col items-center justify-between gap-3 border-t border-subtle pt-6',
            'text-[11px] text-slate-700 sm:flex-row',
          )}
        >
          <p>© 2026 DeepSentinel · Research prototype</p>
          <p className="text-center sm:text-right">
            Evaluated on the PaySim synthetic dataset. Not certified for production
            financial decisioning.
          </p>
        </div>
      </div>
    </footer>
  )
}
