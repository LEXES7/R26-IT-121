import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { login, type LoginResponse } from "../api/auth";
import { NetworkError } from "../api/client";
import { API_BASE } from "../config";
import { accent, bg, mono, radius, risk, space, text } from "../theme/tokens";

type Props = {
  onSignedIn: (session: LoginResponse) => void;
};

export default function LoginScreen({ onSignedIn }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unreachable, setUnreachable] = useState(false);

  const canSubmit = username.trim().length > 0 && password.length > 0 && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    setUnreachable(false);
    try {
      onSignedIn(await login(username.trim(), password));
    } catch (err) {
      // The two failures need different words. A network problem shown as a
      // credential problem sends someone hunting for a typo that is not there.
      setUnreachable(err instanceof NetworkError);
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={bg.canvas} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.brand}>DeepSentinel</Text>
            <Text style={styles.tagline}>Fraud analyst access</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>Username</Text>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              placeholder="admin"
              placeholderTextColor={text.faint}
              returnKeyType="next"
              editable={!busy}
            />

            <Text style={[styles.label, styles.spaced]}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="current-password"
              placeholder="••••••••"
              placeholderTextColor={text.faint}
              returnKeyType="go"
              onSubmitEditing={submit}
              editable={!busy}
            />

            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
                {unreachable && (
                  <Text style={styles.errorHint}>
                    This is a connection problem, not a wrong password. The
                    backend is expected at {API_BASE}.
                  </Text>
                )}
              </View>
            )}

            <Pressable
              style={({ pressed }) => [
                styles.button,
                !canSubmit && styles.buttonDisabled,
                pressed && canSubmit && styles.buttonPressed,
              ]}
              onPress={submit}
              disabled={!canSubmit}
            >
              {busy ? (
                <ActivityIndicator size="small" color={text.primary} />
              ) : (
                <Text style={styles.buttonText}>Sign in</Text>
              )}
            </Pressable>
          </View>

          <Text style={styles.footer}>
            Signed in against {API_BASE || "no configured backend"}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: bg.canvas },
  flex: { flex: 1 },
  content: { padding: space.xl, gap: space.xl, flexGrow: 1, justifyContent: "center" },

  header: { gap: space.xs },
  brand: {
    color: text.primary,
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  tagline: { color: text.secondary, fontSize: 14 },

  card: {
    backgroundColor: bg.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: bg.border,
    padding: space.lg,
  },

  label: {
    color: text.muted,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: space.sm,
  },
  spaced: { marginTop: space.lg },

  input: {
    backgroundColor: bg.raised,
    borderWidth: 1,
    borderColor: bg.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    color: text.primary,
    fontSize: 15,
  },

  errorBox: {
    marginTop: space.lg,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: risk.CRITICAL,
    backgroundColor: "rgba(239, 68, 68, 0.08)",
  },
  errorText: { color: risk.CRITICAL, fontSize: 13, lineHeight: 19 },
  errorHint: { color: text.secondary, fontSize: 12, lineHeight: 18, marginTop: space.sm },

  button: {
    marginTop: space.xl,
    backgroundColor: accent.dark,
    borderRadius: radius.md,
    paddingVertical: space.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 46,
  },
  buttonDisabled: { backgroundColor: bg.borderStrong },
  buttonPressed: { opacity: 0.75 },
  buttonText: { color: text.primary, fontSize: 15, fontWeight: "600" },

  footer: { ...mono, color: text.faint, fontSize: 11, textAlign: "center" },
});
