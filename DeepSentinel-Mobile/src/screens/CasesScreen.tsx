import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";

import { REVIEW_LABEL, listCases, type Case, type ReviewStatus } from "../api/cases";
import { Empty, Screen, Segmented, tap } from "../components/ios";
import { account, ago } from "../lib/format";
import { accent, bg, font, modality, mono, radius, riskColour, space, text, themed } from "../theme/tokens";

/**
 * The review queue: what the live monitor recorded, by where each case is in
 * review. Open is the default because it is the work still to do. Within a
 * queue, severity narrows it and the order is newest or most serious first.
 */

const FILTERS: { value: ReviewStatus | "all"; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "investigating", label: "Investigating" },
  { value: "confirmed_fraud", label: "Fraud" },
  { value: "false_positive", label: "False positive" },
  { value: "closed", label: "Closed" },
  { value: "all", label: "All" },
];

const LEVELS = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
type Level = (typeof LEVELS)[number] | "ALL";
const LEVEL_LABEL: Record<Level, string> = { ALL: "All", CRITICAL: "Critical", HIGH: "High", MEDIUM: "Medium", LOW: "Low" };
const RANK: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };

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

function sentence(name: string | null | undefined): string | null {
  if (!name || name === "UNKNOWN") return null;
  const s = name.replace(/_/g, " ").toLowerCase().trim();
  return s ? s[0].toUpperCase() + s.slice(1) : null;
}

export default function CasesScreen({ onOpen }: { onOpen: (c: Case) => void }) {
  const [filter, setFilter] = useState<ReviewStatus | "all">("open");
  const [level, setLevel] = useState<Level>("ALL");
  const [byRisk, setByRisk] = useState(false);
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

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: rows.length };
    for (const r of rows) {
      const k = String(r.classification).toUpperCase();
      c[k] = (c[k] ?? 0) + 1;
    }
    return c;
  }, [rows]);

  const shown = useMemo(() => {
    const list = level === "ALL" ? rows : rows.filter((r) => String(r.classification).toUpperCase() === level);
    if (!byRisk) return list;
    return [...list].sort(
      (a, b) =>
        (RANK[String(b.classification).toUpperCase()] ?? 0) - (RANK[String(a.classification).toUpperCase()] ?? 0) ||
        (b.fused_score ?? 0) - (a.fused_score ?? 0),
    );
  }, [rows, level, byRisk]);

  const oldest = rows.reduce<string | null>(
    (min, r) => (r.detected_at && (!min || r.detected_at < min) ? r.detected_at : min),
    null,
  );

  const head = (
    <View style={styles.head}>
      <View style={styles.summary}>
        <View style={styles.summaryTile}>
          <Text style={styles.summaryLabel}>IN THIS QUEUE</Text>
          <Text style={styles.summaryValue}>{loading ? "—" : rows.length}</Text>
          <Text style={[styles.summaryNote, counts.CRITICAL ? { color: riskColour("CRITICAL") } : null]}>
            {counts.CRITICAL ? `${counts.CRITICAL} critical` : "None critical"}
          </Text>
        </View>
        <View style={styles.summaryTile}>
          <Text style={styles.summaryLabel}>OLDEST</Text>
          <Text style={styles.summaryValue} numberOfLines={1} adjustsFontSizeToFit>
            {oldest ? ago(oldest).replace(" ago", "") : "—"}
          </Text>
          <Text style={styles.summaryNote}>{oldest ? "since detection" : "Nothing waiting"}</Text>
        </View>
      </View>

      <View style={styles.bleed}>
        <Segmented options={FILTERS} value={filter} onChange={setFilter} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bleed} contentContainerStyle={styles.chips}>
        {(["ALL", ...LEVELS] as Level[]).map((l) => {
          const on = l === level;
          const colour = l === "ALL" ? accent.base : riskColour(l);
          return (
            <Pressable
              key={l}
              onPress={() => {
                tap();
                setLevel(l);
              }}
              style={[styles.chip, on && styles.chipOn]}
              accessibilityState={{ selected: on }}
            >
              {l !== "ALL" && <View style={[styles.chipDot, { backgroundColor: colour }]} />}
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{LEVEL_LABEL[l]}</Text>
              <Text style={[styles.chipCount, on && styles.chipTextOn]}>{counts[l] ?? 0}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.listHead}>
        <Text style={styles.listTitle}>{FILTERS.find((f) => f.value === filter)?.label} cases</Text>
        <Pressable
          onPress={() => {
            tap();
            setByRisk((v) => !v);
          }}
          hitSlop={10}
          style={styles.sort}
          accessibilityRole="button"
          accessibilityLabel={`Sorted by ${byRisk ? "highest risk" : "newest"}. Tap to change.`}
        >
          <Text style={styles.sortText}>{byRisk ? "Highest risk" : "Newest"}</Text>
          <Ionicons name="swap-vertical" size={14} color={accent.base} />
        </Pressable>
      </View>
    </View>
  );

  return (
    <Screen title="Cases" scroll={false}>
      {loading ? (
        <>
          {head}
          <ActivityIndicator color={text.muted} style={{ marginTop: 48 }} />
        </>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(c) => c.case_ref}
          ListHeaderComponent={head}
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
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          ListEmptyComponent={
            error ? (
              <Empty icon="cloud-offline-outline" title="Cannot load cases" body={error} />
            ) : (
              <Empty
                icon="folder-open-outline"
                title="Nothing in this queue"
                body={
                  level === "ALL"
                    ? "The live monitor records a case for every transaction it screens."
                    : `No ${LEVEL_LABEL[level].toLowerCase()} cases here.`
                }
              />
            )
          }
          renderItem={({ item }) => <CaseCard c={item} onPress={() => onOpen(item)} />}
        />
      )}
    </Screen>
  );
}

function CaseCard({ c, onPress }: { c: Case; onPress: () => void }) {
  const colour = riskColour(c.classification);
  const status = (c.review_status ?? "open") as ReviewStatus;
  const decided = status === "confirmed_fraud" || status === "false_positive" || status === "closed";
  const what = sentence(c.typology_name) ?? sentence(c.graph_pattern) ?? "No typology matched";
  const pattern = c.typology_name ? sentence(c.graph_pattern) : null;
  const detectors: [string, boolean | null, number | null, string][] = [
    ["Network", c.graph_available, c.graph_score, modality.graph],
    ["Behaviour", c.behavioral_available, c.behavioral_score, modality.behavioral],
    ["Timing", c.temporal_available, c.temporal_score, modality.temporal],
  ];

  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [styles.card, { borderLeftColor: decided ? reviewColour(status) : colour }, pressed && { backgroundColor: bg.elevated }]}
      accessibilityRole="button"
      accessibilityLabel={`${c.case_ref}, ${c.classification}, ${what}`}
    >
      <View style={styles.cardTop}>
        <View style={[styles.sev, { backgroundColor: `${colour}24` }]}>
          <View style={[styles.sevDot, { backgroundColor: colour }]} />
          <Text style={[styles.sevText, { color: colour }]}>
            {typeof c.fused_score === "number" ? `${Math.round(c.fused_score * 100)}% ` : ""}
            {LEVEL_LABEL[String(c.classification).toUpperCase() as Level] ?? c.classification}
          </Text>
        </View>
        <Text style={styles.ref} numberOfLines={1}>
          {c.case_ref}
        </Text>
        <View style={styles.go}>
          <Ionicons name="arrow-forward" size={16} color={text.secondary} />
        </View>
      </View>

      <View style={styles.cardMid}>
        <Text style={styles.kicker}>{c.typology_name ? "MATCHED TYPOLOGY" : "PATTERN"}</Text>
        <Text style={styles.time}>{ago(c.detected_at)}</Text>
      </View>
      <Text style={styles.what} numberOfLines={2}>
        {what}
      </Text>

      {c.sink_account || pattern ? (
        <View style={styles.route}>
          <Ionicons name="git-merge-outline" size={16} color={text.muted} />
          <Text style={styles.routeText} numberOfLines={1}>
            {c.sink_account ? `Money ends at ${account(c.sink_account)}` : "No sink account named"}
          </Text>
          {pattern ? (
            <View style={styles.role}>
              <Text style={styles.roleText} numberOfLines={1}>
                {pattern}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.cardFoot}>
        <View style={styles.tags}>
          {detectors.map(([name, answered, value, tone]) => (
            <View key={name} style={[styles.tag, !answered && { opacity: 0.45 }]}>
              <View style={[styles.tagDot, answered ? { backgroundColor: tone } : styles.tagHollow]} />
              <Text style={styles.tagText}>
                {name}
                {answered && typeof value === "number" ? ` ${value.toFixed(2)}` : answered ? "" : " off"}
              </Text>
            </View>
          ))}
        </View>
      </View>
      <Text style={[styles.status, { color: reviewColour(status) }]}>
        {REVIEW_LABEL[status] ?? status}
        {c.reviewed_by ? ` · ${c.reviewed_by}` : ""}
      </Text>
    </Pressable>
  );
}

const styles = themed(() => ({
  head: { gap: 14, paddingBottom: 12 },
  list: { paddingHorizontal: space.lg, paddingBottom: 40 },

  summary: { flexDirection: "row", gap: 12 },
  summaryTile: {
    flex: 1,
    backgroundColor: bg.card,
    borderWidth: 1,
    borderColor: bg.border,
    borderRadius: radius.lg,
    padding: 16,
    gap: 4,
  },
  summaryLabel: { color: text.muted, fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  summaryValue: { color: text.primary, fontFamily: font.extrabold, fontSize: 28, letterSpacing: -1 },
  summaryNote: { color: text.muted, fontSize: 13, fontWeight: "600" },

  bleed: { marginHorizontal: -space.lg },
  chips: { gap: 8, paddingHorizontal: space.lg },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: bg.card,
    borderWidth: 1,
    borderColor: bg.border,
  },
  chipOn: { backgroundColor: accent.deep, borderColor: accent.deep },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { color: text.secondary, fontSize: 13, fontWeight: "600" },
  chipCount: { color: text.muted, fontSize: 12, fontWeight: "700" },
  chipTextOn: { color: text.onAccent },

  listHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4, marginTop: 4 },
  listTitle: { color: text.primary, fontSize: 20, fontWeight: "700", letterSpacing: -0.5 },
  sort: { flexDirection: "row", alignItems: "center", gap: 6 },
  sortText: { color: accent.base, fontSize: 14, fontWeight: "600" },

  card: {
    backgroundColor: bg.card,
    borderWidth: 1,
    borderColor: bg.border,
    borderLeftWidth: 4,
    borderRadius: radius.lg,
    padding: 18,
    gap: 8,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  sev: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  sevDot: { width: 7, height: 7, borderRadius: 4 },
  sevText: { fontSize: 12, fontWeight: "700" },
  ref: { ...mono, color: text.muted, fontSize: 12, flex: 1 },
  go: { width: 32, height: 32, borderRadius: 16, backgroundColor: bg.elevated, alignItems: "center", justifyContent: "center" },

  cardMid: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 },
  kicker: { color: text.muted, fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  time: { ...mono, color: text.muted, fontSize: 12 },
  what: { color: text.primary, fontFamily: font.extrabold, fontSize: 22, lineHeight: 28, letterSpacing: -0.6 },

  route: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: bg.elevated,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  routeText: { ...mono, color: text.secondary, fontSize: 12, flex: 1 },
  role: { backgroundColor: accent.soft, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3, maxWidth: "45%" },
  roleText: { color: accent.base, fontSize: 11, fontWeight: "700" },

  cardFoot: { flexDirection: "row", alignItems: "center", marginTop: 2 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6, flex: 1 },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: bg.border,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  tagDot: { width: 7, height: 7, borderRadius: 4 },
  tagHollow: { borderWidth: 1.5, borderColor: text.faint },
  tagText: { color: text.secondary, fontSize: 11, fontWeight: "600" },
  status: { fontSize: 13, fontWeight: "700" },
}));
