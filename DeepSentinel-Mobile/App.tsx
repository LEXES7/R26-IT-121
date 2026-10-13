import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { findCaseByTransaction } from "./src/api/cases";
import { ApiError, setUnauthorisedHandler } from "./src/api/client";
import type { LiveAlert } from "./src/api/monitor";
import * as biometric from "./src/auth/biometric";
import * as session from "./src/auth/session";
import type { Session } from "./src/auth/session";
import type { Sample } from "./src/data/samples";
import { enableNotifications, onNotificationTap } from "./src/lib/notify";
import { useMonitor } from "./src/lib/useMonitor";
import AlertsScreen from "./src/screens/AlertsScreen";
import CaseDeskScreen from "./src/screens/CaseDeskScreen";
import CasesScreen from "./src/screens/CasesScreen";
import LiveScreen from "./src/screens/LiveScreen";
import UnlockScreen from "./src/screens/UnlockScreen";
import OverviewScreen from "./src/screens/OverviewScreen";
import AnalyzeScreen from "./src/screens/AnalyzeScreen";
import CaseScreen from "./src/screens/CaseScreen";
import LoginScreen from "./src/screens/LoginScreen";
import { accent, bg, space, text } from "./src/theme/tokens";

/**
 * The gate, five tabs, and one screen pushed over them.
 *
 * Navigation is still state rather than a router. Cases and Live did not
 * change the shape: each is a leaf with one way in and one way out, and the
 * one link between screens (a live alert opening its case) is a single state
 * change rather than a route.
 */
type Tab = "overview" | "alerts" | "cases" | "live" | "analyze";

/**
 * How long the app may sit in the background before the session is dropped.
 *
 * A fraud tool on an unlocked phone left on a desk is the risk this guards.
 * Sixty seconds rather than instantly: glancing at a notification and coming
 * straight back is normal use, and signing someone out for it teaches them to
 * resent the lock rather than trust it.
 *
 * Without fingerprint or face unlock the session is cleared from the keystore,
 * not just from memory: a lock that a relaunch walks straight past is not a
 * lock. With it, the session is kept and the person is asked for instead.
 */
const LOCK_AFTER_MS = 60_000;

type Detail =
  | ({ kind: "analysis" } & AnalysisDetail)
  | { kind: "case"; caseRef: string };

type AnalysisDetail = {
  row: Analysis;
  evidence?: {
    behavioural?: BehaviouralEvidence | null;
    graph?: GraphEvidence | null;
  };
  available?: { behavioral: boolean; graph: boolean; temporal: boolean };
  groundTruth?: boolean;
  forensicReport?: string | null;
};

export default function App() {
  const [current, setCurrent] = useState<Session | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [tab, setTab] = useState<Tab>("alerts");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [lockedOut, setLockedOut] = useState(false);
  const leftAt = useRef<number | null>(null);

  // Fingerprint or face unlock: what the device offers, what the person chose,
  // and whether the app is currently behind the lock.
  const [bio, setBio] = useState<biometric.Capability>({ usable: false, label: "biometrics" });
  const [bioOn, setBioOn] = useState(false);
  const [locked, setLocked] = useState(false);
  const bioReady = bio.usable && bioOn;

  const [notifying, setNotifying] = useState(false);
  const monitor = useMonitor(!!current && !locked, notifying);

  /**
   * A stored session is checked against the server before it is trusted. A
   * token can expire while the app is closed, and finding that out on launch
   * is better than finding it out on the first thing the user taps.
   */
  useEffect(() => {
    (async () => {
      const [cap, pref] = await Promise.all([biometric.capability(), biometric.preference()]);
      setBio(cap);
      setBioOn(pref === true);
      const stored = await session.load();
      if (!stored) {
        setRestoring(false);
        return;
      }
      try {
        const user = await getMe();
        setCurrent({ ...stored, user });
        if (cap.usable && pref === true) setLocked(true);
      } catch (err) {
        if (err instanceof ApiError) {
          await session.clear(); // the server rejected it
        } else {
          setCurrent(stored); // unreachable, not rejected
          if (cap.usable && pref === true) setLocked(true);
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
        if (away > LOCK_AFTER_MS && bioReady) {
          setLocked(true);
        } else if (away > LOCK_AFTER_MS) {
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
  }, [bioReady]);

  // Ask for notification permission once someone is signed in and unlocked;
  // asking on the login screen would be asking a stranger.
  useEffect(() => {
    if (current && !locked) enableNotifications().then(setNotifying);
  }, [current, locked]);

  /** Open the case the monitor recorded for a live alert. */
  const openTransaction = useCallback(async (transactionId: string) => {
    try {
      const found = await findCaseByTransaction(transactionId);
      if (found) {
        setDetail({ kind: "case", caseRef: found.case_ref });
      } else {
        setTab("live");
        Alert.alert(
          "No case recorded yet",
          `The monitor has not written a case for ${transactionId}. It is recorded moments after the alert; try again shortly.`,
        );
      }
    } catch (err) {
      Alert.alert("Cannot open the case", (err as Error).message);
    }
  }, []);

  useEffect(() => onNotificationTap(openTransaction), [openTransaction]);

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
    setLocked(false);

    // Offered once, after a password sign-in has proved who this is. A "no"
    // is remembered as firmly as a "yes".
    const [cap, pref] = await Promise.all([biometric.capability(), biometric.preference()]);
    setBio(cap);
    if (cap.usable && pref === null) {
      Alert.alert(
        `Unlock with ${cap.label}?`,
        `When the app has been in the background for a minute it locks. With ${cap.label}, you unlock it instead of typing your password again. You can change this from the account button on Alerts.`,
        [
          {
            text: "Not now",
            style: "cancel",
            onPress: () => {
              biometric.setPreference(false);
              setBioOn(false);
            },
          },
          {
            text: "Turn on",
            onPress: () => {
              biometric.setPreference(true);
              setBioOn(true);
            },
          },
        ],
      );
    }
  }, []);

  const toggleBiometric = useCallback(async () => {
    if (!bioOn) {
      // Turning it on is confirmed by the finger or face it will expect.
      if (!(await biometric.verify(bio.label))) return;
    }
    await biometric.setPreference(!bioOn);
    setBioOn(!bioOn);
  }, [bio.label, bioOn]);

  const signOut = useCallback(async () => {
    await session.clear();
    setCurrent(null);
    setDetail(null);
    setTab("alerts");
    setLocked(false);
  }, []);

  const showResult = useCallback((result: AnalyzeResponse, sample: Sample) => {
    setDetail({
      kind: "analysis",
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
      forensicReport: result.forensic_report,
    });
  }, []);

  if (restoring) return <Splash />;
  if (!current) return <LoginScreen onSignedIn={signIn} lockedOut={lockedOut} />;

  if (locked) {
    return (
      <UnlockScreen
        username={current.user.username}
        label={bio.label}
        onUnlocked={() => setLocked(false)}
        onUsePassword={async () => {
          await signOut();
          setLockedOut(true);
        }}
      />
    );
  }

  if (detail?.kind === "case") {
    return <CaseDeskScreen caseRef={detail.caseRef} onBack={() => setDetail(null)} />;
  }

  if (detail) {
    return (
      <CaseScreen
        row={detail.row}
        evidence={detail.evidence}
        available={detail.available}
        groundTruth={detail.groundTruth}
        forensicReport={detail.forensicReport}
        onBack={() => setDetail(null)}
      />
    );
  }

  return (
    <View style={styles.shell}>
      <View style={styles.body}>
        {tab === "overview" ? (
          <OverviewScreen />
        ) : tab === "alerts" ? (
          <AlertsScreen
            session={current}
            onOpen={(row) => setDetail({ kind: "analysis", row })}
            onSignOut={signOut}
            biometric={bio.usable ? { label: bio.label, on: bioOn, toggle: toggleBiometric } : null}
          />
        ) : tab === "cases" ? (
          <CasesScreen onOpen={(c) => setDetail({ kind: "case", caseRef: c.case_ref })} />
        ) : tab === "live" ? (
          <LiveScreen
            state={monitor.state}
            error={monitor.error}
            notifying={notifying}
            onOpen={(a: LiveAlert) => openTransaction(a.transaction_id)}
          />
        ) : (
          <AnalyzeScreen onResult={showResult} />
        )}
      </View>
      <View style={styles.tabs}>
        <TabButton
          label="Overview"
          on={tab === "overview"}
          onPress={() => setTab("overview")}
        />
        <TabButton label="Alerts" on={tab === "alerts"} onPress={() => setTab("alerts")} />
        <TabButton label="Cases" on={tab === "cases"} onPress={() => setTab("cases")} />
        <TabButton
          label="Live"
          on={tab === "live"}
          badge={monitor.state?.running ?? false}
          onPress={() => setTab("live")}
        />
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
    id: result.analysis_id ?? null,
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
  badge = false,
  onPress,
}: {
  label: string;
  on: boolean;
  /** A small lamp beside the label, for a tab whose subject is running. */
  badge?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.tab}>
      <View style={[styles.tabMark, on && styles.tabMarkOn]} />
      <View style={styles.tabLabel}>
        <Text style={[styles.tabText, on && styles.tabTextOn]}>{label}</Text>
        {badge && <View style={styles.tabBadge} />}
      </View>
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
  tab: { flex: 1, alignItems: "center", paddingTop: space.md, paddingBottom: space.xs, gap: space.sm },
  tabMark: {
    width: 24,
    height: 3,
    borderRadius: 1,
    backgroundColor: "transparent",
  },
  tabMarkOn: { backgroundColor: accent.base },
  tabLabel: { flexDirection: "row", alignItems: "center", gap: 4 },
  tabBadge: { width: 6, height: 6, borderRadius: 3, backgroundColor: accent.base },
  tabText: { color: text.muted, fontSize: 13, fontWeight: "600" },
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
