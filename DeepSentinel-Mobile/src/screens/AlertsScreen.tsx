import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { listAnalyses, type Analysis } from "../api/analyses";
import { getHealth, type Health } from "../api/client";
import type { Session } from "../auth/session";
import { ago, account, money, score } from "../lib/format";
import { bg, mono, radius, risk, riskColour, space, text } from "../theme/tokens";
import { statusBarInset } from "../theme/layout";
import { MODALITIES, RiskBadge, ScoreBar } from "../components/ui";

type Props = {
  session: Session;
  onOpen: (row: Analysis) => void;
  onSignOut: () => void;
};

const FILTERS = ["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;

/** How often the list refreshes itself. Short enough to feel live, long
 *  enough not to drain a phone sitting in a pocket. */
const POLL_MS = 15_000;

export default function AlertsScreen({ session, onOpen, onSignOut }: Props) {
  const [rows, setRows] = useState<Analysis[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("ALL");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [list, h] = await Promise.all([
        listAnalyses({ limit: 50, classification: filter === "ALL" ? undefined : filter }),
        getHealth().catch(() => null),
      ]);
      setRows(list);
      setHealth(h);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={bg.canvas} />

      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Alerts</Text>
          <Text style={styles.subtitle}>
            {rows.length} screened{filter !== "ALL" ? ` · ${filter.toLowerCase()}` : ""}
          </Text>
        </View>
        {/* A bordered control, not a name that happens to be tappable. Losing
            a session to a mistaken tap is the kind of thing that happens with
            a phone in one hand, so it also asks before it acts. */}
        <Pressable
          onPress={() => confirmSignOut(session.user.username, onSignOut)}
          style={({ pressed }) => [styles.signOut, pressed && styles.signOutPressed]}
          hitSlop={8}
        >
          <Text style={styles.signOutText}>Sign out</Text>
          <Text style={styles.who}>{session.user.username}</Text>
        </Pressable>
      </View>

      <DetectorStrip health={health} rows={rows} />

      <View style={styles.filters}>
        {FILTERS.map((f) => (
          <Pressable
            key={f}
            onPress={() => setFilter(f)}
            style={[styles.chip, filter === f && styles.chipOn]}
          >
            <Text style={[styles.chipText, filter === f && styles.chipTextOn]}>
              {f}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={styles.centre}>
          <ActivityIndicator color={text.muted} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r, i) => `${r.transaction_id}-${i}`}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={text.muted}
            />
          }
          ListEmptyComponent={
            <View style={styles.centre}>
              <Text style={styles.emptyTitle}>
                {error ? "Cannot reach the backend" : "Nothing screened yet"}
              </Text>
              <Text style={styles.emptyBody}>
                {error ??
                  "Analyses appear here as transactions are screened, whether from the analyzer or from ingested traffic."}
              </Text>
            </View>
          }
          renderItem={({ item }) => <Row row={item} onPress={() => onOpen(item)} />}
        />
      )}
    </SafeAreaView>
  );
}

function confirmSignOut(username: string, onSignOut: () => void) {
  Alert.alert(
    "Sign out?",
    `You are signed in as ${username}. Signing out clears the stored session and you will need your password again.`,
    [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: onSignOut },
    ],
  );
}

/**
 * How much of the system has actually been answering.
 *
 * An earlier version drew all three names in their own colour, which read as
 * all three being up when only one was. The engine lists its upstream
 * addresses without testing them, and the analysis list does not say which
 * detector answered — so the only honest number available here is how many
 * answered across recent screenings.
 *
 * It is at the top because it qualifies every row beneath it: with one
 * detector answering, every score on this screen was built from one opinion
 * and penalised for it.
 */
function DetectorStrip({ health, rows }: { health: Health | null; rows: Analysis[] }) {
  const configured = Object.keys(health?.upstream_bases ?? {}).length;
  const recent = rows.slice(0, 10);
  const worst = recent.length
    ? Math.min(...recent.map((r) => r.modalities_used ?? 0))
    : null;
  const degraded = worst !== null && worst < 3;

  return (
    <View style={styles.strip}>
      <View style={styles.stripNames}>
        {MODALITIES.map(([key, label]) => (
          <View key={key} style={styles.stripItem}>
            <View style={styles.stripDot} />
            <Text style={styles.stripLabel}>{label}</Text>
          </View>
        ))}
      </View>
      <Text style={[styles.stripNote, degraded && styles.stripWarn]}>
        {worst === null
          ? `${configured} detectors configured`
          : degraded
            ? `Recent screenings used ${worst} of 3 — scores are penalised`
            : "All three answering"}
      </Text>
    </View>
  );
}

function Row({ row, onPress }: { row: Analysis; onPress: () => void }) {
  const colour = riskColour(row.classification);
  const used = row.modalities_used ?? 0;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={[styles.rowAccent, { backgroundColor: colour }]} />
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <RiskBadge level={row.classification} />
          <Text style={styles.amount}>{money(row.amount)}</Text>
          <Text style={styles.time}>{ago(row.created_at)}</Text>
        </View>

        <Text style={styles.accounts} numberOfLines={1}>
          {account(row.nameOrig)} → {account(row.nameDest)}
          {row.type ? `  ·  ${row.type}` : ""}
        </Text>

        {row.typology_name && (
          <Text style={styles.typology} numberOfLines={1}>
            {row.typology_name}
          </Text>
        )}

        <View style={styles.rowScore}>
          <ScoreBar value={row.fraud_confidence_score} colour={colour} height={5} />
        </View>

        <View style={styles.rowFoot}>
          <Text style={styles.confidence}>{score(row.fraud_confidence_score)}</Text>
          <View style={styles.segments}>
            {[0, 1, 2].map((i) => (
              <View
                key={i}
                style={[
                  styles.segment,
                  i < used ? { backgroundColor: text.secondary } : null,
                ]}
              />
            ))}
          </View>
          <Text style={[styles.used, used < 3 && styles.usedWarn]}>
            {used} of 3 detectors
          </Text>
        </View>
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
    gap: space.md,
  },
  headerText: { flex: 1 },
  title: { color: text.primary, fontSize: 28, fontWeight: "700", letterSpacing: -0.5 },
  subtitle: { color: text.muted, fontSize: 14, marginTop: 2 },

  signOut: {
    borderWidth: 1,
    borderColor: bg.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    alignItems: "center",
  },
  signOutPressed: { opacity: 0.7, backgroundColor: bg.raised },
  signOutText: { color: text.secondary, fontSize: 13, fontWeight: "600" },
  who: { color: text.faint, fontSize: 11, marginTop: 1 },

  strip: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.md,
    gap: space.xs,
  },
  stripNames: { flexDirection: "row", gap: space.lg },
  stripItem: { flexDirection: "row", alignItems: "center", gap: space.xs },
  // Hollow: this screen cannot tell which detector answered, and a filled dot
  // in the detector's own colour would say that it did.
  stripDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: text.faint,
  },
  stripLabel: { color: text.muted, fontSize: 12 },
  stripNote: { color: text.faint, fontSize: 12 },
  stripWarn: { color: risk.MEDIUM },

  filters: {
    flexDirection: "row",
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
  },
  chip: {
    borderWidth: 1,
    borderColor: bg.border,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 5,
  },
  chipOn: { borderColor: text.secondary, backgroundColor: bg.raised },
  chipText: { color: text.muted, fontSize: 11, fontWeight: "600" },
  chipTextOn: { color: text.primary },

  list: { paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.md },
  centre: { padding: space.xxl, alignItems: "center", gap: space.sm },
  emptyTitle: { color: text.secondary, fontSize: 15, fontWeight: "600" },
  emptyBody: {
    color: text.faint,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },

  row: {
    flexDirection: "row",
    backgroundColor: bg.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: bg.border,
    overflow: "hidden",
  },
  rowPressed: { opacity: 0.75 },
  rowAccent: { width: 3 },
  rowBody: { flex: 1, padding: space.lg },

  rowTop: { flexDirection: "row", alignItems: "center", gap: space.md },
  amount: { ...mono, color: text.primary, fontSize: 16, fontWeight: "700", flex: 1 },
  time: { color: text.faint, fontSize: 11 },

  accounts: { ...mono, color: text.secondary, fontSize: 12, marginTop: space.md },
  typology: { color: text.muted, fontSize: 12, marginTop: 3 },

  rowScore: { marginTop: space.md },
  rowFoot: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginTop: space.sm,
  },
  confidence: { ...mono, color: text.secondary, fontSize: 12, fontWeight: "600" },
  segments: { flexDirection: "row", gap: 3, marginLeft: "auto" },
  segment: {
    width: 14,
    height: 3,
    borderRadius: 2,
    backgroundColor: bg.borderStrong,
  },
  used: { color: text.muted, fontSize: 11 },
  usedWarn: { color: text.secondary },
});
