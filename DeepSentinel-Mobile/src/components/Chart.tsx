import { StyleSheet, Text, View } from "react-native";

import { accent, bg, mono, radius, risk, riskColour, space, text } from "../theme/tokens";

/**
 * Charts built from Views rather than a charting library.
 *
 * The app has no drawing dependency and does not need one for these two shapes:
 * a stacked proportion and a column of bars are both flex layouts. Adding
 * react-native-svg to draw eleven rectangles would cost more than it returns,
 * and every colour here already exists as a token, so a severity is the same
 * hue on the phone as on the dashboard and in the alert email.
 */

/**
 * One bar, split by severity, with the counts beside it.
 *
 * A proportion is easier to read as one bar than as a ring or five separate
 * numbers: the eye compares lengths well and angles badly, and the question
 * being asked here is "how much of the traffic was critical", which is a
 * comparison of parts to a whole.
 */
export function SeverityBar({
  counts,
}: {
  counts: Record<string, number>;
}) {
  const ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
  const present = ORDER.map((k) => ({ key: k, n: counts[k] ?? 0 })).filter((s) => s.n > 0);
  const total = present.reduce((a, s) => a + s.n, 0);

  if (!total) {
    return <Text style={styles.empty}>Nothing screened yet.</Text>;
  }

  return (
    <View style={{ gap: space.md }}>
      <View style={styles.stack}>
        {present.map((s, i) => (
          <View
            key={s.key}
            style={{
              flex: s.n,
              backgroundColor: riskColour(s.key),
              // A hairline of canvas between segments, so two adjacent
              // severities read as two bands rather than one gradient.
              marginLeft: i === 0 ? 0 : 2,
            }}
          />
        ))}
      </View>

      <View style={styles.legend}>
        {present.map((s) => (
          <View key={s.key} style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: riskColour(s.key) }]} />
            <Text style={styles.legendLabel}>{s.key.toLowerCase()}</Text>
            <Text style={styles.legendValue}>{s.n.toLocaleString()}</Text>
            <Text style={styles.legendPct}>
              {((s.n / total) * 100).toFixed(0)}%
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * Screening volume per hour, with the alerted share filled in.
 *
 * The tallest bar is labelled and the rest are not: a number on every column
 * turns a shape into a table, and the shape is the point. Empty hours keep
 * their slot so a gap reads as "nothing happened then" rather than compressing
 * the timeline.
 */
export function VolumeChart({
  buckets,
  height = 96,
}: {
  buckets: { label: string; total: number; alerted: number }[];
  height?: number;
}) {
  const peak = Math.max(1, ...buckets.map((b) => b.total));
  const anything = buckets.some((b) => b.total > 0);

  if (!anything) {
    return <Text style={styles.empty}>No activity in the last {buckets.length} hours.</Text>;
  }

  return (
    <View style={{ gap: space.sm }}>
      <View style={[styles.plot, { height }]}>
        {buckets.map((b, i) => {
          const h = (b.total / peak) * height;
          const alerted = b.total ? (b.alerted / b.total) * h : 0;
          const tallest = b.total === peak;
          return (
            <View key={i} style={styles.column}>
              {tallest && b.total > 0 && (
                <Text style={styles.peakLabel}>{b.total}</Text>
              )}
              <View
                style={{
                  width: "100%",
                  height: Math.max(b.total > 0 ? 3 : 1, h),
                  borderRadius: 2,
                  backgroundColor: b.total > 0 ? accent.dark : bg.border,
                  justifyContent: "flex-end",
                  overflow: "hidden",
                }}
              >
                {alerted > 0 && (
                  <View
                    style={{
                      height: Math.max(2, alerted),
                      backgroundColor: risk.CRITICAL,
                    }}
                  />
                )}
              </View>
            </View>
          );
        })}
      </View>

      <View style={styles.axis}>
        <Text style={styles.axisLabel}>{buckets[0]?.label}:00</Text>
        <Text style={styles.axisLabel}>now</Text>
      </View>

      <View style={styles.keyRow}>
        <View style={[styles.dot, { backgroundColor: accent.dark }]} />
        <Text style={styles.keyText}>screened</Text>
        <View style={[styles.dot, { backgroundColor: risk.CRITICAL, marginLeft: space.md }]} />
        <Text style={styles.keyText}>alerted</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    flexDirection: "row",
    height: 10,
    borderRadius: radius.sm,
    overflow: "hidden",
    backgroundColor: bg.border,
  },

  legend: { gap: space.sm },
  legendItem: { flexDirection: "row", alignItems: "center", gap: space.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { color: text.secondary, fontSize: 15, flex: 1 },
  legendValue: {
    ...mono,
    color: text.primary,
    fontSize: 15,
    fontVariant: ["tabular-nums"],
  },
  legendPct: {
    ...mono,
    color: text.muted,
    fontSize: 13,
    width: 40,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },

  plot: { flexDirection: "row", alignItems: "flex-end", gap: 3 },
  column: { flex: 1, justifyContent: "flex-end", alignItems: "center", gap: 3 },
  peakLabel: {
    ...mono,
    color: text.muted,
    fontSize: 11,
    fontVariant: ["tabular-nums"],
  },

  axis: { flexDirection: "row", justifyContent: "space-between" },
  axisLabel: { ...mono, color: text.faint, fontSize: 11 },

  keyRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  keyText: { color: text.muted, fontSize: 13 },

  empty: { color: text.muted, fontSize: 15, paddingVertical: space.md },
});
