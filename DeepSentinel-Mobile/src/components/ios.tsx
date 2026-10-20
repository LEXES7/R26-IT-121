import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Children, Fragment, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type RefreshControlProps,
  type TextInputProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { accent, bg, mono, radius, serif, space, statusBar, text, themed, tile } from "../theme/tokens";

/**
 * The building blocks of an iOS-style screen.
 *
 * Every screen is a large title over grouped, inset lists, the way Settings
 * and Mail are built. Kept in one file so that a row looks and behaves the
 * same on every screen, and so a screen never styles its own list again.
 */

export type IconName = ComponentProps<typeof Ionicons>["name"];

/** A light tap on selection, as iOS gives on switches and tab changes. */
export function tap(): void {
  Haptics.selectionAsync().catch(() => {});
}

/** A firmer one for a decision that was recorded. */
export function confirmTap(): void {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

// ── Screen ──────────────────────────────────────────────────────────────────

type ScreenProps = {
  title: string;
  /** A second line under a large title, set in the accent colour. */
  accentLine?: string;
  subtitle?: string;
  /** Drawn in place of the large title, for a screen that sets its own top. */
  header?: ReactNode;
  /** A pushed screen shows a back button in the navigation bar. */
  back?: { label: string; onPress: () => void };
  /** Up to two controls on the right of the navigation bar. */
  right?: ReactNode;
  /** Large title under the bar (tab roots) or a centred inline title (pushed screens). */
  large?: boolean;
  /** Pass false when the screen brings its own list, such as a FlatList. */
  scroll?: boolean;
  refreshControl?: ReactElement<RefreshControlProps>;
  children: ReactNode;
};

export function Screen({
  title,
  accentLine,
  subtitle,
  header: customHeader,
  back,
  right,
  large = !back,
  scroll = true,
  refreshControl,
  children,
}: ScreenProps) {
  const header = (
    <>
      {(back || right || !large) && (
        <View style={styles.navBar}>
          <View style={styles.navSide}>
            {back && (
              <Pressable onPress={back.onPress} hitSlop={12} style={styles.backButton}>
                <Ionicons name="chevron-back" size={26} color={accent.base} />
                <Text style={styles.backText} numberOfLines={1}>
                  {back.label}
                </Text>
              </Pressable>
            )}
          </View>
          {!large && (
            <Text style={styles.navTitle} numberOfLines={1}>
              {title}
            </Text>
          )}
          <View style={[styles.navSide, styles.navRight]}>{right}</View>
        </View>
      )}
      {large && customHeader}
      {large && !customHeader && (
        <View style={styles.largeHeader}>
          <Text style={styles.largeTitle}>
            {title}
            {accentLine ? <Text style={styles.largeAccent}>{`\n${accentLine}`}</Text> : null}
          </Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
      )}
    </>
  );

  return (
    <SafeAreaView edges={["top"]} style={styles.screen}>
      <StatusBar barStyle={statusBar()} backgroundColor={bg.canvas} />
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scrollBody}
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl}
        >
          {header}
          {!large && subtitle ? <Text style={styles.inlineSubtitle}>{subtitle}</Text> : null}
          <View style={styles.sections}>{children}</View>
        </ScrollView>
      ) : (
        <>
          {header}
          <View style={{ flex: 1 }}>{children}</View>
        </>
      )}
    </SafeAreaView>
  );
}

/** The navigation bar alone, for a screen that lays out its own body. */
export function NavBar({
  title,
  back,
  right,
}: {
  title?: string;
  back?: { label: string; onPress: () => void };
  right?: ReactNode;
}) {
  return (
    <View style={styles.navBar}>
      <View style={styles.navSide}>
        {back && (
          <Pressable onPress={back.onPress} hitSlop={12} style={styles.backButton}>
            <Ionicons name="chevron-back" size={26} color={accent.base} />
            <Text style={styles.backText} numberOfLines={1}>
              {back.label}
            </Text>
          </Pressable>
        )}
      </View>
      {title ? (
        <Text style={styles.navTitle} numberOfLines={1}>
          {title}
        </Text>
      ) : null}
      <View style={[styles.navSide, styles.navRight]}>{right}</View>
    </View>
  );
}

/** A plain navigation-bar button, text or icon, in the tint colour. */
export function NavButton({
  label,
  icon,
  onPress,
  disabled,
}: {
  label?: string;
  icon?: IconName;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={10} style={({ pressed }) => pressed && { opacity: 0.5 }}>
      {icon ? (
        <Ionicons name={icon} size={24} color={disabled ? text.faint : accent.base} />
      ) : (
        <Text style={[styles.navButton, disabled && { color: text.faint }]}>{label}</Text>
      )}
    </Pressable>
  );
}

// ── Grouped list ────────────────────────────────────────────────────────────

/** An inset grouped section: an optional header, rounded rows, a footnote. */
export function Group({
  header,
  footer,
  children,
}: {
  header?: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View>
      {header ? <Text style={styles.groupHeader}>{header}</Text> : null}
      <View style={styles.group}>
        {rows.map((row, i) => (
          <Fragment key={row.key ?? i}>
            {i > 0 && <View style={styles.separator} />}
            {row}
          </Fragment>
        ))}
      </View>
      {footer ? <Text style={styles.groupFooter}>{footer}</Text> : null}
    </View>
  );
}

/** A glyph in a soft circle of its own colour. */
export function IconTile({ name, color = tile.grey }: { name: IconName; color?: string }) {
  return (
    <View style={[styles.tile, { backgroundColor: `${color}24` }]}>
      <Ionicons name={name} size={18} color={color} />
    </View>
  );
}

type RowProps = {
  title: string;
  subtitle?: string;
  value?: string;
  icon?: IconName;
  iconColor?: string;
  /** Anything to draw at the leading edge instead of an icon tile. */
  leading?: ReactNode;
  /** Anything to draw at the trailing edge instead of a value. */
  trailing?: ReactNode;
  onPress?: () => void;
  /** Shown by default whenever the row navigates. */
  chevron?: boolean;
  destructive?: boolean;
  tint?: boolean;
  busy?: boolean;
  disabled?: boolean;
  monoValue?: boolean;
};

export function Row({
  title,
  subtitle,
  value,
  icon,
  iconColor,
  leading,
  trailing,
  onPress,
  chevron = !!onPress,
  destructive,
  tint,
  busy,
  disabled,
  monoValue,
}: RowProps) {
  const body = (
    <>
      {leading ?? (icon ? <IconTile name={icon} color={iconColor} /> : null)}
      <View style={styles.rowText}>
        <Text
          style={[
            styles.rowTitle,
            destructive && { color: tile.red },
            tint && { color: accent.base },
            disabled && { color: text.faint },
          ]}
          numberOfLines={2}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.rowSubtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {busy ? (
        <ActivityIndicator size="small" color={text.muted} />
      ) : (
        trailing ??
        (value ? (
          <Text style={[styles.rowValue, monoValue && styles.mono]} numberOfLines={1}>
            {value}
          </Text>
        ) : null)
      )}
      {chevron && <Ionicons name="chevron-forward" size={18} color={text.faint} />}
    </>
  );

  if (!onPress) return <View style={styles.row}>{body}</View>;
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      disabled={disabled || busy}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      {body}
    </Pressable>
  );
}

export function SwitchRow({
  title,
  subtitle,
  icon,
  iconColor,
  value,
  onChange,
  disabled,
}: {
  title: string;
  subtitle?: string;
  icon?: IconName;
  iconColor?: string;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Row
      title={title}
      subtitle={subtitle}
      icon={icon}
      iconColor={iconColor}
      disabled={disabled}
      trailing={
        <Switch
          value={value}
          disabled={disabled}
          onValueChange={(next) => {
            tap();
            onChange(next);
          }}
          trackColor={{ false: bg.borderStrong, true: accent.deep }}
          thumbColor={text.onAccent}
          ios_backgroundColor={bg.borderStrong}
        />
      }
    />
  );
}

/** A row that is a choice among several, ticked when selected. */
export function ChoiceRow({
  title,
  subtitle,
  selected,
  onPress,
}: {
  title: string;
  subtitle?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Row
      title={title}
      subtitle={subtitle}
      onPress={onPress}
      chevron={false}
      trailing={selected ? <Ionicons name="checkmark" size={20} color={accent.base} /> : null}
    />
  );
}

/** A labelled text field laid out as a list row. */
export function FieldRow({
  label,
  ...input
}: { label: string } & TextInputProps) {
  return (
    <View style={styles.row}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        placeholderTextColor={text.faint}
        style={styles.fieldInput}
        {...input}
      />
    </View>
  );
}

// ── Buttons and bits ───────────────────────────────────────────────────────

export function Button({
  title,
  onPress,
  kind = "filled",
  busy,
  disabled,
  icon,
}: {
  title: string;
  onPress: () => void;
  kind?: "filled" | "tinted" | "plain" | "destructive";
  busy?: boolean;
  disabled?: boolean;
  icon?: IconName;
}) {
  const filled = kind === "filled";
  const colour =
    kind === "destructive" ? tile.red : filled ? text.onAccent : accent.base;
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.button,
        filled && { backgroundColor: accent.deep },
        kind === "tinted" && { backgroundColor: accent.soft },
        kind === "destructive" && { backgroundColor: `${tile.red}24` },
        (pressed || disabled) && { opacity: 0.55 },
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={colour} />
      ) : (
        <View style={styles.buttonInner}>
          {icon && <Ionicons name={icon} size={18} color={colour} />}
          <Text style={[styles.buttonText, { color: colour }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

/** A small rounded status chip: a coloured dot and a word. */
export function Pill({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: `${color}26` }]}>
      <View style={[styles.pillDot, { backgroundColor: color }]} />
      <Text style={[styles.pillText, { color }]}>{label}</Text>
    </View>
  );
}

/** An iOS segmented control. Scrolls sideways when it has many segments. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0 }}
      contentContainerStyle={styles.segmentWrap}
    >
      <View style={styles.segments}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <Pressable
              key={o.value}
              onPress={() => {
                if (!on) {
                  tap();
                  onChange(o.value);
                }
              }}
              style={[styles.segment, on && styles.segmentOn]}
            >
              <Text style={[styles.segmentText, on && styles.segmentTextOn]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

/** A centred message for an empty or failed list. */
export function Empty({ icon, title, body }: { icon: IconName; title: string; body?: string }) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={40} color={text.faint} />
      <Text style={styles.emptyTitle}>{title}</Text>
      {body ? <Text style={styles.emptyBody}>{body}</Text> : null}
    </View>
  );
}

/** Initials in a circle, for the profile. */
export function Avatar({ name, size = 56 }: { name: string; size?: number }) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?";
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.38 }]}>{initials}</Text>
    </View>
  );
}

export const ios = themed(() => ({
  /** Padding for content laid directly on the canvas, outside a Group. */
  inset: { paddingHorizontal: space.lg },
}));

const styles = themed(() => ({
  screen: { flex: 1, backgroundColor: bg.canvas },
  scrollBody: { paddingBottom: 40 },
  sections: { paddingHorizontal: space.lg, gap: space.xl, paddingTop: space.sm },

  navBar: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.sm,
  },
  navSide: { flex: 1, flexDirection: "row", alignItems: "center" },
  navRight: { justifyContent: "flex-end", gap: space.lg, paddingRight: space.sm },
  navTitle: { color: text.primary, fontSize: 17, fontWeight: "700", maxWidth: "50%" },
  navButton: { color: accent.base, fontSize: 16, fontWeight: "600" },
  backButton: { flexDirection: "row", alignItems: "center", maxWidth: 160 },
  backText: { color: accent.base, fontSize: 16, fontWeight: "500", marginLeft: -2 },

  largeHeader: { paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.sm },
  largeTitle: { color: text.primary, fontFamily: serif.regular, fontSize: 34, lineHeight: 40, letterSpacing: -0.9 },
  largeAccent: { color: accent.base, fontFamily: serif.italic },
  subtitle: { color: text.muted, fontSize: 15, marginTop: 4 },
  inlineSubtitle: {
    color: text.muted,
    fontSize: 13,
    textAlign: "center",
    paddingHorizontal: space.xl,
    marginBottom: space.sm,
  },

  groupHeader: {
    color: text.primary,
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: -0.3,
    marginLeft: 4,
    marginBottom: 10,
  },
  group: {
    backgroundColor: bg.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: bg.border,
    overflow: "hidden",
  },
  groupFooter: {
    color: text.muted,
    fontSize: 13,
    lineHeight: 18,
    marginHorizontal: 4,
    marginTop: 8,
  },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: bg.border, marginLeft: space.lg },

  row: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: 13,
  },
  rowPressed: { backgroundColor: bg.elevated },
  rowText: { flex: 1 },
  rowTitle: { color: text.primary, fontSize: 16, fontWeight: "600" },
  rowSubtitle: { color: text.muted, fontSize: 13, marginTop: 3, lineHeight: 18 },
  rowValue: { color: text.muted, fontSize: 15, fontWeight: "500", maxWidth: "55%" },
  mono: { ...mono, fontSize: 14 },

  tile: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },

  fieldLabel: { color: text.primary, fontSize: 16, fontWeight: "600", width: 110 },
  fieldInput: { flex: 1, color: text.primary, fontSize: 16, paddingVertical: 0 },

  button: {
    minHeight: 52,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.xl,
  },
  buttonInner: { flexDirection: "row", alignItems: "center", gap: space.sm },
  buttonText: { fontSize: 16, fontWeight: "700" },

  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: "flex-start",
  },
  pillDot: { width: 7, height: 7, borderRadius: 4 },
  pillText: { fontSize: 12, fontWeight: "700", letterSpacing: 0.2 },

  segmentWrap: { paddingHorizontal: space.lg },
  segments: {
    flexDirection: "row",
    backgroundColor: bg.card,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: bg.border,
    padding: 4,
    gap: 2,
  },
  segment: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.pill },
  segmentOn: { backgroundColor: accent.deep },
  segmentText: { color: text.secondary, fontSize: 13, fontWeight: "600" },
  segmentTextOn: { color: text.onAccent, fontWeight: "700" },

  empty: { alignItems: "center", paddingVertical: 48, paddingHorizontal: space.xl, gap: space.sm },
  emptyTitle: { color: text.primary, fontFamily: serif.regular, fontSize: 22, letterSpacing: -0.4, textAlign: "center" },
  emptyBody: { color: text.muted, fontSize: 15, lineHeight: 21, textAlign: "center" },

  avatar: { backgroundColor: accent.deep, alignItems: "center", justifyContent: "center" },
  avatarText: { color: text.onAccent, fontWeight: "700" },
}));
