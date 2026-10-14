import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { GraphEvidence } from "../api/analyses";
import {
  REVIEW_LABEL,
  getCase,
  reviewCase,
  type CaseDetail,
  type ReviewStatus,
} from "../api/cases";
import ForensicReport from "../components/ForensicReport";
import { NavBar, confirmTap } from "../components/ios";
import Behavioural from "../components/evidence/Behavioural";
import Graph from "../components/evidence/Graph";
import Temporal from "../components/evidence/Temporal";
import { Card, Fact, Label, MODALITIES, Note, RiskBadge, ScoreBar, Section } from "../components/ui";
import { ago, score } from "../lib/format";
import { accent, bg, mono, radius, riskColour, space, text } from "../theme/tokens";
import { reviewColour } from "./CasesScreen";

/**
 * One recorded case, and the analyst's decision on it.
 *
 * The decision is the point of the screen, so it sits directly under the
 * verdict rather than after the evidence. Confirmed fraud and false positive
 * are what a retraining set is built from, so those two ask before they are
 * recorded; the server attributes and audits every one.
 */

const ACTIONS: { status: ReviewStatus; label: string; confirm: boolean }[] = [
  { status: "investigating", label: "Investigate", confirm: false },
  { status: "confirmed_fraud", label: "Confirm fraud", confirm: true },
  { status: "false_positive", label: "False positive", confirm: true },
  { status: "closed", label: "Close", confirm: false },
];

export default function CaseDeskScreen({
  caseRef,
  onBack,
  backLabel = "Cases",
}: {
  caseRef: string;
  onBack: () => void;
  backLabel?: string;
}) {
  const [c, setCase] = useState<CaseDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
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
    async (status: ReviewStatus) => {
      setSaving(status);
      try {
        await reviewCase(caseRef, status, note);
        confirmTap();
        setNote("");
        await load();
      } catch (err) {
        Alert.alert("Not recorded", (err as Error).message);
      } finally {
        setSaving(null);
      }
    },
    [caseRef, note, load],
  );

  const act = (a: (typeof ACTIONS)[number]) => {
    if (!a.confirm) return record(a.status);
    Alert.alert(
      `${a.label}?`,
      `${caseRef} will be recorded as ${REVIEW_LABEL[a.status].toLowerCase()} under your name. ` +
        "This verdict is used to build the retraining set.",
      [
        { text: "Cancel", style: "cancel" },
        { text: a.label, style: "destructive", onPress: () => record(a.status) },
      ],
    );
  };

  if (!c) {
    return (
      <SafeAreaView edges={["top"]} style={styles.screen}>
        <StatusBar barStyle="light-content" backgroundColor={bg.canvas} />
        <NavBar title={caseRef} back={{ label: backLabel, onPress: onBack }} />
        <View style={styles.content}>
          {error ? (
            <Card>
              <Label>Cannot open {caseRef}</Label>
              <Note>{error}</Note>
            </Card>
          ) : (
            <ActivityIndicator color={text.muted} style={{ marginTop: space.xxl }} />
          )}
        </View>
      </SafeAreaView>
    );
  }

  const colour = riskColour(c.classification);
  const status = (c.review_status ?? "open") as ReviewStatus;
  const scores: Record<string, number | null> = {
    behavioral: c.behavioral_score,
    graph: c.graph_score,
    temporal: c.temporal_score,
  };
  const answered: Record<string, boolean | null> = {
    behavioral: c.behavioral_available,
    graph: c.graph_available,
    temporal: c.temporal_available,
  };

  return (
    <SafeAreaView edges={["top"]} style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={bg.canvas} />
      <NavBar title={c.case_ref} back={{ label: backLabel, onPress: onBack }} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Card>
            <View style={styles.top}>
              <RiskBadge level={c.classification} />
              <Text style={styles.ref}>{c.case_ref}</Text>
              <Text style={styles.time}>{ago(c.detected_at)}</Text>
            </View>
            <Text style={[styles.confidence, { color: colour }]}>{score(c.fused_score)}</Text>
            <Text style={styles.confidenceLabel}>fused score</Text>
            <View style={{ marginTop: space.md }}>
              <ScoreBar value={c.fused_score} colour={colour} height={6} />
            </View>
            {c.uncertainty_penalty_applied && (
              <Note>
                {c.modalities_used ?? 0} of 3 detectors answered, so the uncertainty penalty was
                applied and this score is deliberately conservative.
              </Note>
            )}
            <View style={styles.divider} />
            <Fact label="Transaction" value={c.transaction_id} monospace />
            {c.sink_account && <Fact label="Converging on" value={c.sink_account} monospace />}
            {c.typology_name && (
              <Fact
                label="Retrieved typology"
                value={`${c.typology_name}${c.typology_id ? ` · ${c.typology_id}` : ""}`}
              />
            )}
            <Fact
              label="Alert email"
              value={c.alert_sent ? `sent ${ago(c.alerted_at)}` : "not sent"}
            />
          </Card>

          <Card>
            <Label>Review</Label>
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, { backgroundColor: reviewColour(status) }]} />
              <Text style={[styles.statusText, { color: reviewColour(status) }]}>
                {REVIEW_LABEL[status] ?? status}
              </Text>
              {c.reviewed_by && (
                <Text style={styles.statusBy}>
                  {c.reviewed_by} · {ago(c.reviewed_at)}
                </Text>
              )}
            </View>
            {c.review_note && <Text style={styles.prevNote}>"{c.review_note}"</Text>}

            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Add a note for the audit trail (optional)"
              placeholderTextColor={text.faint}
              multiline
              maxLength={2000}
              style={styles.note}
            />
            <View style={styles.actions}>
              {ACTIONS.map((a) => {
                const current = a.status === status;
                return (
                  <Pressable
                    key={a.status}
                    onPress={() => act(a)}
                    disabled={saving !== null || current}
                    style={({ pressed }) => [
                      styles.action,
                      { borderColor: current ? reviewColour(a.status) : bg.borderStrong },
                      current && { backgroundColor: `${reviewColour(a.status)}1A` },
                      (pressed || (saving !== null && saving !== a.status)) && { opacity: 0.6 },
                    ]}
                  >
                    {saving === a.status ? (
                      <ActivityIndicator size="small" color={text.secondary} />
                    ) : (
                      <Text
                        style={[
                          styles.actionText,
                          current && { color: reviewColour(a.status) },
                        ]}
                      >
                        {a.label}
                      </Text>
                    )}
                  </Pressable>
                );
              })}
            </View>
            {c.label_is_fraud !== null && (
              <Note>
                The dataset labels this transaction{" "}
                {c.label_is_fraud ? "fraud" : "normal"}. It is held out of screening and shown so
                a verdict can be checked against it.
              </Note>
            )}
          </Card>

          <Card>
            <Label>Detectors</Label>
            {MODALITIES.map(([key, label, tone]) => {
              const absent = answered[key] === false;
              return (
                <View key={key} style={styles.modalityRow}>
                  <View
                    style={[styles.modalityAccent, { backgroundColor: absent ? bg.borderStrong : tone }]}
                  />
                  <Text style={[styles.modalityName, absent && styles.absent]}>{label}</Text>
                  <Text style={[styles.modalityScore, absent && styles.absent]}>
                    {absent ? "did not answer" : score(scores[key])}
                  </Text>
                </View>
              );
            })}
          </Card>

          <Section
            title="Network"
            subtitle={
              c.graph_pattern && c.graph_pattern !== "UNKNOWN"
                ? c.graph_pattern.replace(/_/g, " ").toLowerCase()
                : "Edge-enhanced GraphSAGE · subgraph"
            }
            accent={MODALITIES[1][2]}
            initiallyOpen
            disabled={!c.graph_evidence}
          >
            {c.graph_evidence && <Graph evidence={c.graph_evidence as GraphEvidence} />}
          </Section>

          <Section
            title="Forensic report"
            subtitle="Language model · grounded in the retrieved typology"
            accent={accent.base}
            disabled={!c.forensic_report}
          >
            {c.forensic_report && <ForensicReport report={c.forensic_report} />}
          </Section>

          <Section
            title="Behavioural attribution"
            subtitle="Stratified VAE · dual-signal"
            accent={MODALITIES[0][2]}
            disabled={!c.behavioral_evidence}
          >
            {c.behavioral_evidence && <Behavioural evidence={c.behavioral_evidence} />}
          </Section>

          <Section
            title="Temporal evidence"
            subtitle="TS-TCN · peak attention"
            accent={MODALITIES[2][2]}
            disabled={!c.temporal_evidence}
          >
            {c.temporal_evidence && (
              <Temporal evidence={c.temporal_evidence} value={c.temporal_score} />
            )}
          </Section>

          {c.timeline?.length > 0 && (
            <Card>
              <Label>Timeline</Label>
              {c.timeline.map((t, i) => (
                <View key={`${t.stage}-${i}`} style={styles.tlRow}>
                  <View style={styles.tlRail}>
                    <View style={styles.tlDot} />
                    {i < c.timeline.length - 1 && <View style={styles.tlLine} />}
                  </View>
                  <View style={styles.tlBody}>
                    <Text style={styles.tlStage}>{t.stage}</Text>
                    <Text style={styles.tlDetail}>{t.detail}</Text>
                  </View>
                  <Text style={styles.tlAt}>{ago(t.at)}</Text>
                </View>
              ))}
            </Card>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: bg.canvas },
  content: { padding: space.lg, gap: space.md, paddingBottom: space.xxl },
  back: { paddingVertical: space.sm },
  backText: { color: text.secondary, fontSize: 14 },

  top: { flexDirection: "row", alignItems: "center", gap: space.md },
  ref: { ...mono, color: text.primary, fontSize: 13, fontWeight: "600", flex: 1 },
  time: { color: text.faint, fontSize: 11 },
  confidence: { ...mono, fontSize: 40, fontWeight: "700", marginTop: space.md, letterSpacing: -1 },
  confidenceLabel: { color: text.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1 },
  divider: { height: 1, backgroundColor: bg.border, marginTop: space.lg, marginBottom: space.sm },

  statusRow: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.md },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 16, fontWeight: "700" },
  statusBy: { color: text.faint, fontSize: 11, marginLeft: "auto" },
  prevNote: { color: text.secondary, fontSize: 12, fontStyle: "italic", marginTop: space.sm },
  note: {
    marginTop: space.md,
    minHeight: 64,
    borderWidth: 1,
    borderColor: bg.borderStrong,
    borderRadius: radius.md,
    padding: space.md,
    color: text.primary,
    fontSize: 13,
    textAlignVertical: "top",
  },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.md },
  action: {
    flexGrow: 1,
    flexBasis: "45%",
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: space.md,
    alignItems: "center",
  },
  actionText: { color: text.secondary, fontSize: 13, fontWeight: "600" },

  modalityRow: { flexDirection: "row", alignItems: "center", gap: space.md, marginTop: space.md },
  modalityAccent: { width: 3, height: 18, borderRadius: 2 },
  modalityName: { color: text.secondary, fontSize: 14, flex: 1 },
  modalityScore: { ...mono, color: text.primary, fontSize: 14, fontWeight: "600" },
  absent: { color: text.faint, fontWeight: "400" },

  tlRow: { flexDirection: "row", gap: space.md, marginTop: space.md },
  tlRail: { width: 10, alignItems: "center" },
  tlDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: accent.base, marginTop: 4 },
  tlLine: { flex: 1, width: 1, backgroundColor: bg.borderStrong, marginTop: 2 },
  tlBody: { flex: 1 },
  tlStage: { color: text.primary, fontSize: 13, fontWeight: "600" },
  tlDetail: { color: text.muted, fontSize: 12, marginTop: 2 },
  tlAt: { color: text.faint, fontSize: 11 },
});
