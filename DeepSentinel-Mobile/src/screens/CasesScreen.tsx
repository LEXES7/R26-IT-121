import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { REVIEW_LABEL, listCases, type Case, type ReviewStatus } from "../api/cases";
import { RiskBadge, ScoreBar } from "../components/ui";
import { account, ago, score } from "../lib/format";
import { statusBarInset } from "../theme/layout";
import { bg, mono, radius, riskColour, space, text } from "../theme/tokens";

/**
 * The review queue: what the live monitor recorded, filtered by where each
 * case is in review. Open is the default because it is the work still to do.
 */

const FILTERS: (ReviewStatus | "all")[] = [
  "open",
  "investigating",
  "confirmed_fraud",
  "false_positive",
  "closed",
  "all",
];

const POLL_MS = 20_000;

/** A verdict reads as a state, so it carries its own colour beside the severity. */
export function reviewColour(status: string | null | undefined): string {
  switch (status) {
    case "confirmed_fraud":
      return riskColour("CRITICAL");
    case "false_positive":
      return riskColour("LOW");
    case "investigating":
      return riskColour("MEDIUM");
    case "closed":
      return text.muted;
    default:
      return text.secondary;
  }
}

export default function CasesScreen({ onOpen }: { onOpen: (c: Case) => void }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("open");
  const [rows, setRows] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(
        await listCases({ limit: 100, reviewStatus: filter === "all" ? undefined : filter }),
      );
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
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
        <Text style={styles.title}>Cases</Text>
        <Text style={styles.subtitle}>
          {rows.length} {filter === "all" ? "recorded" : REVIEW_LABEL[filter].toLowerCase()}
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
        style={styles.filterBar}
      >
        {FILTERS.map((f) => (
          <Pressable
            key={f}
            onPress={() => setFilter(f)}
            style={[styles.chip, filter === f && styles.chipOn]}
          >
            <Text style={[styles.chipText, filter === f && styles.chipTextOn]}>
              {f === "all" ? "All" : REVIEW_LABEL[f]}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {loading ? (
        <View style={styles.centre}>
          <ActivityIndicator color={text.muted} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(c) => c.case_ref}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={text.muted} />
          }
          ListEmptyComponent={
            <View style={styles.centre}>
              <Text style={styles.emptyTitle}>
                {error ? "Cannot load cases" : "Nothing in this queue"}
              </Text>
              <Text style={styles.emptyBody}>
                {error ??
                  "Cases are recorded by the live monitor as it screens transactions. Start the monitor from the web console to fill this queue."}
              </Text>
            </View>
          }
          renderItem={({ item }) => <Row c={item} onPress={() => onOpen(item)} />}
        />
      )}
    </SafeAreaView>
  );
}

function Row({ c, onPress }: { c: Case; onPress: () => void }) {
  const colour = riskColour(c.classification);
  const status = (c.review_status ?? "open") as ReviewStatus;
  const pattern =
    c.graph_pattern && c.graph_pattern !== "UNKNOWN" ? c.graph_pattern.replace(/_/g, " ") : null;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}>
      <View style={[styles.rowAccent, { backgroundColor: colour }]} />
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <RiskBadge level={c.classification} />
          <Text style={styles.ref}>{c.case_ref}</Text>
          <Text style={styles.time}>{ago(c.detected_at)}</Text>
        </View>
        <Text style={styles.line} numberOfLines={1}>
          {c.transaction_id}
          {c.sink_account ? `  →  ${account(c.sink_account)}` : ""}
        </Text>
        {(pattern || c.typology_name) && (
          <Text style={styles.sub} numberOfLines={1}>
            {[pattern, c.typology_name].filter(Boolean).join(" · ")}
          </Text>
        )}
        <View style={styles.bar}>
          <ScoreBar value={c.fused_score} colour={colour} height={5} />
        </View>
        <View style={styles.foot}>
          <Text style={styles.score}>{score(c.fused_score)}</Text>
          <Text style={[styles.status, { color: reviewColour(status) }]}>
            {REVIEW_LABEL[status] ?? status}
            {c.reviewed_by ? ` · ${c.reviewed_by}` : ""}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: bg.canvas, paddingTop: statusBarInset },
  header: { paddingHorizontal: space.lg, paddingTop: space.md },
  title: { color: text.primary, fontSize: 28, fontWeight: "700", letterSpacing: -0.5 },
  subtitle: { color: text.muted, fontSize: 14, marginTop: 2 },

  filterBar: { flexGrow: 0 },
  filters: { gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.md },
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
  ref: { ...mono, color: text.primary, fontSize: 13, fontWeight: "600", flex: 1 },
  time: { color: text.faint, fontSize: 11 },
  line: { ...mono, color: text.secondary, fontSize: 12, marginTop: space.md },
  sub: { color: text.muted, fontSize: 12, marginTop: 3 },
  bar: { marginTop: space.md },
  foot: { flexDirection: "row", alignItems: "center", marginTop: space.sm },
  score: { ...mono, color: text.secondary, fontSize: 12, fontWeight: "600", flex: 1 },
  status: { fontSize: 12, fontWeight: "600" },
});
