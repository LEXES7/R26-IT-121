import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";

import { REVIEW_LABEL, listCases, type Case, type ReviewStatus } from "../api/cases";
import { Empty, Screen, Segmented, tap } from "../components/ios";
import { account, ago, score } from "../lib/format";
import { bg, mono, radius, riskColour, space, text } from "../theme/tokens";

/**
 * The review queue: what the live monitor recorded, by where each case is in
 * review. Open is the default because it is the work still to do.
 */

const FILTERS: { value: ReviewStatus | "all"; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "investigating", label: "Investigating" },
  { value: "confirmed_fraud", label: "Fraud" },
  { value: "false_positive", label: "False positive" },
  { value: "closed", label: "Closed" },
  { value: "all", label: "All" },
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
  const [filter, setFilter] = useState<ReviewStatus | "all">("open");
  const [rows, setRows] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await listCases({ limit: 100, reviewStatus: filter === "all" ? undefined : filter }));
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

  return (
    <Screen title="Cases" scroll={false}>
      <View style={styles.filters}>
        <Segmented options={FILTERS} value={filter} onChange={setFilter} />
      </View>
      {loading ? (
        <ActivityIndicator color={text.muted} style={{ marginTop: 48 }} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(c) => c.case_ref}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor={text.muted}
              onRefresh={async () => {
                setRefreshing(true);
                await load();
                setRefreshing(false);
              }}
            />
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            error ? (
              <Empty icon="cloud-offline-outline" title="Cannot load cases" body={error} />
            ) : (
              <Empty
                icon="folder-open-outline"
                title="Nothing in this queue"
                body="The live monitor records a case for every transaction it screens."
              />
            )
          }
          renderItem={({ item, index }) => (
            <CaseRow
              c={item}
              first={index === 0}
              last={index === rows.length - 1}
              onPress={() => onOpen(item)}
            />
          )}
        />
      )}
    </Screen>
  );
}

function CaseRow({
  c,
  first,
  last,
  onPress,
}: {
  c: Case;
  first: boolean;
  last: boolean;
  onPress: () => void;
}) {
  const colour = riskColour(c.classification);
  const status = (c.review_status ?? "open") as ReviewStatus;
  const pattern =
    c.graph_pattern && c.graph_pattern !== "UNKNOWN"
      ? c.graph_pattern.replace(/_/g, " ").toLowerCase()
      : null;
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [
        styles.row,
        first && styles.firstRow,
        last && styles.lastRow,
        pressed && { backgroundColor: bg.elevated },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: colour }]} />
      <View style={styles.body}>
        <View style={styles.line}>
          <Text style={styles.ref}>{c.case_ref}</Text>
          <Text style={styles.time}>{ago(c.detected_at)}</Text>
        </View>
        <View style={styles.line}>
          <Text style={styles.sub} numberOfLines={1}>
            {pattern ?? (c.sink_account ? `to ${account(c.sink_account)}` : c.transaction_id)}
          </Text>
          <Text style={[styles.score, { color: colour }]}>{score(c.fused_score, 2)}</Text>
        </View>
        <Text style={[styles.status, { color: reviewColour(status) }]}>
          {REVIEW_LABEL[status] ?? status}
          {c.reviewed_by ? ` · ${c.reviewed_by}` : ""}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={text.faint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  filters: { paddingBottom: space.md },
  list: { paddingHorizontal: space.lg, paddingBottom: 40 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: bg.border, marginLeft: 38 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    backgroundColor: bg.card,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  firstRow: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  lastRow: { borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
  dot: { width: 10, height: 10, borderRadius: 5 },
  body: { flex: 1, gap: 3 },
  line: { flexDirection: "row", alignItems: "baseline", gap: space.sm },
  ref: { ...mono, color: text.primary, fontSize: 15, fontWeight: "600", flex: 1 },
  time: { color: text.muted, fontSize: 13 },
  sub: { color: text.muted, fontSize: 14, flex: 1 },
  score: { ...mono, fontSize: 14, fontWeight: "700" },
  status: { fontSize: 13, fontWeight: "600" },
});
