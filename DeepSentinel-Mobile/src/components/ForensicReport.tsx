import { StyleSheet, Text, View } from "react-native";

import {
  blocks,
  parseReport,
  recommendation,
  segments,
  type ReportSection,
} from "../lib/forensicReport";
import { accent, bg, radius, riskColour, space, text } from "../theme/tokens";
import { Fact, Label, Note } from "./ui";

/**
 * The fusion engine's narrative report, laid out as its five sections.
 *
 * Everything else on the case screen is measured: a score, a feature, a
 * distance. This is the one panel showing prose a language model wrote, and it
 * is set apart deliberately — the editorial accent rather than a modality
 * colour, and a standing note that the numbers it quotes came from the
 * detectors rather than from the model. A reader should never have to work out
 * which parts of this screen are evidence and which are commentary.
 */

/** The three verdicts the engine's prompt allows, and what each one looks like. */
const VERDICT = {
  escalate: { label: "Escalate", tone: riskColour("CRITICAL") },
  review: { label: "Standard review", tone: riskColour("MEDIUM") },
  dismiss: { label: "Dismiss with monitoring", tone: riskColour("LOW") },
} as const;

/**
 * Whether a section is the recommendation, and so may be coloured by verdict.
 *
 * Checked by number and by name rather than by position alone: the model is
 * asked for five sections and usually gives five, but a report that drifts
 * should still colour the right one — and, more importantly, must not colour
 * the wrong one.
 */
function isRecommendation(section: ReportSection): boolean {
  return section.number === 5 || /RECOMMENDATION/i.test(section.title);
}

function Paragraph({ children }: { children: string }) {
  return (
    <Text style={styles.body}>
      {segments(children).map((piece, i) => (
        <Text key={i} style={piece.bold ? styles.strong : undefined}>
          {piece.text}
        </Text>
      ))}
    </Text>
  );
}

export default function ForensicReport({ report }: { report: string }) {
  const { headers, sections } = parseReport(report);

  return (
    <View>
      <Note>
        Written by a language model from the scores and the retrieved typology.
        Every figure it quotes is the detectors' — the model was given them, not
        asked to produce them — but the wording around them is generated, and is
        evidence of nothing on its own.
      </Note>

      {headers.length > 0 && (
        <View style={styles.headerBlock}>
          {headers.map((header) => (
            <Fact key={header.label} label={header.label} value={header.value} />
          ))}
        </View>
      )}

      {sections.map((section, index) => {
        const verdict = isRecommendation(section)
          ? recommendation(section.body)
          : null;

        return (
          <View
            key={index}
            style={[styles.section, index === 0 && styles.firstSection]}
          >
            {!!section.title && (
              <View style={styles.sectionHead}>
                {section.number !== null && (
                  <Text style={styles.sectionNumber}>{section.number}</Text>
                )}
                <Label>{section.title}</Label>
              </View>
            )}

            {verdict && (
              <View style={[styles.verdict, { borderColor: VERDICT[verdict].tone }]}>
                <Text style={[styles.verdictText, { color: VERDICT[verdict].tone }]}>
                  {VERDICT[verdict].label}
                </Text>
              </View>
            )}

            {blocks(section.body).map((block, i) =>
              block.kind === "bullet" ? (
                <View key={i} style={styles.bulletRow}>
                  <Text style={styles.bulletDot}>•</Text>
                  <View style={styles.bulletBody}>
                    <Paragraph>{block.text}</Paragraph>
                  </View>
                </View>
              ) : (
                <Paragraph key={i}>{block.text}</Paragraph>
              ),
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  headerBlock: {
    marginTop: space.md,
    paddingBottom: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: bg.border,
  },

  section: { marginTop: space.lg },
  firstSection: { marginTop: space.md },

  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginBottom: space.sm,
  },
  /**
   * The engine's own section number, kept because the report is a document an
   * analyst may end up citing — "section 4 says" has to mean something.
   */
  sectionNumber: {
    color: accent.base,
    fontSize: 10,
    fontWeight: "700",
    minWidth: 16,
    height: 16,
    lineHeight: 16,
    textAlign: "center",
    borderRadius: radius.sm,
    backgroundColor: bg.raised,
    overflow: "hidden",
  },

  body: {
    color: text.secondary,
    fontSize: 13,
    lineHeight: 20,
    marginTop: space.xs,
  },
  strong: { color: text.primary, fontWeight: "700" },

  bulletRow: { flexDirection: "row", gap: space.sm, marginTop: space.xs },
  bulletDot: { color: text.faint, fontSize: 13, lineHeight: 20 },
  bulletBody: { flex: 1 },

  verdict: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 3,
    marginBottom: space.xs,
  },
  verdictText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
});
