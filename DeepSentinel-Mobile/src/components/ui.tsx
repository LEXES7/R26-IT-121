import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { percent } from "../lib/format";
import { bg, modality, mono, radius, riskColour, space, text } from "../theme/tokens";

/** The small pieces every screen builds from. */

export function Card({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Label({ children }: { children: ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

export function RiskBadge({ level }: { level?: string | null }) {
  const colour = riskColour(level);
  return (
    <View style={[styles.badge, { borderColor: colour, backgroundColor: `${colour}1A` }]}>
      <Text style={[styles.badgeText, { color: colour }]}>
        {(level ?? "UNKNOWN").toUpperCase()}
      </Text>
    </View>
  );
}

/**
 * Which detectors answered for this transaction.
 *
 * The point of showing this next to every score is that a confidence built
 * from one detector is not the same claim as one built from three. A hollow
 * dot is a detector that did not answer and was excluded from the fusion —
 * not a detector that found nothing.
 */
export const MODALITIES = [
  ["behavioral", "Behavioural", modality.behavioral],
  ["graph", "Graph", modality.graph],
  ["temporal", "Temporal", modality.temporal],
] as const;

export function ModalityDots({
  answered,
}: {
  answered: { behavioral: boolean; graph: boolean; temporal: boolean };
}) {
  const used = MODALITIES.filter(([k]) => answered[k]).length;
  return (
    <View style={styles.dotsRow}>
      {MODALITIES.map(([key, , colour]) => (
        <View
          key={key}
          style={[
            styles.modalityDot,
            answered[key]
              ? { backgroundColor: colour, borderColor: colour }
              : { borderColor: text.faint },
          ]}
        />
      ))}
      <Text style={styles.dotsText}>{used} of 3</Text>
    </View>
  );
}

/** A 0–1 score as a bar. Colour carries the severity, never decoration. */
export function ScoreBar({
  value,
  colour,
  height = 6,
}: {
  value: number | null | undefined;
  colour: string;
  height?: number;
}) {
  const pct = typeof value === "number" ? Math.max(0, Math.min(1, value)) : 0;
  return (
    <View style={[styles.barTrack, { height, borderRadius: height / 2 }]}>
      <View
        style={{
          width: `${pct * 100}%`,
          height: "100%",
          backgroundColor: colour,
          borderRadius: height / 2,
        }}
      />
    </View>
  );
}

/** One attribution share: a name, a proportional bar, and the number. */
export function ShareRow({
  name,
  value,
  colour,
}: {
  name: string;
  value: number;
  colour: string;
}) {
  return (
    <View style={styles.shareRow}>
      <Text style={styles.shareName} numberOfLines={1}>
        {name}
      </Text>
      <View style={styles.shareBar}>
        <ScoreBar value={value} colour={colour} height={5} />
      </View>
      <Text style={styles.shareValue}>{percent(value, 1)}</Text>
    </View>
  );
}

/**
 * A section that starts collapsed.
 *
 * A phone cannot show a full forensic decomposition and a graph subgraph at
 * once without becoming a wall. Collapsing lets the verdict stay at the top
 * and the reasoning stay one tap away.
 */
export function Section({
  title,
  subtitle,
  accent: accentColour,
  initiallyOpen = false,
  disabled = false,
  children,
}: {
  title: string;
  subtitle?: string;
  accent?: string;
  initiallyOpen?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(initiallyOpen && !disabled);
  return (
    <View style={[styles.card, styles.section]}>
      <Pressable
        onPress={() => !disabled && setOpen((o) => !o)}
        style={styles.sectionHead}
        disabled={disabled}
      >
        {accentColour && (
          <View style={[styles.sectionAccent, { backgroundColor: accentColour }]} />
        )}
        <View style={styles.sectionTitles}>
          <Text style={[styles.sectionTitle, disabled && { color: text.faint }]}>
            {title}
          </Text>
          {subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
        </View>
        <Text style={[styles.chevron, disabled && { color: text.faint }]}>
          {disabled ? "—" : open ? "▾" : "▸"}
        </Text>
      </Pressable>
      {open && <View style={styles.sectionBody}>{children}</View>}
    </View>
  );
}

/** A label and a value on one line, for dense factual blocks. */
export function Fact({
  label,
  value,
  monospace = false,
}: {
  label: string;
  value: ReactNode;
  monospace?: boolean;
}) {
  return (
    <View style={styles.factRow}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={[styles.factValue, monospace && mono]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <Text style={styles.note}>{children}</Text>;
}

const styles = StyleSheet.create({
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
  },

  badge: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    alignSelf: "flex-start",
  },
  badgeText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.8 },

  dotsRow: { flexDirection: "row", alignItems: "center", gap: space.xs },
  modalityDot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1.5 },
  dotsText: { color: text.muted, fontSize: 11, marginLeft: space.xs },

  barTrack: { backgroundColor: bg.borderStrong, overflow: "hidden", width: "100%" },

  shareRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginTop: space.sm,
  },
  shareName: { color: text.secondary, fontSize: 12, width: 116 },
  shareBar: { flex: 1 },
  shareValue: { ...mono, color: text.muted, fontSize: 11, width: 46, textAlign: "right" },

  section: { padding: 0, overflow: "hidden" },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.lg,
  },
  sectionAccent: { width: 3, height: 26, borderRadius: 2 },
  sectionTitles: { flex: 1 },
  sectionTitle: { color: text.primary, fontSize: 15, fontWeight: "600" },
  sectionSubtitle: { color: text.muted, fontSize: 12, marginTop: 2 },
  chevron: { color: text.secondary, fontSize: 14 },
  sectionBody: {
    paddingHorizontal: space.lg,
    paddingBottom: space.lg,
    borderTopWidth: 1,
    borderTopColor: bg.border,
    paddingTop: space.lg,
  },

  factRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    marginTop: space.sm,
  },
  factLabel: { color: text.muted, fontSize: 12, flex: 1 },
  factValue: { color: text.secondary, fontSize: 12, flexShrink: 1 },

  note: {
    color: text.faint,
    fontSize: 11,
    lineHeight: 17,
    marginTop: space.md,
  },
});
