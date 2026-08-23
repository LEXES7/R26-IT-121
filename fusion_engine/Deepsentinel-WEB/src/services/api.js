import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const TOKEN_KEY = 'ds.token'
const USER_KEY = 'ds.user'

export const client = axios.create({
  baseURL: BASE_URL,
  timeout: 60_000,
})

// ── Token storage ────────────────────────────────────────────────────────────
// localStorage throws in private-browsing and sandboxed contexts, so every
// access is guarded. A storage failure degrades to "not signed in" rather than
// taking down the app.

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function getStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function setSession(token, user) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token)
      if (user) localStorage.setItem(USER_KEY, JSON.stringify(user))
    } else {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(USER_KEY)
    }
  } catch {
    // Non-fatal: the interceptor still attaches the in-memory token for this
    // page load, the session just will not survive a refresh.
  }
}

// ── Interceptors ─────────────────────────────────────────────────────────────

// Attach the bearer token to every request. Previously each call site had to
// remember to do this, and most did not — which is why authenticated endpoints
// were failing.
client.interceptors.request.use((cfg) => {
  const token = getToken()
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

// Session expiry is handled in exactly one place. Subscribers (AuthContext)
// are notified so the UI can redirect to sign-in instead of showing a wall of
// failed requests.
const unauthorizedHandlers = new Set()

export function onUnauthorized(handler) {
  unauthorizedHandlers.add(handler)
  return () => unauthorizedHandlers.delete(handler)
}

client.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error.response?.status

    if (status === 401) {
      setSession(null)
      unauthorizedHandlers.forEach((h) => h())
    }

    // Normalise the error shape so components render a message rather than
    // "[object Object]". FastAPI returns `detail` as a string, as a structured
    // object from our APIError, or as a validation array from Pydantic.
    error.userMessage = extractMessage(error)
    return Promise.reject(error)
  },
)

function extractMessage(error) {
  if (error.code === 'ECONNABORTED') return 'The request timed out. The model may still be loading.'
  if (!error.response) return 'Cannot reach the server. Is the backend running?'

  const detail = error.response.data?.detail

  if (typeof detail === 'string') return detail
  if (typeof detail?.message === 'string') return detail.message
  if (Array.isArray(detail)) {
    // Pydantic validation errors: [{loc: [...], msg: "..."}]
    return detail
      .map((d) => {
        const field = Array.isArray(d.loc) ? d.loc[d.loc.length - 1] : null
        return field ? `${field}: ${d.msg}` : d.msg
      })
      .join('; ')
  }
  return `Request failed (${error.response.status})`
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export const login = (username, password) =>
  client.post('/auth/login', { username, password }).then((r) => r.data)

export const logout = () => client.post('/auth/logout').then((r) => r.data)

export const fetchCurrentUser = () => client.get('/auth/me').then((r) => r.data)

export const changePassword = (currentPassword, newPassword) =>
  client
    .post('/auth/change-password', {
      current_password: currentPassword,
      new_password: newPassword,
    })
    .then((r) => r.data)

// ── Users (admin) ────────────────────────────────────────────────────────────

export const listUsers = () => client.get('/users').then((r) => r.data)

export const createUser = (user) => client.post('/users', user).then((r) => r.data)

export const setUserEnabled = (username, enabled) =>
  client.patch(`/users/${encodeURIComponent(username)}/enabled`, { enabled }).then((r) => r.data)

export const deleteUser = (username) =>
  client.delete(`/users/${encodeURIComponent(username)}`).then((r) => r.data)

export const fetchAuditLog = (limit = 100) =>
  client.get('/audit-log', { params: { limit } }).then((r) => r.data)

// ── Analysis ─────────────────────────────────────────────────────────────────

export const analyzeScenario = (scenario, includeBaseline = false) =>
  client
    .post('/analyze', {
      use_mock: true,
      mock_scenario: scenario,
      include_baseline: includeBaseline,
    })
    .then((r) => r.data)

export const analyzeTransaction = (transaction, includeBaseline = false) =>
  client
    .post('/analyze', { transaction, include_baseline: includeBaseline })
    .then((r) => r.data)

export const getHealth = () => client.get('/health').then((r) => r.data)

export const getTypologies = () => client.get('/typologies').then((r) => r.data)

// ── Settings ─────────────────────────────────────────────────────────────────

export const getSettings = () => client.get('/settings').then((r) => r.data)

export const addRiskManager = (name, email, role = 'Risk Manager') =>
  client.post('/settings/risk-manager', { name, email, role }).then((r) => r.data)

export const removeRiskManager = (email) =>
  client.delete(`/settings/risk-manager/${encodeURIComponent(email)}`).then((r) => r.data)

export const updateAlertSettings = (settings) =>
  client.post('/settings/alert-settings', settings).then((r) => r.data)

// ── Email ────────────────────────────────────────────────────────────────────

export const sendTestEmail = (name, email) =>
  client.post('/email/send-test', { name, email }).then((r) => r.data)

export const getEmailStatus = () => client.get('/email/status').then((r) => r.data)

// ── Batch analysis ───────────────────────────────────────────────────────────

/**
 * Upload a CSV or Excel file and stream per-transaction results.
 *
 * Streams rather than returning a promise of the whole result: a large file
 * takes a while, and the caller should be able to show progress instead of a
 * spinner. Returns an abort function.
 */
export function analyzeBatch(file, { onEvent, onDone, onError, alertThreshold = 0.6 } = {}) {
  const controller = new AbortController()
  const form = new FormData()
  form.append('file', file)
  form.append('alert_threshold', String(alertThreshold))

  const token = getToken()

  ;(async () => {
    try {
      const res = await fetch(`${BASE_URL}/analyze/batch`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
        signal: controller.signal,
      })

      if (!res.ok) {
        let message = `Upload failed (${res.status})`
        try {
          const body = await res.json()
          if (typeof body.detail === 'string') message = body.detail
        } catch {
          /* not JSON */
        }
        throw new Error(message)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const chunks = buffer.split('\n\n')
        buffer = chunks.pop() ?? ''

        for (const chunk of chunks) {
          let name = 'message'
          const data = []
          for (const line of chunk.split('\n')) {
            if (line.startsWith('event:')) name = line.slice(6).trim()
            else if (line.startsWith('data:')) data.push(line.slice(5).trim())
          }
          if (!data.length) continue
          try {
            onEvent?.(name, JSON.parse(data.join('\n')))
          } catch {
            /* skip an unparseable frame rather than aborting the run */
          }
        }
      }
      onDone?.()
    } catch (err) {
      if (err.name !== 'AbortError') {
        onError?.(
          err.message === 'Failed to fetch'
            ? 'Cannot reach the server. Is the backend running?'
            : err.message,
        )
      }
    }
  })()

  return () => controller.abort()
}

export const emailTemplateUrl = (classification = 'HIGH') =>
  `${BASE_URL}/email-template/preview?classification=${classification}`
