import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, G, Line, Polygon, Text as SvgText } from "react-native-svg";

import { getNeighbourhood } from "../api/graph";
import { account, money, score } from "../lib/format";
import { accent, bg, modality, mono, radius, risk, space, text } from "../theme/tokens";
import { Fact, Note } from "./ui";

/**
 * The suspicious subgraph, drawn.
 *
 * The relational detector answers with a structure, and a structure read as a
 * list of account pairs hides the one thing that matters: which way the money
 * converges. Here it is drawn as the detector returned it, the flagged account
 * at the centre, and any account can be tapped to see what the model knows
 * about it and to pull its own neighbourhood from the live graph.
 *
 * Two shapes are accepted because the backend serves two: the subgraph stored
 * on a case (`account_id`, `src`/`dst`, `edge_attention_weight`) and the
 * neighbourhood explorer (`id`, `source`/`target`, `attention`).
 */

export type GNode = {
  id: string;
  score: number | null;
  role: string | null;
  inDegree: number | null;
  outDegree: number | null;
};

export type GEdge = {
  source: string;
  target: string;
  amount: number | null;
  attention: number | null;
  trigger: boolean;
};

type Raw = Record<string, unknown>;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown) => (typeof v === "string" && v ? v : null);

/** Normalise either backend shape. Edges to accounts not in the node list still draw. */
export function fromEvidence(evidence: Raw | null | undefined): {
  nodes: GNode[];
  edges: GEdge[];
  centre: string | null;
} {
  const rawNodes = Array.isArray(evidence?.nodes) ? (evidence!.nodes as Raw[]) : [];
  const rawEdges = Array.isArray(evidence?.edges) ? (evidence!.edges as Raw[]) : [];

  const nodes = new Map<string, GNode>();
  for (const n of rawNodes) {
    const id = str(n.account_id) ?? str(n.id);
    if (!id) continue;
    nodes.set(id, {
      id,
      score: num(n.node_risk_score) ?? num(n.score),
      role: str(n.role),
      inDegree: num(n.in_degree),
      outDegree: num(n.out_degree),
    });
  }

  const edges: GEdge[] = [];
  for (const e of rawEdges) {
    const source = str(e.src) ?? str(e.source);
    const target = str(e.dst) ?? str(e.target);
    if (!source || !target) continue;
    for (const id of [source, target]) {
      if (!nodes.has(id)) {
        nodes.set(id, { id, score: null, role: null, inDegree: null, outDegree: null });
      }
    }
    edges.push({
      source,
      target,
      amount: num(e.amount),
      attention: num(e.edge_attention_weight) ?? num(e.attention),
      trigger: e.is_trigger_edge === true,
    });
  }

  const centre =
    str(evidence?.sink_account) ??
    str(evidence?.centre) ??
    rawNodes.map((n) => (n.is_centre === true ? str(n.id) : null)).find(Boolean) ??
    null;

  return { nodes: [...nodes.values()], edges, centre };
}

/** Node colour from the model's own mule probability, on the risk ramp. */
function nodeColour(s: number | null): string {
  if (s === null) return text.faint;
  if (s >= 0.8) return risk.CRITICAL;
  if (s >= 0.5) return risk.HIGH;
  if (s >= 0.2055) return risk.MEDIUM; // the served operating point
  return risk.LOW;
}

/**
 * A force-directed layout, computed once per graph.
 *
 * Fruchterman-Reingold with a cooling schedule. The centre account is pinned
 * so the eye always starts in the same place, and the seed positions are a
 * deterministic circle so the same case draws the same way every time it is
 * opened. Subgraphs here are tens of nodes, so the quadratic repulsion costs
 * nothing worth avoiding.
 */
function layout(nodes: GNode[], edges: GEdge[], centre: string | null, w: number, h: number) {
  const pos = new Map<string, { x: number; y: number }>();
  const n = nodes.length || 1;
  nodes.forEach((node, i) => {
    const a = (2 * Math.PI * i) / n;
    pos.set(node.id, { x: w / 2 + (w / 3) * Math.cos(a), y: h / 2 + (h / 3) * Math.sin(a) });
  });
  if (centre && pos.has(centre)) pos.set(centre, { x: w / 2, y: h / 2 });

  const k = Math.sqrt((w * h) / n) * 0.75;
  let t = w / 8;
  for (let iter = 0; iter < 160; iter++) {
    const disp = new Map(nodes.map((nd) => [nd.id, { x: 0, y: 0 }]));
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = pos.get(nodes[i].id)!;
        const b = pos.get(nodes[j].id)!;
        const dx = a.x - b.x || 0.01;
        const dy = a.y - b.y || 0.01;
        const d = Math.max(Math.hypot(dx, dy), 0.01);
        const f = (k * k) / d;
        const da = disp.get(nodes[i].id)!;
        const db = disp.get(nodes[j].id)!;
        da.x += (dx / d) * f;
        da.y += (dy / d) * f;
        db.x -= (dx / d) * f;
        db.y -= (dy / d) * f;
      }
    }
    for (const e of edges) {
      const a = pos.get(e.source);
      const b = pos.get(e.target);
      if (!a || !b || e.source === e.target) continue;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const d = Math.max(Math.hypot(dx, dy), 0.01);
      const f = (d * d) / k;
      const da = disp.get(e.source)!;
      const db = disp.get(e.target)!;
      da.x -= (dx / d) * f;
      da.y -= (dy / d) * f;
      db.x += (dx / d) * f;
      db.y += (dy / d) * f;
    }
    for (const nd of nodes) {
      if (nd.id === centre) continue;
      const p = pos.get(nd.id)!;
      const dsp = disp.get(nd.id)!;
      const d = Math.max(Math.hypot(dsp.x, dsp.y), 0.01);
      p.x += (dsp.x / d) * Math.min(d, t);
      p.y += (dsp.y / d) * Math.min(d, t);
      p.x = Math.min(w - 18, Math.max(18, p.x));
      p.y = Math.min(h - 18, Math.max(18, p.y));
    }
    t *= 0.97;
  }
  return pos;
}

const HEIGHT = 320;

export default function NetworkGraph({
  evidence,
  explorable = true,
}: {
  evidence: Raw | null | undefined;
  /** Whether tapping a node may ask the live graph for its neighbours. */
  explorable?: boolean;
}) {
  const base = useMemo(() => fromEvidence(evidence), [evidence]);
  const [extra, setExtra] = useState<{ nodes: GNode[]; edges: GEdge[] }>({ nodes: [], edges: [] });
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<string | null>(base.centre);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { nodes, edges } = useMemo(() => {
    const byId = new Map(base.nodes.map((n) => [n.id, n]));
    for (const n of extra.nodes) {
      const known = byId.get(n.id);
      byId.set(n.id, known ? { ...n, ...known, score: known.score ?? n.score } : n);
    }
    const seen = new Set<string>();
    const all: GEdge[] = [];
    for (const e of [...base.edges, ...extra.edges]) {
      const key = `${e.source}>${e.target}`;
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(e);
    }
    return { nodes: [...byId.values()], edges: all };
  }, [base, extra]);

  const pos = useMemo(
    () => (width ? layout(nodes, edges, base.centre, width, HEIGHT) : null),
    [nodes, edges, base.centre, width],
  );

  const maxAttention = Math.max(0.0001, ...edges.map((e) => e.attention ?? 0));
  const picked = nodes.find((n) => n.id === selected) ?? null;

  async function expand(id: string) {
    setLoading(true);
    setError(null);
    try {
      const hood = await getNeighbourhood(id);
      const more = fromEvidence(hood as unknown as Raw);
      setExtra((prev) => ({
        nodes: [...prev.nodes, ...more.nodes],
        edges: [...prev.edges, ...more.edges],
      }));
      setExpanded((prev) => new Set(prev).add(id));
      if (hood.counts?.truncated) {
        setError(
          `Showing ${hood.counts.edges_returned} of ${hood.counts.edges_in_ball} transfers around this account.`,
        );
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (nodes.length === 0) {
    return <Note>The detector returned no accounts for this transaction.</Note>;
  }

  return (
    <View>
      <View
        style={styles.canvas}
        onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}
      >
        {pos && (
          <Svg width={width} height={HEIGHT}>
            {edges.map((e, i) => {
              const a = pos.get(e.source);
              const b = pos.get(e.target);
              if (!a || !b) return null;
              const strength = (e.attention ?? 0) / maxAttention;
              const touches = selected === e.source || selected === e.target;
              const colour = e.trigger ? accent.base : touches ? text.secondary : bg.borderStrong;
              // An arrowhead two thirds of the way along, so direction reads
              // without the head hiding under the target's circle.
              const mx = a.x + (b.x - a.x) * 0.66;
              const my = a.y + (b.y - a.y) * 0.66;
              const ang = Math.atan2(b.y - a.y, b.x - a.x);
              const s = 5;
              const head = [
                `${mx + s * Math.cos(ang)},${my + s * Math.sin(ang)}`,
                `${mx + s * Math.cos(ang + 2.5)},${my + s * Math.sin(ang + 2.5)}`,
                `${mx + s * Math.cos(ang - 2.5)},${my + s * Math.sin(ang - 2.5)}`,
              ].join(" ");
              return (
                <G key={`${e.source}>${e.target}-${i}`}>
                  <Line
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke={colour}
                    strokeWidth={1 + strength * 3}
                    strokeOpacity={touches || e.trigger ? 1 : 0.7}
                  />
                  <Polygon points={head} fill={colour} />
                </G>
              );
            })}
            {nodes.map((n) => {
              const p = pos.get(n.id);
              if (!p) return null;
              const isCentre = n.id === base.centre;
              const isPicked = n.id === selected;
              const r = isCentre ? 11 : 7;
              return (
                <G key={n.id} onPress={() => setSelected(n.id)}>
                  {/* A larger invisible target: a 7px dot is too small for a thumb. */}
                  <Circle cx={p.x} cy={p.y} r={18} fill="transparent" />
                  <Circle
                    cx={p.x}
                    cy={p.y}
                    r={r}
                    fill={nodeColour(n.score)}
                    stroke={isPicked ? text.primary : bg.card}
                    strokeWidth={isPicked ? 2.5 : 2}
                  />
                  {(isCentre || isPicked) && (
                    <SvgText
                      x={p.x}
                      y={p.y - r - 6}
                      fill={text.primary}
                      fontSize={10}
                      fontFamily="monospace"
                      textAnchor="middle"
                    >
                      {account(n.id, 4)}
                    </SvgText>
                  )}
                </G>
              );
            })}
          </Svg>
        )}
      </View>

      <View style={styles.legend}>
        {[
          ["≥ 0.80", risk.CRITICAL],
          ["≥ 0.50", risk.HIGH],
          ["≥ 0.21", risk.MEDIUM],
          ["below", risk.LOW],
        ].map(([label, colour]) => (
          <View key={label} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colour }]} />
            <Text style={styles.legendText}>{label}</Text>
          </View>
        ))}
        <View style={styles.legendItem}>
          <View style={[styles.legendLine, { backgroundColor: accent.base }]} />
          <Text style={styles.legendText}>this transfer</Text>
        </View>
      </View>
      <Text style={styles.caption}>
        {nodes.length} accounts · {edges.length} transfers · node colour is the model's mule
        probability, line weight its edge attention. Tap an account.
      </Text>

      {picked && (
        <View style={styles.picked}>
          <Text style={styles.pickedId}>{picked.id}</Text>
          {picked.id === base.centre && <Text style={styles.pickedTag}>Flagged account</Text>}
          <Fact label="Mule probability" value={score(picked.score)} monospace />
          {picked.role && <Fact label="Role" value={picked.role.replace(/_/g, " ")} />}
          <Fact
            label="Transfers in / out"
            value={`${picked.inDegree ?? "?"} / ${picked.outDegree ?? "?"}`}
            monospace
          />
          <Fact
            label="Received here"
            value={money(
              edges
                .filter((e) => e.target === picked.id)
                .reduce((sum, e) => sum + (e.amount ?? 0), 0),
            )}
            monospace
          />
          {explorable && (
            <Pressable
              onPress={() => expand(picked.id)}
              disabled={loading || expanded.has(picked.id)}
              style={({ pressed }) => [
                styles.expand,
                (pressed || loading) && { opacity: 0.6 },
                expanded.has(picked.id) && styles.expandDone,
              ]}
            >
              {loading ? (
                <ActivityIndicator size="small" color={text.secondary} />
              ) : (
                <Text style={styles.expandText}>
                  {expanded.has(picked.id)
                    ? "Neighbours added"
                    : "Show this account's neighbours"}
                </Text>
              )}
            </Pressable>
          )}
          {error && <Note>{error}</Note>}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    height: HEIGHT,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: bg.border,
    backgroundColor: bg.raised,
    overflow: "hidden",
  },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: space.md, marginTop: space.md },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLine: { width: 14, height: 2, borderRadius: 1 },
  legendText: { color: text.muted, fontSize: 11 },
  caption: { color: text.faint, fontSize: 11, lineHeight: 16, marginTop: space.sm },

  picked: {
    marginTop: space.lg,
    paddingTop: space.lg,
    borderTopWidth: 1,
    borderTopColor: bg.border,
  },
  pickedId: { ...mono, color: text.primary, fontSize: 15, fontWeight: "600" },
  pickedTag: { color: modality.graph, fontSize: 11, fontWeight: "600", marginTop: 2 },
  expand: {
    marginTop: space.md,
    borderWidth: 1,
    borderColor: bg.borderStrong,
    borderRadius: radius.md,
    paddingVertical: space.sm + 2,
    alignItems: "center",
  },
  expandDone: { borderStyle: "dashed" },
  expandText: { color: text.secondary, fontSize: 13, fontWeight: "600" },
});
