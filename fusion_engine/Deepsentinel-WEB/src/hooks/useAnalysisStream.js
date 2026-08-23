import { useCallback, useRef, useState } from 'react'
import { getToken } from '../services/api'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export const STAGE_IDS = ['input', 'models', 'fusion', 'retrieval', 'report']

const IDLE_STAGES = Object.fromEntries(
  STAGE_IDS.map((id) => [id, { status: 'idle', data: null, durationMs: null, message: null }]),
)

/**
 * Consumes POST /analyze/stream.
 *
 * EventSource cannot be used here: it only issues GET requests and cannot set
 * an Authorization header. So this reads the response body as a stream and
 * parses the SSE framing directly.
 */
export function useAnalysisStream() {
  const [stages, setStages] = useState(IDLE_STAGES)
  const [result, setResult] = useState(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState(null)
  const abortRef = useRef(null)

  const reset = useCallback(() => {
    setStages(IDLE_STAGES)
    setResult(null)
    setError(null)
  }, [])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setRunning(false)
  }, [])

  const run = useCallback(async (body) => {
    // A second run while one is in flight would interleave two event streams
    // into the same state.
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setStages(IDLE_STAGES)
    setResult(null)
    setError(null)
    setRunning(true)

    try {
      const token = getToken()
      const response = await fetch(`${BASE_URL}/analyze/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      if (!response.ok) {
        let detail = `Request failed (${response.status})`
        try {
          const parsed = await response.json()
          if (typeof parsed.detail === 'string') detail = parsed.detail
          else if (typeof parsed.detail?.message === 'string') detail = parsed.detail.message
        } catch {
          // Body was not JSON; keep the status-based message.
        }
        throw new Error(detail)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // SSE events are separated by a blank line. A chunk boundary can fall
        // mid-event, so anything after the last separator stays buffered.
        const chunks = buffer.split('\n\n')
        buffer = chunks.pop() ?? ''

        for (const chunk of chunks) {
          const event = parseEvent(chunk)
          if (!event) continue
          applyEvent(event, { setStages, setResult, setError })
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(
          err.message === 'Failed to fetch'
            ? 'Cannot reach the server. Is the backend running?'
            : err.message,
        )
      }
    } finally {
      setRunning(false)
      abortRef.current = null
    }
  }, [])

  return { stages, result, running, error, run, reset, cancel }
}

function parseEvent(chunk) {
  let name = 'message'
  const dataLines = []

  for (const line of chunk.split('\n')) {
    if (line.startsWith('event:')) name = line.slice(6).trim()
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
  }

  if (dataLines.length === 0) return null

  try {
    return { name, data: JSON.parse(dataLines.join('\n')) }
  } catch {
    return null
  }
}

function applyEvent({ name, data }, { setStages, setResult, setError }) {
  if (name === 'stage') {
    setStages((prev) => ({
      ...prev,
      [data.stage]: {
        status: data.status,
        // A `running` event carries no data; keep what an earlier event set
        // rather than blanking the panel mid-flight.
        data: data.data && Object.keys(data.data).length ? data.data : prev[data.stage]?.data,
        durationMs: data.duration_ms ?? prev[data.stage]?.durationMs ?? null,
        message: data.message ?? null,
      },
    }))
  } else if (name === 'complete') {
    setResult(data)
  } else if (name === 'error') {
    setError(data.message ?? 'The pipeline failed.')
  }
}
