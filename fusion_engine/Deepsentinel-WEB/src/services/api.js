import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const client = axios.create({ baseURL: BASE_URL, timeout: 30000 })

export const analyzeScenario = (scenario, includeBaseline = false) =>
  client.post('/analyze', { use_mock: true, mock_scenario: scenario, include_baseline: includeBaseline }).then((r) => r.data)

export const analyzeTransaction = (tx) =>
  client.post('/analyze/transaction', tx).then((r) => r.data)

export const getHealth = () =>
  client.get('/health').then((r) => r.data)

export const getTypologies = () =>
  client.get('/typologies').then((r) => r.data)
