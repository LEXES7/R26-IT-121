import Constants from "expo-constants";
import { useCallback, useEffect, useState } from "react";
import { Alert, BackHandler, StyleSheet, Text, View } from "react-native";

import { changePassword, updateMe, type User } from "../api/auth";
import { getHealth, type Health } from "../api/client";
import { ROLES, createUser, listUsers, setUserEnabled, type Account } from "../api/users";
import {
  Avatar,
  Button,
  ChoiceRow,
  FieldRow,
  Group,
  NavButton,
  Row,
  Screen,
  SwitchRow,
  confirmTap,
} from "../components/ios";
import { API_BASE } from "../config";
import { ago } from "../lib/format";
import { notificationsSupported } from "../lib/notify";
import { ALERT_LEVEL_CHOICES, APPEARANCE_CHOICES, AUTO_LOCK_CHOICES, type Prefs } from "../lib/prefs";
import { risk, space, text, tile, themed } from "../theme/tokens";

/**
 * Settings, laid out as iOS Settings is: the account at the top, then what
 * this phone does, then the server, then the administrator's tools.
 *
 * Its pages are a small stack of their own, so the tab keeps its place when
 * someone switches away and back.
 */

type Page = "root" | "profile" | "password" | "alerts" | "autolock" | "server" | "users" | "newUser";

const ROLE_LABEL: Record<string, string> = Object.fromEntries(ROLES.map((r) => [r.value, r.label]));

type Props = {
  user: User;
  onUserUpdated: (user: User) => void;
  onSignOut: () => void;
  /** Called after a password change, which ends every session on the server. */
  onPasswordChanged: () => void;
  biometric: { usable: boolean; label: string; on: boolean; toggle: () => void };
  prefs: Prefs;
  onPrefs: (next: Prefs) => void;
  /** Whether the OS allows this app to post notifications. */
  notificationsAllowed: boolean;
};

export default function SettingsScreen(props: Props) {
  const [stack, setStack] = useState<Page[]>(["root"]);
  const page = stack[stack.length - 1];
  const push = (p: Page) => setStack((s) => [...s, p]);
  const pop = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), []);

  // Android's back button walks back through the settings pages first.
  useEffect(() => {
    if (page === "root") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      pop();
      return true;
    });
    return () => sub.remove();
  }, [page, pop]);

  const back = (label = "Settings") => ({ label, onPress: pop });

  switch (page) {
    case "profile":
      return <ProfilePage {...props} back={back()} done={pop} />;
    case "password":
      return <PasswordPage {...props} back={back()} />;
    case "alerts":
      return <AlertsPage {...props} back={back()} />;
    case "autolock":
      return <AutoLockPage {...props} back={back()} />;
    case "server":
      return <ServerPage back={back()} />;
    case "users":
      return <UsersPage self={props.user.username} back={back()} onNew={() => push("newUser")} />;
    case "newUser":
      return <NewUserPage back={back("Users")} done={pop} />;
    default:
      return <RootPage {...props} push={push} />;
  }
}

// ── Root ────────────────────────────────────────────────────────────────────

function RootPage({
  user,
  onSignOut,
  biometric,
  prefs,
  onPrefs,
  notificationsAllowed,
  push,
}: Props & { push: (p: Page) => void }) {
  const alertLabel = !notificationsSupported
    ? "Needs app build"
    : !notificationsAllowed
      ? "Not allowed"
      : ALERT_LEVEL_CHOICES.find((c) => c.value === prefs.alertLevel)?.label;
  const lockLabel = AUTO_LOCK_CHOICES.find((c) => c.minutes === prefs.autoLockMinutes)?.label;
  const version = Constants.expoConfig?.version ?? "1.0.0";

  return (
    <Screen title="Settings" accentLine="Yours to set.">
      <Group>
        <Row
          leading={<Avatar name={user.full_name || user.username} />}
          title={user.full_name || user.username}
          subtitle={`${ROLE_LABEL[user.role] ?? user.role} · ${user.email}`}
          onPress={() => push("profile")}
        />
      </Group>

      <Group header="Security">
        <Row icon="key" iconColor={tile.grey} title="Change password" onPress={() => push("password")} />
        {biometric.usable ? (
          <SwitchRow
            icon="finger-print"
            iconColor={tile.green}
            title={`Unlock with ${biometric.label}`}
            value={biometric.on}
            onChange={biometric.toggle}
          />
        ) : (
          <Row
            icon="finger-print"
            iconColor={tile.grey}
            title="Biometric unlock"
            value="Not set up"
            subtitle="Enrol a fingerprint or face in the phone's settings to use it here."
          />
        )}
        <Row
          icon="lock-closed"
          iconColor={tile.blue}
          title="Auto-lock"
          value={lockLabel}
          onPress={() => push("autolock")}
        />
      </Group>

      <Group header="Notifications">
        <Row
          icon="notifications"
          iconColor={tile.red}
          title="Alert notifications"
          value={alertLabel}
          onPress={() => push("alerts")}
        />
      </Group>

      <Group header="Appearance" footer="System follows the phone's light or dark setting.">
        {APPEARANCE_CHOICES.map((c) => (
          <ChoiceRow
            key={c.value}
            title={c.label}
            selected={prefs.appearance === c.value}
            onPress={() => onPrefs({ ...prefs, appearance: c.value })}
          />
        ))}
      </Group>

      <Group header="Platform">
        <Row icon="server" iconColor={tile.indigo} title="Server" onPress={() => push("server")} />
        {user.role === "admin" && (
          <Row icon="people" iconColor={tile.orange} title="Users" onPress={() => push("users")} />
        )}
      </Group>

      <Group footer={`DeepSentinel ${version} · Expo SDK ${Constants.expoConfig?.sdkVersion ?? ""}`}>
        <Row
          title="Sign out"
          destructive
          chevron={false}
          onPress={() =>
            Alert.alert("Sign out?", "You will need your password to sign in again.", [
              { text: "Cancel", style: "cancel" },
              { text: "Sign out", style: "destructive", onPress: onSignOut },
            ])
          }
        />
      </Group>
    </Screen>
  );
}

// ── Profile ─────────────────────────────────────────────────────────────────

function ProfilePage({
  user,
  onUserUpdated,
  back,
  done,
}: Props & { back: { label: string; onPress: () => void }; done: () => void }) {
  const [name, setName] = useState(user.full_name);
  const [email, setEmail] = useState(user.email);
  const [busy, setBusy] = useState(false);
  const changed = name.trim() !== user.full_name || email.trim() !== user.email;

  async function save() {
    setBusy(true);
    try {
      const changes: { full_name?: string; email?: string } = {};
      if (name.trim() !== user.full_name) changes.full_name = name.trim();
      if (email.trim() !== user.email) changes.email = email.trim();
      const next = await updateMe(changes);
      onUserUpdated(next);
      confirmTap();
      done();
    } catch (err) {
      Alert.alert("Not saved", (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      title="Profile"
      back={back}
      right={<NavButton label={busy ? "Saving" : "Save"} onPress={save} disabled={!changed || busy || !name.trim()} />}
    >
      <View style={styles.profileHead}>
        <Avatar name={name || user.username} size={84} />
        <Text style={styles.profileName}>{name || user.username}</Text>
        <Text style={styles.profileRole}>{ROLE_LABEL[user.role] ?? user.role}</Text>
      </View>
      <Group footer="Your name appears on case reviews and approved SAR drafts.">
        <FieldRow label="Name" value={name} onChangeText={setName} autoCapitalize="words" placeholder="Full name" />
        <FieldRow
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          placeholder="name@bank.lk"
        />
      </Group>
      <Group footer="Your username is your identity in the audit log, and your role is set by an administrator, so neither can be changed here.">
        <Row title="Username" value={user.username} monoValue />
        <Row title="Role" value={ROLE_LABEL[user.role] ?? user.role} />
      </Group>
    </Screen>
  );
}

// ── Password ────────────────────────────────────────────────────────────────

function PasswordPage({
  onPasswordChanged,
  back,
}: Props & { back: { label: string; onPress: () => void } }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const mismatch = again.length > 0 && next !== again;
  const ready = current.length > 0 && next.length >= 8 && next === again;

  async function save() {
    setBusy(true);
    try {
      await changePassword(current, next);
      confirmTap();
      Alert.alert(
        "Password changed",
        "Every session for your account has ended, this one included. Sign in with the new password.",
        [{ text: "OK", onPress: onPasswordChanged }],
      );
    } catch (err) {
      Alert.alert("Not changed", (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Change password" back={back}>
      <Group>
        <FieldRow label="Current" value={current} onChangeText={setCurrent} secureTextEntry placeholder="Required" autoComplete="current-password" />
      </Group>
      <Group
        footer={
          mismatch ? (
            <Text style={{ color: tile.red }}>The two new passwords do not match.</Text>
          ) : (
            "At least 8 characters. Changing it signs you out everywhere."
          )
        }
      >
        <FieldRow label="New" value={next} onChangeText={setNext} secureTextEntry placeholder="8 or more characters" autoComplete="new-password" />
        <FieldRow label="Verify" value={again} onChangeText={setAgain} secureTextEntry placeholder="Repeat" autoComplete="new-password" />
      </Group>
      <Button title="Change password" onPress={save} busy={busy} disabled={!ready} />
    </Screen>
  );
}

// ── Notifications and lock ──────────────────────────────────────────────────

function AlertsPage({
  prefs,
  onPrefs,
  notificationsAllowed,
  back,
}: Props & { back: { label: string; onPress: () => void } }) {
  return (
    <Screen title="Alert notifications" back={back}>
      {!notificationsSupported ? (
        <Group footer="Expo Go cannot show notifications. They work in an installed build of the app. The live feed still updates either way.">
          <Row icon="information-circle" iconColor={tile.blue} title="Needs an installed build" />
        </Group>
      ) : !notificationsAllowed ? (
        <Group footer="Notifications are switched off for DeepSentinel in the phone's settings. Turn them on there to choose a level here.">
          <Row icon="notifications-off" iconColor={tile.grey} title="Not allowed by the phone" />
        </Group>
      ) : null}
      <Group
        header="Notify me about"
        footer="Raised from the live monitor while the app is open. Medium verdicts never notify: the system has not committed on them."
      >
        {ALERT_LEVEL_CHOICES.map((c) => (
          <ChoiceRow
            key={c.value}
            title={c.label}
            subtitle={c.detail}
            selected={prefs.alertLevel === c.value}
            onPress={() => onPrefs({ ...prefs, alertLevel: c.value })}
          />
        ))}
      </Group>
    </Screen>
  );
}

function AutoLockPage({
  prefs,
  onPrefs,
  back,
}: Props & { back: { label: string; onPress: () => void } }) {
  return (
    <Screen title="Auto-lock" back={back}>
      <Group footer="How long the app may sit in the background before it locks. With biometric unlock on, the lock asks for your fingerprint or face; otherwise it signs you out.">
        {AUTO_LOCK_CHOICES.map((c) => (
          <ChoiceRow
            key={c.minutes}
            title={c.label}
            selected={prefs.autoLockMinutes === c.minutes}
            onPress={() => onPrefs({ ...prefs, autoLockMinutes: c.minutes })}
          />
        ))}
      </Group>
    </Screen>
  );
}

// ── Server ──────────────────────────────────────────────────────────────────

function ServerPage({ back }: { back: { label: string; onPress: () => void } }) {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      setHealth(await getHealth());
      setError(null);
    } catch (err) {
      setHealth(null);
      setError((err as Error).message);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  const ok = (v: boolean | undefined) => (v === undefined ? "-" : v ? "Ready" : "Not ready");

  return (
    <Screen title="Server" back={back} right={<NavButton icon="refresh" onPress={check} disabled={checking} />}>
      <Group footer="Set when the app is started, with EXPO_PUBLIC_API_BASE.">
        <Row title="Address" value={API_BASE || "not set"} monoValue />
        <Row
          title="Connection"
          busy={checking}
          trailing={
            <Text style={{ color: error ? risk.CRITICAL : health ? risk.LOW : text.muted, fontSize: 17 }}>
              {error ? "Unreachable" : health ? "Connected" : "Checking"}
            </Text>
          }
        />
      </Group>
      {error ? (
        <Group>
          <Row title={error} />
        </Group>
      ) : health ? (
        <Group header="Fusion engine">
          <Row title="Knowledge base" value={ok(health.knowledge_base)} />
          <Row title="Meta-classifier" value={ok(health.meta_classifier)} />
          <Row title="Report writer" value={ok(health.llm_reporter)} />
        </Group>
      ) : null}
      {health && Object.keys(health.upstream_bases ?? {}).length > 0 && (
        <Group header="Detectors" footer="The addresses the engine calls. Whether each answers shows on Home.">
          {Object.entries(health.upstream_bases).map(([k, v]) => (
            <Row key={k} title={k.replace(/_api_base$/, "").replace(/_/g, " ")} subtitle={v} />
          ))}
        </Group>
      )}
    </Screen>
  );
}

// ── Users (admin) ───────────────────────────────────────────────────────────

function UsersPage({
  self,
  back,
  onNew,
}: {
  self: string;
  back: { label: string; onPress: () => void };
  onNew: () => void;
}) {
  const [users, setUsers] = useState<Account[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setUsers(await listUsers());
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function toggle(u: Account) {
    const verb = u.enabled ? "Disable" : "Enable";
    Alert.alert(
      `${verb} ${u.username}?`,
      u.enabled
        ? "They are signed out everywhere and cannot sign in until enabled again."
        : "They will be able to sign in again.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: verb,
          style: u.enabled ? "destructive" : "default",
          onPress: async () => {
            setBusy(u.username);
            try {
              await setUserEnabled(u.username, !u.enabled);
              confirmTap();
              await load();
            } catch (err) {
              Alert.alert("Not changed", (err as Error).message);
            } finally {
              setBusy(null);
            }
          },
        },
      ],
    );
  }

  return (
    <Screen title="Users" back={back} right={<NavButton icon="add" onPress={onNew} />}>
      {error && (
        <Group>
          <Row title={error} />
        </Group>
      )}
      {users && (
        <Group footer="Tap an account to enable or disable it. You cannot disable your own.">
          {users.map((u) => (
            <Row
              key={u.username}
              leading={<Avatar name={u.full_name || u.username} size={36} />}
              title={u.full_name || u.username}
              subtitle={`${u.username} · ${ROLE_LABEL[u.role] ?? u.role} · ${
                u.last_login ? `seen ${ago(u.last_login)}` : "never signed in"
              }`}
              busy={busy === u.username}
              trailing={
                <Text style={{ color: u.enabled ? risk.LOW : text.faint, fontSize: 15 }}>
                  {u.enabled ? "Active" : "Disabled"}
                </Text>
              }
              chevron={false}
              onPress={u.username === self ? undefined : () => toggle(u)}
            />
          ))}
        </Group>
      )}
    </Screen>
  );
}

function NewUserPage({ back, done }: { back: { label: string; onPress: () => void }; done: () => void }) {
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<string>("analyst");
  const [busy, setBusy] = useState(false);
  const ready = username.trim().length >= 3 && fullName.trim() && email.includes("@") && password.length >= 8;

  async function save() {
    setBusy(true);
    try {
      await createUser({
        username: username.trim(),
        full_name: fullName.trim(),
        email: email.trim(),
        password,
        role,
      });
      confirmTap();
      Alert.alert("Account created", `${username.trim()} can sign in now. Share the password with them directly.`);
      done();
    } catch (err) {
      Alert.alert("Not created", (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      title="New user"
      back={back}
      right={<NavButton label={busy ? "Adding" : "Add"} onPress={save} disabled={!ready || busy} />}
    >
      <Group>
        <FieldRow label="Username" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} placeholder="3 or more characters" />
        <FieldRow label="Name" value={fullName} onChangeText={setFullName} autoCapitalize="words" placeholder="Full name" />
        <FieldRow label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="name@bank.lk" />
        <FieldRow label="Password" value={password} onChangeText={setPassword} secureTextEntry placeholder="8 or more characters" />
      </Group>
      <Group header="Role" footer="Analysts review cases. Risk managers also manage alert recipients. Administrators manage users and the monitor.">
        {ROLES.map((r) => (
          <ChoiceRow key={r.value} title={r.label} selected={role === r.value} onPress={() => setRole(r.value)} />
        ))}
      </Group>
    </Screen>
  );
}

const styles = themed(() => ({
  profileHead: { alignItems: "center", gap: 6, paddingVertical: space.md },
  profileName: { color: text.primary, fontSize: 22, fontWeight: "600", marginTop: space.sm },
  profileRole: { color: text.muted, fontSize: 15 },
}));
