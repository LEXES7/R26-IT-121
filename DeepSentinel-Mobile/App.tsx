import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { LoginResponse } from "./src/api/auth";
import { getMe } from "./src/api/auth";
import { ApiError, setUnauthorisedHandler } from "./src/api/client";
import * as session from "./src/auth/session";
import type { Session } from "./src/auth/session";
import HomeScreen from "./src/screens/HomeScreen";
import LoginScreen from "./src/screens/LoginScreen";
import { bg, radius, space, text } from "./src/theme/tokens";

/**
 * The gate.
 *
 * On launch a stored session is read and then checked against the server
 * before it is trusted. A token can expire while the app is closed, and the
 * difference between finding that out now and finding it out on the first tap
 * is the difference between a login screen and an unexplained failure.
 *
 * A token that cannot be checked because the backend is unreachable is kept
 * rather than discarded: being offline is not the same as being signed out,
 * and throwing the session away would make a bad network cost the user their
 * credentials as well.
 */
export default function App() {
  const [current, setCurrent] = useState<Session | null>(null);
  const [restoring, setRestoring] = useState(true);

  useEffect(() => {
    (async () => {
      const stored = await session.load();
      if (!stored) {
        setRestoring(false);
        return;
      }
      try {
        // Refresh the identity while confirming the token still works — role
        // or name may have changed since it was stored.
        const user = await getMe();
        setCurrent({ ...stored, user });
      } catch (err) {
        if (err instanceof ApiError) {
          await session.clear(); // the server rejected it
        } else {
          setCurrent(stored); // unreachable, not rejected
        }
      } finally {
        setRestoring(false);
      }
    })();
  }, []);

  // Registered once so a 401 from anywhere in the app lands here rather than
  // being handled — or forgotten — screen by screen.
  useEffect(() => {
    setUnauthorisedHandler(() => {
      session.clear();
      setCurrent(null);
    });
    return () => setUnauthorisedHandler(null);
  }, []);

  const signIn = useCallback(async (login: LoginResponse) => {
    setCurrent(await session.save(login));
  }, []);

  const signOut = useCallback(async () => {
    await session.clear();
    setCurrent(null);
  }, []);

  if (restoring) return <Splash />;
  if (!current) return <LoginScreen onSignedIn={signIn} />;
  return <HomeScreen session={current} onSignOut={signOut} />;
}

function Splash() {
  return (
    <SafeAreaView style={styles.splash}>
      <StatusBar barStyle="light-content" backgroundColor={bg.canvas} />
      <View style={styles.splashInner}>
        <Text style={styles.brand}>DeepSentinel</Text>
        <ActivityIndicator size="small" color={text.muted} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: bg.canvas,
    alignItems: "center",
    justifyContent: "center",
  },
  splashInner: { alignItems: "center", gap: space.xl, borderRadius: radius.md },
  brand: {
    color: text.primary,
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
});
