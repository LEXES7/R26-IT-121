import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type {
  Analysis,
  BehaviouralEvidence as BehaviouralShape,
  GraphEvidence as GraphShape,
  TemporalEvidence as TemporalShape,
} from "../api/analyses";
import Behavioural from "../components/evidence/Behavioural";
import Graph from "../components/evidence/Graph";
import Temporal from "../components/evidence/Temporal";
import { Card, Fact, Label, MODALITIES, Note, RiskBadge, ScoreBar, Section } from "../components/ui";
import { ago, money, score } from "../lib/format";
import { bg, mono, radius, riskColour, space, text } from "../theme/tokens";

type Props = {
  row: Analysis;
  onBack: () => void;
  /** Evidence, when the caller has it. The analysis list does not serve it. */
  evidence?: {
    behavioural?: BehaviouralShape | null;
    graph?: GraphShape | null;
    temporal?: TemporalShape | null;
  };
  /**
   * Which detectors answered. `/analyze` reports this and the analysis list
   * does not, so it is optional rather than assumed — a missing flag means
   * unknown, which is not the same as a detector having been absent.
   */
  available?: { behavioral: boolean; graph: boolean; temporal: boolean };
  /**
   * The dataset's own label, when the transaction came from the sample set.
   * Shown beside the score, never fed to a model.
   */
  groundTruth?: boolean;
};

/**
 * One screened transaction, in the order an analyst asks about it: what was
 * decided, how much of the system stood behind that decision, and then — for
 * whoever wants it — why each detector said what it said.
 */

/**
 * Whether a classification and a label point the same way.
 *
 * MEDIUM is deliberately not counted as agreement with either. The band exists
 * for transactions the system will not commit on, and scoring it as a hit or a
 * miss would report a decision that was not made.
 */
function agrees(classification: string, isFraud: boolean): boolean {
  const c = (classification ?? "").toUpperCase();
  return isFraud ? c === "CRITICAL" || c === "HIGH" : c === "LOW";
}
export default function CaseScreen({
  row,
  onBack,
  evidence,
  available,
  groundTruth,
}: Props) {
  const colour = riskColour(row.classification);
  const used = row.modalities_used ?? 0;
  const penalised = used < 3;

  const scores: Record<string, number | null> = {
    behavioral: row.behavioral_score,
    graph: row.graph_score,
    temporal: row.temporal_score,
  };

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={bg.canvas} />
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={onBack} hitSlop={12} style={styles.back}>
          <Text style={styles.backText}>← Alerts</Text>
        </Pressable>

        <Card>
          <View style={styles.verdictTop}>
            <RiskBadge level={row.classification} />
            <Text style={styles.time}>{ago(row.created_at)}</Text>
          </View>

          <Text style={[styles.confidence, { color: colour }]}>
            {score(row.fraud_confidence_score)}
          </Text>
          <Text style={styles.confidenceLabel}>fraud confidence</Text>

          <View style={styles.bar}>
            <ScoreBar value={row.fraud_confidence_score} colour={colour} height={6} />
          </View>

          <View style={styles.detectorLine}>
            <Text style={styles.detectorCount}>{used} of 3 detectors answered</Text>
          </View>
          {penalised && (
            <Note>
              An uncertainty penalty was applied. A confidence built from{" "}
              {used === 1 ? "one detector" : `${used} detectors`} is not the same
              claim as one built from three, and the score was made deliberately
              conservative to say so.
            </Note>
          )}

          <View style={styles.divider} />

          <Fact label="Transaction" value={row.transaction_id} monospace />
          <Fact label="Type" value={row.type ?? "—"} />
          <Fact label="Amount" value={money(row.amount)} monospace />
          <Fact label="From" value={row.nameOrig ?? "—"} monospace />
          <Fact label="To" value={row.nameDest ?? "—"} monospace />
          {row.typology_name && (
            <Fact
              label="Retrieved typology"
              value={`${row.typology_name}${row.typology_id ? ` · ${row.typology_id}` : ""}`}
            />
          )}
          {row.mock_scenario && (
            <View style={styles.mock}>
              <Text style={styles.mockText}>
                SIMULATED · scenario "{row.mock_scenario}" — not a real detection
              </Text>
            </View>
          )}
        </Card>

        {groundTruth !== undefined && (
          <Card>
            <Label>Against the dataset's label</Label>
            <View style={styles.truthRow}>
              <Text
                style={[
                  styles.truthValue,
                  { color: groundTruth ? riskColour("CRITICAL") : riskColour("LOW") },
                ]}
              >
                {groundTruth ? "Labelled fraud" : "Labelled normal"}
              </Text>
              <Text style={styles.truthCall}>
                {agrees(row.classification, groundTruth) ? "agrees" : "disagrees"}
              </Text>
            </View>
            <Note>
              PaySim carries a label for every row. It is held out of screening
              entirely — the models never see it — and shown here only so a
              score can be read against it. One transaction is an illustration,
              not a measurement of accuracy.
            </Note>
          </Card>
        )}

        <Card>
          <Label>Model contributions</Label>
          <Note>
            Each detector's own score, before fusion. A detector that could not
            answer is imputed at 0.5 and excluded from the fused score rather
            than counted as a vote for innocence.
          </Note>
          {MODALITIES.map(([key, label, tone]) => {
            const answered = available?.[key];
            const absent = answered === false;
            return (
              <View key={key} style={styles.modalityRow}>
                <View
                  style={[
                    styles.modalityAccent,
                    { backgroundColor: absent ? bg.borderStrong : tone },
                  ]}
                />
                <View style={styles.modalityText}>
                  <Text style={[styles.modalityName, absent && styles.absent]}>
                    {label}
                  </Text>
                  {absent && (
                    <Text style={styles.modalityNote}>
                      Not deployed · imputed 0.5, excluded
                    </Text>
                  )}
                </View>
                <Text style={[styles.modalityScore, absent && styles.absent]}>
                  {absent ? "—" : score(scores[key])}
                </Text>
              </View>
            );
          })}
          {!available && (
            <Note>
              Which of the three answered is not carried in the analysis list,
              so these cannot be marked individually — only the count above is
              certain.
            </Note>
          )}
        </Card>

        <Section
          title="Behavioural attribution"
          subtitle="Stratified VAE · dual-signal"
          accent={MODALITIES[0][2]}
          initiallyOpen
          disabled={!evidence?.behavioural}
        >
          {evidence?.behavioural && <Behavioural evidence={evidence.behavioural} />}
        </Section>

        <Section
          title="Graph evidence"
          subtitle="Edge-enhanced GraphSAGE · subgraph"
          accent={MODALITIES[1][2]}
          disabled={!evidence?.graph}
        >
          {evidence?.graph && <Graph evidence={evidence.graph} />}
        </Section>

        <Section
          title="Temporal evidence"
          subtitle="TS-TCN · peak attention"
          accent={MODALITIES[2][2]}
          disabled={!evidence?.temporal}
        >
          {evidence?.temporal && (
            <Temporal evidence={evidence.temporal} value={row.temporal_score} />
          )}
        </Section>

        {!evidence?.behavioural && !evidence?.graph && !evidence?.temporal && (
          <Card style={styles.gap}>
            <Label>Why the panels are empty</Label>
            <Note>
              The detectors return their attribution with every score, and the
              monitor now stores the behavioural decomposition on the case. The
              analysis list does not serve it back yet, so there is nothing for
              these panels to read. They are built and waiting: the moment a
              stored case is served with its evidence, they fill in.
            </Note>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: bg.canvas },
  content: { padding: space.lg, gap: space.md, paddingBottom: space.xxl },

  back: { paddingVertical: space.sm },
  backText: { color: text.secondary, fontSize: 14 },

  verdictTop: { flexDirection: "row", alignItems: "center" },
  time: { color: text.faint, fontSize: 11, marginLeft: "auto" },

  confidence: {
    ...mono,
    fontSize: 40,
    fontWeight: "700",
    marginTop: space.md,
    letterSpacing: -1,
  },
  confidenceLabel: {
    color: text.muted,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  bar: { marginTop: space.md },

  detectorLine: { marginTop: space.lg },
  detectorCount: { color: text.secondary, fontSize: 13, fontWeight: "600" },

  divider: {
    height: 1,
    backgroundColor: bg.border,
    marginTop: space.lg,
    marginBottom: space.sm,
  },

  mock: {
    marginTop: space.lg,
    borderWidth: 1,
    borderColor: text.faint,
    borderRadius: radius.sm,
    padding: space.sm,
  },
  mockText: { color: text.muted, fontSize: 10, letterSpacing: 0.5 },

  modalityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    marginTop: space.md,
  },
  modalityAccent: { width: 3, height: 18, borderRadius: 2 },
  modalityText: { flex: 1 },
  modalityName: { color: text.secondary, fontSize: 14 },
  modalityNote: { color: text.faint, fontSize: 11, marginTop: 2 },
  modalityScore: { ...mono, color: text.primary, fontSize: 15, fontWeight: "600" },
  absent: { color: text.faint },

  truthRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: space.md,
    marginTop: space.md,
  },
  truthValue: { fontSize: 16, fontWeight: "700", flex: 1 },
  truthCall: { color: text.muted, fontSize: 12 },

  gap: { borderStyle: "dashed" },
});
