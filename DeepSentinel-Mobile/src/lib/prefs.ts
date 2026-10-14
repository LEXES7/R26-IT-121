import * as SecureStore from "expo-secure-store";

/**
 * Settings that belong to this phone rather than to the account.
 *
 * Kept in the same keystore as the session so they survive a restart, and
 * read once at launch. Anything that changes what the server does lives on
 * the server; these only change how this device behaves.
 */

export type AlertLevel = "high" | "critical" | "off";

export type Prefs = {
  /** Which live alerts raise a notification. */
  alertLevel: AlertLevel;
  /** Minutes in the background before the app locks. 0 locks on every return. */
  autoLockMinutes: number;
};

export const DEFAULT_PREFS: Prefs = { alertLevel: "high", autoLockMinutes: 1 };

export const AUTO_LOCK_CHOICES = [
  { minutes: 0, label: "Immediately" },
  { minutes: 1, label: "After 1 minute" },
  { minutes: 5, label: "After 5 minutes" },
  { minutes: 15, label: "After 15 minutes" },
] as const;

export const ALERT_LEVEL_CHOICES: { value: AlertLevel; label: string; detail: string }[] = [
  { value: "high", label: "High and critical", detail: "Every verdict the system commits on" },
  { value: "critical", label: "Critical only", detail: "Only the strongest verdicts" },
  { value: "off", label: "Off", detail: "The feed still updates; nothing buzzes" },
];

const KEY = "ds.prefs";

export async function loadPrefs(): Promise<Prefs> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    return raw ? { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) } : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

export async function savePrefs(prefs: Prefs): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEY, JSON.stringify(prefs));
  } catch {
    // Kept for this run only.
  }
}

/** The severities that notify at a given level. */
export function severitiesFor(level: AlertLevel): Set<string> {
  if (level === "off") return new Set();
  if (level === "critical") return new Set(["CRITICAL"]);
  return new Set(["CRITICAL", "HIGH"]);
}
