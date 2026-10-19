import { Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  BackHandler,
  LayoutAnimation,
  Pressable,
  StatusBar,
  Text,
  useColorScheme,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import type { Analysis, BehaviouralEvidence, GraphEvidence } from "./src/api/analyses";
import type { AnalyzeResponse, Transaction } from "./src/api/analyze";
import type { LoginResponse, User } from "./src/api/auth";
import { getMe } from "./src/api/auth";
import { findCaseByTransaction } from "./src/api/cases";
import { ApiError, setUnauthorisedHandler } from "./src/api/client";
import type { LiveAlert } from "./src/api/monitor";
import * as biometric from "./src/auth/biometric";
import * as session from "./src/auth/session";
import type { Session } from "./src/auth/session";
import { tap, type IconName } from "./src/components/ios";
import type { Sample } from "./src/data/samples";
import { enableNotifications, onNotificationTap } from "./src/lib/notify";
import { DEFAULT_PREFS, loadPrefs, savePrefs, severitiesFor, type Prefs } from "./src/lib/prefs";
import { useMonitor } from "./src/lib/useMonitor";
import AlertsScreen from "./src/screens/AlertsScreen";
import AnalyzeScreen from "./src/screens/AnalyzeScreen";
import AssistantScreen from "./src/screens/AssistantScreen";
import CaseDeskScreen from "./src/screens/CaseDeskScreen";
import CaseScreen from "./src/screens/CaseScreen";
import CasesScreen from "./src/screens/CasesScreen";
import HomeScreen from "./src/screens/HomeScreen";
import LiveScreen from "./src/screens/LiveScreen";
import LoginScreen from "./src/screens/LoginScreen";
import OverviewScreen from "./src/screens/OverviewScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import UnlockScreen from "./src/screens/UnlockScreen";
import { accent, bg, radius, setMode, statusBar, text, themed, type Mode } from "./src/theme/tokens";

/**
 * The gate, five tabs, and a stack of pushed screens inside each tab.
 *
 * Laid out as an iOS app is: the tab bar stays put, each tab keeps its own
 * history, and tapping the tab you are already on goes back to its root. Still
 * plain state rather than a router library; nothing here needs deep links.
 */
type Tab = "home" | "alerts" | "cases" | "assistant" | "settings";

const TABS: { key: Tab; label: string; icon: IconName; iconOn: IconName }[] = [
  { key: "home", label: "Home", icon: "home-outline", iconOn: "home" },
  { key: "alerts", label: "Alerts", icon: "notifications-outline", iconOn: "notifications" },
  { key: "cases", label: "Cases", icon: "folder-open-outline", iconOn: "folder-open" },
  { key: "assistant", label: "Assistant", icon: "sparkles-outline", iconOn: "sparkles" },
  { key: "settings", label: "Settings", icon: "settings-outline", iconOn: "settings" },
];

const TAB_LABEL: Record<Tab, string> = Object.fromEntries(TABS.map((t) => [t.key, t.label])) as Record<Tab, string>;

type AnalysisPage = {
  kind: "analysis";
  row: Analysis;
  evidence?: { behavioural?: BehaviouralEvidence | null; graph?: GraphEvidence | null };
  available?: { behavioral: boolean; graph: boolean; temporal: boolean };
  groundTruth?: boolean;
  forensicReport?: string | null;
};

type Page =
  | AnalysisPage
  | { kind: "case"; caseRef: string }
  | { kind: "live" }
  | { kind: "analyze" }
  | { kind: "overview" };

/** What a page is called in the back button of the page above it. */
function pageTitle(p: Page): string {
  switch (p.kind) {
    case "analysis":
      return "Transaction";
    case "case":
      return p.caseRef;
    case "live":
      return "Live";
    case "analyze":
      return "Screen";
    case "overview":
      return "Overview";
  }
}

const EMPTY_STACKS: Record<Tab, Page[]> = { home: [], alerts: [], cases: [], assistant: [], settings: [] };

export default function App() {
  // The app's two faces. Bundled, so they resolve in a frame; until they do
  // the canvas shows rather than text jumping from one face to another.
  const [fontsLoaded, fontError] = useFonts({
    "PlusJakartaSans-Regular": require("./assets/fonts/PlusJakartaSans-Regular.ttf"),
    "PlusJakartaSans-Medium": require("./assets/fonts/PlusJakartaSans-Medium.ttf"),
    "PlusJakartaSans-SemiBold": require("./assets/fonts/PlusJakartaSans-SemiBold.ttf"),
    "PlusJakartaSans-Bold": require("./assets/fonts/PlusJakartaSans-Bold.ttf"),
    "PlusJakartaSans-ExtraBold": require("./assets/fonts/PlusJakartaSans-ExtraBold.ttf"),
    "JetBrainsMono-Medium": require("./assets/fonts/JetBrainsMono-Medium.ttf"),
  });
  if (!fontsLoaded && !fontError) return <View style={{ flex: 1, backgroundColor: bg.canvas }} />;

  return (
    <SafeAreaProvider>
      <Root />
    </SafeAreaProvider>
  );
}

function Root() {
  const [current, setCurrent] = useState<Session | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [tab, setTab] = useState<Tab>("home");
  const [stacks, setStacks] = useState<Record<Tab, Page[]>>(EMPTY_STACKS);
  const [lockedOut, setLockedOut] = useState(false);
  const leftAt = useRef<number | null>(null);

  // Fingerprint or face unlock: what the device offers, what the person chose,
  // and whether the app is currently behind the lock.
  const [bio, setBio] = useState<biometric.Capability>({ usable: false, label: "biometrics" });
  const [bioOn, setBioOn] = useState(false);
  const [locked, setLocked] = useState(false);
  const bioReady = bio.usable && bioOn;

  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);

  // Light or dark. Set before anything below renders, so every token and
  // stylesheet read during this render is already in the chosen mode.
  const scheme = useColorScheme();
  const mode: Mode = prefs.appearance === "system" ? (scheme === "light" ? "light" : "dark") : prefs.appearance;
  setMode(mode);
  const [notificationsAllowed, setNotificationsAllowed] = useState(false);
  const severities = useMemo(
    () => (notificationsAllowed ? severitiesFor(prefs.alertLevel) : new Set<string>()),
    [notificationsAllowed, prefs.alertLevel],
  );
  const monitor = useMonitor(!!current && !locked, severities);

  const stack = stacks[tab];
  const top = stack[stack.length - 1] ?? null;

  const push = useCallback(
    (page: Page, onTab?: Tab) => {
      const target = onTab ?? tab;
      if (onTab) setTab(onTab);
      setStacks((s) => ({ ...s, [target]: [...s[target], page] }));
    },
    [tab],
  );
  const pop = useCallback(() => {
    setStacks((s) => ({ ...s, [tab]: s[tab].slice(0, -1) }));
  }, [tab]);

  const reset = useCallback(() => {
    setStacks(EMPTY_STACKS);
    setTab("home");
  }, []);

  /**
   * A stored session is checked against the server before it is trusted. A
   * token can expire while the app is closed, and finding that out on launch
   * is better than finding it out on the first thing the user taps.
   */
  useEffect(() => {
    (async () => {
      const [cap, pref, stored, p] = await Promise.all([
        biometric.capability(),
        biometric.preference(),
        session.load(),
        loadPrefs(),
      ]);
      setBio(cap);
      setBioOn(pref === true);
      setPrefs(p);
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
  // handled, or forgotten, screen by screen.
  useEffect(() => {
    setUnauthorisedHandler(() => {
      session.clear();
      setCurrent(null);
      reset();
    });
    return () => setUnauthorisedHandler(null);
  }, [reset]);

  /**
   * Lock when the app has been away long enough. How long is a setting.
   *
   * Timed from when it went to the background rather than counted while it is
   * gone: a phone suspends background timers. Only "background" starts the
   * clock. The fingerprint prompt and permission dialogs make the app briefly
   * "inactive", and counting those would lock the app in a loop.
   *
   * Without biometric unlock the session is cleared from the keystore, not
   * just from memory, so a relaunch cannot walk past the lock.
   */
  useEffect(() => {
    const lockAfter = prefs.autoLockMinutes * 60_000;
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        const away = leftAt.current !== null ? Date.now() - leftAt.current : -1;
        leftAt.current = null;
        if (away < 0 || away < lockAfter || !current) return;
        if (bioReady) {
          setLocked(true);
        } else {
          session.clear();
          setCurrent(null);
          reset();
          setLockedOut(true);
        }
      } else if (next === "background") {
        leftAt.current ??= Date.now();
      }
    });
    return () => sub.remove();
  }, [bioReady, prefs.autoLockMinutes, current, reset]);

  // Ask for notification permission once someone is signed in and unlocked;
  // asking on the login screen would be asking a stranger.
  useEffect(() => {
    if (current && !locked) enableNotifications().then(setNotificationsAllowed);
  }, [current, locked]);

  /** Open the case the monitor recorded for a live alert, on the Home tab. */
  const openTransaction = useCallback(
    async (transactionId: string) => {
      try {
        const found = await findCaseByTransaction(transactionId);
        if (found) {
          push({ kind: "case", caseRef: found.case_ref }, "home");
        } else {
          Alert.alert(
            "No case recorded yet",
            `The monitor has not written a case for ${transactionId}. It is recorded moments after the alert; try again shortly.`,
          );
        }
      } catch (err) {
        Alert.alert("Cannot open the case", (err as Error).message);
      }
    },
    [push],
  );

  useEffect(() => onNotificationTap(openTransaction), [openTransaction]);

  // Android's back button pops the current tab's stack before it leaves the app.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (top) {
        pop();
        return true;
      }
      if (tab !== "home" && tab !== "settings") {
        setTab("home");
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [top, tab, pop]);

  const signIn = useCallback(
    async (login: LoginResponse) => {
      setCurrent(await session.save(login));
      reset();
      setLockedOut(false);
      setLocked(false);

      // Offered once, after a password sign-in has proved who this is. A "no"
      // is remembered as firmly as a "yes".
      const [cap, pref] = await Promise.all([biometric.capability(), biometric.preference()]);
      setBio(cap);
      if (cap.usable && pref === null) {
        Alert.alert(
          `Unlock with ${cap.label}?`,
          `When the app has been in the background it locks. With ${cap.label}, you unlock it instead of typing your password again. You can change this in Settings.`,
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
    },
    [reset],
  );

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
    reset();
    setLocked(false);
  }, [reset]);

  const changePrefs = useCallback((next: Prefs) => {
    setPrefs(next);
    savePrefs(next);
  }, []);

  const updateUser = useCallback(
    async (user: User) => {
      if (current) setCurrent(await session.updateUser(current, user));
    },
    [current],
  );

  const showResult = useCallback(
    (result: AnalyzeResponse, sample: Sample) => {
      push({
        kind: "analysis",
        row: toAnalysis(result, sample.transaction),
        evidence: { behavioural: result.behavioral_evidence, graph: result.graph_evidence },
        available: {
          behavioral: result.behavioral_available,
          graph: result.graph_available,
          temporal: result.temporal_available,
        },
        groundTruth: sample.isFraud,
        forensicReport: result.forensic_report,
      });
    },
    [push],
  );

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

  const backLabel = stack.length > 1 ? pageTitle(stack[stack.length - 2]) : TAB_LABEL[tab];

  function renderPage(page: Page) {
    switch (page.kind) {
      case "analysis":
        return (
          <CaseScreen
            row={page.row}
            evidence={page.evidence}
            available={page.available}
            groundTruth={page.groundTruth}
            forensicReport={page.forensicReport}
            backLabel={backLabel}
            onBack={pop}
          />
        );
      case "case":
        return <CaseDeskScreen caseRef={page.caseRef} backLabel={backLabel} onBack={pop} />;
      case "live":
        return (
          <LiveScreen
            state={monitor.state}
            error={monitor.error}
            notifying={severities.size > 0}
            onOpen={(a: LiveAlert) => openTransaction(a.transaction_id)}
            onBack={pop}
          />
        );
      case "analyze":
        return <AnalyzeScreen onResult={showResult} backLabel={backLabel} onBack={pop} />;
      case "overview":
        return <OverviewScreen onBack={pop} />;
    }
  }

  function renderRoot() {
    switch (tab) {
      case "home":
        return (
          <HomeScreen
            user={current!.user}
            monitor={monitor.state}
            onOpenAlert={(a) => openTransaction(a.transaction_id)}
            onOpenCase={(caseRef) => push({ kind: "case", caseRef })}
            onOpenLive={() => push({ kind: "live" })}
            onScreen={() => push({ kind: "analyze" })}
            onOverview={() => push({ kind: "overview" })}
            onCases={() => setTab("cases")}
            onAlerts={() => setTab("alerts")}
          />
        );
      case "alerts":
        return (
          <AlertsScreen
            onOpen={(row) => push({ kind: "analysis", row })}
            onScreen={() => push({ kind: "analyze" })}
          />
        );
      case "cases":
        return <CasesScreen onOpen={(c) => push({ kind: "case", caseRef: c.case_ref })} />;
      case "assistant":
        return <AssistantScreen />;
      case "settings":
        return (
          <SettingsScreen
            user={current!.user}
            onUserUpdated={updateUser}
            onSignOut={signOut}
            onPasswordChanged={signOut}
            biometric={{ usable: bio.usable, label: bio.label, on: bioOn, toggle: toggleBiometric }}
            prefs={prefs}
            onPrefs={changePrefs}
            notificationsAllowed={notificationsAllowed}
          />
        );
    }
  }

  return (
    <View style={styles.shell}>
      <StatusBar barStyle={statusBar()} backgroundColor={bg.canvas} />
      {/* Remounted on a change of mode, so nothing keeps a colour from before it. */}
      <View key={mode} style={styles.body}>
        {top ? renderPage(top) : renderRoot()}
      </View>
      <TabBar
        tab={tab}
        onSelect={(t) => {
          if (t === tab) {
            // iOS: tapping the current tab returns to its root.
            setStacks((s) => ({ ...s, [t]: [] }));
          } else {
            setTab(t);
          }
        }}
      />
    </View>
  );
}

/**
 * A screening result, in the shape the transaction screen already reads.
 *
 * The two paths return different objects for the same thing (the analysis
 * list a stored summary, `/analyze` a live result) and one screen renders
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

/**
 * The tab dock: a floating pill, the current tab a filled capsule with its
 * name, the others their icon alone. Five names in a row would not fit one
 * thumb's width at a readable size; the icons are labelled for screen readers.
 */
function TabBar({ tab, onSelect }: { tab: Tab; onSelect: (t: Tab) => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.dockWrap, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={styles.dock} accessibilityRole="tablist">
        {TABS.map((t) => {
          const on = t.key === tab;
          return (
            <Pressable
              key={t.key}
              onPress={() => {
                tap();
                if (!on) LayoutAnimation.configureNext(LayoutAnimation.create(180, "easeInEaseOut", "opacity"));
                onSelect(t.key);
              }}
              style={({ pressed }) => [styles.tab, on && styles.tabOn, pressed && !on && { opacity: 0.6 }]}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={t.label}
            >
              <Ionicons name={on ? t.iconOn : t.icon} size={22} color={on ? text.onAccent : text.muted} />
              {on && (
                <Text style={styles.tabText} numberOfLines={1}>
                  {t.label}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Splash() {
  return (
    <SafeAreaView style={styles.splash}>
      <StatusBar barStyle={statusBar()} backgroundColor={bg.canvas} />
      <View style={styles.splashInner}>
        <Text style={styles.brand}>DeepSentinel</Text>
        <ActivityIndicator size="small" color={text.muted} />
      </View>
    </SafeAreaView>
  );
}

const styles = themed(() => ({
  shell: { flex: 1, backgroundColor: bg.canvas },
  body: { flex: 1 },

  dockWrap: { paddingHorizontal: 16, paddingTop: 8, backgroundColor: bg.canvas },
  dock: {
    flexDirection: "row",
    alignItems: "center",
    height: 64,
    padding: 8,
    gap: 4,
    borderRadius: radius.pill,
    backgroundColor: bg.card,
    borderWidth: 1,
    borderColor: bg.border,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  tab: {
    flex: 1,
    height: 48,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  tabOn: {
    flex: 0,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 18,
    backgroundColor: accent.deep,
  },
  tabText: { color: text.onAccent, fontSize: 14, fontWeight: "700" },

  splash: { flex: 1, backgroundColor: bg.canvas, alignItems: "center", justifyContent: "center" },
  splashInner: { alignItems: "center", gap: 24 },
  brand: { color: text.primary, fontSize: 28, fontWeight: "700", letterSpacing: -0.5 },
}));
