import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { bucketByHour, loadOverview, type Overview } from "../api/overview";
import { SeverityBar, VolumeChart } from "../components/Chart";
import { bg, mono, radius, risk, space, text } from "../theme/tokens";
import { statusBarInset } from "../theme/layout";

/**
 * The state of the whole system on one screen.
 *
 * Deliberately read-only. Everything actionable already lives on Alerts and
 * Screen; this answers "is it working and what has it been doing", which is
 * the question someone opens the app to answer when they are not responding to
 * a specific alert.
 */

/** Matches the alerts list, so the two tabs do not disagree about how fresh
 *  they are. */
const POLL_MS = 15_000;

export default function OverviewScreen() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await loadOverview(200));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

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

  if (loading) {
    return (
      <SafeAreaView style={styles.centre}>
        <StatusBar barStyle="light-content" backgroundColor={bg.canvas} />
        <ActivityIndicator size="small" color={text.muted} />
      </SafeAreaView>
    );
  }

  const stats = data?.stats;
  const caps = data?.capabilities;
  const buckets = bucketByHour(data?.recent ?? [], 12);
  const detectors = [
    { key: "network", label: "Network", live: caps?.network?.live },
    { key: "behavioural", label: "Behaviour", live: caps?.behavioural?.live },
    { key: "temporal", label: "Timing", live: caps?.temporal?.live },
    { key: "fusion", label: "Fusion", live: caps?.fusion?.live },
  ];
  const up = detectors.filter((d) => d.live).length;
  const known = detectors.filter((d) => d.live !== undefined).length;

  return (
    <SafeAreaView style={styles.shell}>
      <StatusBar barStyle="light-content" backgroundColor={bg.canvas} />
      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={text.muted} />
        }
      >
        <View style={styles.header}>
          <Text style={styles.title}>Overview</Text>
          <Text style={styles.subtitle}>
            {known === 0
              ? "Detector status unavailable"
              : up === known
                ? "All models answering"
                : `${up} of ${known} models answering`}
          </Text>
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        {/* Named, not silently zeroed. "Nothing screened" and "we could not
            ask" look identical as a 0 and mean opposite things. */}
        {data?.failed?.length ? (
          <Text style={styles.warn}>
            Could not load: {data.failed.join(", ")}. The rest is current.
          </Text>
        ) : null}

        <View style={styles.kpis}>
          <Kpi label="Screened" value={stats ? stats.total.toLocaleString() : "—"} />
          <Kpi
            label="Alerts sent"
            value={stats ? stats.alerts_sent.toLocaleString() : "—"}
            tint={stats?.alerts_sent ? risk.CRITICAL : undefined}
          />
          <Kpi
            label="Mean score"
            value={
              stats?.mean_confidence != null ? stats.mean_confidence.toFixed(3) : "—"
            }
          />
        </View>

        <Panel title="Volume" note="last 12 hours">
          <VolumeChart buckets={buckets} />
          <Text style={styles.foot}>
            Built from the {(data?.recent ?? []).length} most recent analyses, so
            it covers whatever period those span.
          </Text>
        </Panel>

        <Panel title="What was found" note="all time">
          <SeverityBar counts={stats?.by_classification ?? {}} />
        </Panel>

        <Panel title="Detectors">
          <View style={{ gap: space.md }}>
            {detectors.map((d) => (
              <View key={d.key} style={styles.detector}>
                <View
                  style={[
                    styles.pip,
                    {
                      backgroundColor:
                        d.live === undefined
                          ? text.faint
                          : d.live
                            ? risk.LOW
                            : risk.CRITICAL,
                    },
                  ]}
                />
                <Text style={styles.detectorName}>{d.label}</Text>
                <Text style={styles.detectorState}>
                  {d.live === undefined ? "unknown" : d.live ? "answering" : "down"}
                </Text>
              </View>
            ))}
          </View>

          {caps?.network?.accounts ? (
            <Text style={styles.foot}>
              Payment graph: {caps.network.accounts.toLocaleString()} accounts,{" "}
              {caps.network.transfers?.toLocaleString() ?? "—"} transfers,{" "}
              {caps.network.hops ?? 2} hops per transaction.
            </Text>
          ) : null}
        </Panel>
      </ScrollView>
    </SafeAreaView>
  );
}

function Kpi({ label, value, tint }: { label: string; value: string; tint?: string }) {
  return (
    <View style={styles.kpi}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiValue, tint ? { color: tint } : null]}>{value}</Text>
    </View>
  );
}

function Panel({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.panel}>
      <View style={styles.panelHead}>
        <Text style={styles.panelTitle}>{title}</Text>
        {note && <Text style={styles.panelNote}>{note}</Text>}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: bg.canvas, paddingTop: statusBarInset },
  centre: {
    flex: 1,
    backgroundColor: bg.canvas,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: statusBarInset,
  },
  body: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl },

  header: { gap: space.xs },
  title: { color: text.primary, fontSize: 26, fontWeight: "700", letterSpacing: -0.5 },
  subtitle: { color: text.secondary, fontSize: 15 },

  error: { color: risk.CRITICAL, fontSize: 15 },
  warn: { color: risk.MEDIUM, fontSize: 14 },

  kpis: { flexDirection: "row", gap: space.md },
  kpi: {
    flex: 1,
    backgroundColor: bg.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: bg.border,
    padding: space.md,
    gap: space.xs,
  },
  kpiLabel: { color: text.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6 },
  kpiValue: {
    ...mono,
    color: text.primary,
    fontSize: 20,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },

  panel: {
    backgroundColor: bg.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: bg.border,
    padding: space.lg,
    gap: space.md,
  },
  panelHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  panelTitle: { color: text.primary, fontSize: 17, fontWeight: "700" },
  panelNote: { color: text.faint, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6 },

  detector: { flexDirection: "row", alignItems: "center", gap: space.md },
  pip: { width: 8, height: 8, borderRadius: 4 },
  detectorName: { color: text.primary, fontSize: 15, flex: 1 },
  detectorState: { color: text.muted, fontSize: 14 },

  foot: { color: text.faint, fontSize: 13, lineHeight: 19 },
});
