import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

import { API_BASE } from "../config";
import { ApiError, NetworkError, getAuthToken, request } from "./client";

/**
 * The two documents an analysis turns into: a SAR draft for the compliance
 * officer, and the forensic report as a filed PDF.
 */

/** One SAR draft, as `backend/sar.py` serialises it. */
export type SarDraft = {
  id: number;
  analysis_id: number;
  status: string;
  generated_text: string;
  edited_text: string | null;
  /** The edited text when there is one, otherwise the generated text. */
  text: string;
  was_edited: boolean;
  model_version: string | null;
  generated_by: string | null;
  generated_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  watermark: string;
  /** Always false. The platform drafts; filing is the institution's own act. */
  filed: boolean;
};

/** The latest draft, or null when none has been generated yet. */
export async function getSar(analysisId: number): Promise<SarDraft | null> {
  try {
    return await request<SarDraft>(`/analyses/${analysisId}/sar`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

/** Drafting calls the language model, so it gets the long deadline. */
export const generateSar = (analysisId: number) =>
  request<SarDraft>(`/analyses/${analysisId}/sar`, { method: "POST", timeoutMs: 120_000 });

export const reviseSar = (draftId: number, text: string) =>
  request<SarDraft>(`/analyses/sar/${draftId}`, { method: "PATCH", body: { text } });

export const decideSar = (draftId: number, approve: boolean, note?: string) =>
  request<SarDraft>(`/analyses/sar/${draftId}/decision`, {
    method: "POST",
    body: { approve, ...(note?.trim() ? { note: note.trim() } : {}) },
  });

/**
 * Download the forensic report PDF and hand it to the system share sheet.
 *
 * Downloaded to the cache first rather than opened as a URL: the endpoint is
 * behind the bearer token, and a share target such as a mail app cannot carry
 * it. What is shared is the same bytes the alert email attaches.
 */
export async function shareReportPdf(analysisId: number, transactionId: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Sharing is not available on this device.");
  }
  const token = getAuthToken();
  const safeName = transactionId.replace(/[^A-Za-z0-9_-]/g, "_");
  const target = `${FileSystem.cacheDirectory}DeepSentinel-${safeName}.pdf`;

  let result: FileSystem.FileSystemDownloadResult;
  try {
    result = await FileSystem.downloadAsync(
      `${API_BASE}/analyses/${analysisId}/report.pdf`,
      target,
      { headers: token ? { Authorization: `Bearer ${token}` } : {} },
    );
  } catch {
    throw new NetworkError(`Cannot reach the backend at ${API_BASE}.`);
  }

  if (result.status !== 200) {
    // The error body was written into the file; it is not a PDF, so drop it.
    await FileSystem.deleteAsync(target, { idempotent: true });
    throw new ApiError(
      result.status,
      result.status === 404
        ? "No report is stored for this analysis."
        : `The backend returned ${result.status} for the report.`,
    );
  }

  await Sharing.shareAsync(result.uri, {
    mimeType: "application/pdf",
    dialogTitle: `Forensic report ${transactionId}`,
    UTI: "com.adobe.pdf",
  });
}
