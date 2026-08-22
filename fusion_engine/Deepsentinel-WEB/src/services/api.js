import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const client = axios.create({ baseURL: BASE_URL, timeout: 30000 })

// ── Analysis ──
export const analyzeScenario = (scenario, includeBaseline = false) =>
  client.post('/analyze', { use_mock: true, mock_scenario: scenario, include_baseline: includeBaseline }).then((r) => r.data)

export const analyzeTransaction = (tx) =>
  client.post('/analyze', { transaction, include_baseline: false }).then((r) => r.data)

export const getHealth = () =>
  client.get('/health').then((r) => r.data)

export const getTypologies = () =>
  client.get('/typologies').then((r) => r.data)

// ── Settings ──
export const getSettings = () =>
  client.get('/settings').then((r) => r.data)

export const addRiskManager = (name, email, role = 'Risk Manager') =>
  client.post('/settings/risk-manager', { name, email, role }).then((r) => r.data)

export const removeRiskManager = (email) =>
  client.delete(`/settings/risk-manager/${email}`).then((r) => r.data)

export const updateAlertSettings = (settings) =>
  client.post('/settings/alert-settings', settings).then((r) => r.data)

// ── Email ──
export const sendTestEmail = (riskManager) =>
  client.post('/email/send-test', riskManager).then((r) => r.data)

export const getEmailTemplate = (classification = 'HIGH') =>
  `${BASE_URL}/email-template/preview?classification=${classification}`
