import { useCallback, useEffect, useState } from "react";
import { RefreshControl, StyleSheet, Text, View } from "react-native";

import { listCases } from "../api/cases";
import type { LiveAlert, MonitorState } from "../api/monitor";
import { loadOverview, type Overview } from "../api/overview";
import type { User } from "../api/auth";
import { Group, Pill, Row, Screen } from "../components/ios";
import { account, money, score } from "../lib/format";
import { bg, mono, radius, risk, riskColour, space, text, tile } from "../theme/tokens";

/**
 * The first thing someone sees: is the system working, and is there anything
 * for me to do. Everything else is one tap from here.
 */

const POLL_MS = 30_000;

function greeting(name: string): string {
  const h = new Date().getHours();
  const part = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  const first = name.split(/\s+/)[0];
  return first ? `${part}, ${first}` : part;
}

function since(at: number): string {
  const s = Math.max(0, Date.now() / 1000 - at);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}

export default function HomeScreen({
  user,
  monitor,
  onOpenAlert,
  onOpenLive,
  onScreen,
  onOverview,
  onCases,
  onAlerts,
}: {
  user: User;
  monitor: MonitorState | null;
  onOpenAlert: (a: LiveAlert) => void;
  onOpenLive: () => void;
  onScreen: () => void;
  onOverview: () => void;
  onCases: () => void;
  onAlerts: () => void;
}) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [openCases, setOpenCases] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [o, c] = await Promise.allSettled([
      loadOverview(200),
      listCases({ limit: 200, reviewStatus: "open" }),
    ]);
    if (o.status === "fulfilled") setOverview(o.value);
    if (c.status === "fulfilled") setOpenCases(c.value.length);
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  const caps = overview?.capabilities;
  const detectors = [caps?.network?.live, caps?.behavioural?.live, caps?.temporal?.live];
  const known = detectors.filter((d) => d !== undefined).length;
  const up = detectors.filter(Boolean).length;
  const running = monitor?.running ?? false;
  const recent = (monitor?.alerts ?? []).slice(0, 3);

  return (
    <Screen
      title="Home"
      subtitle={greeting(user.full_name || user.username)}
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
    >
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <Pill
            label={monitor ? (running ? "Monitoring" : "Monitor stopped") : "Connecting"}
            color={running ? risk.LOW : text.muted}
          />
          <Text style={styles.heroNote}>
            {known === 0
              ? "Detector status unknown"
              : up === known
                ? "All detectors answering"
                : `${up} of ${known} detectors answering`}
          </Text>
        </View>
        <View style={styles.stats}>
          <Stat value={monitor ? monitor.counters.screened.toLocaleString() : "—"} label="Screened" />
          <Stat
            value={monitor ? monitor.counters.alerts.toLocaleString() : "—"}
            label="Alerts"
            color={monitor?.counters.alerts ? risk.HIGH : undefined}
          />
          <Stat value={openCases === null ? "—" : String(openCases)} label="Open cases" />
        </View>
      </View>

      <Group
        header="Needs attention"
        footer={recent.length ? undefined : running ? "Nothing at medium or above yet." : "Alerts appear here while the monitor runs."}
      >
        {recent.map((a) => (
          <Row
            key={`${a.transaction_id}@${a.at}`}
            leading={<View style={[styles.dot, { backgroundColor: riskColour(a.severity) }]} />}
            title={`${money(a.amount)}`}
            subtitle={`${account(a.from)} → ${account(a.to)}`}
            trailing={
              <View style={styles.alertRight}>
                <Text style={[styles.alertScore, { color: riskColour(a.severity) }]}>
                  {score(a.fused_score, 2)}
                </Text>
                <Text style={styles.alertTime}>{since(a.at)}</Text>
              </View>
            }
            onPress={() => onOpenAlert(a)}
          />
        ))}
        <Row icon="pulse" iconColor={tile.red} title="Live feed" onPress={onOpenLive} />
      </Group>

      <Group header="Work">
        <Row
          icon="folder-open"
          iconColor={tile.orange}
          title="Open cases"
          value={openCases === null ? undefined : String(openCases)}
          onPress={onCases}
        />
        <Row icon="notifications" iconColor={tile.blue} title="Screened transactions" onPress={onAlerts} />
        <Row icon="scan" iconColor={tile.teal} title="Screen a transaction" onPress={onScreen} />
      </Group>

      <Group header="System">
        <Row
          icon="stats-chart"
          iconColor={tile.indigo}
          title="Overview"
          subtitle={
            overview?.stats
              ? `${overview.stats.total.toLocaleString()} screened in total`
              : undefined
          }
          onPress={onOverview}
        />
      </Group>
    </Screen>
  );
}

function Stat({ value, label, color }: { value: string; label: string; color?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, color ? { color } : null]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: bg.card, borderRadius: radius.lg, padding: space.lg, gap: space.lg },
  heroTop: { gap: space.sm },
  heroNote: { color: text.muted, fontSize: 13 },
  stats: { flexDirection: "row" },
  stat: { flex: 1 },
  statValue: { ...mono, color: text.primary, fontSize: 26, fontWeight: "700" },
  statLabel: { color: text.muted, fontSize: 13, marginTop: 2 },

  dot: { width: 10, height: 10, borderRadius: 5 },
  alertRight: { alignItems: "flex-end" },
  alertScore: { ...mono, fontSize: 15, fontWeight: "700" },
  alertTime: { color: text.faint, fontSize: 12, marginTop: 2 },
});
