import * as SecureStore from "expo-secure-store";

import type { LoginResponse, User } from "../api/auth";
import { setAuthToken } from "../api/client";

/**
 * Where the signed-in session lives between app launches.
 *
 * SecureStore rather than AsyncStorage: this is a bearer token for a fraud
 * platform, and AsyncStorage is an unencrypted file that any process with the
 * app's storage can read. SecureStore puts it behind the Android Keystore.
 *
 * Only the token and the user's identity are kept. The password is never
 * written anywhere — it is exchanged for a token and dropped.
 */

const TOKEN_KEY = "ds.token";
const USER_KEY = "ds.user";

export type Session = { token: string; user: User };

/**
 * Every call is wrapped: SecureStore throws on devices where the keystore is
 * unavailable, and a storage failure should degrade to "not signed in" rather
 * than crash the app on launch.
 */
export async function save(login: LoginResponse): Promise<Session> {
  const session = { token: login.access_token, user: login.user };
  try {
    await SecureStore.setItemAsync(TOKEN_KEY, session.token);
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(session.user));
  } catch {
    // The session still works for this run; it just will not survive a restart.
  }
  setAuthToken(session.token);
  return session;
}

/**
 * Read the stored session, if there is one.
 *
 * Returns what was stored without asking the server whether it is still valid.
 * The caller checks that — see `App.tsx` — because a token that expired while
 * the app was closed should send the user to the login screen on launch rather
 * than on the first thing they tap.
 */
export async function load(): Promise<Session | null> {
  try {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    const rawUser = await SecureStore.getItemAsync(USER_KEY);
    if (!token || !rawUser) return null;
    const session = { token, user: JSON.parse(rawUser) as User };
    setAuthToken(token);
    return session;
  } catch {
    return null;
  }
}

export async function clear(): Promise<void> {
  setAuthToken(null);
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
  } catch {
    // Nothing to do: the in-memory token is already gone, which is what
    // matters for the current run.
  }
}
