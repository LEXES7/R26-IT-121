import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Settings from './Settings'
import Users from './Users'
import AuditLog from './AuditLog'
import Account from './Account'
import ReportStyle from '../components/ReportStyle'

/**
 * Administration, as one place instead of four.
 *
 * Settings, Users, Audit log and Account were four sidebar entries and four
 * pages, each a single screen. Four destinations for one job — running the
 * workspace — is four things to learn and four places to look. They are tabs
 * now: the same pages, the same routes, the same permissions, one entry.
 *
 * The routes are unchanged on purpose. /users still works, still deep-links,
 * and still 403s for a non-admin — the tab strip only shows what the signed-in
 * role may actually open, so the page never advertises a door it will refuse.
 */

const TABS = [
  ['/settings',  'Alerting',  'canManageAlerts',  Settings],
  ['/users',     'People',    'canManageUsers',   Users],
  ['/audit-log', 'Audit log', 'canViewAuditLog',  AuditLog],
  ['/account',   'Account',   null,               Account],
  // No capability: everyone may look at the report they receive. Choosing is
  // gated inside the panel, and by require_manager on the route.
  ['/report-style', 'Report style', null,          ReportStyle],
]

export default function Workspace() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const caps = useAuth()

  const allowed = TABS.filter(([, , cap]) => !cap || caps[cap])
  const current = allowed.find(([to]) => pathname.startsWith(to)) ?? allowed[0]
  const Panel = current?.[3]

  return (
    <div className="ds-fade-up" style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap',
                    borderBottom: '1px solid rgb(var(--ds-line))', paddingBottom: 11 }}>
        {allowed.map(([to, label]) => (
          <button key={to} onClick={() => navigate(to)}
                  className={`ds-btn ${current?.[0] === to ? 'ds-btn-primary' : 'ds-btn-quiet'}`}>
            {label}
          </button>
        ))}
      </div>
      {Panel ? <Panel /> : null}
    </div>
  )
}
