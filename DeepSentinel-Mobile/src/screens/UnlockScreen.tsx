import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  ImageBackground,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { verify } from "../auth/biometric";
import { accent, bg, serif, space, text, themed } from "../theme/tokens";

/**
 * The lock, when the person chose fingerprint or face unlock.
 *
 * Asks the device straight away, because that is what someone reaching for
 * the app expects. Cancelling leaves them here rather than signing them out:
 * a dismissed prompt is usually a thumb in the wrong place, not a decision.
 * The way out is the password, which drops the stored session entirely.
 *
 * Set over the Earth at night, with the site's line, so the first thing on
 * the phone is the same product as the first thing on the web.
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
    <ImageBackground
      source={require("../../assets/images/earth-night.jpg")}
      resizeMode="cover"
      style={styles.screen}
      imageStyle={styles.photo}
    >
    <View style={styles.shade} />
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1 }}>
      <StatusBar barStyle="light-content" backgroundColor={bg.canvas} />
      <View style={styles.inner}>
        <Text style={styles.brand}>
          Deep<Text style={{ color: accent.base }}>Sentinel</Text>
        </Text>
        <View style={{ flex: 1 }} />
        <Text style={styles.claim}>
          Detect the fraud.{"\n"}
          <Text style={styles.claimAccent}>Then prove it.</Text>
        </Text>
        <Text style={styles.who}>Locked · signed in as {username}</Text>

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
    </ImageBackground>
  );
}

const styles = themed(() => ({
  screen: { flex: 1, backgroundColor: bg.canvas },
  photo: { opacity: 0.75 },
  shade: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(9,8,7,0.45)" },
  inner: { flex: 1, padding: space.xl, paddingTop: space.lg, gap: space.md },
  brand: { color: text.primary, fontSize: 17, fontWeight: "600" },
  claim: { color: text.primary, fontFamily: serif.regular, fontSize: 50, lineHeight: 50 },
  claimAccent: { color: accent.base, fontFamily: serif.italic },
  who: { color: text.muted, fontSize: 14, marginBottom: space.lg },
  primary: {
    backgroundColor: text.secondary,
    borderRadius: 16,
    paddingVertical: space.md + 2,
    alignItems: "center",
  },
  primaryText: { color: bg.canvas, fontSize: 15, fontWeight: "700" },
  hint: { color: text.muted, fontSize: 12, lineHeight: 18 },
  secondary: { alignItems: "center", paddingVertical: space.md },
  secondaryText: { color: text.secondary, fontSize: 14 },
}));
