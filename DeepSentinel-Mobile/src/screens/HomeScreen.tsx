import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, Text, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import type { User } from "../api/auth";
import { listCases, type Case } from "../api/cases";
import type { LiveAlert, MonitorState } from "../api/monitor";
import { loadOverview, type Overview } from "../api/overview";
import { Group, Row, Screen, tap, type IconName } from "../components/ios";
import { account, money } from "../lib/format";
import { accent, bg, font, hero, mono, radius, risk, riskColour, space, text, themed, tile } from "../theme/tokens";

/**
 * The first thing someone sees: is the system working, and is there anything
 * for me to do. The most serious thing waiting is the card at the top, the
 * day's numbers sit under it, and the live stream under those. Everything
 * else is one tap from here.
 */

const POLL_MS = 30_000;

const RANK: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
const rank = (level?: string | null) => RANK[String(level ?? "").toUpperCase()] ?? 0;

function greeting(name: string): { part: string; first: string } {
  const h = new Date().getHours();
  const part = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return { part, first: name.split(/\s+/)[0] ?? "" };
}

function since(at: number): string {
  const s = Math.max(0, Date.now() / 1000 - at);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

/** 9060955.18 as 9.06M. No currency: PaySim carries none. */
function compactAmount(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e4) return `${(v / 1e3).toFixed(1)}K`;
  return money(v);
}

function compactCount(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e4) return `${(n / 1e3).toFixed(1)}k`;
  return n.toLocaleString();
}

function sentence(name: string | null | undefined): string | null {
  if (!name) return null;
  const s = name.replace(/_/g, " ").trim();
  return s ? s[0].toUpperCase() + s.slice(1) : null;
}

/** The single most serious thing waiting: a live alert if there is one, else an open case. */
type Lead =
  | { kind: "alert"; alert: LiveAlert }
  | { kind: "case"; item: Case }
  | null;

function pickLead(alerts: LiveAlert[], cases: Case[]): Lead {
  const alert = [...alerts]
    .filter((a) => rank(a.severity) >= RANK.HIGH)
    .sort((a, b) => rank(b.severity) - rank(a.severity) || b.fused_score - a.fused_score)[0];
  if (alert) return { kind: "alert", alert };
  const item = [...cases]
    .filter((c) => rank(c.classification) >= RANK.HIGH)
    .sort((a, b) => rank(b.classification) - rank(a.classification) || (b.fused_score ?? 0) - (a.fused_score ?? 0))[0];
  return item ? { kind: "case", item } : null;
}

export default function HomeScreen({
  user,
  monitor,
  onOpenAlert,
  onOpenCase,
  onOpenLive,
  onScreen,
  onOverview,
  onCases,
  onAlerts,
}: {
  user: User;
  monitor: MonitorState | null;
  onOpenAlert: (a: LiveAlert) => void;
  onOpenCase: (caseRef: string) => void;
  onOpenLive: () => void;
  onScreen: () => void;
  onOverview: () => void;
  onCases: () => void;
  onAlerts: () => void;
}) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [openCases, setOpenCases] = useState<Case[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [o, c] = await Promise.allSettled([
      loadOverview(200),
      listCases({ limit: 200, reviewStatus: "open" }),
    ]);
    if (o.status === "fulfilled") setOverview(o.value);
    if (c.status === "fulfilled") setOpenCases(c.value);
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
  const alerts = monitor?.alerts ?? [];
  const stream = alerts.slice(0, 3);
  const critical = openCases?.filter((c) => rank(c.classification) === RANK.CRITICAL).length ?? 0;
  const lead = pickLead(alerts, openCases ?? []);
  const { part, first } = greeting(user.full_name || user.username);

  const header = (
    <View style={styles.header}>
      <Text style={styles.eyebrow}>
        {new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
      </Text>
      <View style={styles.headRow}>
        <Text style={styles.greeting}>
          {part},{first ? `\n${first}` : ""}
        </Text>
        <View style={styles.engines}>
          <View
            style={[
              styles.enginesDot,
              { backgroundColor: known === 0 ? text.faint : up === known ? risk.LOW : risk.HIGH },
            ]}
          />
          <Text style={styles.enginesText}>
            {known === 0 ? "Detectors\nunknown" : `${up}/${known} detectors\nanswering`}
          </Text>
        </View>
      </View>
    </View>
  );

  return (
    <Screen
      title="Home"
      header={header}
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
      {lead ? (
        <LeadCard lead={lead} onOpen={() => (lead.kind === "alert" ? onOpenAlert(lead.alert) : onOpenCase(lead.item.case_ref))} />
      ) : (
        <View style={styles.calm}>
          <View style={[styles.calmIcon, { backgroundColor: `${tile.green}24` }]}>
            <Ionicons name="shield-checkmark" size={22} color={risk.LOW} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.calmTitle}>{openCases === null ? "Checking the queue" : "Nothing serious is waiting"}</Text>
            <Text style={styles.calmBody}>
              {running ? "The monitor is screening. High and critical verdicts appear here first." : "The monitor is not running, so nothing new is being screened."}
            </Text>
          </View>
        </View>
      )}

      <View>
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Today</Text>
          <Pressable onPress={onOverview} hitSlop={10} style={styles.sectionLink}>
            <Text style={styles.sectionLinkText}>Overview</Text>
            <Ionicons name="stats-chart" size={14} color={accent.base} />
          </Pressable>
        </View>
        <View style={styles.grid}>
          <Tile
            label="Screened"
            icon="shield-checkmark-outline"
            iconColor={tile.green}
            value={monitor ? compactCount(monitor.counters.screened) : "-"}
            note={monitor ? `${Math.round(monitor.counters.throughput_per_min).toLocaleString()} a minute` : "Monitor offline"}
            noteColor={monitor ? risk.LOW : undefined}
            onPress={onAlerts}
          />
          <Tile
            label="Open cases"
            icon="folder-open-outline"
            iconColor={tile.orange}
            value={openCases === null ? "-" : String(openCases.length)}
            note={openCases === null ? "Not loaded" : critical ? `${critical} critical` : "None critical"}
            noteColor={critical ? risk.CRITICAL : undefined}
            onPress={onCases}
          />
          <Tile
            label="Alerts"
            icon="notifications-outline"
            iconColor={tile.red}
            value={monitor ? compactCount(monitor.counters.alerts) : "-"}
            note={monitor ? `${compactCount(monitor.counters.flagged)} flagged` : "Monitor offline"}
            noteColor={monitor?.counters.alerts ? risk.HIGH : undefined}
            onPress={onOpenLive}
          />
          <Tile
            label="On record"
            icon="server-outline"
            iconColor={tile.blue}
            value={overview?.stats ? compactCount(overview.stats.total) : "-"}
            note={overview?.stats ? `${compactCount(overview.stats.alerts_sent)} alerted` : "Not loaded"}
            onPress={onOverview}
          />
        </View>
      </View>

      <View>
        <View style={styles.sectionHead}>
          <View style={styles.sectionLeft}>
            <Text style={styles.sectionTitle}>Live stream</Text>
            {running && (
              <View style={styles.realtime}>
                <Text style={styles.realtimeText}>Real-time</Text>
              </View>
            )}
          </View>
          <Pressable onPress={onOpenLive} hitSlop={10}>
            <Text style={styles.sectionLinkText}>{alerts.length ? `See all (${alerts.length})` : "Open"}</Text>
          </Pressable>
        </View>
        <View style={styles.stream}>
          {stream.length ? (
            stream.map((a) => <StreamCard key={`${a.transaction_id}@${a.at}`} alert={a} onPress={() => onOpenAlert(a)} />)
          ) : (
            <Text style={styles.streamEmpty}>
              {running ? "Nothing at medium or above yet." : "Alerts appear here while the monitor runs."}
            </Text>
          )}
        </View>
      </View>

      <Group>
        <Row icon="scan" iconColor={tile.teal} title="Screen a transaction" subtitle="Run all three detectors on details you enter" onPress={onScreen} />
      </Group>
    </Screen>
  );
}

function LeadCard({ lead, onOpen }: { lead: NonNullable<Lead>; onOpen: () => void }) {
  const level = lead.kind === "alert" ? lead.alert.severity : lead.item.classification;
  const value = lead.kind === "alert" ? lead.alert.fused_score : lead.item.fused_score ?? 0;
  const from = lead.kind === "alert" ? lead.alert.from : null;
  const to = lead.kind === "alert" ? lead.alert.to : lead.item.sink_account;
  const why =
    lead.kind === "alert"
      ? sentence(lead.alert.pattern) ?? sentence(lead.alert.driver) ?? `${lead.alert.modalities_used} of 3 detectors agree`
      : sentence(lead.item.typology_name) ?? sentence(lead.item.graph_pattern) ?? "Open case awaiting review";

  return (
    <View style={styles.lead}>
      <Svg style={styles.fill} preserveAspectRatio="none" viewBox="0 0 100 100">
        <Defs>
          <LinearGradient id="lead" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={hero.from} />
            <Stop offset="1" stopColor={hero.to} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" fill="url(#lead)" />
      </Svg>

      <View style={styles.leadTop}>
        <View style={{ flex: 1, gap: 10 }}>
          <View style={styles.leadChip}>
            <Ionicons name="warning" size={14} color={hero.ink} />
            <Text style={styles.leadChipText}>
              {String(level).toUpperCase()} {lead.kind === "alert" ? "ALERT" : "CASE"}
            </Text>
          </View>
          {from || to ? (
            <View style={styles.leadAccounts}>
              {from ? <Text style={styles.leadAccount}>{account(from)}</Text> : null}
              {from ? <Ionicons name="arrow-forward" size={14} color={hero.ink} /> : null}
              {to ? <Text style={styles.leadAccount}>{account(to)}</Text> : null}
            </View>
          ) : null}
        </View>
        <Ring value={value} />
      </View>

      <Text style={styles.leadAmount}>
        {lead.kind === "alert" ? compactAmount(lead.alert.amount) : lead.item.case_ref}
      </Text>
      <Text style={styles.leadWhy}>{why}</Text>

      <Pressable
        onPress={() => {
          tap();
          onOpen();
        }}
        style={({ pressed }) => [styles.leadButton, pressed && { opacity: 0.8 }]}
        accessibilityRole="button"
      >
        <Text style={styles.leadButtonText}>Open the case</Text>
        <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

/** The fused probability as a ring, with the number written inside it. */
function Ring({ value }: { value: number }) {
  const size = 76;
  const stroke = 7;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <View style={{ width: size, height: size }} accessibilityLabel={`Fused probability ${Math.round(v * 100)} percent`}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={hero.ink} strokeOpacity={0.14} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={hero.ink}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c * v} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.ringLabel}>
        <Text style={styles.ringValue}>{Math.round(v * 100)}%</Text>
        <Text style={styles.ringCaption}>FUSED</Text>
      </View>
    </View>
  );
}

function Tile({
  label,
  icon,
  iconColor,
  value,
  note,
  noteColor,
  onPress,
}: {
  label: string;
  icon: IconName;
  iconColor: string;
  value: string;
  note: string;
  noteColor?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [styles.tile, pressed && { backgroundColor: bg.elevated }]}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value}, ${note}`}
    >
      <View style={styles.tileHead}>
        <Text style={styles.tileLabel}>{label}</Text>
        <View style={[styles.tileIcon, { backgroundColor: `${iconColor}24` }]}>
          <Ionicons name={icon} size={17} color={iconColor} />
        </View>
      </View>
      <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <View style={styles.tileNoteRow}>
        {noteColor ? <View style={[styles.tileDot, { backgroundColor: noteColor }]} /> : null}
        <Text style={[styles.tileNote, noteColor ? { color: noteColor } : null]} numberOfLines={1}>
          {note}
        </Text>
      </View>
    </Pressable>
  );
}

function StreamCard({ alert, onPress }: { alert: LiveAlert; onPress: () => void }) {
  const colour = riskColour(alert.severity);
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [styles.streamCard, pressed && { backgroundColor: bg.elevated }]}
    >
      <View style={[styles.streamIcon, { backgroundColor: `${colour}24` }]}>
        <Ionicons name="swap-horizontal" size={20} color={colour} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <View style={styles.streamTop}>
          <Text style={styles.streamAmount} numberOfLines={1}>
            {money(alert.amount)}
          </Text>
          <View style={[styles.sevChip, { backgroundColor: `${colour}24` }]}>
            <Text style={[styles.sevChipText, { color: colour }]}>{alert.severity}</Text>
          </View>
        </View>
        <Text style={styles.streamSub} numberOfLines={1}>
          {account(alert.from)} → {account(alert.to)} · {since(alert.at)}
        </Text>
      </View>
      <View style={styles.chev}>
        <Ionicons name="chevron-forward" size={16} color={text.muted} />
      </View>
    </Pressable>
  );
}

const styles = themed(() => ({
  header: { paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.md, gap: 4 },
  eyebrow: { color: text.muted, fontSize: 14, fontWeight: "500" },
  headRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  greeting: { flex: 1, color: text.primary, fontFamily: font.extrabold, fontSize: 32, lineHeight: 38, letterSpacing: -1 },
  engines: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: bg.card,
    borderWidth: 1,
    borderColor: bg.border,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  enginesDot: { width: 8, height: 8, borderRadius: 4 },
  enginesText: { color: accent.base, fontSize: 12, fontWeight: "600", lineHeight: 16 },

  lead: { borderRadius: radius.xl, overflow: "hidden", padding: 22, gap: 6 },
  fill: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  leadTop: { flexDirection: "row", alignItems: "flex-start", gap: space.md, marginBottom: 10 },
  leadChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    backgroundColor: "rgba(60,40,0,0.10)",
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  leadChipText: { color: hero.ink, fontSize: 12, fontWeight: "700", letterSpacing: 0.8 },
  leadAccounts: { flexDirection: "row", alignItems: "center", gap: 8 },
  leadAccount: { ...mono, color: hero.ink, fontSize: 14 },
  leadAmount: { color: hero.ink, fontFamily: font.extrabold, fontSize: 46, lineHeight: 52, letterSpacing: -1.8 },
  leadWhy: { color: hero.muted, fontSize: 15, lineHeight: 21, fontWeight: "500" },
  leadButton: {
    marginTop: 16,
    height: 54,
    borderRadius: radius.pill,
    backgroundColor: "#131B2E",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  leadButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  ringLabel: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center" },
  ringValue: { color: hero.ink, fontSize: 17, fontWeight: "800", letterSpacing: -0.5 },
  ringCaption: { color: hero.muted, fontSize: 9, fontWeight: "700", letterSpacing: 0.8 },

  calm: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    backgroundColor: bg.card,
    borderWidth: 1,
    borderColor: bg.border,
    borderRadius: radius.xl,
    padding: 20,
  },
  calmIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  calmTitle: { color: text.primary, fontSize: 17, fontWeight: "700" },
  calmBody: { color: text.muted, fontSize: 14, lineHeight: 20, marginTop: 2 },

  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12, paddingHorizontal: 4 },
  sectionLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionTitle: { color: text.primary, fontSize: 20, fontWeight: "700", letterSpacing: -0.5 },
  sectionLink: { flexDirection: "row", alignItems: "center", gap: 6 },
  sectionLinkText: { color: accent.base, fontSize: 14, fontWeight: "600" },
  realtime: { backgroundColor: accent.soft, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  realtimeText: { color: accent.base, fontSize: 12, fontWeight: "700" },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  tile: {
    flexBasis: "47%",
    flexGrow: 1,
    backgroundColor: bg.card,
    borderWidth: 1,
    borderColor: bg.border,
    borderRadius: radius.lg,
    padding: 18,
    gap: 8,
  },
  tileHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  tileLabel: { color: text.secondary, fontSize: 14, fontWeight: "500" },
  tileIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  tileValue: { color: text.primary, fontFamily: font.extrabold, fontSize: 30, letterSpacing: -1, marginTop: 4 },
  tileNoteRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  tileDot: { width: 7, height: 7, borderRadius: 4 },
  tileNote: { color: text.muted, fontSize: 13, fontWeight: "600", flexShrink: 1 },

  stream: { gap: 10 },
  streamEmpty: { color: text.muted, fontSize: 14, paddingHorizontal: 4 },
  streamCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: bg.card,
    borderWidth: 1,
    borderColor: bg.border,
    borderRadius: radius.lg,
    padding: 16,
  },
  streamIcon: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  streamTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  streamAmount: { color: text.primary, fontSize: 18, fontWeight: "800", letterSpacing: -0.5, flexShrink: 1 },
  sevChip: { borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3 },
  sevChipText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.4 },
  streamSub: { ...mono, color: text.muted, fontSize: 12 },
  chev: { width: 32, height: 32, borderRadius: 16, backgroundColor: bg.elevated, alignItems: "center", justifyContent: "center" },
}));
