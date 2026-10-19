import { StyleSheet, type ImageStyle, type TextStyle, type ViewStyle } from "react-native";

/**
 * Design tokens, in two palettes: a deep slate dark theme and a cool, clean
 * light one, with a cobalt accent, green for clear, amber for caution and red
 * for threat.
 *
 * The tokens are live. `bg.canvas`, `text.primary` and the rest read the
 * current mode every time they are read, so a value looked up during render
 * is always the right one. Stylesheets are built with `themed()`, which builds
 * one sheet per mode on first use; App re-renders the screens when the mode
 * changes, and every style follows without a screen having to know a theme
 * exists.
 *
 * Severity is never colour alone: every severity on screen also carries its
 * name.
 */

export type Mode = "dark" | "light";

const PALETTES = {
  dark: {
    bg: {
      canvas: "#0C0F14",
      raised: "#141820",
      card: "#161A22", // cards and grouped lists
      elevated: "#1F232C", // inputs, pressed cells, nested modules
      border: "#252A33",
      borderStrong: "#363B46",
    },
    text: {
      primary: "#F1F2F7",
      secondary: "#C3C5D9",
      muted: "#8D90A2",
      faint: "#5E6172",
      onAccent: "#FFFFFF",
    },
    accent: {
      base: "#9DB2FF", // links, icons and highlighted text on the dark ground
      deep: "#1E58FC", // filled controls, the selected tab
      dark: "#0038B7",
      soft: "rgba(30,88,252,0.16)",
    },
    risk: {
      CRITICAL: "#FF5A67",
      HIGH: "#FFB020",
      MEDIUM: "#E8C45A",
      LOW: "#2EE59D",
      UNKNOWN: "#8D90A2",
    },
    modality: {
      graph: "#9DB2FF", // network
      behavioral: "#FFB020", // behaviour
      temporal: "#2EE59D", // timing
    },
    hero: { from: "#FFE2A8", to: "#FFC56B", ink: "#1A1205", muted: "#5C4318" },
  },
  light: {
    bg: {
      canvas: "#FAF8FF",
      raised: "#F2F3FF",
      card: "#FFFFFF",
      elevated: "#EEF0FB",
      border: "#E3E6F2",
      borderStrong: "#C9CCDA",
    },
    text: {
      primary: "#131B2E",
      secondary: "#434655",
      muted: "#6B6E7E",
      faint: "#9A9DAE",
      onAccent: "#FFFFFF",
    },
    accent: {
      base: "#1D4FD8",
      deep: "#2563EB",
      dark: "#1E40AF",
      soft: "rgba(37,99,235,0.10)",
    },
    risk: {
      CRITICAL: "#BA1A1A",
      HIGH: "#B45309",
      MEDIUM: "#8A6200",
      LOW: "#007D55",
      UNKNOWN: "#6B6E7E",
    },
    modality: {
      graph: "#2563EB",
      behavioral: "#B45309",
      temporal: "#007D55",
    },
    hero: { from: "#FFF1C4", to: "#FFD27A", ink: "#2A1A00", muted: "#6A4A10" },
  },
} as const;

type Palette = (typeof PALETTES)["dark"];
type Widen<T> = { readonly [K in keyof T]: string };

let current: Mode = "dark";

/** Switch every token to `mode`. App calls this before the screens render. */
export function setMode(mode: Mode): void {
  current = mode;
}

export function getMode(): Mode {
  return current;
}

/** Status bar text that reads on the current canvas. */
export function statusBar(): "light-content" | "dark-content" {
  return current === "dark" ? "light-content" : "dark-content";
}

/** An object whose fields always read from the palette of the current mode. */
function live<K extends keyof Palette>(key: K): Widen<Palette[K]> {
  const now = () => PALETTES[current][key] as unknown as Record<string | symbol, string>;
  return new Proxy({} as Widen<Palette[K]>, {
    get: (_, field) => now()[field],
    has: (_, field) => field in now(),
    ownKeys: () => Reflect.ownKeys(now()),
    getOwnPropertyDescriptor: (_, field) =>
      field in now() ? { enumerable: true, configurable: true, value: now()[field] } : undefined,
  });
}

export const bg = live("bg");
export const text = live("text");
export const accent = live("accent");
/** Risk classification. One hue per severity, used everywhere a severity appears. */
export const risk = live("risk");
/** Per-detector identity, so a colour always means the same detector. */
export const modality = live("modality");
/** The warm card that carries the most serious case on Home. */
export const hero = live("hero");

export type RiskLevel = keyof Palette["risk"];

export function riskColour(level?: string | null): string {
  const key = String(level ?? "").toUpperCase() as RiskLevel;
  return risk[key] ?? risk.UNKNOWN;
}

/** Icon tiles in grouped lists. The same in both modes: they sit on their own fill. */
export const tile = {
  blue: "#1E58FC",
  green: "#12B981",
  orange: "#F59E0B",
  red: "#EF4444",
  purple: "#8B5CF6",
  grey: "#8D90A2",
  teal: "#14B8A6",
  indigo: "#6366F1",
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 14, lg: 24, xl: 28, pill: 999 } as const;

/** The two faces, bundled in assets/fonts and loaded in App.tsx. */
export const font = {
  regular: "PlusJakartaSans-Regular",
  medium: "PlusJakartaSans-Medium",
  semibold: "PlusJakartaSans-SemiBold",
  bold: "PlusJakartaSans-Bold",
  extrabold: "PlusJakartaSans-ExtraBold",
  mono: "JetBrainsMono-Medium",
} as const;

/**
 * Monospace, for anything a person may need to read character by character:
 * account identifiers, case references, scores. A proportional font makes
 * C1666544295 and C1666554295 look alike.
 */
export const mono = { fontFamily: font.mono } as const;

/** Display titles. Both map to the heavy sans; the names stay for older screens. */
export const serif = { regular: font.extrabold, italic: font.extrabold } as const;

// stylesheets that follow the mode

const WEIGHT_FACE: Record<string, string> = {
  "100": font.regular,
  "200": font.regular,
  "300": font.regular,
  "400": font.regular,
  normal: font.regular,
  "500": font.medium,
  "600": font.semibold,
  "700": font.bold,
  bold: font.bold,
  "800": font.extrabold,
  "900": font.extrabold,
};

/**
 * Text gets the app's face from its weight. A custom font on Android ignores
 * fontWeight, so the weight is turned into the matching file instead, and
 * every text style written as "fontSize 15, fontWeight 600" picks up the
 * typeface without being edited.
 */
export function face<T extends TextStyle>(style: T): T {
  const s = { ...style };
  if (s.fontFamily === font.mono || (s.fontFamily && String(s.fontFamily).startsWith("PlusJakarta"))) {
    delete s.fontWeight;
  } else if (s.fontSize !== undefined && !s.fontFamily) {
    s.fontFamily = WEIGHT_FACE[String(s.fontWeight ?? "400")] ?? font.regular;
    delete s.fontWeight;
  }
  return s;
}

type NamedStyles<T> = { [P in keyof T]: ViewStyle | TextStyle | ImageStyle };

/**
 * StyleSheet.create, once per mode. `make` reads the live tokens, so the sheet
 * built for dark and the one built for light each hold their own colours.
 */
export function themed<T extends NamedStyles<T>>(make: () => T): T {
  const sheets: Partial<Record<Mode, T>> = {};
  const build = (): T => {
    const raw = make() as Record<string, TextStyle>;
    const out: Record<string, TextStyle> = {};
    for (const name of Object.keys(raw)) out[name] = face(raw[name]);
    return StyleSheet.create(out) as unknown as T;
  };
  return new Proxy({} as T, {
    get: (_, key) => (sheets[current] ??= build())[key as keyof T],
  });
}
