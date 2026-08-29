import { useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { getMonitorRuntime } from '../services/api'

/**
 * The signed-in application shell.
 *
 * A sidebar rather than a top bar, because the console has fourteen
 * destinations grouped into three jobs — observe, investigate, understand —
 * and a horizontal strip can neither show that grouping nor hold that many
 * items without becoming a menu of menus.
 *
 * The public site keeps its own chrome. A landing page is read once and has to
 * argue; a console is read all day and has to get out of the way, so the two
 * are deliberately not the same surface.
 *
 * The status line at the foot is live, not decoration: it reports how many
 * detectors can actually score, which is the one piece of system state that
 * changes what every number on every page means.
 */

/* Icons are inline rather than a library. Fourteen glyphs at ~15px do not
   justify a dependency, and these inherit currentColor so the nav's active
   and hover states need no extra rules. */
const I = {
  gauge: 'M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm0-4V6m8 6a8 8 0 1 0-16 0',
  activity: 'M3 12h4l3 8 4-16 3 8h4',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.35-4.35',
  archive: 'M3 7h18v13H3zM3 3h18v4H3zm7 8h4',
  sliders: 'M4 21v-7m0-4V3m8 18v-9m0-4V3m8 18v-5m0-4V3M1 14h6m2-6h6m2 8h6',
  upload: 'M12 16V4m0 0-4 4m4-4 4 4M4 20h16',
  brain: 'M9 4a3 3 0 0 0-3 3 3 3 0 0 0-1 5.8V17a3 3 0 0 0 5 2.2M15 4a3 3 0 0 1 3 3 3 3 0 0 1 1 5.8V17a3 3 0 0 1-5 2.2M12 4v16',
  network: 'M12 3v6m0 6v6M5.6 7.5 12 9l6.4-1.5M5.6 16.5 12 15l6.4 1.5M4 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm16 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM4 22a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm16 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm-8-8a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-2-1.2l-.4-2.6h-4l-.4 2.6a7.4 7.4 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.4 7.4 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7.4 7.4 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.07-.4.1-.8.1-1.2Z',
  log: 'M4 4h16v16H4zM8 9h8M8 13h8M8 17h5',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-14v2m0 14v2M3 12h2m14 0h2M5.6 5.6l1.4 1.4m10 10 1.4 1.4m0-12.8-1.4 1.4m-10 10-1.4 1.4',
  menu: 'M3 6h18M3 12h18M3 18h18',
  close: 'M18 6 6 18M6 6l12 12',
  out: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 14 5-5-5-5m5 5H9',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z',
}

function Icon({ d, size = 15 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none"
         stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"
         strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

/* Grouped by the job being done, not by which service answers. */
const ADMIN_ROUTES = ['/settings', '/users', '/audit-log', '/account']

const GROUPS = [
  ['Observe', [
    ['/', 'Overview', I.gauge],
    ['/monitor', 'Live monitor', I.activity],
    ['/analyzer', 'Analyzer', I.search],
  ]],
  ['Investigate', [
    ['/cases', 'Cases', I.archive],
    ['/thresholds', 'Thresholds', I.sliders],
    ['/batch', 'Batch upload', I.upload],
  ]],
  ['Understand', [
    ['/models', 'Detectors', I.network],
    ['/assistant', 'Assistant', I.brain],
    ['/about', 'Architecture', I.log],
  ]],
]

export default function ConsoleShell({ eyebrow, title, subtitle, actions, children }) {
  const { user, signOut, canManageUsers, canManageAlerts, canViewAuditLog } = useAuth()
  const { theme, toggle } = useTheme()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const [ready, setReady] = useState(null)

  // The foot of the sidebar reports what can actually score. Polled slowly:
  // it probes three upstream services and nothing here changes by the second.
  useEffect(() => {
    let alive = true
    const read = () => getMonitorRuntime()
      .then((r) => {
        if (!alive) return
        const d = Object.values(r?.detectors ?? {})
        setReady({ up: d.filter((x) => x?.ready).length, total: d.length || 3 })
      })
      .catch(() => alive && setReady(null))
    read()
    const t = setInterval(read, 15000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  const initials = (user?.full_name || user?.username || '?')
    .replace(/deepsentinel/i, '').trim()
    .split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?'

  // One entry, not four. Alerting, people, audit and account are tabs on a
  // single Administration page — the same screens, a quarter of the navigation.
  const admin = [['/settings', 'Administration', I.settings]]

  const allUp = ready && ready.up === ready.total

  return (
    <div className="ds">
      <div className="ds-shell">
        <aside className={`ds-sidebar ${open ? 'open' : ''}`}>
          <div className="ds-brand">
            <span style={{ color: 'rgb(var(--ds-accent))', display: 'grid' }}>
              <Icon d={I.shield} size={26} />
            </span>
            <div className="ds-brand-copy">
              <div className="ds-brand-name">DeepSentinel</div>
              <div className="ds-brand-sub">Fraud operations</div>
            </div>
          </div>

          <nav className="ds-nav">
            {GROUPS.map(([label, items]) => (
              <div key={label} style={{ marginBottom: 19 }}>
                <div className="ds-nav-label">{label}</div>
                {items.map(([to, text, d]) => (
                  <NavLink
                    key={to} to={to} end={to === '/'}
                    onClick={() => setOpen(false)}
                    className={({ isActive }) => `ds-nav-btn ${isActive ? 'active' : ''}`}
                  >
                    <Icon d={d} /><span>{text}</span>
                  </NavLink>
                ))}
              </div>
            ))}
            {admin.length > 0 && (
              <div>
                <div className="ds-nav-label">Workspace</div>
                {admin.map(([to, text, d]) => (
                  <NavLink
                    key={to} to={to} onClick={() => setOpen(false)}
                    // Administration owns four routes; the entry stays lit on
                    // all of them, not only the one it links to.
                    className={() => `ds-nav-btn ${
                      ADMIN_ROUTES.some((r) => pathname.startsWith(r)) ? 'active' : ''}`}
                  >
                    <Icon d={d} /><span>{text}</span>
                  </NavLink>
                ))}
              </div>
            )}
          </nav>

          <div className="ds-sidebar-foot">
            <div className="ds-statusline">
              <span>
                {ready === null ? 'Checking models'
                  : allUp ? 'All models ready'
                  : `${ready.up} of ${ready.total} ready`}
              </span>
              <span className={`ds-status-dot ${ready === null ? 'off' : allUp ? '' : 'warn'}`} />
            </div>
            <button
              onClick={() => signOut().then(() => navigate('/'))}
              className="ds-btn ds-btn-quiet"
              style={{ marginTop: 10, width: '100%', justifyContent: 'flex-start', padding: '7px 9px' }}
            >
              <Icon d={I.out} size={13} /><span>Sign out</span>
            </button>
          </div>
        </aside>

        <main className="ds-main">
          <header className="ds-topbar">
            <div style={{ minWidth: 0 }}>
              {eyebrow && <div className="ds-eyebrow">{eyebrow}</div>}
              <h1 className="ds-page-title">{title}</h1>
              {subtitle && <div className="ds-page-sub">{subtitle}</div>}
            </div>
            <div className="ds-top-actions">
              <button className="ds-icon-btn ds-mobile-menu" onClick={() => setOpen(!open)}
                      aria-label="Toggle navigation">
                <Icon d={open ? I.close : I.menu} />
              </button>
              <button className="ds-icon-btn" onClick={toggle}
                      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
                <Icon d={theme === 'dark' ? I.sun : I.moon} />
              </button>
              {actions}
              <div className="ds-user">
                <div className="ds-avatar">{initials}</div>
                <span>{(user?.full_name || user?.username || '').replace(/deepsentinel/i, '').trim()}</span>
              </div>
            </div>
          </header>
          <div className="ds-content">{children}</div>
        </main>
      </div>
    </div>
  )
}

/* ── shared pieces, so every console page is built from the same parts ── */

export function Panel({ children, className = '', style }) {
  return <section className={`ds-panel ${className}`} style={style}>{children}</section>
}

export function SectionHeading({ label, title, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'end', justifyContent: 'space-between',
                  gap: 12, marginBottom: 13 }}>
      <div>
        {label && <div className="ds-section-label" style={{ marginBottom: 5 }}>{label}</div>}
        <div className="ds-section-title">{title}</div>
      </div>
      {action}
    </div>
  )
}

export function Badge({ children, tone = '' }) {
  return <span className={`ds-badge ${tone}`}>{children}</span>
}

/** A headline figure. `—` when the value is unknown, never 0: "nothing
 *  happened" and "we could not reach the service" must not look the same. */
export function Metric({ label, value, meta, tone = '', onClick }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Panel className={`ds-kpi ${tone ? `ds-kpi-${tone}` : ''}`}>
      <Tag onClick={onClick}
           style={{ all: 'unset', cursor: onClick ? 'pointer' : 'default', display: 'block', width: '100%' }}>
        <div className="ds-section-label">{label}</div>
        <div className="ds-kpi-value ds-mono">
          {value === null || value === undefined ? '—' : value}
        </div>
        <div className="ds-kpi-meta">{meta}</div>
      </Tag>
    </Panel>
  )
}

export function Progress({ value, color }) {
  return (
    <div className="ds-progress">
      <span style={{ width: `${Math.max(0, Math.min(value, 100))}%`, background: color }} />
    </div>
  )
}

export function Footer({ left = 'Evidence stays attached to the decision.' }) {
  return (
    <div className="ds-footer">
      <span>{left}</span>
      <span className="ds-mono">DEEPSENTINEL / INTERNAL</span>
    </div>
  )
}
