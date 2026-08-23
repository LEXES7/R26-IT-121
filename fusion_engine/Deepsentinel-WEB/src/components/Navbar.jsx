import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ROLE_LABELS, useAuth } from '../context/AuthContext'
import { Badge, cx } from './ui'

const ROLE_TONE = {
  admin: 'admin',
  risk_manager: 'manager',
  analyst: 'analyst',
}

/**
 * Primary navigation.
 *
 * Direct links stay flat; the administration group collapses into a dropdown so
 * the bar does not grow every time a page is added. Everything is filtered by
 * capability, so nobody is shown a destination that would refuse them.
 */
export default function Navbar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const auth = useAuth()

  const [mobileOpen, setMobileOpen] = useState(false)
  const [openMenu, setOpenMenu] = useState(null) // 'admin' | 'user' | null
  const navRef = useRef(null)

  const primary = auth.isAuthenticated
    ? [
        { to: '/', label: 'Overview' },
        { to: '/analyzer', label: 'Analyzer' },
        { to: '/batch', label: 'Batch upload' },
        { to: '/about', label: 'Architecture' },
      ]
    : [
        { to: '/', label: 'Overview' },
        { to: '/about', label: 'Architecture' },
        { to: '/faq', label: 'FAQ' },
      ]

  const adminLinks = [
    auth.canManageAlerts && {
      to: '/settings',
      label: 'Alert settings',
      detail: 'Recipients and thresholds',
    },
    auth.canManageUsers && {
      to: '/users',
      label: 'Users',
      detail: 'Accounts and roles',
    },
    auth.canViewAuditLog && {
      to: '/audit-log',
      label: 'Audit log',
      detail: 'Security event trail',
    },
  ].filter(Boolean)

  // Close menus on navigation
  useEffect(() => {
    setMobileOpen(false)
    setOpenMenu(null)
  }, [pathname])

  // Close on outside click or Escape
  useEffect(() => {
    if (!openMenu) return
    const onClick = (e) => {
      if (navRef.current && !navRef.current.contains(e.target)) setOpenMenu(null)
    }
    const onKey = (e) => e.key === 'Escape' && setOpenMenu(null)
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [openMenu])

  const handleSignOut = async () => {
    await auth.signOut()
    navigate('/login', { replace: true })
  }

  const initials = (auth.user?.full_name || auth.user?.username || '?')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const isAdminSectionActive = adminLinks.some((l) => l.to === pathname)

  return (
    <nav
      ref={navRef}
      className="sticky top-0 z-50 border-b border-subtle"
      style={{ background: 'rgba(6,9,26,0.85)', backdropFilter: 'blur(16px)' }}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link to="/" className="flex shrink-0 items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 text-sm font-bold text-white shadow-lg shadow-blue-500/30">
            DS
          </div>
          <span className="hidden text-base font-semibold tracking-tight text-white sm:block">
            Deep<span className="text-blue-400">Sentinel</span>
          </span>
        </Link>

        {/* Desktop navigation */}
        <div className="hidden items-center gap-1 lg:flex">
          {primary.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              aria-current={pathname === l.to ? 'page' : undefined}
              className={cx(
                'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                pathname === l.to
                  ? 'bg-surface-overlay text-white'
                  : 'text-slate-400 hover:bg-surface-raised hover:text-slate-100',
              )}
            >
              {l.label}
            </Link>
          ))}

          {adminLinks.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setOpenMenu((m) => (m === 'admin' ? null : 'admin'))}
                aria-expanded={openMenu === 'admin'}
                aria-haspopup="menu"
                className={cx(
                  'flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isAdminSectionActive || openMenu === 'admin'
                    ? 'bg-surface-overlay text-white'
                    : 'text-slate-400 hover:bg-surface-raised hover:text-slate-100',
                )}
              >
                Administration
                <span
                  className={cx(
                    'text-[9px] transition-transform',
                    openMenu === 'admin' && 'rotate-180',
                  )}
                >
                  ▼
                </span>
              </button>

              {openMenu === 'admin' && (
                <div
                  role="menu"
                  className="absolute left-0 mt-2 w-64 animate-slide-up overflow-hidden rounded-xl border border-subtle shadow-2xl"
                  style={{ background: 'rgba(15,23,42,0.98)', backdropFilter: 'blur(16px)' }}
                >
                  <div className="p-1.5">
                    {adminLinks.map((l) => (
                      <Link
                        key={l.to}
                        to={l.to}
                        role="menuitem"
                        className={cx(
                          'block rounded-lg px-3 py-2.5 transition-colors',
                          pathname === l.to
                            ? 'bg-surface-overlay'
                            : 'hover:bg-surface-raised',
                        )}
                      >
                        <span className="block text-sm text-slate-200">{l.label}</span>
                        <span className="mt-0.5 block text-[11px] text-slate-600">
                          {l.detail}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2">
          {auth.isAuthenticated ? (
            <div className="relative hidden lg:block">
              <button
                onClick={() => setOpenMenu((m) => (m === 'user' ? null : 'user'))}
                aria-expanded={openMenu === 'user'}
                aria-haspopup="menu"
                className="flex items-center gap-2 rounded-lg py-1.5 pl-1.5 pr-2.5 transition-colors hover:bg-surface-raised"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-slate-600 to-slate-700 text-[11px] font-semibold text-white">
                  {initials}
                </span>
                <span className="max-w-[9rem] truncate text-sm text-slate-300">
                  {auth.user?.full_name || auth.user?.username}
                </span>
                <span
                  className={cx(
                    'text-[9px] text-slate-600 transition-transform',
                    openMenu === 'user' && 'rotate-180',
                  )}
                >
                  ▼
                </span>
              </button>

              {openMenu === 'user' && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-64 animate-slide-up overflow-hidden rounded-xl border border-subtle shadow-2xl"
                  style={{ background: 'rgba(15,23,42,0.98)', backdropFilter: 'blur(16px)' }}
                >
                  <div className="border-b border-subtle p-4">
                    <p className="truncate text-sm font-medium text-white">
                      {auth.user?.full_name}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">{auth.user?.email}</p>
                    <Badge tone={ROLE_TONE[auth.role]} className="mt-2">
                      {ROLE_LABELS[auth.role] ?? auth.role}
                    </Badge>
                  </div>
                  <div className="p-1.5">
                    <Link
                      to="/account"
                      role="menuitem"
                      className="block rounded-lg px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-surface-raised hover:text-white"
                    >
                      Account &amp; password
                    </Link>
                    <button
                      onClick={handleSignOut}
                      role="menuitem"
                      className="block w-full rounded-lg px-3 py-2 text-left text-sm text-red-400 transition-colors hover:bg-red-500/10"
                    >
                      Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <Link
              to="/login"
              className="hidden rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition-colors hover:bg-blue-500 lg:block"
            >
              Sign in
            </Link>
          )}

          <button
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-surface-raised hover:text-white lg:hidden"
            onClick={() => setMobileOpen((v) => !v)}
            aria-expanded={mobileOpen}
            aria-label="Toggle navigation"
          >
            {mobileOpen ? '✕' : '☰'}
          </button>
        </div>
      </div>

      {/* Mobile */}
      {mobileOpen && (
        <div
          className="max-h-[calc(100vh-4rem)] space-y-1 overflow-y-auto border-t border-subtle px-4 py-3 lg:hidden"
          style={{ background: 'rgba(6,9,26,0.98)' }}
        >
          {primary.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className={cx(
                'block rounded-xl px-4 py-2.5 text-sm font-medium transition-colors',
                pathname === l.to
                  ? 'bg-surface-overlay text-white'
                  : 'text-slate-400 hover:bg-surface-raised hover:text-white',
              )}
            >
              {l.label}
            </Link>
          ))}

          {adminLinks.length > 0 && (
            <div className="pt-3">
              <p className="px-4 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                Administration
              </p>
              {adminLinks.map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  className={cx(
                    'block rounded-xl px-4 py-2.5 transition-colors',
                    pathname === l.to
                      ? 'bg-surface-overlay'
                      : 'hover:bg-surface-raised',
                  )}
                >
                  <span
                    className={cx(
                      'block text-sm font-medium',
                      pathname === l.to ? 'text-white' : 'text-slate-400',
                    )}
                  >
                    {l.label}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-slate-600">{l.detail}</span>
                </Link>
              ))}
            </div>
          )}

          <div className="mt-3 space-y-1 border-t border-subtle pt-3">
            {auth.isAuthenticated ? (
              <>
                <div className="px-4 py-2">
                  <p className="truncate text-sm text-white">{auth.user?.full_name}</p>
                  <p className="truncate text-xs text-slate-600">{auth.user?.email}</p>
                  <Badge tone={ROLE_TONE[auth.role]} className="mt-1.5">
                    {ROLE_LABELS[auth.role] ?? auth.role}
                  </Badge>
                </div>
                <Link
                  to="/account"
                  className="block rounded-xl px-4 py-2.5 text-sm text-slate-400 hover:bg-surface-raised hover:text-white"
                >
                  Account &amp; password
                </Link>
                <button
                  onClick={handleSignOut}
                  className="block w-full rounded-xl px-4 py-2.5 text-left text-sm text-red-400 hover:bg-red-500/10"
                >
                  Sign out
                </button>
              </>
            ) : (
              <Link
                to="/login"
                className="block rounded-xl bg-blue-600 px-4 py-2.5 text-center text-sm font-semibold text-white"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      )}
    </nav>
  )
}
