import { request } from "./client";

/**
 * The analysis history — what the platform has screened and what it decided.
 *
 * The shapes here are the fusion engine's, not this app's: `GET /analyses`
 * returns a summary per transaction, and the per-modality evidence is not part
 * of it. The evidence types below describe what each detector returns when it
 * is asked directly, so a screen can render it the moment the backend serves
 * it from a stored case.
 */

/** One row of `GET /analyses`. Null scores mean that detector did not answer. */
export type Analysis = {
  transaction_id: string;
  created_at: string;
  fraud_confidence_score: number;
  classification: string;
  modalities_used: number;
  graph_score: number | null;
  behavioral_score: number | null;
  temporal_score: number | null;
  typology_name: string | null;
  typology_id: string | null;
  similarity_score: number | null;
  type: string | null;
  amount: number | null;
  nameOrig: string | null;
  nameDest: string | null;
  alert_sent: boolean;
  mock_scenario: string | null;
};

export type Statistics = Record<string, unknown> & {
  total?: number;
  by_classification?: Record<string, number>;
};

export const listAnalyses = (opts: { limit?: number; classification?: string } = {}) => {
  const params = new URLSearchParams();
  params.set("limit", String(opts.limit ?? 50));
  if (opts.classification) params.set("classification", opts.classification);
  return request<Analysis[]>(`/analyses?${params.toString()}`);
};

export const getStatistics = () => request<Statistics>("/analyses/statistics");

// ── Evidence ────────────────────────────────────────────────────────────────
// Three detectors, three different kinds of answer. The graph returns a
// structure, the behavioural model a decomposition, the temporal model a single
// weighted predecessor. They are not variations of one shape and are not
// modelled as though they were.

/** M2 Ewaduge — the subgraph the relational model flagged. */
export type GraphEvidence = {
  pattern?: string | null;
  sink_account?: string | null;
  nodes?: { account_id?: string; role?: string; is_mule?: boolean }[];
  edges?: { source?: string; target?: string; amount?: number; attention?: number }[];
  structural_evidence?: {
    mules_in_subgraph?: number | null;
    fresh_sender_ratio?: number | null;
    convergence_count?: number | null;
    mean_drain_ratio?: number | null;
  };
};

/** M3 Pathirana — the one predecessor the attention head weighted most. */
export type TemporalEvidence = {
  composite_id?: string | null;
  attention_weight?: number | null;
  predecessor_signal?: string | null;
  offset_from_current?: number | null;
  peak_features?: Record<string, number>;
  step_burstiness?: number | null;
};

/** One entry of a DSAA signal's attribution: a name and its share of the total. */
export type Share = {
  feature?: string;
  dimension?: string;
  share: number;
};

/** M1 Wijesinghe — the stratified VAE's decomposition of its own score. */
export type BehaviouralEvidence = {
  risk_level?: string | null;
  transaction_type?: string | null;
  feature_set?: string | null;
  model_version?: string | null;
  vae_diagnostics?: {
    combined_anomaly_score?: number | null;
    raw_score?: number | null;
    threshold?: number | null;
    calibrated_threshold?: number | null;
    flagged?: boolean;
    operating_point?: string | null;
    stratum?: string | null;
    recon_z?: number | null;
    kl_z?: number | null;
    density_z?: number | null;
    weights?: { alpha?: number; beta?: number; gamma?: number };
    calibration_method?: string | null;
    is_control_stratum?: boolean;
    out_of_training_distribution?: boolean;
  };
  fingerprint?: {
    signal_1_reconstruction_error?: {
      dominant_feature_signal?: string | null;
      shares?: Share[];
    };
    signal_2_kl_divergence?: {
      dominant_dimension_signal?: string | null;
      shares?: Share[];
    };
    signal_3_latent_density?: {
      dominant_dimension_signal?: string | null;
      shares?: Share[];
    };
  };
  fraud_typology?: {
    typology_label?: string | null;
    cluster_id?: number | null;
    confidence?: number | null;
    cluster_fraud_purity?: number | null;
    cluster_size?: number | null;
    fatf_hint?: string | null;
    rationale?: string | null;
    discovery?: string | null;
  };
  metadata?: {
    inference_latency_ms?: number | null;
    bundle?: string | null;
    protocol?: string | null;
    engineered_features?: Record<string, number>;
  };
};
