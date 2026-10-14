import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { LiveAlert, MonitorState } from "../api/monitor";
import { RiskBadge, ScoreBar } from "../components/ui";
import { notificationsSupported } from "../lib/notify";
import { account, money, percent, score } from "../lib/format";
import { statusBarInset } from "../theme/layout";
import { accent, bg, mono, radius, risk, riskColour, space, text } from "../theme/tokens";

/**
 * What the monitor is screening right now.
 *
 * The phone's view of the web console's live dashboard: whether the pipeline
 * is running, how fast, which stage is busy, and every alert as it fires. An
 * alert opens the case the monitor recorded for it.
 */

const STAGES: [string, string][] = [
  ["graph", "Graph"],
  ["behavioural", "Behaviour"],
  ["temporal", "Timing"],
  ["fusion", "Fusion"],
  ["report", "Report"],
];

function stageColour(status: string | undefined): string {
  // The engine reports "active" while a stage is working and "idle" between
  // transactions; anything else is a fault it has named.
  if (status === "active") return accent.base;
  if (status && status !== "idle") return risk.CRITICAL;
  return text.faint;
}

export default function LiveScreen({
  state,
  error,
  notifying,
  onOpen,
}: {
  state: MonitorState | null;
  error: string | null;
  /** Whether new HIGH and CRITICAL alerts raise a notification on this device. */
  notifying: boolean;
  onOpen: (alert: LiveAlert) => Promise<void>;
}) {
  const [opening, setOpening] = useState<string | null>(null);

  const open = async (a: LiveAlert) => {
    setOpening(a.transaction_id);
    try {
      await onOpen(a);
    } finally {
      setOpening(null);
    }
  };

  const c = state?.counters;

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={bg.canvas} />
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Live</Text>
          <Text style={styles.subtitle}>
            {notifying
              ? "Notifying on HIGH and CRITICAL"
              : notificationsSupported
                ? "Notifications are off"
                : "Notifications need a development build, not Expo Go"}
          </Text>
        </View>
        <View
          style={[
            styles.pill,
            { borderColor: state?.running ? risk.LOW : bg.borderStrong },
          ]}
        >
          <View
            style={[
              styles.pillDot,
              { backgroundColor: state?.running ? risk.LOW : text.faint },
            ]}
          />
          <Text style={[styles.pillText, { color: state?.running ? risk.LOW : text.muted }]}>
            {state ? (state.running ? "Screening" : "Stopped") : "…"}
          </Text>
        </View>
      </View>

      {!state ? (
        <View style={styles.centre}>
          {error ? (
            <>
              <Text style={styles.emptyTitle}>Cannot reach the monitor</Text>
              <Text style={styles.emptyBody}>{error}</Text>
            </>
          ) : (
            <ActivityIndicator color={text.muted} />
          )}
        </View>
      ) : (
        <FlatList
          data={state.alerts}
          keyExtractor={(a) => `${a.transaction_id}@${a.at}`}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={{ gap: space.md }}>
              <View style={styles.stats}>
                <Stat label="Screened" value={String(c?.screened ?? 0)} />
                <Stat label="Alerts" value={String(c?.alerts ?? 0)} />
                <Stat label="Per minute" value={String(c?.throughput_per_min ?? 0)} />
                <Stat label="Flag rate" value={percent(c?.flag_rate, 1)} />
              </View>
              <View style={styles.stages}>
                {STAGES.map(([key, label]) => (
                  <View key={key} style={styles.stage}>
                    <View
                      style={[styles.stageLamp, { backgroundColor: stageColour(state.stages[key]) }]}
                    />
                    <Text style={styles.stageText}>{label}</Text>
                  </View>
                ))}
              </View>
              {state.source && (
                <Text style={styles.source}>
                  Source: {state.source}
                  {state.queue != null ? ` · ${state.queue} queued` : ""}
                </Text>
              )}
              {error && <Text style={styles.stale}>Last refresh failed: {error}</Text>}
              <Text style={styles.section}>Recent alerts</Text>
            </View>
          }
          ListEmptyComponent={
            <Text style={styles.emptyBody}>
              {state.running
                ? "Screening. Nothing at MEDIUM or above yet."
                : "The monitor is stopped. An administrator starts it from the web console."}
            </Text>
          }
          renderItem={({ item }) => (
            <AlertRow a={item} opening={opening === item.transaction_id} onPress={() => open(item)} />
          )}
        />
      )}
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function AlertRow({ a, opening, onPress }: { a: LiveAlert; opening: boolean; onPress: () => void }) {
  const colour = riskColour(a.severity);
  const secondsAgo = Math.max(0, Date.now() / 1000 - a.at);
  const when =
    secondsAgo < 60
      ? `${Math.round(secondsAgo)}s ago`
      : secondsAgo < 3600
        ? `${Math.round(secondsAgo / 60)}m ago`
        : `${Math.round(secondsAgo / 3600)}h ago`;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}>
      <View style={[styles.rowAccent, { backgroundColor: colour }]} />
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <RiskBadge level={a.severity} />
          <Text style={styles.amount}>{money(a.amount)}</Text>
          {opening ? (
            <ActivityIndicator size="small" color={text.muted} />
          ) : (
            <Text style={styles.time}>{when}</Text>
          )}
        </View>
        <Text style={styles.accounts} numberOfLines={1}>
          {account(a.from)} → {account(a.to)}
        </Text>
        <Text style={styles.why} numberOfLines={1}>
          {[
            a.pattern && a.pattern !== "UNKNOWN" ? a.pattern.replace(/_/g, " ").toLowerCase() : null,
            a.driver ? `driven by ${a.driver}` : null,
            `${a.modalities_used} of 3 detectors`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </Text>
        <View style={{ marginTop: space.sm }}>
          <ScoreBar value={a.fused_score} colour={colour} height={4} />
        </View>
        <Text style={styles.score}>{score(a.fused_score)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: bg.canvas, paddingTop: statusBarInset },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.md,
  },
  title: { color: text.primary, fontSize: 28, fontWeight: "700", letterSpacing: -0.5 },
  subtitle: { color: text.muted, fontSize: 14, marginTop: 2 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 5,
  },
  pillDot: { width: 7, height: 7, borderRadius: 4 },
  pillText: { fontSize: 12, fontWeight: "600" },

  list: { paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.md },
  stats: { flexDirection: "row", gap: space.sm },
  stat: {
    flex: 1,
    backgroundColor: bg.card,
    borderWidth: 1,
    borderColor: bg.border,
    borderRadius: radius.md,
    padding: space.md,
  },
  statValue: { ...mono, color: text.primary, fontSize: 17, fontWeight: "700" },
  statLabel: { color: text.muted, fontSize: 10, marginTop: 2, textTransform: "uppercase", letterSpacing: 0.6 },
  stages: { flexDirection: "row", justifyContent: "space-between" },
  stage: { alignItems: "center", gap: 4 },
  stageLamp: { width: 10, height: 10, borderRadius: 5 },
  stageText: { color: text.muted, fontSize: 11 },
  source: { color: text.faint, fontSize: 11 },
  stale: { color: risk.MEDIUM, fontSize: 11 },
  section: {
    color: text.muted,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginTop: space.sm,
  },

  centre: { padding: space.xxl, alignItems: "center", gap: space.sm },
  emptyTitle: { color: text.secondary, fontSize: 15, fontWeight: "600" },
  emptyBody: { color: text.faint, fontSize: 12, lineHeight: 18, textAlign: "center" },

  row: {
    flexDirection: "row",
    backgroundColor: bg.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: bg.border,
    overflow: "hidden",
  },
  rowAccent: { width: 3 },
  rowBody: { flex: 1, padding: space.lg },
  rowTop: { flexDirection: "row", alignItems: "center", gap: space.md },
  amount: { ...mono, color: text.primary, fontSize: 16, fontWeight: "700", flex: 1 },
  time: { color: text.faint, fontSize: 11 },
  accounts: { ...mono, color: text.secondary, fontSize: 12, marginTop: space.md },
  why: { color: text.muted, fontSize: 12, marginTop: 3 },
  score: { ...mono, color: text.muted, fontSize: 11, marginTop: 4 },
});
