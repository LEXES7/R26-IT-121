import { Ionicons } from "@expo/vector-icons";
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
import { Button, confirmTap, type IconName } from "../components/ios";
import Behavioural from "../components/evidence/Behavioural";
import Graph from "../components/evidence/Graph";
import Temporal from "../components/evidence/Temporal";
import { Card, Fact, Label, MODALITIES, Note, ScoreBar, Section } from "../components/ui";
import { account, ago, score } from "../lib/format";
import { accent, bg, font, modality, mono, radius, riskColour, space, statusBar, text, themed } from "../theme/tokens";
import { reviewColour } from "./CasesScreen";

/**
 * One recorded case, and the analyst's decision on it.
 *
 * The decision is the point of the screen, so it sits directly under the
 * verdict rather than after the evidence. Confirmed fraud and false positive
 * are what a retraining set is built from, so those two ask before they are
 * recorded; the server attributes and audits every one.
 */

const ACTIONS: { status: ReviewStatus; label: string; confirm: boolean; icon: IconName }[] = [
  { status: "investigating", label: "Investigate", confirm: false, icon: "search" },
  { status: "closed", label: "Close", confirm: false, icon: "archive-outline" },
  { status: "false_positive", label: "False positive", confirm: true, icon: "close-circle-outline" },
  { status: "confirmed_fraud", label: "Confirm fraud", confirm: true, icon: "alert-circle" },
];

const RISK_WORD: Record<string, string> = {
  CRITICAL: "Critical",
  HIGH: "High risk",
  MEDIUM: "Medium risk",
  LOW: "Low risk",
};

/** What each detector reads, in a line, beside the model that reads it. */
const DETECTOR: Record<"behavioral" | "graph" | "temporal", { model: string; reads: string; icon: IconName }> = {
  graph: { model: "GraphSAGE", reads: "Who pays whom, two hops out", icon: "git-network-outline" },
  behavioral: { model: "VAE", reads: "How this transaction behaves for its type", icon: "pulse-outline" },
  temporal: { model: "TCN", reads: "The 32 transactions before it", icon: "time-outline" },
};

export default function CaseDeskScreen({
  caseRef,
  onBack,
  backLabel = "Cases",
  onTrace,
}: {
  caseRef: string;
  onBack: () => void;
  backLabel?: string;
  /** Opens the money trail of this case as a full-screen scene. */
  onTrace?: () => void;
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
        <StatusBar barStyle={statusBar()} backgroundColor={bg.canvas} />
        <TopBar caseRef={caseRef} backLabel={backLabel} onBack={onBack} />
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
  const used = c.modalities_used ?? MODALITIES.filter(([k]) => answered[k] !== false).length;
  const pct = typeof c.fused_score === "number" ? Math.round(c.fused_score * 100) : null;

  return (
    <SafeAreaView edges={["top"]} style={styles.screen}>
      <StatusBar barStyle={statusBar()} backgroundColor={bg.canvas} />
      <TopBar caseRef={c.case_ref} backLabel={backLabel} onBack={onBack} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.verdict}>
            <View style={styles.verdictTop}>
              <View style={styles.refChip}>
                <Text style={styles.refChipText}>{c.case_ref}</Text>
              </View>
              <View style={[styles.sevChip, { backgroundColor: `${colour}24` }]}>
                <View style={[styles.sevDot, { backgroundColor: colour }]} />
                <Text style={[styles.sevText, { color: colour }]}>
                  {String(c.classification).toUpperCase()}
                </Text>
              </View>
              <Text style={styles.time}>{ago(c.detected_at)}</Text>
            </View>

            <Text style={styles.kicker}>FUSED PROBABILITY OF FRAUD</Text>
            <View style={styles.bigRow}>
              <Text style={[styles.big, { color: colour }]}>{pct === null ? "-" : `${pct}%`}</Text>
              <Text style={styles.bigWord}>{RISK_WORD[String(c.classification).toUpperCase()] ?? ""}</Text>
            </View>

            <View style={styles.route}>
              <Text style={styles.routeText} numberOfLines={1}>
                {c.transaction_id}
              </Text>
              {c.sink_account ? (
                <>
                  <Ionicons name="arrow-forward" size={13} color={text.muted} />
                  <Text style={[styles.routeText, { color: accent.base }]} numberOfLines={1}>
                    {account(c.sink_account)}
                  </Text>
                </>
              ) : null}
            </View>

            {onTrace && (c.graph_evidence as { nodes?: unknown[] } | null)?.nodes?.length ? (
              <View style={{ marginTop: 14 }}>
                <Button title="Trace the money" kind="tinted" icon="git-network-outline" onPress={onTrace} />
              </View>
            ) : null}

            <View style={styles.ensemble}>
              <View style={styles.ensembleHead}>
                <Text style={styles.ensembleLabel}>THREE-DETECTOR ENSEMBLE</Text>
                <View style={styles.consensus}>
                  <Ionicons name="git-network-outline" size={13} color={accent.base} />
                  <Text style={styles.consensusText}>{used}/3 answered</Text>
                </View>
              </View>
              <ScoreBar value={c.fused_score} colour={colour} height={8} />
              <View style={styles.scale}>
                <Text style={styles.scaleText}>0</Text>
                <Text style={styles.scaleText}>50</Text>
                <Text style={[styles.scaleText, { color: colour }]}>{pct ?? "-"}</Text>
              </View>
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
          </View>

          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Detectors</Text>
            <Text style={styles.sectionNote}>each judged alone</Text>
          </View>
          {MODALITIES.map(([key, label]) => {
            const tone = modality[key];
            const absent = answered[key] === false;
            const info = DETECTOR[key];
            return (
              <View key={key} style={[styles.detector, absent && { opacity: 0.55 }]}>
                <View style={[styles.detIcon, { backgroundColor: absent ? bg.elevated : `${tone}24` }]}>
                  <Ionicons name={info.icon} size={20} color={absent ? text.faint : tone} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.detTop}>
                    <Text style={styles.detName}>{label}</Text>
                    <View style={styles.modelTag}>
                      <Text style={styles.modelTagText}>{info.model}</Text>
                    </View>
                  </View>
                  <Text style={styles.detWhat}>{info.reads}</Text>
                </View>
                <Text style={[styles.detScore, absent ? styles.absent : { color: tone }]}>
                  {absent ? "off" : score(scores[key], 2)}
                </Text>
              </View>
            );
          })}

          <Section
            title="Network"
            subtitle={
              c.graph_pattern && c.graph_pattern !== "UNKNOWN"
                ? c.graph_pattern.replace(/_/g, " ").toLowerCase()
                : "Edge-enhanced GraphSAGE · subgraph"
            }
            accent={modality.graph}
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
            accent={modality.behavioral}
            disabled={!c.behavioral_evidence}
          >
            {c.behavioral_evidence && <Behavioural evidence={c.behavioral_evidence} />}
          </Section>

          <Section
            title="Temporal evidence"
            subtitle="TS-TCN · peak attention"
            accent={modality.temporal}
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
            <Text style={styles.noteHint}>The note goes with the decision you choose below.</Text>
            {c.label_is_fraud !== null && (
              <Note>
                The dataset labels this transaction{" "}
                {c.label_is_fraud ? "fraud" : "normal"}. It is held out of screening and shown so
                a verdict can be checked against it.
              </Note>
            )}
          </Card>
        </ScrollView>

        <View style={styles.dock}>
          {ACTIONS.map((a) => {
            const current = a.status === status;
            const tone = reviewColour(a.status);
            const wide = a.status === "confirmed_fraud" || a.status === "false_positive";
            const fraud = a.status === "confirmed_fraud";
            return (
              <Pressable
                key={a.status}
                onPress={() => act(a)}
                disabled={saving !== null || current}
                accessibilityRole="button"
                accessibilityLabel={current ? `${a.label}, current status` : a.label}
                accessibilityState={{ disabled: saving !== null || current, selected: current }}
                style={({ pressed }) => [
                  wide ? styles.dockWide : styles.dockRound,
                  fraud && { backgroundColor: `${riskColour("CRITICAL")}29` },
                  current && { borderWidth: 1.5, borderColor: tone },
                  (pressed || (saving !== null && saving !== a.status)) && { opacity: 0.6 },
                ]}
              >
                {saving === a.status ? (
                  <ActivityIndicator size="small" color={text.secondary} />
                ) : (
                  <>
                    <Ionicons
                      name={a.icon}
                      size={wide ? 17 : 20}
                      color={fraud ? riskColour("CRITICAL") : current ? tone : text.secondary}
                    />
                    {wide && (
                      <Text
                        style={[styles.dockText, fraud && { color: riskColour("CRITICAL") }, current && { color: tone }]}
                        numberOfLines={1}
                      >
                        {a.label}
                      </Text>
                    )}
                  </>
                )}
              </Pressable>
            );
          })}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** A round back button and the case reference, in place of the plain bar. */
function TopBar({ caseRef, backLabel, onBack }: { caseRef: string; backLabel: string; onBack: () => void }) {
  return (
    <View style={styles.topBar}>
      <Pressable
        onPress={onBack}
        hitSlop={8}
        style={({ pressed }) => [styles.backRound, pressed && { opacity: 0.6 }]}
        accessibilityRole="button"
        accessibilityLabel={`Back to ${backLabel}`}
      >
        <Ionicons name="chevron-back" size={22} color={text.primary} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={styles.topTitle}>Case</Text>
        <Text style={styles.topRef} numberOfLines={1}>
          {caseRef}
        </Text>
      </View>
    </View>
  );
}

const styles = themed(() => ({
  screen: { flex: 1, backgroundColor: bg.canvas },
  content: { padding: space.lg, gap: space.md, paddingBottom: space.xxl },

  topBar: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: space.lg, paddingVertical: 8 },
  backRound: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: bg.card,
    borderWidth: 1,
    borderColor: bg.border,
    alignItems: "center",
    justifyContent: "center",
  },
  topTitle: { color: text.primary, fontSize: 20, fontWeight: "700", letterSpacing: -0.5 },
  topRef: { ...mono, color: text.muted, fontSize: 12 },

  verdict: {
    backgroundColor: bg.card,
    borderWidth: 1,
    borderColor: bg.border,
    borderRadius: radius.xl,
    padding: 20,
  },
  verdictTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  refChip: { backgroundColor: bg.elevated, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5, flexShrink: 1 },
  refChipText: { ...mono, color: text.secondary, fontSize: 11 },
  sevChip: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  sevDot: { width: 7, height: 7, borderRadius: 4 },
  sevText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6 },
  time: { ...mono, color: text.muted, fontSize: 11, marginLeft: "auto" },

  kicker: { color: text.muted, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, textAlign: "center", marginTop: 22 },
  bigRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "center", gap: 10, marginTop: 4 },
  big: { fontFamily: font.extrabold, fontSize: 56, letterSpacing: -2.4 },
  bigWord: { color: text.secondary, fontSize: 16, fontWeight: "700" },
  route: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "center",
    maxWidth: "100%",
    backgroundColor: bg.elevated,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginTop: 10,
  },
  routeText: { ...mono, color: text.secondary, fontSize: 12, flexShrink: 1 },

  ensemble: { backgroundColor: bg.elevated, borderRadius: radius.lg, padding: 16, gap: 10, marginTop: 18 },
  ensembleHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  ensembleLabel: { color: text.muted, fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  consensus: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: accent.soft, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  consensusText: { color: accent.base, fontSize: 12, fontWeight: "700" },
  scale: { flexDirection: "row", justifyContent: "space-between" },
  scaleText: { ...mono, color: text.muted, fontSize: 11 },
  divider: { height: 1, backgroundColor: bg.border, marginTop: space.lg, marginBottom: space.sm },

  sectionHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingHorizontal: 4, marginTop: 8 },
  sectionTitle: { color: text.primary, fontSize: 20, fontWeight: "700", letterSpacing: -0.5 },
  sectionNote: { color: text.muted, fontSize: 12, fontWeight: "600" },
  detector: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: bg.card,
    borderWidth: 1,
    borderColor: bg.border,
    borderRadius: radius.lg,
    padding: 16,
  },
  detIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  detTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  detName: { color: text.primary, fontSize: 16, fontWeight: "700" },
  modelTag: { backgroundColor: bg.elevated, borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 2 },
  modelTagText: { ...mono, color: text.secondary, fontSize: 10 },
  detWhat: { color: text.muted, fontSize: 13, marginTop: 3 },
  detScore: { ...mono, fontSize: 17 },
  absent: { color: text.faint },

  statusRow: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.md },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 16, fontWeight: "700" },
  statusBy: { color: text.muted, fontSize: 12, marginLeft: "auto" },
  prevNote: { color: text.secondary, fontSize: 13, fontStyle: "italic", marginTop: space.sm },
  note: {
    marginTop: space.md,
    minHeight: 72,
    backgroundColor: bg.elevated,
    borderRadius: radius.md,
    padding: space.md,
    color: text.primary,
    fontSize: 14,
    textAlignVertical: "top",
  },
  noteHint: { color: text.muted, fontSize: 12, marginTop: 8 },

  dock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: space.lg,
    marginBottom: 4,
    padding: 8,
    borderRadius: radius.pill,
    backgroundColor: bg.card,
    borderWidth: 1,
    borderColor: bg.border,
  },
  dockRound: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: bg.elevated,
    alignItems: "center",
    justifyContent: "center",
  },
  dockWide: {
    flex: 1,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: bg.elevated,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 10,
  },
  dockText: { color: text.primary, fontSize: 14, fontWeight: "700" },

  tlRow: { flexDirection: "row", gap: space.md, marginTop: space.md },
  tlRail: { width: 10, alignItems: "center" },
  tlDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: accent.base, marginTop: 4 },
  tlLine: { flex: 1, width: 1, backgroundColor: bg.borderStrong, marginTop: 2 },
  tlBody: { flex: 1 },
  tlStage: { color: text.primary, fontSize: 14, fontWeight: "600" },
  tlDetail: { color: text.muted, fontSize: 13, marginTop: 2 },
  tlAt: { color: text.muted, fontSize: 12 },
}));
