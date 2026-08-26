import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { Analysis, BehaviouralEvidence, GraphEvidence } from "./src/api/analyses";
import type { AnalyzeResponse, Transaction } from "./src/api/analyze";
import type { LoginResponse } from "./src/api/auth";
import { getMe } from "./src/api/auth";
import { ApiError, setUnauthorisedHandler } from "./src/api/client";
import * as session from "./src/auth/session";
import type { Session } from "./src/auth/session";
import type { Sample } from "./src/data/samples";
import AlertsScreen from "./src/screens/AlertsScreen";
import AnalyzeScreen from "./src/screens/AnalyzeScreen";
import CaseScreen from "./src/screens/CaseScreen";
import LoginScreen from "./src/screens/LoginScreen";
import { accent, bg, space, text } from "./src/theme/tokens";

/**
 * The gate, two tabs, and one screen pushed over them.
 *
 * Navigation is state rather than a router: three screens and one way between
 * them is less structure than a router would impose. Worth revisiting if a
 * fourth arrives.
 */
type Tab = "alerts" | "analyze";

/**
 * How long the app may sit in the background before the session is dropped.
 *
 * A fraud tool on an unlocked phone left on a desk is the risk this guards.
 * Sixty seconds rather than instantly: glancing at a notification and coming
 * straight back is normal use, and signing someone out for it teaches them to
 * resent the lock rather than trust it.
 *
 * The session is cleared from the keystore, not just from memory — a lock that
 * a relaunch walks straight past is not a lock.
 */
const LOCK_AFTER_MS = 60_000;

type Detail = {
  row: Analysis;
  evidence?: {
    behavioural?: BehaviouralEvidence | null;
    graph?: GraphEvidence | null;
  };
  available?: { behavioral: boolean; graph: boolean; temporal: boolean };
  groundTruth?: boolean;
};

export default function App() {
  const [current, setCurrent] = useState<Session | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [tab, setTab] = useState<Tab>("alerts");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [lockedOut, setLockedOut] = useState(false);
  const leftAt = useRef<number | null>(null);

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
      setDetail(null);
      setTab("alerts");
    });
    return () => setUnauthorisedHandler(null);
  }, []);

  /**
   * Drop the session when the app has been away long enough.
   *
   * Timed from when it left rather than counted while it is gone: a phone
   * suspends background timers, so a countdown running in the app would not
   * finish while the app is the thing that was suspended.
   */
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        const away = leftAt.current ? Date.now() - leftAt.current : 0;
        leftAt.current = null;
        if (away > LOCK_AFTER_MS) {
          session.clear();
          setCurrent(null);
          setDetail(null);
          setTab("alerts");
          setLockedOut(true);
        }
      } else if (next === "background" || next === "inactive") {
        leftAt.current ??= Date.now();
      }
    });
    return () => sub.remove();
  }, []);

  // Android's back button should close a case, not the app.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (detail) {
        setDetail(null);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [detail]);

  const signIn = useCallback(async (login: LoginResponse) => {
    setCurrent(await session.save(login));
    setTab("alerts");
    setDetail(null);
    setLockedOut(false);
  }, []);

  const signOut = useCallback(async () => {
    await session.clear();
    setCurrent(null);
    setDetail(null);
    setTab("alerts");
  }, []);

  const showResult = useCallback((result: AnalyzeResponse, sample: Sample) => {
    setDetail({
      row: toAnalysis(result, sample.transaction),
      evidence: {
        behavioural: result.behavioral_evidence,
        graph: result.graph_evidence,
      },
      available: {
        behavioral: result.behavioral_available,
        graph: result.graph_available,
        temporal: result.temporal_available,
      },
      groundTruth: sample.isFraud,
    });
  }, []);

  if (restoring) return <Splash />;
  if (!current) return <LoginScreen onSignedIn={signIn} lockedOut={lockedOut} />;

  if (detail) {
    return (
      <CaseScreen
        row={detail.row}
        evidence={detail.evidence}
        available={detail.available}
        groundTruth={detail.groundTruth}
        onBack={() => setDetail(null)}
      />
    );
  }

  return (
    <View style={styles.shell}>
      <View style={styles.body}>
        {tab === "alerts" ? (
          <AlertsScreen
            session={current}
            onOpen={(row) => setDetail({ row })}
            onSignOut={signOut}
          />
        ) : (
          <AnalyzeScreen onResult={showResult} />
        )}
      </View>
      <View style={styles.tabs}>
        <TabButton label="Alerts" on={tab === "alerts"} onPress={() => setTab("alerts")} />
        <TabButton
          label="Screen"
          on={tab === "analyze"}
          onPress={() => setTab("analyze")}
        />
      </View>
    </View>
  );
}

/**
 * A screening result, in the shape the case screen already reads.
 *
 * The two paths return different objects for the same thing — the analysis
 * list a stored summary, `/analyze` a live result — and one screen renders
 * both rather than existing twice.
 */
function toAnalysis(result: AnalyzeResponse, t: Transaction): Analysis {
  return {
    transaction_id: result.transaction_id,
    created_at: new Date().toISOString(),
    fraud_confidence_score: result.fraud_confidence_score,
    classification: result.classification,
    modalities_used: result.modalities_used,
    graph_score: result.graph_score,
    behavioral_score: result.behavioral_score,
    temporal_score: result.temporal_score,
    typology_name: result.retrieval?.typology_name ?? null,
    typology_id: result.retrieval?.typology_id ?? null,
    similarity_score: result.retrieval?.similarity_score ?? null,
    type: t.type,
    amount: t.amount,
    nameOrig: t.nameOrig,
    nameDest: t.nameDest,
    alert_sent: false,
    mock_scenario: result.mock_scenario,
  };
}

function TabButton({
  label,
  on,
  onPress,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.tab}>
      <View style={[styles.tabMark, on && styles.tabMarkOn]} />
      <Text style={[styles.tabText, on && styles.tabTextOn]}>{label}</Text>
    </Pressable>
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
  shell: { flex: 1, backgroundColor: bg.canvas },
  body: { flex: 1 },

  tabs: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: bg.border,
    backgroundColor: bg.raised,
    paddingBottom: space.lg,
  },
  tab: { flex: 1, alignItems: "center", paddingTop: space.md, gap: space.xs },
  tabMark: {
    width: 18,
    height: 2,
    borderRadius: 1,
    backgroundColor: "transparent",
  },
  tabMarkOn: { backgroundColor: accent.base },
  tabText: { color: text.muted, fontSize: 12, fontWeight: "600" },
  tabTextOn: { color: text.primary },

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
