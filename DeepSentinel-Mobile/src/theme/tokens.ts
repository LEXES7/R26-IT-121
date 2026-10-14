import { Platform } from "react-native";

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

/**
 * Surfaces, from iOS's dark system palette.
 *
 * The app is laid out the way an iOS app is: a black canvas, grouped lists on
 * a raised grey, hairline separators. The risk ramp above is not part of this
 * and still matches the web console exactly.
 */
export const bg = {
  canvas: "#000000", // systemBackground
  raised: "#1C1C1E", // secondarySystemBackground
  card: "#1C1C1E", // grouped cell
  elevated: "#2C2C2E", // tertiarySystemBackground, inputs and pressed cells
  border: "#38383A", // separator
  borderStrong: "#48484A", // systemGray3
} as const;

/** Text ramp. A given step always means the same amount of emphasis. */
export const text = {
  primary: "#FFFFFF", // label
  secondary: "#AEAEB2", // systemGray2
  muted: "#8E8E93", // systemGray
  faint: "#636366", // systemGray4
} as const;

/** Editorial accent and the app's tint. Teal, kept clear of the risk ramp. */
export const accent = {
  base: "#2DD4BF",
  deep: "#0F9B8E",
  dark: "#0D766E",
} as const;

/** Icon tiles in grouped lists, iOS Settings style. */
export const tile = {
  blue: "#0A84FF",
  green: "#30D158",
  orange: "#FF9F0A",
  red: "#FF453A",
  purple: "#BF5AF2",
  grey: "#8E8E93",
  teal: "#2DD4BF",
  indigo: "#5E5CE6",
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 6, md: 10, lg: 12, pill: 999 } as const;

/**
 * Monospace, for anything a person may need to read character by character —
 * account identifiers, case references, scores. A proportional font makes
 * C1666544295 and C1666554295 look alike.
 */
export const mono = {
  fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }),
};
