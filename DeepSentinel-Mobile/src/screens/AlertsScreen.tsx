import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";

import { listAnalyses, type Analysis } from "../api/analyses";
import { Empty, NavButton, Screen, Segmented, tap } from "../components/ios";
import { account, ago, money, score } from "../lib/format";
import { bg, mono, radius, riskColour, space, text } from "../theme/tokens";

/**
 * Every screened transaction, newest first.
 *
 * One line of what matters per row: how serious, how much, between whom.
 * The detector breakdown is a tap away on the transaction itself.
 */

const FILTERS = [
  { value: "ALL", label: "All" },
  { value: "CRITICAL", label: "Critical" },
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
] as const;

type Filter = (typeof FILTERS)[number]["value"];

/** Short enough to feel live, long enough not to drain a phone in a pocket. */
const POLL_MS = 15_000;

export default function AlertsScreen({
  onOpen,
  onScreen,
}: {
  onOpen: (row: Analysis) => void;
  /** Opens the screen for running a new transaction. */
  onScreen: () => void;
}) {
  const [rows, setRows] = useState<Analysis[]>([]);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await listAnalyses({ limit: 50, classification: filter === "ALL" ? undefined : filter }));
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
    <Screen
      title="Alerts"
      scroll={false}
      right={<NavButton icon="add-circle-outline" onPress={onScreen} />}
    >
      <View style={styles.filters}>
        <Segmented options={[...FILTERS]} value={filter} onChange={setFilter} />
      </View>
      {loading ? (
        <ActivityIndicator color={text.muted} style={{ marginTop: 48 }} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r, i) => `${r.id ?? r.transaction_id}-${i}`}
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
              <Empty icon="cloud-offline-outline" title="Cannot reach the backend" body={error} />
            ) : (
              <Empty
                icon="checkmark-circle-outline"
                title="Nothing here"
                body="Screened transactions appear here, from this app, the web console or ingested traffic."
              />
            )
          }
          renderItem={({ item, index }) => (
            <AlertRow
              row={item}
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

function AlertRow({
  row,
  first,
  last,
  onPress,
}: {
  row: Analysis;
  first: boolean;
  last: boolean;
  onPress: () => void;
}) {
  const colour = riskColour(row.classification);
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
          <Text style={styles.amount}>{money(row.amount)}</Text>
          <Text style={styles.time}>{ago(row.created_at)}</Text>
        </View>
        <View style={styles.line}>
          <Text style={styles.parties} numberOfLines={1}>
            {account(row.nameOrig)} → {account(row.nameDest)}
            {row.type ? ` · ${row.type.replace("_", " ").toLowerCase()}` : ""}
          </Text>
          <Text style={[styles.score, { color: colour }]}>{score(row.fraud_confidence_score, 2)}</Text>
        </View>
        {row.mock_scenario ? <Text style={styles.sim}>Simulated</Text> : null}
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
  amount: { ...mono, color: text.primary, fontSize: 17, fontWeight: "600", flex: 1 },
  time: { color: text.muted, fontSize: 13 },
  parties: { color: text.muted, fontSize: 14, flex: 1 },
  score: { ...mono, fontSize: 14, fontWeight: "700" },
  sim: { color: text.faint, fontSize: 12 },
});
