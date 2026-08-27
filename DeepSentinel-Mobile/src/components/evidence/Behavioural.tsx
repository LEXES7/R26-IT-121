import { StyleSheet, Text, View } from "react-native";

import type { BehaviouralEvidence, Share } from "../../api/analyses";
import { readable, score } from "../../lib/format";
import { bg, modality, mono, risk, space, text } from "../../theme/tokens";
import { Fact, Label, Note, ScoreBar, ShareRow } from "../ui";

/**
 * The stratified VAE's account of its own score.
 *
 * This detector's evidence is a decomposition, not a structure: which stratum
 * model answered, how the three terms of the score combined, and which input
 * features and latent dimensions carried the anomaly. All of it is read out of
 * the model's own objective — nothing here is a separate explainer's guess at
 * what the model might have been doing.
 */
export default function Behavioural({ evidence }: { evidence: BehaviouralEvidence }) {
  const d = evidence.vae_diagnostics ?? {};
  const fp = evidence.fingerprint ?? {};
  const typ = evidence.fraud_typology ?? {};
  const meta = evidence.metadata ?? {};
  const w = d.weights ?? {};

  const terms = [
    { key: "Reconstruction", z: d.recon_z, weight: w.alpha, hint: "features the model could not rebuild" },
    { key: "KL divergence", z: d.kl_z, weight: w.beta, hint: "latent dimensions that departed from the prior" },
    { key: "Latent density", z: d.density_z, weight: w.gamma, hint: "distance from where normal traffic sits" },
  ];
  const contributions = terms.map((t) => (t.z ?? 0) * (t.weight ?? 0));
  const total = contributions.reduce((a, b) => a + Math.abs(b), 0) || 1;

  return (
    <View>
      {d.out_of_training_distribution && (
        <View style={styles.caveat}>
          <Text style={styles.caveatTitle}>Outside the training distribution</Text>
          <Text style={styles.caveatBody}>
            No model was fitted for this transaction type, so the pooled model
            answered. The score is an extrapolation and should not be read as a
            measurement.
          </Text>
        </View>
      )}

      <View style={styles.headline}>
        <View style={styles.headlineItem}>
          <Text style={styles.headlineValue}>{score(d.raw_score, 4)}</Text>
          <Text style={styles.headlineLabel}>anomaly</Text>
        </View>
        <Text style={styles.versus}>vs</Text>
        <View style={styles.headlineItem}>
          <Text style={[styles.headlineValue, styles.threshold]}>
            {score(d.threshold, 4)}
          </Text>
          <Text style={styles.headlineLabel}>threshold</Text>
        </View>
        <View style={styles.flagged}>
          <Text
            style={[
              styles.flaggedText,
              { color: d.flagged ? risk.CRITICAL : risk.LOW },
            ]}
          >
            {d.flagged ? "FLAGGED" : "CLEAR"}
          </Text>
        </View>
      </View>

      <Label>How the score was built</Label>
      <Note>
        Three standardised terms, weighted and summed. The bar is each term's
        share of the total, so a large term with a small weight is not mistaken
        for the reason.
      </Note>
      {terms.map((t, i) => (
        <View key={t.key} style={styles.term}>
          <View style={styles.termHead}>
            <Text style={styles.termName}>{t.key}</Text>
            <Text style={styles.termMath}>
              {score(t.z, 3)} × {score(t.weight, 2)}
            </Text>
          </View>
          <ScoreBar
            value={Math.abs(contributions[i]) / total}
            colour={modality.behavioral}
            height={5}
          />
          <Text style={styles.termHint}>{t.hint}</Text>
        </View>
      ))}

      <Signal
        title="Signal 1 — reconstruction error"
        subtitle="Which input features the model failed to rebuild"
        dominant={fp.signal_1_reconstruction_error?.dominant_feature_signal}
        shares={fp.signal_1_reconstruction_error?.shares}
      />
      <Signal
        title="Signal 2 — KL divergence"
        subtitle="Which latent dimensions departed from the prior"
        dominant={fp.signal_2_kl_divergence?.dominant_dimension_signal}
        shares={fp.signal_2_kl_divergence?.shares}
      />
      <Signal
        title="Signal 3 — latent density"
        subtitle="Where the transaction sits relative to normal traffic"
        dominant={fp.signal_3_latent_density?.dominant_dimension_signal}
        shares={fp.signal_3_latent_density?.shares}
      />

      <View style={styles.block}>
        <Label>Typology</Label>
        {typ.typology_label && typ.typology_label !== "UNASSIGNED" ? (
          <>
            <Text style={styles.typology}>{typ.typology_label}</Text>
            <Fact label="Cluster" value={`#${typ.cluster_id} · ${typ.cluster_size ?? "—"} members`} />
            <Fact label="FATF" value={typ.fatf_hint ?? "—"} />
            <Fact label="Fraud purity" value={score(typ.cluster_fraud_purity, 3)} />
          </>
        ) : (
          <>
            <Text style={[styles.typology, { color: text.muted }]}>No match</Text>
            <Note>
              {typ.rationale ??
                "The fingerprint fell outside every discovered cluster."}
            </Note>
          </>
        )}
        {typ.discovery && <Note>{typ.discovery}</Note>}
      </View>

      <View style={styles.block}>
        <Label>Model</Label>
        <Fact label="Stratum" value={d.stratum ?? evidence.transaction_type ?? "—"} />
        <Fact label="Feature set" value={evidence.feature_set ?? "—"} monospace />
        <Fact label="Bundle" value={meta.bundle ?? "—"} monospace />
        <Fact label="Calibration" value={d.calibration_method ?? "—"} />
        <Fact label="Operating point" value={d.operating_point ?? "—"} />
        <Fact label="Version" value={evidence.model_version ?? "—"} monospace />
        <Fact
          label="Inference"
          value={meta.inference_latency_ms != null ? `${meta.inference_latency_ms} ms` : "—"}
        />
      </View>
    </View>
  );
}

function Signal({
  title,
  subtitle,
  dominant,
  shares,
}: {
  title: string;
  subtitle: string;
  dominant?: string | null;
  shares?: Share[];
}) {
  if (!shares?.length) return null;
  return (
    <View style={styles.block}>
      <Label>{title}</Label>
      <Text style={styles.signalSubtitle}>{subtitle}</Text>
      {shares.slice(0, 5).map((s, i) => (
        <ShareRow
          key={`${s.feature ?? s.dimension ?? i}`}
          name={readable(s.feature ?? s.dimension ?? "—")}
          value={s.share}
          colour={modality.behavioral}
        />
      ))}
      {dominant && <Note>{dominant}</Note>}
    </View>
  );
}

const styles = StyleSheet.create({
  caveat: {
    borderWidth: 1,
    borderColor: risk.MEDIUM,
    backgroundColor: "rgba(234, 179, 8, 0.08)",
    borderRadius: 8,
    padding: space.md,
    marginBottom: space.lg,
  },
  caveatTitle: { color: risk.MEDIUM, fontSize: 13, fontWeight: "700" },
  caveatBody: {
    color: text.secondary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: space.xs,
  },

  headline: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: space.md,
    marginBottom: space.xl,
  },
  headlineItem: { alignItems: "flex-start" },
  headlineValue: { ...mono, color: text.primary, fontSize: 22, fontWeight: "700" },
  threshold: { color: text.muted, fontSize: 16 },
  headlineLabel: { color: text.faint, fontSize: 10, textTransform: "uppercase", letterSpacing: 1 },
  versus: { color: text.faint, fontSize: 12, marginBottom: 4 },
  flagged: { flex: 1, alignItems: "flex-end" },
  flaggedText: { fontSize: 11, fontWeight: "700", letterSpacing: 1 },

  term: { marginTop: space.md },
  termHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: space.xs,
  },
  termName: { color: text.secondary, fontSize: 13 },
  termMath: { ...mono, color: text.muted, fontSize: 11 },
  termHint: { color: text.faint, fontSize: 11, marginTop: 3 },

  block: {
    marginTop: space.xl,
    paddingTop: space.lg,
    borderTopWidth: 1,
    borderTopColor: bg.border,
  },
  signalSubtitle: { color: text.faint, fontSize: 11, marginTop: 3 },
  typology: {
    color: modality.behavioral,
    fontSize: 15,
    fontWeight: "700",
    marginTop: space.sm,
  },
});
