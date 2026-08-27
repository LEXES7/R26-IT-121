import { request } from "./client";
import type { BehaviouralEvidence, GraphEvidence } from "./analyses";

/**
 * Screening a transaction directly.
 *
 * Unlike the analysis list, this response carries the evidence: the detectors
 * return their attribution with every score, and `/analyze` passes it straight
 * through. It is the one path where the full behavioural decomposition is
 * available to this app today.
 */

/** A PaySim transaction, in the shape the fusion engine's schema requires. */
export type Transaction = {
  step: number;
  type: string;
  amount: number;
  nameOrig: string;
  nameDest: string;
  oldbalanceOrg: number;
  newbalanceOrig: number;
  oldbalanceDest: number;
  newbalanceDest: number;
  isFlaggedFraud: number;
};

export type AnalyzeResponse = {
  transaction_id: string;
  fraud_confidence_score: number;
  classification: string;
  modalities_used: number;

  graph_score: number | null;
  behavioral_score: number | null;
  temporal_score: number | null;

  // Present here and absent from the analysis list, which is why a screened
  // transaction can say which detectors answered and a listed one cannot.
  graph_available: boolean;
  behavioral_available: boolean;
  temporal_available: boolean;

  retrieval?: {
    typology_id?: string | null;
    typology_name?: string | null;
    stage?: string | null;
    similarity_score?: number | null;
  } | null;

  forensic_report: string | null;
  mock_scenario: string | null;

  behavioral_signal: string | null;
  graph_signal: string | null;
  temporal_signal: string | null;

  behavioral_evidence: BehaviouralEvidence | null;
  graph_evidence: GraphEvidence | null;
};

/**
 * Screening takes several seconds when the LLM writes a report, which is well
 * past the client's default timeout, so this one is given its own.
 */
const ANALYSE_TIMEOUT_MS = 90_000;

export const analyse = (transaction: Transaction, transactionId?: string) =>
  request<AnalyzeResponse>("/analyze", {
    method: "POST",
    body: { transaction, transaction_id: transactionId },
    timeoutMs: ANALYSE_TIMEOUT_MS,
  });
