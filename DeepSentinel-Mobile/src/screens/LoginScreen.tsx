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
import { ApiError, NetworkError } from "../api/client";
import { API_BASE } from "../config";
import { accent, bg, mono, radius, risk, space, text } from "../theme/tokens";

type Props = {
  onSignedIn: (session: LoginResponse) => void;
};

/**
 * Mirrors `max_failed_logins` in the backend's config.ini.
 *
 * Counted here rather than reported by the server on purpose. The server
 * answers an unknown user and a wrong password identically — and pads the
 * timing to match — so the endpoint cannot be used to find out which usernames
 * exist. A "2 attempts remaining" from the server would undo that, because a
 * username that does not exist has no counter to report.
 *
 * Counting locally tells the person nothing they did not already know: these
 * are their own attempts, on their own device. It is shown the way a banking
 * app shows it — a plain count, because being locked out with no warning is
 * the worse failure. The wording says "on this device" because an attempt made
 * elsewhere counts towards the same lockout and this one cannot see it.
 */
const LOCKOUT_AFTER = 5;

/** HTTP 423 Locked — the backend's answer once the account is locked out. */
const LOCKED = 423;

export default function LoginScreen({ onSignedIn }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unreachable, setUnreachable] = useState(false);
  const [locked, setLocked] = useState(false);
  const [failures, setFailures] = useState(0);

  const canSubmit = username.trim().length > 0 && password.length > 0 && !busy;
  const remaining = Math.max(0, LOCKOUT_AFTER - failures);

  /** A different account is a different counter. */
  function onUsernameChange(next: string) {
    if (next.trim() !== username.trim()) {
      setFailures(0);
      setLocked(false);
    }
    setUsername(next);
  }

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    setUnreachable(false);
    setLocked(false);
    try {
      const session = await login(username.trim(), password);
      setFailures(0);
      onSignedIn(session);
    } catch (err) {
      // Three failures that need three different answers: a rejected
      // credential, a locked account, and a backend that was never reached.
      // Showing the third as the first sends someone hunting for a typo that
      // is not there — which happened here while the backend was still bound
      // to 127.0.0.1.
      if (err instanceof NetworkError) {
        setUnreachable(true);
      } else if (err instanceof ApiError && err.status === LOCKED) {
        setLocked(true);
        setFailures(LOCKOUT_AFTER);
      } else if (err instanceof ApiError && err.status === 401) {
        // A 401 after a lockout means the lockout expired: the backend zeroes
        // its counter when it locks, so this is attempt one of a fresh five,
        // not the sixth of the old set.
        setFailures((n) => (locked ? 1 : n + 1));
        setLocked(false);
        setPassword("");
      }
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
              onChangeText={onUsernameChange}
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
              <View style={[styles.errorBox, locked && styles.lockedBox]}>
                <Text style={[styles.errorText, locked && styles.lockedText]}>
                  {locked ? "Account locked" : error}
                </Text>

                {locked && <Text style={styles.errorHint}>{error}</Text>}

                {unreachable && (
                  <Text style={styles.errorHint}>
                    This is a connection problem, not a wrong password. The
                    backend is expected at {API_BASE}.
                  </Text>
                )}

                {/* Shown from the first failure. Being locked out with no
                    warning is worse than being told the count. */}
                {!locked && !unreachable && failures > 0 && (
                  <View style={styles.remainingRow}>
                    <Text
                      style={[
                        styles.remainingCount,
                        remaining <= 2 && styles.remainingUrgent,
                      ]}
                    >
                      {remaining} {remaining === 1 ? "attempt" : "attempts"}{" "}
                      remaining
                    </Text>
                    <Text style={styles.remainingNote}>
                      Counted on this device. The account locks for 15 minutes
                      after {LOCKOUT_AFTER} failed attempts.
                    </Text>
                  </View>
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
  // A lockout is not the same event as a rejected password: it is temporary,
  // it has a stated duration, and no amount of retrying will help. Amber, and
  // a heading of its own, so it is not read as "try again".
  lockedBox: {
    borderColor: risk.MEDIUM,
    backgroundColor: "rgba(234, 179, 8, 0.08)",
  },
  lockedText: { color: risk.MEDIUM, fontWeight: "700" },

  remainingRow: {
    marginTop: space.md,
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: "rgba(239, 68, 68, 0.25)",
  },
  remainingCount: { color: text.primary, fontSize: 14, fontWeight: "700" },
  // The last two carry the warning, so they carry the lockout's colour.
  remainingUrgent: { color: risk.MEDIUM },
  remainingNote: {
    color: text.secondary,
    fontSize: 12,
    lineHeight: 17,
    marginTop: space.xs,
  },
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
