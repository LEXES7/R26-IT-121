import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { analyse, type AnalyzeResponse } from "../api/analyze";
import { NetworkError } from "../api/client";
import { SAMPLES, type Sample } from "../data/samples";
import { account, money } from "../lib/format";
import { accent, bg, mono, radius, risk, space, text } from "../theme/tokens";
import { statusBarInset } from "../theme/layout";
import { Card, Fact, Label, Note } from "../components/ui";

type Props = {
  onResult: (result: AnalyzeResponse, sample: Sample) => void;
};

/**
 * Screen a transaction from the phone.
 *
 * This is the one path that returns the detectors' evidence today, so it is
 * also the only place the behavioural decomposition can be seen end to end
 * without a change to the backend.
 *
 * The transactions are real PaySim rows rather than a form. A form invites
 * numbers that never occur in the data — a transfer that leaves the origin
 * balance unchanged, say — and a model asked about an impossible transaction
 * gives an answer that means nothing.
 */
export default function AnalyzeScreen({ onResult }: Props) {
  const [selected, setSelected] = useState<Sample>(SAMPLES[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const result = await analyse(selected.transaction);
      onResult(result, selected);
    } catch (err) {
      setError(
        err instanceof NetworkError
          ? `${(err as Error).message} Screening runs three detectors and a report, so it is slower than the rest of the app.`
          : (err as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }

  const t = selected.transaction;

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={bg.canvas} />
      <ScrollView contentContainerStyle={styles.content}>
        <View>
          <Text style={styles.title}>Screen a transaction</Text>
          <Text style={styles.subtitle}>
            Real PaySim rows from the platform's own sample file
          </Text>
        </View>

        <View style={styles.samples}>
          {SAMPLES.map((s) => {
            const on = s.label === selected.label;
            return (
              <Pressable
                key={s.label}
                onPress={() => !busy && setSelected(s)}
                style={[styles.sample, on && styles.sampleOn]}
              >
                <View style={styles.sampleHead}>
                  <Text style={[styles.sampleLabel, on && styles.sampleLabelOn]}>
                    {s.label}
                  </Text>
                  <Text style={styles.sampleType}>{s.transaction.type}</Text>
                </View>
                <Text style={styles.sampleAmount}>
                  {money(s.transaction.amount)}
                </Text>
                <Text style={styles.sampleNote}>{s.note}</Text>
              </Pressable>
            );
          })}
        </View>

        <Card>
          <Label>Transaction</Label>
          <Fact label="Type" value={t.type} />
          <Fact label="Amount" value={money(t.amount)} monospace />
          <Fact label="Step" value={`${t.step} (hour ${t.step % 24})`} />
          <Fact label="From" value={account(t.nameOrig, 6)} monospace />
          <Fact
            label="Origin balance"
            value={`${money(t.oldbalanceOrg)} → ${money(t.newbalanceOrig)}`}
            monospace
          />
          <Fact label="To" value={account(t.nameDest, 6)} monospace />
          <Fact
            label="Destination balance"
            value={`${money(t.oldbalanceDest)} → ${money(t.newbalanceDest)}`}
            monospace
          />
          <Note>
            The dataset's own fraud label is held back until a result comes
            back. It is not part of the transaction and would not exist at
            screening time.
          </Note>
        </Card>

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Pressable
          style={({ pressed }) => [
            styles.button,
            busy && styles.buttonBusy,
            pressed && !busy && styles.buttonPressed,
          ]}
          onPress={run}
          disabled={busy}
        >
          {busy ? (
            <View style={styles.busyRow}>
              <ActivityIndicator size="small" color={text.primary} />
              <Text style={styles.buttonText}>Screening…</Text>
            </View>
          ) : (
            <Text style={styles.buttonText}>Screen this transaction</Text>
          )}
        </Pressable>

        {busy && (
          <Note>
            Three detectors are called in parallel, their scores fused, a FATF
            typology retrieved and a report written. Several seconds is normal.
          </Note>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: bg.canvas, paddingTop: statusBarInset },
  content: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl },

  title: { color: text.primary, fontSize: 26, fontWeight: "700", letterSpacing: -0.5 },
  subtitle: { color: text.muted, fontSize: 13, marginTop: 2 },

  samples: { gap: space.sm },
  sample: {
    backgroundColor: bg.card,
    borderWidth: 1,
    borderColor: bg.border,
    borderRadius: radius.md,
    padding: space.md,
  },
  sampleOn: { borderColor: accent.base, backgroundColor: bg.raised },
  sampleHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  sampleLabel: { color: text.secondary, fontSize: 14, fontWeight: "600", flex: 1 },
  sampleLabelOn: { color: text.primary },
  sampleType: { color: text.faint, fontSize: 10, letterSpacing: 0.8 },
  sampleAmount: { ...mono, color: text.primary, fontSize: 15, marginTop: 4 },
  sampleNote: { color: text.faint, fontSize: 11, marginTop: 3, lineHeight: 16 },

  errorBox: {
    borderWidth: 1,
    borderColor: risk.CRITICAL,
    backgroundColor: "rgba(239, 68, 68, 0.08)",
    borderRadius: radius.md,
    padding: space.md,
  },
  errorText: { color: risk.CRITICAL, fontSize: 13, lineHeight: 19 },

  button: {
    backgroundColor: accent.dark,
    borderRadius: radius.md,
    paddingVertical: space.md,
    alignItems: "center",
    minHeight: 46,
    justifyContent: "center",
  },
  buttonBusy: { backgroundColor: bg.borderStrong },
  buttonPressed: { opacity: 0.75 },
  buttonText: { color: text.primary, fontSize: 15, fontWeight: "600" },
  busyRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
});
