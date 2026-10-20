import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  decideSar,
  generateSar,
  getSar,
  reviseSar,
  shareReportPdf,
  type SarDraft,
} from "../api/reports";
import { ago } from "../lib/format";
import { accent, bg, mono, radius, riskColour, space, text, themed } from "../theme/tokens";
import { Label, Note } from "./ui";

/**
 * The paperwork an alert turns into: the forensic report as a PDF, and a
 * suspicious activity report drafted for an officer to review.
 *
 * The draft is a draft. The language model writes it, an officer edits and
 * approves it, and the platform never files it; the server says so on every
 * draft and so does this panel.
 */
export default function SarPanel({
  analysisId,
  transactionId,
}: {
  analysisId: number;
  transactionId: string;
}) {
  const [draft, setDraft] = useState<SarDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<null | "generate" | "save" | "approve" | "reject" | "pdf">(null);
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    getSar(analysisId)
      .then((d) => live && setDraft(d))
      .catch((err) => live && setError((err as Error).message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [analysisId]);

  const run = useCallback(
    async (what: NonNullable<typeof busy>, fn: () => Promise<SarDraft | void>) => {
      setBusy(what);
      setError(null);
      try {
        const next = await fn();
        if (next) setDraft(next);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  const decide = (approve: boolean) =>
    Alert.alert(
      approve ? "Approve this draft?" : "Reject this draft?",
      approve
        ? "Approval attributes the text to you. It does not file the report; filing stays a separate act in your institution's own system."
        : "The draft is kept for the record and marked rejected.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: approve ? "Approve" : "Reject",
          style: approve ? "default" : "destructive",
          onPress: () =>
            run(approve ? "approve" : "reject", () => decideSar(draft!.id, approve)),
        },
      ],
    );

  // A draft under review can still be edited and decided; only a decision closes it.
  const decided = draft?.status === "approved" || draft?.status === "rejected";

  return (
    <View>
      <Pressable
        onPress={() => run("pdf", () => shareReportPdf(analysisId, transactionId))}
        disabled={busy !== null}
        style={({ pressed }) => [styles.primary, (pressed || busy === "pdf") && styles.dim]}
      >
        {busy === "pdf" ? (
          <ActivityIndicator size="small" color={bg.canvas} />
        ) : (
          <Text style={styles.primaryText}>Share forensic report (PDF)</Text>
        )}
      </Pressable>
      <Note>
        The same document the alert email attaches, built from the stored record.
      </Note>

      <View style={styles.block}>
        <Label>Suspicious activity report</Label>

        {loading ? (
          <ActivityIndicator color={text.muted} style={{ marginTop: space.md }} />
        ) : !draft ? (
          <>
            <Note>
              No draft yet. Drafting asks the language model to write the report from this
              alert's stored evidence and narrative, which takes up to a minute.
            </Note>
            <Pressable
              onPress={() => run("generate", () => generateSar(analysisId))}
              disabled={busy !== null}
              style={({ pressed }) => [styles.secondary, pressed && styles.dim]}
            >
              {busy === "generate" ? (
                <ActivityIndicator size="small" color={text.secondary} />
              ) : (
                <Text style={styles.secondaryText}>Draft a SAR</Text>
              )}
            </Pressable>
          </>
        ) : (
          <>
            <View style={styles.meta}>
              <Text
                style={[
                  styles.status,
                  {
                    color:
                      draft.status === "approved"
                        ? riskColour("LOW")
                        : draft.status === "rejected"
                          ? riskColour("CRITICAL")
                          : accent.base,
                  },
                ]}
              >
                {draft.status.replace(/_/g, " ").toUpperCase()}
              </Text>
              <Text style={styles.metaText}>
                {draft.was_edited ? "edited · " : ""}
                {draft.reviewed_by
                  ? `${draft.reviewed_by} · ${ago(draft.reviewed_at)}`
                  : `drafted ${ago(draft.generated_at)}`}
              </Text>
            </View>
            <Text style={styles.watermark}>{draft.watermark}</Text>

            {editing ? (
              <TextInput
                value={edit}
                onChangeText={setEdit}
                multiline
                style={styles.editor}
                textAlignVertical="top"
              />
            ) : (
              <Text style={styles.body} selectable>
                {draft.text}
              </Text>
            )}

            <View style={styles.row}>
              {editing ? (
                <>
                  <Button label="Cancel" onPress={() => setEditing(false)} />
                  <Button
                    label="Save edits"
                    busy={busy === "save"}
                    disabled={busy !== null || edit === draft.text}
                    onPress={() =>
                      run("save", async () => {
                        const next = await reviseSar(draft.id, edit);
                        setEditing(false);
                        return next;
                      })
                    }
                  />
                </>
              ) : (
                <>
                  <Button
                    label="Edit"
                    disabled={busy !== null || decided}
                    onPress={() => {
                      setEdit(draft.text);
                      setEditing(true);
                    }}
                  />
                  <Button
                    label="Share text"
                    onPress={() =>
                      Share.share({
                        title: `SAR draft ${transactionId}`,
                        message: `${draft.watermark}\n\n${draft.text}`,
                      })
                    }
                  />
                </>
              )}
            </View>
            {!editing && !decided && (
              <View style={styles.row}>
                <Button
                  label="Reject"
                  tone={riskColour("CRITICAL")}
                  busy={busy === "reject"}
                  disabled={busy !== null}
                  onPress={() => decide(false)}
                />
                <Button
                  label="Approve"
                  tone={riskColour("LOW")}
                  busy={busy === "approve"}
                  disabled={busy !== null}
                  onPress={() => decide(true)}
                />
              </View>
            )}
            <Note>This system drafts. It never files a report.</Note>
          </>
        )}
        {error && <Text style={styles.error}>{error}</Text>}
      </View>
    </View>
  );
}

function Button({
  label,
  onPress,
  disabled,
  busy,
  tone,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  tone?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        tone ? { borderColor: tone } : null,
        (pressed || disabled) && styles.dim,
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={text.secondary} />
      ) : (
        <Text style={[styles.buttonText, tone ? { color: tone } : null]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = themed(() => ({
  primary: {
    backgroundColor: accent.base,
    borderRadius: radius.md,
    paddingVertical: space.md,
    alignItems: "center",
  },
  primaryText: { color: bg.canvas, fontSize: 14, fontWeight: "700" },
  secondary: {
    marginTop: space.md,
    borderWidth: 1,
    borderColor: bg.borderStrong,
    borderRadius: radius.md,
    paddingVertical: space.md,
    alignItems: "center",
  },
  secondaryText: { color: text.secondary, fontSize: 14, fontWeight: "600" },
  dim: { opacity: 0.6 },

  block: {
    marginTop: space.xl,
    paddingTop: space.lg,
    borderTopWidth: 1,
    borderTopColor: bg.border,
  },
  meta: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.md },
  status: { fontSize: 11, fontWeight: "700", letterSpacing: 0.8 },
  metaText: { color: text.faint, fontSize: 11 },
  watermark: { ...mono, color: text.faint, fontSize: 10, marginTop: space.sm },
  body: { color: text.secondary, fontSize: 13, lineHeight: 20, marginTop: space.md },
  editor: {
    marginTop: space.md,
    minHeight: 240,
    borderWidth: 1,
    borderColor: bg.borderStrong,
    borderRadius: radius.md,
    padding: space.md,
    color: text.primary,
    fontSize: 13,
    lineHeight: 20,
  },
  row: { flexDirection: "row", gap: space.sm, marginTop: space.md },
  button: {
    flex: 1,
    borderWidth: 1,
    borderColor: bg.borderStrong,
    borderRadius: radius.md,
    paddingVertical: space.sm + 2,
    alignItems: "center",
  },
  buttonText: { color: text.secondary, fontSize: 13, fontWeight: "600" },
  error: { color: riskColour("CRITICAL"), fontSize: 12, marginTop: space.md, lineHeight: 18 },
}));
