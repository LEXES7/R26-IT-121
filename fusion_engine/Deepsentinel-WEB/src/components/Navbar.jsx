import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

const NAV_LINKS = [
  { to: '/', label: 'Overview' },
  { to: '/analyzer', label: 'Analyzer' },
  { to: '/settings', label: '⚙️ Settings' },
  { to: '/about', label: 'About' },
  { to: '/faq', label: 'FAQ' },
]

export default function Navbar() {
  const { pathname } = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <nav className="sticky top-0 z-50 border-b border-white/[0.06]" style={{ background: 'rgba(6,9,26,0.85)', backdropFilter: 'blur(16px)' }}>
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">

        {/* Logo */}
        <Link to="/" className="flex items-center gap-3 flex-shrink-0" onClick={() => setMobileOpen(false)}>
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-blue-500/30">
            DS
          </div>
          <span className="font-semibold text-white text-base tracking-tight">
            Deep<span className="text-blue-400">Sentinel</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden sm:flex items-center gap-1">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                pathname === l.to
                  ? 'text-white bg-white/10'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-white/[0.05]'
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>

        {/* Right side */}
        <div className="hidden sm:flex items-center gap-3">
          <a
            href="https://deepsent-api-production.up.railway.app/docs"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors font-medium"
          >
            API Docs ↗
          </a>
          <Link
            to="/analyzer"
            className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-all shadow-md shadow-blue-600/20"
          >
            Try Analyzer
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          className="sm:hidden text-slate-400 hover:text-white p-2 rounded-lg hover:bg-white/5 transition-colors"
          onClick={() => setMobileOpen(v => !v)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? '✕' : '☰'}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="sm:hidden border-t border-white/[0.06] px-4 py-3 space-y-1" style={{ background: 'rgba(6,9,26,0.95)' }}>
          {NAV_LINKS.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              onClick={() => setMobileOpen(false)}
              className={`block px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                pathname === l.to
                  ? 'bg-white/10 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-white/[0.05]'
              }`}
            >
              {l.label}
            </Link>
          ))}
          <div className="pt-2 px-4">
            <Link
              to="/analyzer"
              onClick={() => setMobileOpen(false)}
              className="block w-full text-center bg-blue-600 text-white text-sm font-semibold py-2.5 rounded-xl"
            >
              Try Analyzer
            </Link>
          </div>
        </div>
      )}
    </nav>
  )
}
