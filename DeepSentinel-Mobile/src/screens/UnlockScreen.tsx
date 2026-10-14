import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { verify } from "../auth/biometric";
import { accent, bg, radius, space, text } from "../theme/tokens";

/**
 * The lock, when the person chose fingerprint or face unlock.
 *
 * Asks the device straight away, because that is what someone reaching for
 * the app expects. Cancelling leaves them here rather than signing them out:
 * a dismissed prompt is usually a thumb in the wrong place, not a decision.
 * The way out is the password, which drops the stored session entirely.
 */
export default function UnlockScreen({
  username,
  label,
  onUnlocked,
  onUsePassword,
}: {
  username: string;
  label: string;
  onUnlocked: () => void;
  onUsePassword: () => void;
}) {
  const [asking, setAsking] = useState(false);
  const [failed, setFailed] = useState(false);

  const ask = useCallback(async () => {
    setAsking(true);
    const ok = await verify(label);
    setAsking(false);
    if (ok) onUnlocked();
    else setFailed(true);
  }, [label, onUnlocked]);

  useEffect(() => {
    ask();
  }, [ask]);

  return (
    <SafeAreaView edges={["top"]} style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={bg.canvas} />
      <View style={styles.inner}>
        <Text style={styles.brand}>DeepSentinel</Text>
        <Text style={styles.locked}>Locked</Text>
        <Text style={styles.who}>Signed in as {username}</Text>

        <Pressable
          onPress={ask}
          disabled={asking}
          style={({ pressed }) => [styles.primary, (pressed || asking) && { opacity: 0.7 }]}
        >
          {asking ? (
            <ActivityIndicator color={bg.canvas} />
          ) : (
            <Text style={styles.primaryText}>Unlock with {label}</Text>
          )}
        </Pressable>
        {failed && !asking && (
          <Text style={styles.hint}>Not unlocked. Try again, or sign in with your password.</Text>
        )}

        <Pressable onPress={onUsePassword} hitSlop={10} style={styles.secondary}>
          <Text style={styles.secondaryText}>Sign in with password instead</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: bg.canvas },
  inner: { flex: 1, justifyContent: "center", padding: space.xl, gap: space.md },
  brand: { color: text.primary, fontSize: 26, fontWeight: "700", letterSpacing: -0.5 },
  locked: { color: accent.base, fontSize: 13, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase" },
  who: { color: text.muted, fontSize: 14, marginBottom: space.xl },
  primary: {
    backgroundColor: accent.base,
    borderRadius: radius.md,
    paddingVertical: space.md + 2,
    alignItems: "center",
  },
  primaryText: { color: bg.canvas, fontSize: 15, fontWeight: "700" },
  hint: { color: text.muted, fontSize: 12, lineHeight: 18 },
  secondary: { alignItems: "center", paddingVertical: space.md },
  secondaryText: { color: text.secondary, fontSize: 14 },
});
