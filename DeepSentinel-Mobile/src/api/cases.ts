import type { BehaviouralEvidence, TemporalEvidence } from "./analyses";
import { request } from "./client";

/**
 * The case desk: what the live monitor detected, and what an analyst decided.
 *
 * Cases and analyses are two stores, not one. The monitor writes a case for
 * every transaction it screens and the analyzer writes an analysis, so a case
 * is reviewed here and an analysis is drafted into a SAR on the case screen.
 */

/** The verdicts the backend accepts on `PATCH /cases/{ref}/review`. */
export const REVIEW_STATUSES = [
  "open",
  "investigating",
  "confirmed_fraud",
  "false_positive",
  "closed",
] as const;

export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const REVIEW_LABEL: Record<ReviewStatus, string> = {
  open: "Open",
  investigating: "Investigating",
  confirmed_fraud: "Confirmed fraud",
  false_positive: "False positive",
  closed: "Closed",
};

/** One row of `GET /cases`. */
export type Case = {
  case_ref: string;
  transaction_id: string;
  detected_at: string | null;
  classification: string;
  fused_score: number | null;
  graph_score: number | null;
  behavioral_score: number | null;
  temporal_score: number | null;
  graph_available: boolean | null;
  behavioral_available: boolean | null;
  temporal_available: boolean | null;
  modalities_used: number | null;
  uncertainty_penalty_applied: boolean | null;
  typology_name: string | null;
  typology_id: string | null;
  graph_pattern: string | null;
  sink_account: string | null;
  /** The subgraph exactly as the relational detector returned it. */
  graph_evidence: Record<string, unknown> | null;
  forensic_report: string | null;
  screening_ms: number | null;
  total_ms: number | null;
  alert_sent: boolean | null;
  alerted_at: string | null;
  recipients: string[] | null;
  review_status: ReviewStatus | string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  label_is_fraud: boolean | null;
};

/** `GET /cases/{ref}` adds the two evidence blobs the list leaves out, and a timeline. */
export type CaseDetail = Case & {
  behavioral_evidence: BehaviouralEvidence | null;
  temporal_evidence: TemporalEvidence | null;
  timeline: { stage: string; at: string | null; detail: string }[];
};

export const listCases = (
  opts: { limit?: number; reviewStatus?: string; classification?: string } = {},
) => {
  const params = new URLSearchParams();
  params.set("limit", String(opts.limit ?? 50));
  if (opts.reviewStatus) params.set("review_status", opts.reviewStatus);
  if (opts.classification) params.set("classification", opts.classification);
  return request<{ cases: Case[] }>(`/cases?${params.toString()}`).then((r) => r.cases);
};

export const getCase = (caseRef: string) =>
  request<CaseDetail>(`/cases/${encodeURIComponent(caseRef)}`);

/**
 * Record a verdict. The server attributes it to the signed-in user and writes
 * it to the audit log, so nothing here sends a name.
 */
export const reviewCase = (caseRef: string, status: ReviewStatus, note?: string) =>
  request<Case>(`/cases/${encodeURIComponent(caseRef)}/review`, {
    method: "PATCH",
    body: { review_status: status, ...(note?.trim() ? { note: note.trim() } : {}) },
  });

/**
 * The case recorded for a transaction, if the monitor recorded one.
 *
 * The live feed knows a transaction, not a case reference: the reference is
 * minted when the row is written, after the alert is published. The list is
 * newest first, so a recent alert is near the top of it.
 */
export async function findCaseByTransaction(transactionId: string): Promise<Case | null> {
  const cases = await listCases({ limit: 200 });
  return cases.find((c) => c.transaction_id === transactionId) ?? null;
}
