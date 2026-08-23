import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import ErrorBoundary from './components/ErrorBoundary'
import ProtectedRoute from './components/ProtectedRoute'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import Login from './pages/Login'
import Home from './pages/Home'
import Analyzer from './pages/Analyzer'
import BatchAnalysis from './pages/BatchAnalysis'
import Settings from './pages/Settings'
import Users from './pages/Users'
import AuditLog from './pages/AuditLog'
import Account from './pages/Account'
import About from './pages/About'
import FAQ from './pages/FAQ'

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
            <Route
              path="/login"
              element={isAuthenticated ? <Navigate to="/analyzer" replace /> : <Login />}
            />

            {/* Any signed-in user */}
            <Route path="/analyzer" element={<ProtectedRoute><Analyzer /></ProtectedRoute>} />
            <Route path="/batch" element={<ProtectedRoute><BatchAnalysis /></ProtectedRoute>} />
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
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Shell />
      </AuthProvider>
    </BrowserRouter>
  )
}
