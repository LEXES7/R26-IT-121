import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8090'

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

// One genuine transaction drawn from the graph service — the same source the
// live monitor screens. Lets the analyzer run the real model on real input
// instead of a hand-written scenario.
export const getSampleTransaction = () =>
  client.get('/analyze/sample-transaction').then((r) => r.data)

// ── Packages ─────────────────────────────────────────────────────────────────
// Which commercial package this deployment holds, and which features it
// unlocks. Detection, fusion, alerting and monitoring are never gated.

/** The public price list. No auth — it is what an unsigned-in visitor reads. */
export const getCatalogue = () =>
  client.get('/packages/catalogue').then((r) => r.data)

export const getPackage = () => client.get('/packages').then((r) => r.data)

export const setPackage = (pkg) =>
  client.put('/packages', { package: pkg }).then((r) => r.data)

// ── Suspicious Activity Report drafts ────────────────────────────────────────
// The system drafts; a named officer reviews and decides. Nothing files.

export const getSarDraft = (analysisId) =>
  client.get(`/analyses/${analysisId}/sar`).then((r) => r.data)

export const createSarDraft = (analysisId) =>
  client.post(`/analyses/${analysisId}/sar`).then((r) => r.data)

export const reviseSarDraft = (draftId, text) =>
  client.patch(`/analyses/sar/${draftId}`, { text }).then((r) => r.data)

export const decideSarDraft = (draftId, approve, note) =>
  client
    .post(`/analyses/sar/${draftId}/decision`, { approve, note })
    .then((r) => r.data)

// ── Threshold simulation ─────────────────────────────────────────────────────
// Replays decisions already recorded at a different threshold. Historical, not
// predictive.

export const simulateThresholds = (days) =>
  client.get('/analyses/simulate', { params: days ? { days } : {} }).then((r) => r.data)

// ── Plain-English restatement of a forensic report ───────────────────────────

export const explainPlainly = (analysisId) =>
  client.post(`/analyses/${analysisId}/explain`).then((r) => r.data)

// ── Cases ────────────────────────────────────────────────────────────────────

/** Ingested transactions, searchable by id or account, joined to any case. */
export const searchTransactions = (q, limit = 40) =>
  client.get('/transactions', { params: { q: q || undefined, limit } })
    .then((r) => r.data)

/** One stored transaction, in the shape the analyzer sends to the models. */
export const getStoredTransaction = (transactionId) =>
  client.get(`/transactions/${encodeURIComponent(transactionId)}`)
    .then((r) => r.data)

/** Run one detector alone and return exactly what it said. */
/* Demo mode — the relational model on its own.
 *
 * Separate from every other scoring call in this file because it deliberately
 * does not fuse: one detector answers, and what is on screen is attributable
 * to that detector alone. Used for showing the model's inductive behaviour,
 * not for deciding anything. */
export const demoScoreAccount = (account, transactions) =>
  client.post('/graph/demo/score-account', { account, transactions })
    .then((r) => r.data)

export const demoScoreCsv = (file) => {
  const body = new FormData()
  body.append('file', file)
  return client.post('/graph/demo/score-csv', body).then((r) => r.data)
}

/** Fill the sequence detector's 32-transaction window so it can answer.
 *  Real rows from the served graph, not invented ones. */
export const warmTemporalWindow = () =>
  client.post('/detectors/temporal/warm').then((r) => r.data)

export const scoreOneDetector = (name, transaction) =>
  client.post(`/detectors/${name}`, { transaction }).then((r) => r.data)

/** The fused operating point the monitor actually alerts on. */
export const getThresholds = () =>
  client.get('/settings/thresholds').then((r) => r.data)

export const applyThresholds = (bands) =>
  client.put('/settings/thresholds', { bands }).then((r) => r.data)

export const resetThresholds = () =>
  client.delete('/settings/thresholds').then((r) => r.data)

export const listCases = (params = {}) =>
  client.get('/cases', { params }).then((r) => r.data)

export const getCase = (caseRef) =>
  client.get(`/cases/${caseRef}`).then((r) => r.data)

export const reviewCase = (caseRef, reviewStatus, note) =>
  client
    .patch(`/cases/${caseRef}/review`, { review_status: reviewStatus, note })
    .then((r) => r.data)

// ── Daily briefing ───────────────────────────────────────────────────────────

export const getBriefing = (hours = 24) =>
  client.get('/api/monitor/briefing', { params: { hours } }).then((r) => r.data)

export const sendBriefing = (hours = 24) =>
  client.post('/api/monitor/briefing/send', null, { params: { hours } }).then((r) => r.data)

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
/** `alertThreshold` is omitted unless it is set, so the server falls back to
 *  the line the live monitor is alerting on. It used to default to 0.6 here —
 *  a third copy of that number, and the one that actually won, so the same
 *  file scored in batch and screened live disagreed. */
export function analyzeBatch(file, { onEvent, onDone, onError, alertThreshold } = {}) {
  const controller = new AbortController()
  const form = new FormData()
  form.append('file', file)
  if (alertThreshold !== undefined && alertThreshold !== null) {
    form.append('alert_threshold', String(alertThreshold))
  }

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

// ── Project assistant ────────────────────────────────────────────────────────
// Grounded Q&A over the project's own documentation. Answers carry `sources`,
// so every claim can be traced back to a file in the repository.

export const askAssistant = (question, history = []) =>
  client.post('/api/chat', { question, history }).then((r) => r.data)

export const getAssistantSuggestions = () =>
  client.get('/api/chat/suggestions').then((r) => r.data.suggestions)

export const getAssistantHealth = () =>
  client.get('/api/chat/health').then((r) => r.data)

// ── Operator assistant (Professional package) ────────────────────────────────
// Tool-using agent over the live platform. Gated: `capabilities` reports
// whether this deployment and this user's package include it, so the UI can
// present an upsell instead of a dead feature.

export const getAssistantCapabilities = () =>
  client.get('/api/assistant/capabilities').then((r) => r.data)

export const askOperatorAssistant = (question, history = []) =>
  client.post('/api/assistant', { question, history }).then((r) => r.data)

export const getAssistantSettings = () =>
  client.get('/api/assistant/settings').then((r) => r.data)

export const updateAssistantSettings = (changes) =>
  client.patch('/api/assistant/settings', changes).then((r) => r.data)

// ── Commercial enquiry ───────────────────────────────────────────────────────
// Public: creates no account and grants no access, it only reaches the team.

export const submitEnquiry = (enquiry) =>
  client.post('/api/enquiry', enquiry).then((r) => r.data)

// ── Live monitor ─────────────────────────────────────────────────────────────

export const getMonitorState = () =>
  client.get('/api/monitor/state').then((r) => r.data)

export const startMonitor = (interval) =>
  client.post('/api/monitor/start', null, { params: { interval } }).then((r) => r.data)

export const stopMonitor = () => client.post('/api/monitor/stop').then((r) => r.data)

export const pauseMonitor = () => client.post('/api/monitor/pause').then((r) => r.data)

export const resumeMonitor = () => client.post('/api/monitor/resume').then((r) => r.data)

export const restartMonitor = (interval) =>
  client.post('/api/monitor/restart', null, { params: { interval } }).then((r) => r.data)

/** Empty the live alert list, activity feed and counters. Administrators only.
 *  Clears the view, not the record — the cases stay in the database. */
export const clearMonitor = () => client.post('/api/monitor/clear').then((r) => r.data)

/** The payment graph around one account. Bounded server-side — never the
 *  whole 3.27M-node graph. */
export const getNeighbourhood = (account, { scope = 'component', hops = 1,
                                            maxEdges = 400 } = {}) =>
  client.get('/graph/neighbourhood', {
    params: { account, scope, hops, max_edges: maxEdges },
  }).then((r) => r.data)

export const getGraphSettings = () =>
  client.get('/graph/settings').then((r) => r.data)

export const setGraphSettings = (patch) =>
  client.put('/graph/settings', patch).then((r) => r.data)

/** The forensic report's look. Preview is open to anyone signed in; choosing
 *  is for admins and risk managers, and enforced server-side. */
export const getReportStyles = () =>
  client.get('/report-styles').then((r) => r.data)

export const chooseReportStyle = (style) =>
  client.put('/report-styles/selected', { style }).then((r) => r.data)

/** The preview as a blob URL. Fetched through the client rather than pointed
 *  at with an <iframe src>, because an iframe cannot carry the bearer token
 *  and the endpoint requires one. Caller must revokeObjectURL when done. */
export const reportStylePreviewUrl = (style) =>
  client.get(`/report-styles/${style}/preview`, { responseType: 'blob' })
    .then((r) => URL.createObjectURL(
      new Blob([r.data], { type: 'application/pdf' })))

/** The forensic narrative for one analysis, as a PDF the user keeps.
 *
 * Fetched through the client rather than linked to directly: the endpoint
 * requires a bearer token and an <a href> cannot carry one. Triggers the save
 * and cleans up the object URL itself, so callers do not have to. */
export const downloadAnalysisReport = async (analysisId, style) => {
  const r = await client.get(`/analyses/${analysisId}/report.pdf`, {
    responseType: 'blob',
    params: style ? { style } : undefined,
  })
  const url = URL.createObjectURL(new Blob([r.data], { type: 'application/pdf' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `deepsentinel-report-${analysisId}.pdf`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** Loop state plus each detector's own runtime — "is the platform working". */
export const getMonitorRuntime = () =>
  client.get('/api/monitor/runtime').then((r) => r.data)

/**
 * Subscribe to the monitor's event stream.
 *
 * EventSource cannot send an Authorization header, so this uses fetch with a
 * reader and parses the SSE framing by hand — the same approach the batch
 * upload already takes. Returns an abort function.
 */
export function streamMonitor({ onEvent, onError } = {}) {
  const controller = new AbortController()

  ;(async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/monitor/stream`, {
        headers: { Authorization: `Bearer ${getToken()}` },
        signal: controller.signal,
      })
      if (!res.ok || !res.body) throw new Error(`Stream failed (${res.status})`)

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // SSE frames are separated by a blank line.
        const frames = buffer.split('\n\n')
        buffer = frames.pop() ?? ''
        for (const frame of frames) {
          let name = 'message'
          const data = []
          for (const line of frame.split('\n')) {
            if (line.startsWith('event:')) name = line.slice(6).trim()
            else if (line.startsWith('data:')) data.push(line.slice(5).trim())
          }
          if (!data.length) continue
          try {
            onEvent?.(name, JSON.parse(data.join('\n')))
          } catch {
            /* skip an unparseable frame rather than dropping the stream */
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') onError?.(err.message)
    }
  })()

  return () => controller.abort()
}
