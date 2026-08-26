import { useCallback, useEffect, useState } from "react";
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

import { getHealth, type Health } from "./src/api/client";
import { API_BASE } from "./src/config";
import { accent, bg, mono, radius, risk, space, text } from "./src/theme/tokens";

type State = "checking" | "ok" | "failed";

/**
 * Connection check.
 *
 * The first screen is deliberately not a login form. On a phone the failure
 * that actually happens is the network — wrong address, a different Wi-Fi, a
 * backend bound to 127.0.0.1 — and a login form reports every one of those as
 * though the password were wrong. This answers "can this phone reach the fusion
 * engine, and what does it say about itself" before any credential is typed.
 *
 * It stays useful once login exists: it is the screen to open when something is
 * not working.
 */
export default function App() {
  const [state, setState] = useState<State>("checking");
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(async () => {
    setState("checking");
    setError(null);
    try {
      setHealth(await getHealth());
      setState("ok");
    } catch (err) {
      setError((err as Error).message);
      setState("failed");
    }
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={bg.canvas} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.brand}>DeepSentinel</Text>
        <Text style={styles.tagline}>
          Multi-modal fraud detection with forensic attribution
        </Text>

        <View style={styles.card}>
          <View style={styles.statusRow}>
            <View style={[styles.dot, { backgroundColor: statusColour(state) }]} />
            <Text style={styles.statusText}>{statusLabel(state)}</Text>
            {state === "checking" && (
              <ActivityIndicator size="small" color={text.muted} />
            )}
          </View>

          <Text style={styles.label}>Backend</Text>
          <Text style={styles.value}>{API_BASE || "not configured"}</Text>

          {state === "failed" && error && (
            <>
              <Text style={[styles.label, styles.spaced]}>What went wrong</Text>
              <Text style={styles.error}>{error}</Text>
              <Text style={styles.hint}>
                The phone and the laptop have to be on the same network, and the
                backend has to be started with --host 0.0.0.0 rather than
                127.0.0.1.
              </Text>
            </>
          )}

          {state === "ok" && health && (
            <>
              <Text style={[styles.label, styles.spaced]}>Engine</Text>
              <Capability label="Knowledge base" on={health.knowledge_base} />
              <Capability label="Meta-classifier" on={health.meta_classifier} />
              <Capability label="LLM reporter" on={health.llm_reporter} />

              <Text style={[styles.label, styles.spaced]}>Detectors</Text>
              {Object.entries(health.upstream_bases ?? {}).map(([name, url]) => (
                <View key={name} style={styles.upstreamRow}>
                  <Text style={styles.upstreamName}>{name}</Text>
                  <Text style={styles.upstreamUrl} numberOfLines={1}>
                    {url}
                  </Text>
                </View>
              ))}
              <Text style={styles.hint}>
                These are the addresses the engine will call. It does not test
                them here, so an address being listed is not the same as that
                detector being up.
              </Text>
            </>
          )}
        </View>

        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          onPress={check}
          disabled={state === "checking"}
        >
          <Text style={styles.buttonText}>
            {state === "checking" ? "Checking…" : "Check again"}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Capability({ label, on }: { label: string; on: boolean }) {
  return (
    <View style={styles.capabilityRow}>
      <View
        style={[
          styles.dot,
          styles.smallDot,
          { backgroundColor: on ? risk.LOW : text.faint },
        ]}
      />
      <Text style={styles.capabilityLabel}>{label}</Text>
      <Text style={[styles.capabilityState, !on && { color: text.faint }]}>
        {on ? "ready" : "off"}
      </Text>
    </View>
  );
}

function statusColour(state: State): string {
  if (state === "ok") return risk.LOW;
  if (state === "failed") return risk.CRITICAL;
  return text.muted;
}

function statusLabel(state: State): string {
  if (state === "ok") return "Connected";
  if (state === "failed") return "Cannot reach the backend";
  return "Checking connection";
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: bg.canvas },
  content: { padding: space.xl, gap: space.lg },

  brand: {
    color: text.primary,
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  tagline: { color: text.secondary, fontSize: 14, lineHeight: 20 },

  card: {
    backgroundColor: bg.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: bg.border,
    padding: space.lg,
  },

  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginBottom: space.md,
  },
  dot: { width: 10, height: 10, borderRadius: radius.pill },
  smallDot: { width: 7, height: 7 },
  statusText: { color: text.primary, fontSize: 15, fontWeight: "600", flex: 1 },

  label: {
    color: text.muted,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  spaced: { marginTop: space.lg },
  value: { ...mono, color: text.secondary, fontSize: 13, marginTop: space.xs },

  error: {
    color: risk.CRITICAL,
    fontSize: 13,
    marginTop: space.xs,
    lineHeight: 19,
  },
  hint: { color: text.faint, fontSize: 12, lineHeight: 18, marginTop: space.md },

  capabilityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginTop: space.sm,
  },
  capabilityLabel: { color: text.secondary, fontSize: 14, flex: 1 },
  capabilityState: { color: text.secondary, fontSize: 12 },

  upstreamRow: { marginTop: space.sm },
  upstreamName: {
    color: text.secondary,
    fontSize: 13,
    textTransform: "capitalize",
  },
  upstreamUrl: { ...mono, color: text.faint, fontSize: 11, marginTop: 2 },

  button: {
    backgroundColor: accent.dark,
    borderRadius: radius.md,
    paddingVertical: space.md,
    alignItems: "center",
  },
  buttonPressed: { opacity: 0.75 },
  buttonText: { color: text.primary, fontSize: 15, fontWeight: "600" },
});
