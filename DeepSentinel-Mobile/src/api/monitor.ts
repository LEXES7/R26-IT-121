import { request } from "./client";

/**
 * The live monitor, read by polling `GET /api/monitor/state`.
 *
 * The web console reads the same state over server-sent events. React Native's
 * fetch does not expose a streaming body, so the phone asks for the snapshot
 * instead: the server builds both from one store, so they cannot disagree.
 */

/** One alert as the monitor publishes it: every verdict at MEDIUM or above. */
export type LiveAlert = {
  transaction_id: string;
  severity: string;
  fused_score: number;
  graph_score: number | null;
  pattern: string | null;
  sink_account: string | null;
  amount: number;
  from: string;
  to: string;
  modalities_used: number;
  fusion_method?: string;
  scores?: Record<string, number | null>;
  driver?: string | null;
  /** Unix seconds. */
  at: number;
};

export type MonitorState = {
  running: boolean;
  counters: {
    screened: number;
    flagged: number;
    alerts: number;
    uptime_seconds: number;
    throughput_per_min: number;
    flag_rate: number;
  };
  stages: Record<string, string>;
  /** Newest first, at most twenty. */
  alerts: LiveAlert[];
  events: { kind: string; at: number; [key: string]: unknown }[];
  source?: string | null;
  queue?: number | null;
};

export const getMonitorState = () => request<MonitorState>("/api/monitor/state");

/** A stable identity for an alert, so one is never announced twice. */
export const alertKey = (a: LiveAlert) => `${a.transaction_id}@${a.at}`;
