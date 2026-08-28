import Constants from "expo-constants";

/**
 * The one place the backend's address is read.
 *
 * Nothing else in the app may write a URL. When the fusion engine moves to
 * Azure this file does not change — app.config.js picks the new value up from
 * EXPO_PUBLIC_API_BASE.
 */
export const API_BASE: string = (
  Constants.expoConfig?.extra?.apiBase ?? ""
).replace(/\/+$/, "");

/**
 * How long a request may take before it is treated as unreachable.
 *
 * Deliberately short. On a phone the common failure is not a slow server but
 * the wrong network — a spinner that hangs for a minute reads as "broken app"
 * when the honest answer is "cannot reach the backend", and the sooner that is
 * on screen the sooner it can be fixed.
 */
export const REQUEST_TIMEOUT_MS = 10_000;
