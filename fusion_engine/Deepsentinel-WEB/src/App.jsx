import { useEffect } from 'react'
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { destroySmoothScroll, initSmoothScroll } from './lib/motion'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import ErrorBoundary from './components/ErrorBoundary'
import ProtectedRoute from './components/ProtectedRoute'
import Navbar from './components/Navbar'
import { CONSOLE_PATHS } from './components/ConsoleShell'
import ConsoleShell from './components/ConsoleShell'
import Footer from './components/Footer'
import ChatBot from './components/ChatBot'
import NotFound from './pages/NotFound'
import useLiquidPointer from './hooks/useLiquidPointer'
import Greeting from './components/Greeting'
import Login from './pages/Login'
import Home from './pages/Home'
import Analyzer from './pages/Analyzer'
import Models from './pages/Models'
import Workspace from './pages/Workspace'
import Thresholds from './pages/Thresholds'
import Cases from './pages/Cases'
import Dashboard from './pages/Dashboard'
import SystemHealth from './pages/SystemHealth'
import Monitor from './pages/Monitor'
import GraphExplorer from './pages/GraphExplorer'
import BehaviourLab from './pages/BehaviourLab'
import TimingLab from './pages/TimingLab'
import FusionLab from './pages/FusionLab'
import Assistant from './pages/Assistant'
import BatchAnalysis from './pages/BatchAnalysis'
import Settings from './pages/Settings'
import Users from './pages/Users'
import AuditLog from './pages/AuditLog'
import Account from './pages/Account'
import About from './pages/About'
import FAQ from './pages/FAQ'
import Pricing from './pages/Pricing'
import LiveMap from './pages/LiveMap'
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
// Derived from the navigation rather than listed again here — see
// CONSOLE_PATHS. The hand-written version fell behind every route added after
// it, and the symptom was the public header appearing over the console.
//
// A few pages are reachable from both navigations. /about is in the console's
// "Understand" group and in the public header, so deriving blindly made it a
// console route and the public header removed itself from a public page,
// leaving it with no navigation at all. Anything both sides offer belongs to
// the public site: that is the version an unauthenticated visitor must get.
const SHARED_WITH_PUBLIC = ['/about', '/faq', '/pricing', '/live']
const CONSOLE_ROUTES = [...CONSOLE_PATHS, '/audit-log', '/users', '/settings']
  .filter((r) => !SHARED_WITH_PUBLIC.includes(r))

function Shell() {
  useLiquidPointer()
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

      <Greeting />

      {/* First thing in the tab order, visible only once focused: a keyboard
          user should not have to walk the whole nav on every page. */}
      <a href="#content" className="ds-skip">Skip to content</a>

      <main id="content" className="flex-1">
        <ErrorBoundary>
          <Routes>
            {/* Public */}
            {/* Signed in, "/" is the operator's dashboard; signed out it is the
                public overview. One address, and nobody has to learn a second. */}
            <Route path="/" element={<RootPage />} />
            <Route path="/about" element={<About />} />
            <Route path="/faq" element={<FAQ />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/live" element={<LiveMap />} />
            <Route path="/components/:slug" element={<ComponentDetail />} />
            {/* Signed in, both of these send you home — and "/" resolves to
                the console your role actually has. Sending everyone to the
                analyzer was fine while every role could open it; once
                administrators could not, signing in as one landed on "Access
                restricted". */}
            <Route
              path="/signup"
              element={isAuthenticated ? <Navigate to="/" replace /> : <RequestAccess />}
            />
            <Route
              path="/login"
              element={isAuthenticated ? <Navigate to="/" replace /> : <Login />}
            />

            {/* Any signed-in user. The monitor is readable by everyone; its
                controls are gated inside the page and, that being cosmetic,
                by require_admin on the routes themselves. */}
            <Route path="/monitor" element={<ProtectedRoute><Console><Monitor /></Console></ProtectedRoute>} />
            <Route path="/models" element={<ProtectedRoute><Console><Models /></Console></ProtectedRoute>} />
            {/* Readable by any signed-in role; the switch inside it is an
                administrator's, and enforced by require_admin on the route. */}
            <Route path="/graph" element={<ProtectedRoute><GraphExplorer /></ProtectedRoute>} />
            <Route path="/lab/behaviour" element={<ProtectedRoute><BehaviourLab /></ProtectedRoute>} />
            <Route path="/lab/timing" element={<ProtectedRoute><TimingLab /></ProtectedRoute>} />
            <Route path="/lab/fusion" element={<ProtectedRoute><FusionLab /></ProtectedRoute>} />
            <Route path="/account" element={<ProtectedRoute><Console><Workspace /></Console></ProtectedRoute>} />
            <Route path="/report-style" element={<ProtectedRoute><Console><Workspace /></Console></ProtectedRoute>} />

            {/* Case work. Not an administrator's: on a deployment that role is
                the client's IT department, and financial-crime cases are not
                theirs to read. Hidden from their navigation and refused here. */}
            <Route path="/analyzer" element={<ProtectedRoute capability="canRunAnalysis"><Console><Analyzer /></Console></ProtectedRoute>} />
            <Route path="/cases" element={<ProtectedRoute capability="canViewCases"><Console><Cases /></Console></ProtectedRoute>} />
            {/* Addressable so a case can be sent to a colleague. Still gated. */}
            <Route path="/cases/:caseRef" element={<ProtectedRoute capability="canViewCases"><Cases /></ProtectedRoute>} />
            <Route path="/batch" element={<ProtectedRoute capability="canDecideCases"><Console><BatchAnalysis /></Console></ProtectedRoute>} />
            <Route path="/assistant" element={<ProtectedRoute capability="canViewCases"><Console><Assistant /></Console></ProtectedRoute>} />

            {/* The operating point the monitor alerts on — a configuration
                decision, and audited as one. */}
            <Route path="/thresholds" element={<ProtectedRoute capability="canConfigureSystem"><Console><Thresholds /></Console></ProtectedRoute>} />

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

            <Route path="*" element={<NotFound />} />
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
// The breadcrumb has to name the group the sidebar files the page under, or
// the two disagree in front of the reader. Thresholds and Detectors moved when
// the console split in two; these followed them.
const CONSOLE_PAGES = {
  '/monitor':   ['Workspace / Observe', 'Live monitor', 'Every transaction, screened as it arrives.'],
  '/analyzer':  ['Workspace / Observe', 'Analyzer', 'One transaction, through all five stages.'],
  '/cases':     ['Workspace / Investigate', 'Cases', 'What the models caught, and what you decided.'],
  '/thresholds':['Workspace / Configure', 'Thresholds', 'Replay past decisions at a different line.'],
  '/batch':     ['Workspace / Investigate', 'Batch upload', 'Score a file and measure it against its labels.'],
  '/models':    ['Workspace / Operate', 'Detectors',
                 'Each model on its own — no fusion, no retrieval.'],
  '/assistant': ['Workspace / Understand', 'Assistant', 'Ask about the system in plain language.'],
  '/settings':  ['Workspace / Configure', 'Administration', 'Alerting, people, audit and your account.'],
  '/users':     ['Workspace / Configure', 'Administration', 'Alerting, people, audit and your account.'],
  '/audit-log': ['Workspace / Configure', 'Administration', 'Alerting, people, audit and your account.'],
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
  const { isAuthenticated, initialising, isAdmin } = useAuth()
  // Render nothing rather than the marketing page while the session is still
  // resolving — a signed-in user flashing the public page reads as a bug.
  if (initialising) return null
  if (!isAuthenticated) return <Home />
  // One address, two homes. An administrator lands on the system's condition;
  // everyone else lands on the case load. Keeping both at "/" means nobody has
  // to learn a second address and a shared link works for either.
  return isAdmin ? <SystemHealth /> : <Dashboard />
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
