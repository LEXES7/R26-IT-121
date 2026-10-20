import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

/**
 * Fingerprint or face unlock for a session that is already signed in.
 *
 * Without it the background lock has one answer, which is to throw the
 * session away and ask for the password again. With it, the token stays in the
 * keystore and the lock asks for the person instead. It never replaces the
 * password: the first sign-in on a device is always a password, and the server
 * still checks the token on every request.
 *
 * The choice is stored as "1" or "0" so that a refusal is remembered too.
 * Asking after every sign-in would teach people to tap "no" without reading.
 */

const PREF_KEY = "ds.biometric";

export type Capability = {
  /** The device has a sensor and at least one fingerprint or face enrolled. */
  usable: boolean;
  /** What to call it on screen. */
  label: string;
};

export async function capability(): Promise<Capability> {
  try {
    const [hardware, enrolled, types] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);
    const face = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
    const finger = types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT);
    return {
      usable: hardware && enrolled,
      label: finger ? "fingerprint" : face ? "face unlock" : "biometrics",
    };
  } catch {
    return { usable: false, label: "biometrics" };
  }
}

/** null means the person has not been asked yet. */
export async function preference(): Promise<boolean | null> {
  try {
    const v = await SecureStore.getItemAsync(PREF_KEY);
    return v === null ? null : v === "1";
  } catch {
    return null;
  }
}

export async function setPreference(on: boolean): Promise<void> {
  try {
    await SecureStore.setItemAsync(PREF_KEY, on ? "1" : "0");
  } catch {
    // Not persisted; the lock falls back to signing out, which is the safe side.
  }
}

/** True only when the device confirmed the person. Cancelling is not an error. */
export async function verify(label: string): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Unlock DeepSentinel",
      cancelLabel: "Cancel",
      // The device PIN is allowed as a fallback, as a banking app allows it:
      // a cut finger should not lock an analyst out of a live case.
      disableDeviceFallback: false,
      biometricsSecurityLevel: "strong",
      fallbackLabel: `Use device PIN instead of ${label}`,
    });
    return result.success;
  } catch {
    return false;
  }
}
