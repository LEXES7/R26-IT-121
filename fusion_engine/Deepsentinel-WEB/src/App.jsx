import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { destroySmoothScroll, initSmoothScroll } from './lib/motion'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import ErrorBoundary from './components/ErrorBoundary'
import ProtectedRoute from './components/ProtectedRoute'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import ChatBot from './components/ChatBot'
import Login from './pages/Login'
import Home from './pages/Home'
import Analyzer from './pages/Analyzer'
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
function Shell() {
  const { isAuthenticated } = useAuth()

  // Lenis drives GSAP's ticker so pinned sections scrub smoothly. Skipped
  // entirely under prefers-reduced-motion — hijacking the wheel is exactly
  // what that setting asks us not to do.
  useEffect(() => {
    initSmoothScroll()
    return destroySmoothScroll
  }, [])

  return (
    <div className="flex min-h-screen flex-col bg-sentinel-950">
      <Navbar />

      <main className="flex-1">
        <ErrorBoundary>
          <Routes>
            {/* Public */}
            <Route path="/" element={<Home />} />
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
            <Route path="/monitor" element={<ProtectedRoute><Monitor /></ProtectedRoute>} />
            <Route path="/analyzer" element={<ProtectedRoute><Analyzer /></ProtectedRoute>} />
            <Route path="/batch" element={<ProtectedRoute><BatchAnalysis /></ProtectedRoute>} />
            {/* Entitlement is enforced server-side; the page renders an upsell when not licensed. */}
            <Route path="/assistant" element={<ProtectedRoute><Assistant /></ProtectedRoute>} />
            <Route path="/account" element={<ProtectedRoute><Account /></ProtectedRoute>} />

            {/* Capability-gated */}
            <Route
              path="/settings"
              element={
                <ProtectedRoute capability="canManageAlerts">
                  <Settings />
                </ProtectedRoute>
              }
            />
            <Route
              path="/users"
              element={
                <ProtectedRoute capability="canManageUsers">
                  <Users />
                </ProtectedRoute>
              }
            />
            <Route
              path="/audit-log"
              element={
                <ProtectedRoute capability="canViewAuditLog">
                  <AuditLog />
                </ProtectedRoute>
              }
            />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ErrorBoundary>
      </main>

      <Footer />

      {/* Available on every page — reviewers read the showcase without signing in. */}
      <ChatBot />
    </div>
  )
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
