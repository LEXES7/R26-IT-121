import { StyleSheet, Text, View } from "react-native";

import type { GraphEvidence } from "../../api/analyses";
import { account, money, percent } from "../../lib/format";
import { bg, modality, mono, space, text } from "../../theme/tokens";
import { Fact, Label, Note } from "../ui";

/**
 * The relational model's subgraph — M2's component.
 *
 * This evidence is a structure rather than a decomposition: which accounts are
 * implicated, which one the money converges on, and the shape the pattern
 * makes. The panel is built now so that the moment the graph service is
 * running its output has somewhere to go.
 */
export default function Graph({ evidence }: { evidence: GraphEvidence }) {
  const s = evidence.structural_evidence ?? {};
  const nodes = evidence.nodes ?? [];
  const edges = evidence.edges ?? [];

  return (
    <View>
      {evidence.pattern && evidence.pattern !== "UNKNOWN" ? (
        <Text style={styles.pattern}>{evidence.pattern.replace(/_/g, " ")}</Text>
      ) : (
        <Text style={[styles.pattern, { color: text.muted }]}>No named pattern</Text>
      )}

      {evidence.sink_account && (
        <View style={styles.sink}>
          <Text style={styles.sinkLabel}>Converging on</Text>
          <Text style={styles.sinkValue}>{evidence.sink_account}</Text>
        </View>
      )}

      <View style={styles.block}>
        <Label>Structure</Label>
        <Fact
          label="Distinct senders converging"
          value={s.convergence_count ?? "—"}
        />
        <Fact label="Accounts already known as mules" value={s.mules_in_subgraph ?? "—"} />
        <Fact
          label="Senders with no prior history"
          value={s.fresh_sender_ratio != null ? percent(s.fresh_sender_ratio, 1) : "—"}
        />
        <Fact
          label="Mean drain ratio"
          value={s.mean_drain_ratio != null ? percent(s.mean_drain_ratio, 1) : "—"}
        />
      </View>

      {nodes.length > 0 && (
        <View style={styles.block}>
          <Label>Implicated accounts · {nodes.length}</Label>
          {nodes.slice(0, 8).map((n, i) => (
            <View key={n.account_id ?? i} style={styles.node}>
              <View
                style={[
                  styles.nodeDot,
                  n.is_mule && { backgroundColor: modality.graph },
                ]}
              />
              <Text style={styles.nodeId}>{n.account_id ?? "—"}</Text>
              {n.role && <Text style={styles.nodeRole}>{n.role}</Text>}
            </View>
          ))}
          {nodes.length > 8 && <Note>and {nodes.length - 8} more</Note>}
        </View>
      )}

      {edges.length > 0 && (
        <View style={styles.block}>
          <Label>Flows · {edges.length}</Label>
          {edges.slice(0, 6).map((e, i) => (
            <View key={i} style={styles.edge}>
              <Text style={styles.edgePath} numberOfLines={1}>
                {account(e.source)} → {account(e.target)}
              </Text>
              <Text style={styles.edgeAmount}>{money(e.amount)}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pattern: {
    color: modality.graph,
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.3,
  },

  sink: { marginTop: space.md },
  sinkLabel: {
    color: text.muted,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  sinkValue: { ...mono, color: text.primary, fontSize: 14, marginTop: 3 },

  block: {
    marginTop: space.xl,
    paddingTop: space.lg,
    borderTopWidth: 1,
    borderTopColor: bg.border,
  },

  node: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginTop: space.sm,
  },
  nodeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: modality.graph,
  },
  nodeId: { ...mono, color: text.secondary, fontSize: 12, flex: 1 },
  nodeRole: { color: text.faint, fontSize: 11 },

  edge: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    marginTop: space.sm,
  },
  edgePath: { ...mono, color: text.secondary, fontSize: 12, flex: 1 },
  edgeAmount: { ...mono, color: text.muted, fontSize: 11 },
});
