import { StyleSheet, Text, View } from "react-native";

import type { GraphEvidence } from "../../api/analyses";
import { percent } from "../../lib/format";
import { bg, modality, mono, space, text, themed } from "../../theme/tokens";
import NetworkGraph from "../NetworkGraph";
import { Fact, Label } from "../ui";

/**
 * The relational model's subgraph — M2's component.
 *
 * This evidence is a structure rather than a decomposition: which accounts are
 * implicated, which one the money converges on, and the shape the pattern
 * makes. The structure is drawn rather than listed, so the convergence the
 * pattern names is something the reader can see.
 */
export default function Graph({ evidence }: { evidence: GraphEvidence }) {
  const s = evidence.structural_evidence ?? {};

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
          value={s.convergence_count ?? "-"}
        />
        <Fact label="Accounts already known as mules" value={s.mules_in_subgraph ?? "-"} />
        <Fact
          label="Senders with no prior history"
          value={s.fresh_sender_ratio != null ? percent(s.fresh_sender_ratio, 1) : "-"}
        />
        <Fact
          label="Mean drain ratio"
          value={s.mean_drain_ratio != null ? percent(s.mean_drain_ratio, 1) : "-"}
        />
      </View>

      <View style={styles.block}>
        <Label>Network</Label>
        <View style={styles.network}>
          <NetworkGraph evidence={evidence as Record<string, unknown>} />
        </View>
      </View>
    </View>
  );
}

const styles = themed(() => ({
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

  network: { marginTop: space.md },
}));
