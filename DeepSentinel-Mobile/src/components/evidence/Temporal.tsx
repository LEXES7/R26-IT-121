import { StyleSheet, Text, View } from "react-native";

import type { TemporalEvidence } from "../../api/analyses";
import { percent, readable, score } from "../../lib/format";
import { bg, modality, mono, risk, space, text } from "../../theme/tokens";
import { Fact, Label, Note, ScoreBar } from "../ui";

/**
 * The temporal model's peak-attention evidence — M3's component.
 *
 * The fused response carries one predecessor, not the full 32-position
 * attention vector, so this shows a single weighted position rather than
 * pretending to a distribution. Built now so the panel is waiting when the
 * temporal service comes up.
 */

/** Mirrors TS-TCN/api/constants.py. Not carried in the fused response today. */
const THRESHOLD_SUSPICIOUS = 0.4431;
const THRESHOLD_CRITICAL = 0.9;

function level(value: number | null | undefined): string | null {
  if (typeof value !== "number") return null;
  if (value >= THRESHOLD_CRITICAL) return "CRITICAL";
  if (value >= THRESHOLD_SUSPICIOUS) return "SUSPICIOUS";
  return "NORMAL";
}

const TONE: Record<string, string> = {
  NORMAL: risk.LOW,
  SUSPICIOUS: risk.MEDIUM,
  CRITICAL: risk.CRITICAL,
};

export default function Temporal({
  evidence,
  value,
}: {
  evidence: TemporalEvidence;
  value?: number | null;
}) {
  const band = level(value);
  const features = Object.entries(evidence.peak_features ?? {});

  return (
    <View>
      {band && (
        <Text style={[styles.band, { color: TONE[band] }]}>{band}</Text>
      )}

      {typeof evidence.step_burstiness === "number" && (
        <View style={styles.burst}>
          <View style={styles.burstHead}>
            <Text style={styles.burstLabel}>Step burstiness</Text>
            <Text style={styles.burstValue}>
              {score(evidence.step_burstiness, 4)}
            </Text>
          </View>
          <Note>
            The Goh–Barabási B coefficient. Above zero the transactions arrive in
            bursts; below, at regular intervals. Machine-regular timing is the
            signal here, not volume.
          </Note>
        </View>
      )}

      <View style={styles.block}>
        <Label>Peak predecessor</Label>
        <Note>
          Which of the 32 transactions before this one the attention head
          weighted most.
        </Note>
        {typeof evidence.attention_weight === "number" && (
          <View style={styles.weight}>
            <View style={styles.weightHead}>
              <Text style={styles.weightLabel}>Attention weight</Text>
              <Text style={styles.weightValue}>
                {percent(evidence.attention_weight, 1)}
              </Text>
            </View>
            <ScoreBar
              value={evidence.attention_weight}
              colour={modality.temporal}
              height={5}
            />
          </View>
        )}
        <Fact label="Transaction" value={evidence.composite_id ?? "—"} monospace />
        <Fact
          label="Position"
          value={
            evidence.offset_from_current != null
              ? `${evidence.offset_from_current} before this one`
              : "—"
          }
        />
        {evidence.predecessor_signal && (
          <Text style={styles.signal}>{evidence.predecessor_signal}</Text>
        )}
      </View>

      {features.length > 0 && (
        <View style={styles.block}>
          <Label>Features at that position</Label>
          {features.slice(0, 8).map(([name, v]) => (
            <Fact key={name} label={readable(name)} value={score(v, 4)} monospace />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  band: { fontSize: 15, fontWeight: "700", letterSpacing: 1 },

  burst: { marginTop: space.md },
  burstHead: { flexDirection: "row", justifyContent: "space-between" },
  burstLabel: { color: text.secondary, fontSize: 13 },
  burstValue: { ...mono, color: text.primary, fontSize: 14, fontWeight: "600" },

  block: {
    marginTop: space.xl,
    paddingTop: space.lg,
    borderTopWidth: 1,
    borderTopColor: bg.border,
  },

  weight: { marginTop: space.md, marginBottom: space.sm },
  weightHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: space.xs,
  },
  weightLabel: { color: text.secondary, fontSize: 13 },
  weightValue: { ...mono, color: text.primary, fontSize: 13 },

  signal: {
    color: text.secondary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: space.md,
  },
});
