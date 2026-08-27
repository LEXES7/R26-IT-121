/**
 * Parsing the fusion engine's forensic report.
 *
 * The engine asks the language model for a fixed five-section report — a
 * header block, then SECTION 1 through SECTION 5 — and passes whatever comes
 * back through untouched. That gives this app a shape to lay out against, but
 * not a guarantee: the text is model output, and a model can drift from the
 * format it was given.
 *
 * So every rule here degrades rather than fails. An unrecognised header line
 * stays in the body, an unnumbered heading still opens a section, and a report
 * with no headings at all renders as one block of prose. The one thing that
 * must never happen is losing a sentence the analyst was meant to read.
 */

export type ReportSection = {
  /** The engine's own numbering, when the model kept it. */
  number: number | null;
  title: string;
  body: string;
};

export type ParsedReport = {
  /** `Transaction ID`, `Classification`, `FATF Typology Match` — the header block. */
  headers: { label: string; value: string }[];
  sections: ReportSection[];
};

/** The `---` the prompt wraps the report in; it is a fence, not content. */
const FENCE = /^\s*-{3,}\s*$/;

/** `SECTION 2 — MULTI-MODAL EVIDENCE ANALYSIS`, allowing any dash the model picks. */
const HEADING = /^\s*SECTION\s+(\d+)?\s*[—–:-]?\s*(.*\S)\s*$/i;

/** A header-block line: a short label, a colon, a value. */
const HEADER_LINE = /^\s*([A-Za-z][A-Za-z0-9 /_-]{0,40}):\s*(.+\S)\s*$/;

/** The report's own title line, which the screen already provides. */
const TITLE = /^\s*(CASE\s+INVESTIGATION\s+)?REPORT\s*$/i;

export function parseReport(raw: string): ParsedReport {
  const headers: { label: string; value: string }[] = [];
  const sections: ReportSection[] = [];
  let current: ReportSection | null = null;
  /** Prose that arrives before any heading — kept, not discarded. */
  const preamble: string[] = [];

  for (const line of raw.replace(/\r\n?/g, "\n").split("\n")) {
    if (FENCE.test(line)) continue;

    const heading = line.match(HEADING);
    if (heading) {
      current = {
        number: heading[1] ? Number(heading[1]) : null,
        title: titleCase(heading[2]),
        body: "",
      };
      sections.push(current);
      continue;
    }

    if (current) {
      current.body += line + "\n";
      continue;
    }

    // Still in the header block.
    if (TITLE.test(clean(line))) continue;
    const header = line.match(HEADER_LINE);
    if (header) {
      headers.push({ label: header[1].trim(), value: clean(header[2]) });
    } else if (line.trim()) {
      preamble.push(line);
    }
  }

  if (preamble.length) {
    sections.unshift({ number: null, title: "", body: preamble.join("\n") });
  }

  for (const section of sections) section.body = section.body.trim();

  return { headers, sections: sections.filter((s) => s.body || s.title) };
}

/**
 * SCREAMING HEADINGS the prompt asked for, made readable.
 *
 * "MULTI-MODAL EVIDENCE ANALYSIS" is shouted because the prompt shouted it,
 * not because it is urgent, and a screen full of capitals reads as alarm.
 * Words already mixed-case are left alone — the model may have chosen them.
 */
function titleCase(heading: string): string {
  if (heading !== heading.toUpperCase()) return clean(heading);
  return clean(heading)
    .toLowerCase()
    .replace(/(^|[\s(—–-])([a-z])/g, (_, before, letter) => before + letter.toUpperCase())
    .replace(/\bFatf\b/g, "FATF");
}

/** Drop the emphasis markers the model adds despite being asked not to. */
function clean(value: string): string {
  return value.replace(/\*\*/g, "").replace(/^#+\s*/, "").trim();
}

export type Segment = { text: string; bold: boolean };

/**
 * Split a paragraph on `**bold**` so it can be rendered rather than shown raw.
 *
 * The prompt forbids commentary but says nothing about emphasis, and models
 * reach for it. Printing the asterisks is worse than either honouring them or
 * stripping them, and honouring them is what the model meant.
 */
export function segments(text: string): Segment[] {
  const out: Segment[] = [];
  for (const [i, piece] of text.split("**").entries()) {
    if (piece) out.push({ text: piece, bold: i % 2 === 1 });
  }
  return out.length ? out : [{ text, bold: false }];
}

/** A body split into paragraphs and bullets, in the order they appear. */
export type Block =
  | { kind: "paragraph"; text: string }
  | { kind: "bullet"; text: string };

const BULLET = /^\s*[-*•]\s+(.*\S)\s*$/;

export function blocks(body: string): Block[] {
  const out: Block[] = [];
  let paragraph: string[] = [];

  const flush = () => {
    const text = clean(paragraph.join(" ").replace(/\s+/g, " "));
    if (text) out.push({ kind: "paragraph", text });
    paragraph = [];
  };

  for (const line of body.split("\n")) {
    const bullet = line.match(BULLET);
    if (bullet) {
      flush();
      out.push({ kind: "bullet", text: clean(bullet[1]) });
    } else if (line.trim()) {
      paragraph.push(line.trim());
    } else {
      flush();
    }
  }
  flush();
  return out;
}

/**
 * The recommendation's direction, for colouring section five.
 *
 * The engine gives the model exactly three verdicts, tied to confidence
 * thresholds, so each pattern matches the whole phrase rather than the verb
 * alone. Looking for "ESCALAT" by itself reads an escalation out of a sentence
 * like "nothing here is worth escalating", which is the opposite decision.
 *
 * Anything that does not match returns null and is left uncoloured rather than
 * guessed at — a wrong colour on a recommendation is a misread decision.
 */
export function recommendation(body: string): "escalate" | "review" | "dismiss" | null {
  const text = body.toUpperCase();
  if (/\bESCALAT(E|ED)\b[^.]{0,40}\bREVIEW\b/.test(text)) return "escalate";
  if (/\bDISMISS(|ED)\b[^.]{0,40}\bMONITORING\b/.test(text)) return "dismiss";
  if (/\bFLAG(|GED)\b[^.]{0,40}\bREVIEW\b/.test(text)) return "review";
  return null;
}
