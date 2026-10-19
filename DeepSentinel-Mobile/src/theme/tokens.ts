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
 * Surfaces: the web app's warm near-black and warm greys.
 *
 * Still laid out the way an iOS app is, grouped lists on a raised surface with
 * hairline separators, but in the site's palette rather than iOS grey, so the
 * phone, the console and the public site read as one product. The risk ramp
 * above is not part of this and still matches the web exactly.
 */
export const bg = {
  canvas: "#0D0C0B", // the site's ground
  raised: "#161412",
  card: "#1A1715", // grouped cell
  elevated: "#26221F", // inputs and pressed cells
  border: "#2E2A27", // separator
  borderStrong: "#46403B",
} as const;

/** Text ramp, warm like the site's. A given step always means the same emphasis. */
export const text = {
  primary: "#FBFAF7",
  secondary: "#D6D1C9",
  muted: "#A39C92",
  faint: "#6C655D",
} as const;

/**
 * The site's display face, bundled in assets/fonts and loaded in App.tsx.
 * Large titles are set in it, with an italic teal clause where a screen has
 * one, as every page of the site is.
 */
export const serif = {
  regular: "InstrumentSerif-Regular",
  italic: "InstrumentSerif-Italic",
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
