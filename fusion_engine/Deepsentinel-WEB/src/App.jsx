import { useEffect } from 'react'
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { destroySmoothScroll, initSmoothScroll } from './lib/motion'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import ErrorBoundary from './components/ErrorBoundary'
import ProtectedRoute from './components/ProtectedRoute'
import Navbar from './components/Navbar'
import ConsoleShell from './components/ConsoleShell'
import Footer from './components/Footer'
import ChatBot from './components/ChatBot'
import Login from './pages/Login'
import Home from './pages/Home'
import Analyzer from './pages/Analyzer'
import Models from './pages/Models'
import Workspace from './pages/Workspace'
import Thresholds from './pages/Thresholds'
import Cases from './pages/Cases'
import Dashboard from './pages/Dashboard'
import Monitor from './pages/Monitor'
import Assistant from './pages/Assistant'
import BatchAnalysis from './pages/BatchAnalysis'
import Settings from './pages/Settings'
import Users from './pages/Users'
import AuditLog from './pages/AuditLog'
import Account from './pages/Account'
import About from './pages/About'
import FAQ from './pages/FAQ'
import ComponentDetail from './pages/ComponentDetail'
import RequestAccess from './pages/RequestAccess'

/**
 * Route access.
 *
 * Public — the research showcase. Reviewers and prospective customers can read
 * what the platform is without an account.
 *
 * Protected — anything that touches real data or configuration. Gated on a
 * capability, not a role, and independently enforced server-side.
 */
/**
 * Routes that belong to the operator console rather than the public showcase.
 *
 * The marketing footer is a sitemap for a visitor deciding whether to sign up.
 * Under a case queue it is just noise — and worse, it invites an analyst
 * mid-triage to click away into the brochure. Console routes get a single
 * quiet line instead.
 */
const CONSOLE_ROUTES = [
  '/monitor', '/analyzer', '/thresholds', '/cases', '/batch', '/models',
  '/assistant', '/account', '/settings', '/users', '/audit-log',
]

function Shell() {
  const { isAuthenticated } = useAuth()
  const { pathname } = useLocation()
  // "/" is the dashboard once signed in, so it is a console route only then.
  const isConsole = CONSOLE_ROUTES.some((r) => pathname.startsWith(r))
    || (isAuthenticated && pathname === '/')

  // Lenis drives GSAP's ticker so pinned sections scrub smoothly. Skipped
  // entirely under prefers-reduced-motion — hijacking the wheel is exactly
  // what that setting asks us not to do.
  useEffect(() => {
    initSmoothScroll()
    return destroySmoothScroll
  }, [])

  return (
    <div className={isConsole ? '' : 'flex min-h-screen flex-col bg-sentinel-950'}>
      {!isConsole && <Navbar />}

      <main className="flex-1">
        <ErrorBoundary>
          <Routes>
            {/* Public */}
            {/* Signed in, "/" is the operator's dashboard; signed out it is the
                public overview. One address, and nobody has to learn a second. */}
            <Route path="/" element={<RootPage />} />
            <Route path="/about" element={<About />} />
            <Route path="/faq" element={<FAQ />} />
            <Route path="/components/:slug" element={<ComponentDetail />} />
            <Route
              path="/signup"
              element={isAuthenticated ? <Navigate to="/analyzer" replace /> : <RequestAccess />}
            />
            <Route
              path="/login"
              element={isAuthenticated ? <Navigate to="/analyzer" replace /> : <Login />}
            />

            {/* Any signed-in user */}
            <Route path="/monitor" element={<ProtectedRoute><Console><Monitor /></Console></ProtectedRoute>} />
            <Route path="/analyzer" element={<ProtectedRoute><Console><Analyzer /></Console></ProtectedRoute>} />
            <Route path="/thresholds" element={<ProtectedRoute><Console><Thresholds /></Console></ProtectedRoute>} />
            <Route path="/cases" element={<ProtectedRoute><Console><Cases /></Console></ProtectedRoute>} />
            {/* Addressable so a case can be sent to a colleague. Still authenticated. */}
            <Route path="/cases/:caseRef" element={<ProtectedRoute><Cases /></ProtectedRoute>} />
            <Route path="/batch" element={<ProtectedRoute><Console><BatchAnalysis /></Console></ProtectedRoute>} />
            {/* Entitlement is enforced server-side; the page renders an upsell when not licensed. */}
            <Route path="/models" element={<ProtectedRoute><Console><Models /></Console></ProtectedRoute>} />
            <Route path="/assistant" element={<ProtectedRoute><Console><Assistant /></Console></ProtectedRoute>} />
            <Route path="/account" element={<ProtectedRoute><Console><Workspace /></Console></ProtectedRoute>} />

            {/* Capability-gated */}
            <Route
              path="/settings"
              element={
                <ProtectedRoute capability="canManageAlerts">
                  <Console><Workspace /></Console>
                </ProtectedRoute>
              }
            />
            <Route
              path="/users"
              element={
                <ProtectedRoute capability="canManageUsers">
                  <Console><Workspace /></Console>
                </ProtectedRoute>
              }
            />
            <Route
              path="/audit-log"
              element={
                <ProtectedRoute capability="canViewAuditLog">
                  <Console><Workspace /></Console>
                </ProtectedRoute>
              }
            />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ErrorBoundary>
      </main>

      {!isConsole && <Footer />}

      {/* Available on every page — reviewers read the showcase without signing in. */}
      <ChatBot />
    </div>
  )
}

/**
 * Chrome for a console page.
 *
 * The shell lives here rather than inside each page so there is one place that
 * decides what the signed-in application looks like. Dashboard is the
 * exception — its title states how many cases are waiting, which only it
 * knows — so it renders its own shell and is not wrapped again.
 */
const CONSOLE_PAGES = {
  '/monitor':   ['Workspace / Observe', 'Live monitor', 'Every transaction, screened as it arrives.'],
  '/analyzer':  ['Workspace / Observe', 'Analyzer', 'One transaction, through all five stages.'],
  '/cases':     ['Workspace / Investigate', 'Cases', 'What the models caught, and what you decided.'],
  '/thresholds':['Workspace / Investigate', 'Thresholds', 'Replay past decisions at a different line.'],
  '/batch':     ['Workspace / Investigate', 'Batch upload', 'Score a file and measure it against its labels.'],
  '/models':    ['Workspace / Understand', 'Detectors',
                 'Each model on its own — no fusion, no retrieval.'],
  '/assistant': ['Workspace / Understand', 'Assistant', 'Ask about the system in plain language.'],
  '/settings':  ['Workspace', 'Administration', 'Alerting, people, audit and your account.'],
  '/users':     ['Workspace', 'Administration', 'Alerting, people, audit and your account.'],
  '/audit-log': ['Workspace', 'Administration', 'Alerting, people, audit and your account.'],
  '/account':   ['Workspace', 'Administration', 'Alerting, people, audit and your account.'],
}

function Console({ children }) {
  const { pathname } = useLocation()
  const key = Object.keys(CONSOLE_PAGES).find((r) => pathname.startsWith(r))
  const [eyebrow, title, subtitle] = CONSOLE_PAGES[key] ?? ['Workspace', 'DeepSentinel']
  return (
    <ConsoleShell eyebrow={eyebrow} title={title} subtitle={subtitle}>
      {children}
    </ConsoleShell>
  )
}

/** The landing page depends on who is asking. */
function RootPage() {
  const { isAuthenticated, initialising } = useAuth()
  // Render nothing rather than the marketing page while the session is still
  // resolving — a signed-in user flashing the public page reads as a bug.
  if (initialising) return null
  return isAuthenticated ? <Dashboard /> : <Home />
}


export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <Shell />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}
