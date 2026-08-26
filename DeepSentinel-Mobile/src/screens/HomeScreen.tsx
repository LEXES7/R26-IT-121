import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { getHealth, type Health } from "../api/client";
import type { Session } from "../auth/session";
import { API_BASE } from "../config";
import { bg, mono, radius, risk, space, text } from "../theme/tokens";

type Props = {
  session: Session;
  onSignOut: () => void;
};

/**
 * The screen behind the login.
 *
 * For now it answers two questions and nothing more: who am I signed in as,
 * and is the engine actually up. The alert list, the case detail and the live
 * monitor land here next — this is the shell they hang off, not the finished
 * home screen.
 */
export default function HomeScreen({ session, onSignOut }: Props) {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const check = useCallback(async () => {
    setError(null);
    try {
      setHealth(await getHealth());
    } catch (err) {
      setHealth(null);
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    check().finally(() => setLoading(false));
  }, [check]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await check();
    setRefreshing(false);
  }, [check]);

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={bg.canvas} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={text.muted}
          />
        }
      >
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.brand}>DeepSentinel</Text>
            <Text style={styles.who}>
              {session.user.full_name || session.user.username}
            </Text>
          </View>
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>{session.user.role}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Engine</Text>
          {loading ? (
            <ActivityIndicator
              size="small"
              color={text.muted}
              style={styles.loader}
            />
          ) : error ? (
            <>
              <View style={styles.statusRow}>
                <View style={[styles.dot, { backgroundColor: risk.CRITICAL }]} />
                <Text style={styles.statusText}>Unreachable</Text>
              </View>
              <Text style={styles.errorText}>{error}</Text>
            </>
          ) : (
            health && (
              <>
                <View style={styles.statusRow}>
                  <View style={[styles.dot, { backgroundColor: risk.LOW }]} />
                  <Text style={styles.statusText}>Connected</Text>
                </View>
                <Capability label="Knowledge base" on={health.knowledge_base} />
                <Capability label="Meta-classifier" on={health.meta_classifier} />
                <Capability label="LLM reporter" on={health.llm_reporter} />
              </>
            )
          )}
          <Text style={styles.value}>{API_BASE}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Next</Text>
          <Text style={styles.body}>
            Alerts, case detail and the live monitor are not built yet. This
            screen exists to prove the session works end to end: the token below
            came from the fusion engine and is being sent on every request.
          </Text>
          <Text style={[styles.value, styles.token]} numberOfLines={1}>
            {session.token.slice(0, 24)}…
          </Text>
        </View>

        <Pressable
          style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}
          onPress={onSignOut}
        >
          <Text style={styles.signOutText}>Sign out</Text>
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: bg.canvas },
  content: { padding: space.xl, gap: space.lg },

  header: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  headerText: { flex: 1 },
  brand: {
    color: text.primary,
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  who: { color: text.secondary, fontSize: 14, marginTop: 2 },
  roleBadge: {
    borderWidth: 1,
    borderColor: bg.borderStrong,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  roleText: {
    color: text.secondary,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1,
    textTransform: "uppercase",
  },

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
    marginBottom: space.md,
  },
  body: { color: text.secondary, fontSize: 13, lineHeight: 20 },
  value: { ...mono, color: text.faint, fontSize: 11, marginTop: space.md },
  token: { color: text.muted },
  loader: { alignSelf: "flex-start" },

  statusRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  dot: { width: 10, height: 10, borderRadius: radius.pill },
  smallDot: { width: 7, height: 7 },
  statusText: { color: text.primary, fontSize: 15, fontWeight: "600" },
  errorText: {
    color: risk.CRITICAL,
    fontSize: 13,
    lineHeight: 19,
    marginTop: space.sm,
  },

  capabilityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginTop: space.md,
  },
  capabilityLabel: { color: text.secondary, fontSize: 14, flex: 1 },
  capabilityState: { color: text.secondary, fontSize: 12 },

  signOut: {
    borderWidth: 1,
    borderColor: bg.borderStrong,
    borderRadius: radius.md,
    paddingVertical: space.md,
    alignItems: "center",
  },
  pressed: { opacity: 0.7 },
  signOutText: { color: text.secondary, fontSize: 15, fontWeight: "600" },
});
