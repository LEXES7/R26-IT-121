import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  PanResponder,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  View,
  type GestureResponderEvent,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle, Defs, G, LinearGradient, Path, Pattern, RadialGradient, Rect, Stop } from "react-native-svg";

import { REVIEW_LABEL, getCase, reviewCase, type CaseDetail, type ReviewStatus } from "../api/cases";
import { getNeighbourhood } from "../api/graph";
import { confirmTap, tap, type IconName } from "../components/ios";
import { fromEvidence, type GEdge, type GNode } from "../components/NetworkGraph";
import { account, ago, money, percent } from "../lib/format";
import { parseReport, recommendation } from "../lib/forensicReport";
import { font, mono, radius, riskColour, scene, statusBar, themed } from "../theme/tokens";

/**
 * The money trail of one case, as a scene to move around in.
 *
 * The account the money converges on sits in the middle, and every account the
 * relational detector put in the ring is a tile around it, joined by the
 * transfers between them. Accounts one transfer from the sink form the first
 * ring, two transfers the second, so distance on screen is distance in money.
 * Drag to move, pinch or use the buttons to zoom, tap an account to see what
 * the model knows about it and to pull its neighbours from the live graph.
 *
 * Under the scene, the one structural fact that matters most, and the
 * forensic report's recommendation with the decisions it points to.
 */

type Tab = "overview" | "graph" | "timeline";

const ROLE: Record<string, { label: string; icon: IconName; implicated: boolean }> = {
  SINK: { label: "Sink account", icon: "wallet", implicated: true },
  MULE_CENTRAL: { label: "Central mule", icon: "git-merge", implicated: true },
  MULE: { label: "Mule", icon: "swap-horizontal", implicated: true },
  INTERMEDIARY: { label: "Intermediary", icon: "git-commit", implicated: true },
  FRESH_SENDER: { label: "Fresh sender", icon: "person-add", implicated: true },
  SENDER: { label: "Sender", icon: "arrow-up-circle", implicated: false },
  LEGITIMATE: { label: "Not implicated", icon: "checkmark-circle", implicated: false },
};
const OTHER = { label: "Account", icon: "ellipse-outline" as IconName, implicated: false };
const roleOf = (n: GNode) => ROLE[n.role ?? ""] ?? OTHER;

/** The served operating point. An account the model scores above it is flagged. */
const THRESHOLD = 0.2055;
const flagged = (n: GNode) => roleOf(n).implicated || (n.score ?? 0) >= THRESHOLD;

const TILE = 60;
const CARD_W = 156;
const CARD_H = 150;
const MIN_SCALE = 0.35;
const MAX_SCALE = 2.4;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

type Action = { status: ReviewStatus; label: string; icon: IconName; confirm: boolean };
const CONFIRM: Action = { status: "confirmed_fraud", label: "Confirm fraud", icon: "alert-circle", confirm: true };
const INVESTIGATE: Action = { status: "investigating", label: "Investigate", icon: "search", confirm: false };
const FALSE_POSITIVE: Action = { status: "false_positive", label: "False positive", icon: "close-circle", confirm: true };

/** What the report recommends, and the two decisions that follow from it. */
const PLAN = {
  escalate: { label: "Escalate", level: "CRITICAL", primary: CONFIRM, secondary: INVESTIGATE },
  review: { label: "Standard review", level: "MEDIUM", primary: INVESTIGATE, secondary: CONFIRM },
  dismiss: { label: "Dismiss with monitoring", level: "LOW", primary: FALSE_POSITIVE, secondary: INVESTIGATE },
} as const;

type Placed = { x: number; y: number };

/**
 * Rings by distance in transfers from the centre account.
 *
 * Each ring is spread evenly, in the order of the accounts it connects to on
 * the ring inside, so a transfer rarely has to cross the scene to reach its
 * partner. A ring grows with the number of accounts on it, so tiles never
 * overlap however many the detector returns.
 */
function rings(nodes: GNode[], edges: GEdge[], centreHint: string | null) {
  const ids = new Set(nodes.map((n) => n.id));
  const adj = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, new Set());
    adj.get(a)!.add(b);
  };
  for (const e of edges) {
    link(e.source, e.target);
    link(e.target, e.source);
  }

  let centre = centreHint && ids.has(centreHint) ? centreHint : null;
  if (!centre) {
    // No sink named: the account most money flows into stands in for it.
    const inflow = new Map<string, number>();
    for (const e of edges) inflow.set(e.target, (inflow.get(e.target) ?? 0) + 1);
    centre = [...inflow.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? nodes[0]?.id ?? null;
  }

  const hop = new Map<string, number>();
  if (centre) {
    hop.set(centre, 0);
    const queue = [centre];
    while (queue.length) {
      const id = queue.shift()!;
      for (const next of adj.get(id) ?? []) {
        if (!hop.has(next)) {
          hop.set(next, hop.get(id)! + 1);
          queue.push(next);
        }
      }
    }
  }
  const deepest = Math.max(0, ...hop.values());
  const byRing = new Map<number, string[]>();
  for (const n of nodes) {
    if (n.id === centre) continue;
    const k = hop.get(n.id) ?? deepest + 1;
    if (!byRing.has(k)) byRing.set(k, []);
    byRing.get(k)!.push(n.id);
  }

  const pos = new Map<string, Placed>();
  const angle = new Map<string, number>();
  let radiusSoFar = 0;
  const ringNumbers = [...byRing.keys()].sort((a, b) => a - b);
  for (const k of ringNumbers) {
    const members = byRing.get(k)!;
    const parentAngle = (id: string) => {
      const parents = [...(adj.get(id) ?? [])].filter((p) => angle.has(p));
      if (!parents.length) return Number.POSITIVE_INFINITY;
      return parents.reduce((s, p) => s + angle.get(p)!, 0) / parents.length;
    };
    members.sort((a, b) => parentAngle(a) - parentAngle(b));
    const fit = (members.length * (TILE + 34)) / (2 * Math.PI);
    const r = Math.max(radiusSoFar === 0 ? 150 : radiusSoFar + 116, fit);
    const first = members.length ? parentAngle(members[0]) : 0;
    const start = Number.isFinite(first) ? first : -Math.PI * 0.75;
    members.forEach((id, i) => {
      const a = start + (2 * Math.PI * i) / members.length;
      angle.set(id, a);
      pos.set(id, { x: r * Math.cos(a), y: r * Math.sin(a) });
    });
    radiusSoFar = r;
  }
  if (centre) {
    pos.set(centre, { x: 0, y: 0 });
    angle.set(centre, 0);
  }

  const size = Math.max(360, 2 * (radiusSoFar + TILE + 30));
  const placed = new Map<string, Placed>();
  for (const [id, p] of pos) placed.set(id, { x: p.x + size / 2, y: p.y + size / 2 });
  return { centre, placed, size };
}

/** Where the line from a box's centre towards a point leaves the box. */
function exit(cx: number, cy: number, hw: number, hh: number, tx: number, ty: number) {
  const dx = tx - cx;
  const dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const k = 1 / Math.max(Math.abs(dx) / hw, Math.abs(dy) / hh);
  return { x: cx + dx * k, y: cy + dy * k };
}

/** A cable between two points, bowed to one side. */
function cable(a: Placed, b: Placed, bow: number) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const c1 = { x: a.x + dx * 0.35 + nx * bow, y: a.y + dy * 0.35 + ny * bow };
  const c2 = { x: a.x + dx * 0.65 - nx * bow, y: a.y + dy * 0.65 - ny * bow };
  return `M${a.x},${a.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${b.x},${b.y}`;
}

/** The one structural fact worth reading first, in a sentence. */
function headline(c: CaseDetail, nodes: GNode[], edges: GEdge[]): string {
  const s = (c.graph_evidence as { structural_evidence?: Record<string, number | null> } | null)
    ?.structural_evidence ?? {};
  if ((s.convergence_count ?? 0) >= 2) return `${s.convergence_count} senders converge on one account`;
  if ((s.mules_in_subgraph ?? 0) >= 1) {
    return `${s.mules_in_subgraph} known mule account${s.mules_in_subgraph === 1 ? "" : "s"} in the ring`;
  }
  if (typeof s.mean_drain_ratio === "number" && s.mean_drain_ratio > 0) {
    return `Senders drained ${percent(s.mean_drain_ratio, 0)} of their balance`;
  }
  if (c.graph_pattern && c.graph_pattern !== "UNKNOWN") return c.graph_pattern.replace(/_/g, " ").toLowerCase();
  return `${nodes.length} accounts, ${edges.length} transfers`;
}

/** The report's recommendation: its verdict, and its first sentence. */
function advice(report: string | null) {
  if (!report) return null;
  const { sections } = parseReport(report);
  const rec = sections.find((s) => s.number === 5 || /RECOMMENDATION/i.test(s.title));
  if (!rec) return null;
  const plain = rec.body.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
  const first = plain.match(/^.*?[.!?](\s|$)/)?.[0]?.trim() ?? plain;
  return { verdict: recommendation(rec.body), sentence: first.length > 150 ? `${first.slice(0, 147)}...` : first };
}

export default function NetworkScreen({ caseRef, onBack }: { caseRef: string; onBack: () => void }) {
  const [c, setCase] = useState<CaseDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("graph");
  const [saving, setSaving] = useState<ReviewStatus | null>(null);

  const load = useCallback(async () => {
    try {
      setCase(await getCase(caseRef));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [caseRef]);

  useEffect(() => {
    load();
  }, [load]);

  const record = useCallback(
    async (a: Action) => {
      const go = async () => {
        setSaving(a.status);
        try {
          await reviewCase(caseRef, a.status);
          confirmTap();
          await load();
        } catch (err) {
          Alert.alert("Not recorded", (err as Error).message);
        } finally {
          setSaving(null);
        }
      };
      if (!a.confirm) return go();
      Alert.alert(
        `${a.label}?`,
        `${caseRef} will be recorded as ${REVIEW_LABEL[a.status].toLowerCase()} under your name. ` +
          "This verdict is used to build the retraining set.",
        [
          { text: "Cancel", style: "cancel" },
          { text: a.label, style: "destructive", onPress: go },
        ],
      );
    },
    [caseRef, load],
  );

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.screen}>
      <StatusBar barStyle={statusBar()} />
      <Backdrop />

      <View style={styles.topBar}>
        <GlassButton icon="chevron-back" label="Back" onPress={onBack} />
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={styles.title}>Trace the money</Text>
          <Text style={styles.subtitle}>{caseRef}</Text>
        </View>
        <View style={{ width: 48 }} />
      </View>

      <View style={styles.tabs} accessibilityRole="tablist">
        {(["overview", "graph", "timeline"] as Tab[]).map((t) => {
          const on = t === tab;
          return (
            <Pressable
              key={t}
              onPress={() => {
                tap();
                setTab(t);
              }}
              style={[styles.tab, on && styles.tabOn]}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
            >
              <Text style={[styles.tabText, on && styles.tabTextOn]}>
                {t === "overview" ? "Overview" : t === "graph" ? "Graph" : "Timeline"}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {!c ? (
        <View style={styles.centred}>
          {error ? (
            <Text style={styles.muted}>Cannot open {caseRef}: {error}</Text>
          ) : (
            <ActivityIndicator color={scene.ink} />
          )}
        </View>
      ) : (
        <>
          <View style={{ flex: 1 }}>
            {tab === "graph" && <Scene c={c} />}
            {tab === "overview" && <Overview c={c} />}
            {tab === "timeline" && <Timeline c={c} />}
          </View>
          <Dock c={c} saving={saving} onAct={record} />
        </>
      )}
    </SafeAreaView>
  );
}

/** The deep gradient and the dot grid behind everything. Fixed: it does not pan. */
function Backdrop() {
  return (
    <Svg style={styles.fill} pointerEvents="none">
      <Defs>
        <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={scene.top} />
          <Stop offset="0.32" stopColor={scene.mid} />
          <Stop offset="1" stopColor={scene.bottom} />
        </LinearGradient>
        <Pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse">
          <Circle cx="2" cy="2" r="1.3" fill={scene.dot} />
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#sky)" />
      <Rect width="100%" height="100%" fill="url(#dots)" />
    </Svg>
  );
}

function GlassButton({
  icon,
  label,
  onPress,
  active,
  size = 48,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  active?: boolean;
  size?: number;
}) {
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active }}
      style={({ pressed }) => [
        styles.glassButton,
        { width: size, height: size, borderRadius: size / 2 },
        active && { backgroundColor: scene.button, borderColor: scene.button },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Ionicons name={icon} size={size * 0.44} color={active ? "#FFFFFF" : scene.ink} />
    </Pressable>
  );
}

function Scene({ c }: { c: CaseDetail }) {
  const base = useMemo(() => fromEvidence(c.graph_evidence as Record<string, unknown> | null), [c.graph_evidence]);
  const [extra, setExtra] = useState<{ nodes: GNode[]; edges: GEdge[] }>({ nodes: [], edges: [] });
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [expanding, setExpanding] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [note, setNote] = useState<string | null>(null);
  const [view, setView] = useState({ w: 0, h: 0 });

  // The case's ring, plus whatever has been pulled from the live graph.
  const all = useMemo(() => {
    const byId = new Map(base.nodes.map((n) => [n.id, n]));
    for (const n of extra.nodes) {
      const known = byId.get(n.id);
      byId.set(n.id, known ? { ...n, ...known, score: known.score ?? n.score } : n);
    }
    const seen = new Set<string>();
    const edges: GEdge[] = [];
    for (const e of [...base.edges, ...extra.edges]) {
      const key = `${e.source}>${e.target}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push(e);
    }
    return { nodes: [...byId.values()], edges };
  }, [base, extra]);

  const { nodes, edges } = useMemo(() => {
    if (!onlyFlagged) return all;
    const keep = new Set(all.nodes.filter((n) => flagged(n) || n.id === base.centre).map((n) => n.id));
    return {
      nodes: all.nodes.filter((n) => keep.has(n.id)),
      edges: all.edges.filter((e) => keep.has(e.source) && keep.has(e.target)),
    };
  }, [all, onlyFlagged, base.centre]);

  const { centre, placed, size } = useMemo(() => rings(nodes, edges, base.centre), [nodes, edges, base.centre]);
  const maxAttention = Math.max(0.0001, ...edges.map((e) => e.attention ?? 0));

  // Pan and zoom live in animated values, so a drag never re-renders the scene.
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const scale = useRef(new Animated.Value(1)).current;
  const now = useRef({ x: 0, y: 0, s: 1 });
  const start = useRef({ x: 0, y: 0, s: 1, d0: 0, pinched: false });
  const touched = useRef(false);

  const fitScale = view.w && view.h ? clamp(Math.min(view.w / size, view.h / size) * 0.96, MIN_SCALE, 1.15) : 1;

  const animateTo = useCallback(
    (s: number, x = now.current.x, y = now.current.y) => {
      now.current = { x, y, s };
      Animated.parallel([
        Animated.spring(scale, { toValue: s, useNativeDriver: true, friction: 9 }),
        Animated.spring(pan, { toValue: { x, y }, useNativeDriver: true, friction: 9 }),
      ]).start();
    },
    [pan, scale],
  );

  // Open fitted, and refit when the graph grows, until the person has moved it.
  useEffect(() => {
    if (!touched.current && view.w) animateTo(fitScale, 0, 0);
  }, [fitScale, view.w, animateTo]);

  const spread = (e: GestureResponderEvent) => {
    const t = e.nativeEvent.touches;
    return t.length < 2 ? 0 : Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY);
  };

  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (e, g) =>
          e.nativeEvent.touches.length === 2 || Math.abs(g.dx) + Math.abs(g.dy) > 6,
        onPanResponderGrant: (e) => {
          touched.current = true;
          start.current = { ...now.current, d0: spread(e), pinched: false };
        },
        onPanResponderMove: (e, g) => {
          const d = spread(e);
          if (d > 0) {
            if (!start.current.d0) start.current = { ...start.current, d0: d, s: now.current.s };
            const s = clamp((start.current.s * d) / start.current.d0, MIN_SCALE, MAX_SCALE);
            now.current.s = s;
            start.current.pinched = true;
            scale.setValue(s);
          } else if (!start.current.pinched) {
            const x = start.current.x + g.dx;
            const y = start.current.y + g.dy;
            now.current.x = x;
            now.current.y = y;
            pan.setValue({ x, y });
          }
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [pan, scale],
  );

  async function expand(id: string) {
    setExpanding(true);
    setNote(null);
    try {
      const hood = await getNeighbourhood(id);
      const more = fromEvidence(hood as unknown as Record<string, unknown>);
      setExtra((prev) => ({ nodes: [...prev.nodes, ...more.nodes], edges: [...prev.edges, ...more.edges] }));
      setExpanded((prev) => new Set(prev).add(id));
      touched.current = false;
      if (hood.counts?.truncated) {
        setNote(`Showing ${hood.counts.edges_returned} of ${hood.counts.edges_in_ball} transfers around ${account(id, 4)}.`);
      }
    } catch (err) {
      setNote((err as Error).message);
    } finally {
      setExpanding(false);
    }
  }

  if (base.nodes.length === 0) {
    return (
      <View style={styles.centred}>
        <Text style={styles.muted}>The network detector returned no accounts for this case.</Text>
      </View>
    );
  }

  const centreNode = nodes.find((n) => n.id === centre) ?? null;
  const pickedNode = nodes.find((n) => n.id === picked) ?? null;
  const box = (id: string) => (id === centre ? { hw: CARD_W / 2, hh: CARD_H / 2 } : { hw: TILE / 2, hh: TILE / 2 });

  return (
    <View
      style={styles.viewport}
      onLayout={(e) => setView({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      {...responder.panHandlers}
    >
      {view.w > 0 && (
        <Animated.View
          style={{
            position: "absolute",
            left: (view.w - size) / 2,
            top: (view.h - size) / 2,
            width: size,
            height: size,
            transform: [{ translateX: pan.x }, { translateY: pan.y }, { scale }],
          }}
        >
          <Svg width={size} height={size}>
            <Defs>
              <RadialGradient id="halo" cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor={scene.glow} stopOpacity="0.55" />
                <Stop offset="1" stopColor={scene.glow} stopOpacity="0" />
              </RadialGradient>
              <RadialGradient id="spark" cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor={scene.glow} stopOpacity="0.95" />
                <Stop offset="1" stopColor={scene.glow} stopOpacity="0" />
              </RadialGradient>
              <LinearGradient id="tile" x1="0" y1="0" x2="0.4" y2="1">
                <Stop offset="0" stopColor={scene.tileTop} />
                <Stop offset="1" stopColor={scene.tileBottom} />
              </LinearGradient>
              {edges.map((e, i) => {
                const a = placed.get(e.source);
                const b = placed.get(e.target);
                if (!a || !b) return null;
                return (
                  <LinearGradient key={i} id={`w${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} gradientUnits="userSpaceOnUse">
                    <Stop offset="0" stopColor={scene.wire} stopOpacity="0.55" />
                    <Stop offset="1" stopColor={e.target === centre ? scene.glow : scene.wire} stopOpacity="0.95" />
                  </LinearGradient>
                );
              })}
            </Defs>

            {centre && placed.get(centre) && (
              <Circle cx={placed.get(centre)!.x} cy={placed.get(centre)!.y} r={CARD_W * 0.95} fill="url(#halo)" />
            )}

            {edges.map((e, i) => {
              const a = placed.get(e.source);
              const b = placed.get(e.target);
              if (!a || !b || e.source === e.target) return null;
              const ba = box(e.source);
              const bb = box(e.target);
              const p = exit(a.x, a.y, ba.hw, ba.hh, b.x, b.y);
              const q = exit(b.x, b.y, bb.hw, bb.hh, a.x, a.y);
              const len = Math.hypot(q.x - p.x, q.y - p.y);
              const bow = Math.min(34, len * 0.14) * (i % 2 ? 1 : -1);
              const weight = (e.attention ?? 0) / maxAttention;
              const lit = picked === e.source || picked === e.target || e.trigger;
              const into = e.target === centre;
              return (
                <G key={`${e.source}>${e.target}-${i}`}>
                  <Path d={cable(p, q, bow)} stroke={into ? scene.glow : scene.wire} strokeOpacity={0.16}
                        strokeWidth={6 + weight * 6} fill="none" />
                  <Path d={cable(p, q, bow)} stroke={e.trigger ? scene.danger : `url(#w${i})`}
                        strokeWidth={lit ? 2.6 : 1.4 + weight * 1.6} fill="none" />
                  <Path d={cable(p, q, -bow * 0.6)} stroke={`url(#w${i})`} strokeOpacity={0.45}
                        strokeWidth={0.9} fill="none" />
                  {into && <Circle cx={q.x} cy={q.y} r={15} fill="url(#spark)" />}
                </G>
              );
            })}

            {nodes.map((n) => {
              const p = placed.get(n.id);
              if (!p) return null;
              if (n.id === centre) {
                return (
                  <Rect key={n.id} x={p.x - CARD_W / 2} y={p.y - CARD_H / 2} width={CARD_W} height={CARD_H} rx={26}
                        fill={scene.glassStrong} stroke={picked === n.id ? scene.ink : scene.glassBorder} strokeWidth={picked === n.id ? 2 : 1} />
                );
              }
              return (
                <G key={n.id}>
                  <Rect x={p.x - TILE / 2} y={p.y - TILE / 2 + 6} width={TILE} height={TILE} rx={18}
                        fill={scene.tileTop} fillOpacity={0.25} />
                  <Rect x={p.x - TILE / 2} y={p.y - TILE / 2} width={TILE} height={TILE} rx={18}
                        fill={roleOf(n).implicated || flagged(n) ? "url(#tile)" : scene.glass}
                        stroke={picked === n.id ? scene.ink : scene.glassBorder} strokeWidth={picked === n.id ? 2 : 1} />
                </G>
              );
            })}
          </Svg>

          {nodes.map((n) => {
            const p = placed.get(n.id);
            if (!p) return null;
            const r = roleOf(n);
            if (n.id === centre) {
              return (
                <Pressable
                  key={n.id}
                  onPress={() => setPicked(picked === n.id ? null : n.id)}
                  style={[styles.centreCard, { left: p.x - CARD_W / 2, top: p.y - CARD_H / 2 }]}
                  accessibilityRole="button"
                  accessibilityLabel={`${n.id}, ${r.label}`}
                >
                  <Ionicons name="person" size={40} color={scene.ink} />
                  <Text style={styles.centreId} numberOfLines={1}>{account(n.id, 4)}</Text>
                  <View style={styles.centreChip}>
                    <Text style={styles.centreChipText} numberOfLines={1}>
                      {n.role ? r.label : "Money converges here"}
                    </Text>
                  </View>
                </Pressable>
              );
            }
            const loud = r.implicated || flagged(n);
            return (
              <Pressable
                key={n.id}
                onPress={() => setPicked(picked === n.id ? null : n.id)}
                style={[styles.tileHit, { left: p.x - TILE / 2, top: p.y - TILE / 2 }]}
                accessibilityRole="button"
                accessibilityLabel={`${n.id}, ${r.label}${flagged(n) ? ", flagged" : ""}`}
              >
                <Ionicons name={r.icon} size={24} color={loud ? "#FFFFFF" : scene.ink} />
                {flagged(n) && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>!</Text>
                  </View>
                )}
                <Text style={styles.tileLabel} numberOfLines={1}>{account(n.id, 3)}</Text>
              </Pressable>
            );
          })}
        </Animated.View>
      )}

      <View style={styles.zoom}>
        <GlassButton icon="funnel-outline" label={onlyFlagged ? "Show every account" : "Show flagged accounts only"}
                     active={onlyFlagged} size={42} onPress={() => setOnlyFlagged((v) => !v)} />
        <GlassButton icon="add" label="Zoom in" size={42} onPress={() => animateTo(clamp(now.current.s * 1.3, MIN_SCALE, MAX_SCALE))} />
        <GlassButton icon="remove" label="Zoom out" size={42} onPress={() => animateTo(clamp(now.current.s / 1.3, MIN_SCALE, MAX_SCALE))} />
        <GlassButton icon="scan-outline" label="Fit to screen" size={42} onPress={() => {
          touched.current = false;
          animateTo(fitScale, 0, 0);
        }} />
      </View>

      <View style={styles.bottomStack} pointerEvents="box-none">
        {pickedNode && (
          <View style={styles.popover}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Text style={styles.popId} numberOfLines={1}>{pickedNode.id}</Text>
              <Pressable onPress={() => setPicked(null)} hitSlop={10} accessibilityLabel="Close">
                <Ionicons name="close" size={18} color={scene.inkMuted} />
              </Pressable>
            </View>
            <Text style={styles.popMeta}>
              {roleOf(pickedNode).label}
              {typeof pickedNode.score === "number" ? ` · mule probability ${pickedNode.score.toFixed(3)}` : ""}
              {pickedNode.inDegree !== null ? ` · ${pickedNode.inDegree} in, ${pickedNode.outDegree ?? 0} out` : ""}
            </Text>
            {(() => {
              const into = edges.filter((e) => e.target === pickedNode.id && typeof e.amount === "number");
              return into.length ? (
                <Text style={styles.popMeta}>
                  Received {into.length} transfer{into.length === 1 ? "" : "s"} in this view, {money(into.reduce((s, e) => s + (e.amount ?? 0), 0))} in all
                </Text>
              ) : null;
            })()}
            {!expanded.has(pickedNode.id) && (
              <Pressable onPress={() => expand(pickedNode.id)} disabled={expanding} style={styles.popButton}
                         accessibilityRole="button">
                {expanding ? (
                  <ActivityIndicator size="small" color={scene.ink} />
                ) : (
                  <>
                    <Ionicons name="git-network-outline" size={15} color={scene.ink} />
                    <Text style={styles.popButtonText}>Pull its neighbours from the live graph</Text>
                  </>
                )}
              </Pressable>
            )}
          </View>
        )}
        <View style={styles.strip}>
          <View style={styles.stripDot} />
          <Text style={styles.stripText} numberOfLines={1}>
            {note ?? headline(c, nodes, edges)}
          </Text>
          <Text style={styles.stripTime}>{ago(c.detected_at)}</Text>
        </View>
      </View>

      {!centreNode && <Text style={[styles.muted, { position: "absolute", top: 12, alignSelf: "center" }]}>No sink account named</Text>}
    </View>
  );
}

function Overview({ c }: { c: CaseDetail }) {
  const { nodes, edges } = useMemo(() => fromEvidence(c.graph_evidence as Record<string, unknown> | null), [c.graph_evidence]);
  const s = (c.graph_evidence as { structural_evidence?: Record<string, number | null> } | null)?.structural_evidence ?? {};
  const counts = new Map<string, number>();
  for (const n of nodes) counts.set(roleOf(n).label, (counts.get(roleOf(n).label) ?? 0) + 1);
  const colour = riskColour(c.classification);
  return (
    <ScrollView contentContainerStyle={styles.pageBody}>
      <View style={styles.glassCard}>
        <Text style={styles.kicker}>FUSED PROBABILITY OF FRAUD</Text>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 10 }}>
          <Text style={[styles.bigNumber, { color: colour }]}>
            {typeof c.fused_score === "number" ? `${Math.round(c.fused_score * 100)}%` : "-"}
          </Text>
          <Text style={styles.cardText}>{String(c.classification).toLowerCase()}</Text>
        </View>
        {[
          ["Network", c.graph_available, c.graph_score],
          ["Behaviour", c.behavioral_available, c.behavioral_score],
          ["Timing", c.temporal_available, c.temporal_score],
        ].map(([name, ok, v]) => (
          <View key={name as string} style={styles.factRow}>
            <Text style={styles.factLabel}>{name as string}</Text>
            <Text style={styles.factValue}>{ok === false ? "did not answer" : typeof v === "number" ? v.toFixed(3) : "-"}</Text>
          </View>
        ))}
      </View>

      <View style={styles.glassCard}>
        <Text style={styles.kicker}>THE RING</Text>
        <Text style={styles.cardTitle}>
          {c.graph_pattern && c.graph_pattern !== "UNKNOWN" ? c.graph_pattern.replace(/_/g, " ").toLowerCase() : "No named pattern"}
        </Text>
        {[
          ["Accounts", String(nodes.length)],
          ["Transfers", String(edges.length)],
          ["Converging on", c.sink_account ?? "-"],
          ["Senders converging", s.convergence_count != null ? String(s.convergence_count) : "-"],
          ["Known mules", s.mules_in_subgraph != null ? String(s.mules_in_subgraph) : "-"],
          ["Senders with no history", s.fresh_sender_ratio != null ? percent(s.fresh_sender_ratio, 1) : "-"],
          ["Mean drain ratio", s.mean_drain_ratio != null ? percent(s.mean_drain_ratio, 1) : "-"],
        ].map(([l, v]) => (
          <View key={l} style={styles.factRow}>
            <Text style={styles.factLabel}>{l}</Text>
            <Text style={[styles.factValue, l === "Converging on" && mono]} numberOfLines={1}>{v}</Text>
          </View>
        ))}
      </View>

      {counts.size > 0 && (
        <View style={styles.glassCard}>
          <Text style={styles.kicker}>ACCOUNTS BY ROLE</Text>
          {[...counts.entries()].sort((a, b) => b[1] - a[1]).map(([label, n]) => (
            <View key={label} style={styles.factRow}>
              <Text style={styles.factLabel}>{label}</Text>
              <Text style={styles.factValue}>{n}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function Timeline({ c }: { c: CaseDetail }) {
  if (!c.timeline?.length) {
    return (
      <View style={styles.centred}>
        <Text style={styles.muted}>No timeline was recorded for this case.</Text>
      </View>
    );
  }
  return (
    <ScrollView contentContainerStyle={styles.pageBody}>
      {c.timeline.map((t, i) => (
        <View key={`${t.stage}-${i}`} style={styles.tlRow}>
          <View style={styles.tlRail}>
            <View style={styles.tlDot} />
            {i < c.timeline.length - 1 && <View style={styles.tlLine} />}
          </View>
          <View style={[styles.glassCard, { flex: 1, marginBottom: 10 }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
              <Text style={styles.cardTitle}>{t.stage}</Text>
              <Text style={styles.stripTime}>{ago(t.at)}</Text>
            </View>
            <Text style={styles.cardText}>{t.detail}</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

/** The report's recommendation, and the two decisions it points to. */
function Dock({
  c,
  saving,
  onAct,
}: {
  c: CaseDetail;
  saving: ReviewStatus | null;
  onAct: (a: Action) => void;
}) {
  const said = useMemo(() => advice(c.forensic_report), [c.forensic_report]);
  const plan = said?.verdict ? PLAN[said.verdict] : null;
  const status = (c.review_status ?? "open") as ReviewStatus;
  const decided = status === "confirmed_fraud" || status === "false_positive" || status === "closed";
  const primary = plan?.primary ?? CONFIRM;
  const secondary = plan?.secondary ?? INVESTIGATE;

  return (
    <View style={styles.dock}>
      <View style={styles.dockHead}>
        <View style={styles.sparkle}>
          <Ionicons name="sparkles" size={18} color={scene.ink} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.dockTitle}>
            {plan ? `Report recommends: ${plan.label}` : "Forensic report"}
          </Text>
          <Text style={styles.dockText} numberOfLines={2}>
            {said?.sentence ?? (c.forensic_report ? "The report gives no recommendation in its usual form." : "No report was written for this case.")}
          </Text>
        </View>
      </View>
      {decided ? (
        <Text style={styles.decided}>
          Recorded as {REVIEW_LABEL[status]?.toLowerCase() ?? status}
          {c.reviewed_by ? ` by ${c.reviewed_by}` : ""}
          {c.reviewed_at ? `, ${ago(c.reviewed_at)}` : ""}
        </Text>
      ) : (
        <View style={styles.dockButtons}>
          {[primary, secondary].map((a, i) => {
            const current = a.status === status;
            return (
              <Pressable
                key={a.status}
                onPress={() => onAct(a)}
                disabled={saving !== null || current}
                style={({ pressed }) => [
                  i === 0 ? styles.primary : styles.secondary,
                  (pressed || current) && { opacity: 0.6 },
                ]}
                accessibilityRole="button"
                accessibilityState={{ disabled: saving !== null || current }}
              >
                {saving === a.status ? (
                  <ActivityIndicator size="small" color={i === 0 ? "#FFFFFF" : scene.ink} />
                ) : (
                  <>
                    <Ionicons name={a.icon} size={17} color={i === 0 ? "#FFFFFF" : scene.ink} />
                    <Text style={i === 0 ? styles.primaryText : styles.secondaryText}>
                      {current ? `${a.label} (current)` : a.label}
                    </Text>
                  </>
                )}
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = themed(() => ({
  screen: { flex: 1, backgroundColor: scene.bottom },
  fill: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  centred: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  muted: { color: scene.inkMuted, fontSize: 14, textAlign: "center" },

  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10, gap: 12 },
  title: { color: scene.ink, fontSize: 22, fontWeight: "600", letterSpacing: -0.4 },
  subtitle: { ...mono, color: scene.inkMuted, fontSize: 11, marginTop: 2 },
  glassButton: {
    backgroundColor: scene.glass,
    borderWidth: 1,
    borderColor: scene.glassBorder,
    alignItems: "center",
    justifyContent: "center",
  },

  tabs: {
    flexDirection: "row",
    marginHorizontal: 16,
    padding: 4,
    gap: 4,
    borderRadius: radius.pill,
    backgroundColor: scene.glass,
    borderWidth: 1,
    borderColor: scene.glassBorder,
  },
  tab: { flex: 1, height: 42, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  tabOn: { backgroundColor: scene.glassStrong, borderWidth: 1, borderColor: scene.glassBorder },
  tabText: { color: scene.inkMuted, fontSize: 15, fontWeight: "500" },
  tabTextOn: { color: scene.ink, fontWeight: "600" },

  viewport: { flex: 1, overflow: "hidden" },
  centreCard: {
    position: "absolute",
    width: CARD_W,
    height: CARD_H,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 10,
  },
  centreId: { ...mono, color: scene.ink, fontSize: 15 },
  centreChip: {
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: "rgba(255,95,162,0.22)",
    borderWidth: 1,
    borderColor: "rgba(255,95,162,0.45)",
    maxWidth: CARD_W - 16,
  },
  centreChipText: { color: scene.ink, fontSize: 12, fontWeight: "600" },
  tileHit: { position: "absolute", width: TILE, height: TILE, alignItems: "center", justifyContent: "center" },
  tileLabel: {
    ...mono,
    position: "absolute",
    top: TILE + 6,
    left: -20,
    width: TILE + 40,
    textAlign: "center",
    color: scene.inkMuted,
    fontSize: 9,
  },
  badge: {
    position: "absolute",
    top: -9,
    right: -9,
    width: 22,
    height: 22,
    borderRadius: 7,
    backgroundColor: scene.danger,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.35)",
  },
  badgeText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },

  zoom: { position: "absolute", right: 14, bottom: 76, gap: 10 },

  bottomStack: { position: "absolute", left: 16, right: 16, bottom: 10, gap: 8 },
  popover: {
    borderRadius: 20,
    padding: 14,
    gap: 6,
    backgroundColor: scene.glassStrong,
    borderWidth: 1,
    borderColor: scene.glassBorder,
    marginRight: 56,
  },
  popId: { ...mono, flex: 1, color: scene.ink, fontSize: 13 },
  popMeta: { color: scene.inkMuted, fontSize: 12, lineHeight: 17 },
  popButton: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: scene.glass,
    borderWidth: 1,
    borderColor: scene.glassBorder,
  },
  popButtonText: { color: scene.ink, fontSize: 12, fontWeight: "600" },
  strip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    height: 44,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,79,139,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,79,139,0.32)",
  },
  stripDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: scene.danger },
  stripText: { flex: 1, color: scene.ink, fontSize: 14, fontWeight: "500" },
  stripTime: { color: scene.inkMuted, fontSize: 12 },

  dock: {
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 6,
    borderRadius: 30,
    padding: 16,
    gap: 14,
    backgroundColor: scene.glass,
    borderWidth: 1,
    borderColor: scene.glassBorder,
  },
  dockHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  sparkle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,95,162,0.18)",
    borderWidth: 1,
    borderColor: scene.glassBorder,
  },
  dockTitle: { color: scene.ink, fontSize: 16, fontWeight: "600" },
  dockText: { color: scene.inkMuted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  dockButtons: { flexDirection: "row", gap: 10 },
  primary: {
    flex: 1,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: scene.button,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: scene.button,
    shadowOpacity: 0.5,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  primaryText: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
  secondary: {
    flex: 1,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: scene.glass,
    borderWidth: 1,
    borderColor: scene.glassBorder,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  secondaryText: { color: scene.ink, fontSize: 15, fontWeight: "600" },
  decided: { color: scene.inkMuted, fontSize: 13, textAlign: "center" },

  pageBody: { padding: 16, gap: 12 },
  glassCard: {
    borderRadius: 24,
    padding: 18,
    gap: 6,
    backgroundColor: scene.glass,
    borderWidth: 1,
    borderColor: scene.glassBorder,
  },
  kicker: { color: scene.inkMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  bigNumber: { fontFamily: font.extrabold, fontSize: 44, letterSpacing: -1.6 },
  cardTitle: { color: scene.ink, fontSize: 17, fontWeight: "700", textTransform: "capitalize" },
  cardText: { color: scene.inkMuted, fontSize: 14, lineHeight: 20 },
  factRow: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 3 },
  factLabel: { color: scene.inkMuted, fontSize: 14 },
  factValue: { color: scene.ink, fontSize: 14, fontWeight: "600", flexShrink: 1, textAlign: "right" },

  tlRow: { flexDirection: "row", gap: 12 },
  tlRail: { width: 12, alignItems: "center", paddingTop: 20 },
  tlDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: scene.glow },
  tlLine: { flex: 1, width: 2, backgroundColor: scene.glassBorder, marginTop: 4 },
}));
