import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { Analysis } from "./src/api/analyses";
import type { LoginResponse } from "./src/api/auth";
import { getMe } from "./src/api/auth";
import { ApiError, setUnauthorisedHandler } from "./src/api/client";
import * as session from "./src/auth/session";
import type { Session } from "./src/auth/session";
import AlertsScreen from "./src/screens/AlertsScreen";
import CaseScreen from "./src/screens/CaseScreen";
import LoginScreen from "./src/screens/LoginScreen";
import { bg, space, text } from "./src/theme/tokens";

/**
 * The gate, and a two-deep stack behind it.
 *
 * Navigation is a piece of state rather than a router: there are two screens
 * and one way between them, and a router would be more moving parts than the
 * problem has. It is worth revisiting when the monitor and the analyzer land.
 */
type Screen = { name: "alerts" } | { name: "case"; row: Analysis };

export default function App() {
  const [current, setCurrent] = useState<Session | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [screen, setScreen] = useState<Screen>({ name: "alerts" });

  /**
   * A stored session is checked against the server before it is trusted. A
   * token can expire while the app is closed, and finding that out on launch
   * is better than finding it out on the first thing the user taps.
   */
  useEffect(() => {
    (async () => {
      const stored = await session.load();
      if (!stored) {
        setRestoring(false);
        return;
      }
      try {
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

  // Registered once, so a 401 from anywhere lands here rather than being
  // handled — or forgotten — screen by screen.
  useEffect(() => {
    setUnauthorisedHandler(() => {
      session.clear();
      setCurrent(null);
      setScreen({ name: "alerts" });
    });
    return () => setUnauthorisedHandler(null);
  }, []);

  // Android's back button should leave a case, not the app.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (screen.name === "case") {
        setScreen({ name: "alerts" });
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [screen]);

  const signIn = useCallback(async (login: LoginResponse) => {
    setCurrent(await session.save(login));
    setScreen({ name: "alerts" });
  }, []);

  const signOut = useCallback(async () => {
    await session.clear();
    setCurrent(null);
    setScreen({ name: "alerts" });
  }, []);

  if (restoring) return <Splash />;
  if (!current) return <LoginScreen onSignedIn={signIn} />;

  if (screen.name === "case") {
    return (
      <CaseScreen row={screen.row} onBack={() => setScreen({ name: "alerts" })} />
    );
  }

  return (
    <AlertsScreen
      session={current}
      onOpen={(row) => setScreen({ name: "case", row })}
      onSignOut={signOut}
    />
  );
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
  splashInner: { alignItems: "center", gap: space.xl },
  brand: {
    color: text.primary,
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
});
