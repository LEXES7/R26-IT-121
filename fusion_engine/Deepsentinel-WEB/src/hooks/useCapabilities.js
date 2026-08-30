import { useEffect, useState } from 'react'

/**
 * Live facts about the detectors, for the pages anyone can read.
 *
 * Returns null until it has an answer, and stays null if the API cannot be
 * reached. Callers fall back to the figures in components.js — a marketing
 * page that goes blank because a backend is down is worse than one showing a
 * number that is a week stale.
 *
 * Reads /public/capabilities rather than the monitor's runtime: that one
 * needs a session and carries operational detail no visitor should see.
 */
export default function useCapabilities() {
  const [caps, setCaps] = useState(null)

  useEffect(() => {
    let alive = true
    // Same base the rest of the app talks to.
    const base = import.meta.env.VITE_API_URL || 'http://localhost:8090'
    fetch(`${base}/public/capabilities`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d) setCaps(d) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  return caps
}

/** 3277509 → "3.3M". Long digit strings do not belong in a headline figure. */
export function compact(n) {
  if (n == null) return null
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`
  return String(n)
}
