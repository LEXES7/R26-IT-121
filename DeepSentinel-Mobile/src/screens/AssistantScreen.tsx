import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  askAssistant,
  getAssistantCapabilities,
  type AssistantCapabilities,
  type AssistantStep,
  type Turn,
} from "../api/assistant";
import { Empty, NavButton, Screen, tap } from "../components/ios";
import { accent, bg, mono, radius, space, text, tile } from "../theme/tokens";

/**
 * The operator assistant from the web console, on the phone.
 *
 * It answers by calling the platform's own tools and returns each call, so an
 * answer about an account can be checked against what it was built from. The
 * calls are folded under each answer rather than hidden: an unexplained
 * answer about someone's account is not usable evidence.
 */

/** The web console's own examples, so both surfaces suggest the same things. */
const EXAMPLES = [
  "Show me the suspicious network around C1674473954.",
  "Are all three detection models reachable right now?",
  "Show me the most recent CRITICAL cases.",
  "Have we analysed account C1674473954 before?",
];

type Message =
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: string;
      steps: AssistantStep[];
      truncated: boolean;
      usedLlm: boolean;
    }
  | { role: "error"; content: string };

export default function AssistantScreen() {
  const [caps, setCaps] = useState<AssistantCapabilities | null>(null);
  const [capsError, setCapsError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const scroller = useRef<ScrollView>(null);

  useEffect(() => {
    getAssistantCapabilities()
      .then(setCaps)
      .catch((err) => setCapsError((err as Error).message));
  }, []);

  async function send(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    tap();
    const history: Turn[] = messages
      .filter((m): m is Exclude<Message, { role: "error" }> => m.role !== "error")
      .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
    setMessages((prev) => [...prev, { role: "user", content: q }]);
    setDraft("");
    setBusy(true);
    try {
      const res = await askAssistant(q, history);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: res.answer,
          steps: res.steps ?? [],
          truncated: res.truncated,
          usedLlm: res.used_llm,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [...prev, { role: "error", content: (err as Error).message }]);
    } finally {
      setBusy(false);
    }
  }

  const unavailable = caps && !caps.available;

  return (
    <Screen
      title="Assistant"
      accentLine="Ask about any case."
      scroll={false}
      right={
        messages.length > 0 ? (
          <NavButton icon="create-outline" onPress={() => setMessages([])} />
        ) : undefined
      }
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <ScrollView
          ref={scroller}
          contentContainerStyle={styles.thread}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: true })}
        >
          {capsError ? (
            <Empty icon="cloud-offline-outline" title="Cannot reach the assistant" body={capsError} />
          ) : !caps ? (
            <ActivityIndicator color={text.muted} style={{ marginTop: 48 }} />
          ) : unavailable ? (
            <Empty
              icon="lock-closed-outline"
              title="Not available on this account"
              body={caps.reason ?? "An administrator controls who may use the assistant."}
            />
          ) : messages.length === 0 ? (
            <View style={styles.intro}>
              <View style={styles.introIcon}>
                <Ionicons name="sparkles" size={28} color={accent.base} />
              </View>
              <Text style={styles.introTitle}>Ask about cases, accounts and the detectors</Text>
              <Text style={styles.introBody}>
                Answers come from the platform's own data. Each one lists the tools it used.
                {caps.llm_configured ? "" : " No language model is configured, so answers are direct tool results."}
              </Text>
              <View style={styles.examples}>
                {EXAMPLES.map((e) => (
                  <Pressable
                    key={e}
                    onPress={() => send(e)}
                    style={({ pressed }) => [styles.example, pressed && { opacity: 0.6 }]}
                  >
                    <Text style={styles.exampleText}>{e}</Text>
                    <Ionicons name="arrow-up-circle" size={20} color={accent.base} />
                  </Pressable>
                ))}
              </View>
            </View>
          ) : (
            messages.map((m, i) => <Bubble key={i} m={m} />)
          )}
          {busy && (
            <View style={[styles.bubble, styles.theirs, styles.thinking]}>
              <ActivityIndicator size="small" color={text.muted} />
              <Text style={styles.thinkingText}>Checking the platform…</Text>
            </View>
          )}
        </ScrollView>

        {!unavailable && !capsError && (
          <View style={styles.composer}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Ask the assistant"
              placeholderTextColor={text.faint}
              style={styles.input}
              multiline
              maxLength={2000}
              editable={!!caps && !busy}
            />
            <Pressable
              onPress={() => send(draft)}
              disabled={!draft.trim() || busy}
              hitSlop={8}
              style={({ pressed }) => pressed && { opacity: 0.6 }}
            >
              <Ionicons
                name="arrow-up-circle"
                size={34}
                color={draft.trim() && !busy ? accent.base : text.faint}
              />
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Bubble({ m }: { m: Message }) {
  const [open, setOpen] = useState(false);
  if (m.role === "user") {
    return (
      <View style={[styles.bubble, styles.mine]}>
        <Text style={styles.mineText}>{m.content}</Text>
      </View>
    );
  }
  if (m.role === "error") {
    return (
      <View style={[styles.bubble, styles.theirs, styles.error]}>
        <Text style={styles.errorText}>{m.content}</Text>
      </View>
    );
  }
  return (
    <View style={[styles.bubble, styles.theirs]}>
      <RichText value={m.content} />
      {m.truncated && (
        <Text style={styles.meta}>Stopped at the step limit; the answer may be partial.</Text>
      )}
      {m.steps.length > 0 && (
        <Pressable
          onPress={() => {
            tap();
            setOpen((o) => !o);
          }}
          style={styles.stepsToggle}
          hitSlop={6}
        >
          <Ionicons name={open ? "chevron-down" : "chevron-forward"} size={14} color={accent.base} />
          <Text style={styles.stepsToggleText}>
            {m.steps.length} tool {m.steps.length === 1 ? "call" : "calls"}
          </Text>
        </Pressable>
      )}
      {open &&
        m.steps.map((s, i) => (
          <View key={i} style={styles.step}>
            <Text style={styles.stepTool}>
              {s.tool}
              {s.error ? "  failed" : ""}
            </Text>
            {Object.keys(s.arguments ?? {}).length > 0 && (
              <Text style={styles.stepArgs} numberOfLines={3}>
                {JSON.stringify(s.arguments)}
              </Text>
            )}
            {s.error && <Text style={styles.errorText}>{s.error}</Text>}
          </View>
        ))}
    </View>
  );
}

/**
 * Just enough Markdown for the answers the assistant writes: paragraphs,
 * bullet lines and **bold**. Anything else is shown as written.
 */
function RichText({ value }: { value: string }) {
  const lines = value.replace(/\r/g, "").split("\n");
  return (
    <View style={{ gap: 6 }}>
      {lines.map((line, i) => {
        if (!line.trim()) return null;
        const bullet = /^\s*[-*•]\s+/.test(line);
        const heading = /^#{1,4}\s+/.test(line);
        const body = line.replace(/^\s*[-*•]\s+/, "").replace(/^#{1,4}\s+/, "");
        const parts = body.split(/(\*\*[^*]+\*\*)/g);
        const rendered = parts.map((p, j) =>
          p.startsWith("**") && p.endsWith("**") ? (
            <Text key={j} style={{ fontWeight: "700" }}>
              {p.slice(2, -2)}
            </Text>
          ) : (
            p.replace(/`/g, "")
          ),
        );
        return (
          <View key={i} style={bullet ? styles.bulletRow : undefined}>
            {bullet && <Text style={styles.theirsText}>•</Text>}
            <Text style={[styles.theirsText, bullet && { flex: 1 }, heading && { fontWeight: "700" }]}>
              {rendered}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  thread: { padding: space.lg, gap: space.md, flexGrow: 1 },

  intro: { alignItems: "center", paddingTop: space.xl, gap: space.md },
  introIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "rgba(45, 212, 191, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  introTitle: { color: text.primary, fontSize: 20, fontWeight: "600", textAlign: "center" },
  introBody: { color: text.muted, fontSize: 15, lineHeight: 21, textAlign: "center" },
  examples: { alignSelf: "stretch", gap: space.sm, marginTop: space.md },
  example: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    backgroundColor: bg.card,
    borderRadius: radius.lg,
    padding: space.md,
  },
  exampleText: { color: text.primary, fontSize: 15, flex: 1, lineHeight: 20 },

  bubble: { maxWidth: "88%", borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  mine: { alignSelf: "flex-end", backgroundColor: accent.dark },
  mineText: { color: "#fff", fontSize: 16, lineHeight: 22 },
  theirs: { alignSelf: "flex-start", backgroundColor: bg.elevated },
  theirsText: { color: text.primary, fontSize: 16, lineHeight: 22 },
  bulletRow: { flexDirection: "row", gap: 8 },
  thinking: { flexDirection: "row", alignItems: "center", gap: space.sm },
  thinkingText: { color: text.muted, fontSize: 15 },
  meta: { color: text.muted, fontSize: 12, marginTop: 6 },
  error: { backgroundColor: "rgba(255, 69, 58, 0.15)" },
  errorText: { color: tile.red, fontSize: 14, lineHeight: 19 },

  stepsToggle: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 },
  stepsToggleText: { color: accent.base, fontSize: 13, fontWeight: "600" },
  step: { marginTop: 8, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: bg.borderStrong },
  stepTool: { ...mono, color: text.secondary, fontSize: 13, fontWeight: "600" },
  stepArgs: { ...mono, color: text.muted, fontSize: 11, marginTop: 2 },

  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: bg.border,
    backgroundColor: bg.canvas,
  },
  input: {
    flex: 1,
    minHeight: 36,
    maxHeight: 120,
    backgroundColor: bg.raised,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: bg.borderStrong,
    color: text.primary,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 8,
  },
});
