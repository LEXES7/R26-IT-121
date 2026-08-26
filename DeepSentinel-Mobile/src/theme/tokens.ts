/**
 * Design tokens, taken from the web app's tailwind.config.js and index.css.
 *
 * These are copied rather than imported because the two apps cannot share a
 * build, but the values must not drift: a CRITICAL badge has to be the same red
 * on a phone as it is on the dashboard and in the alert email. When the web
 * palette changes, change it here too.
 */

/** Risk classification. One hue per severity, used everywhere a severity appears. */
export const risk = {
  CRITICAL: "#ef4444",
  HIGH: "#f97316",
  MEDIUM: "#eab308",
  LOW: "#22c55e",
  UNKNOWN: "#64748b",
} as const;

export type RiskLevel = keyof typeof risk;

export function riskColour(level?: string | null): string {
  const key = String(level ?? "").toUpperCase() as RiskLevel;
  return risk[key] ?? risk.UNKNOWN;
}

/** Per-modality identity, so a colour always means the same detector. */
export const modality = {
  graph: "rgb(15, 155, 142)", // network   — teal
  behavioral: "rgb(220, 38, 73)", // behaviour — rose
  temporal: "rgb(194, 116, 10)", // timing    — amber
} as const;

/** Canvas layers — the sentinel ramp. */
export const bg = {
  canvas: "#06091A", // sentinel-950
  raised: "#0A0F1E", // sentinel-900
  card: "#0F172A", // sentinel-800
  border: "#1E293B", // sentinel-700
  borderStrong: "#334155", // sentinel-600
} as const;

/** Text ramp. A given step always means the same amount of emphasis. */
export const text = {
  primary: "#E2E8F0",
  secondary: "#94A3B8",
  muted: "#64748B",
  faint: "#475569",
} as const;

/** Editorial accent. Teal, kept clear of the risk ramp so it never reads as a severity. */
export const accent = {
  base: "#2DD4BF",
  deep: "#0F9B8E",
  dark: "#0D766E",
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 6, md: 10, lg: 14, pill: 999 } as const;

/**
 * Monospace, for anything a person may need to read character by character —
 * account identifiers, case references, scores. A proportional font makes
 * C1666544295 and C1666554295 look alike.
 */
export const mono = { fontFamily: "monospace" } as const;
