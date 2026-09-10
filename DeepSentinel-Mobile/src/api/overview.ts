import { request } from "./client";
import { listAnalyses, type Analysis } from "./analyses";

/**
 * Everything the overview screen shows, and nothing it invents.
 *
 * The three sources are deliberately separate calls rather than one aggregate
 * endpoint: the detector roster is public and answers even when the database is
 * unreachable, so a phone can still say which models are up when the queue
 * cannot be read. Merging them server-side would make the whole screen fail
 * whenever any one part did.
 */

/** GET /analyses/statistics — see backend/settings.py::analysis_statistics. */
export type Statistics = {
  total: number;
  by_classification: Record<string, number>;
  alerts_sent: number;
  mean_confidence: number | null;
};

export const getStatistics = () =>
  request<Statistics>("/analyses/statistics");

/**
 * GET /public/capabilities — no authentication.
 *
 * The curated subset: sizes, capabilities, and whether each detector answers.
 * Deliberately not /api/monitor/runtime, which carries the alert sending
 * address, undelivered counts and upstream stack traces.
 */
export type Capabilities = {
  network?: { accounts?: number | null; transfers?: number | null; hops?: number | null; live: boolean };
  behavioural?: { strata?: number | null; latency_ms?: number | null; live: boolean };
  temporal?: { window?: number | null; live: boolean };
  fusion?: { strategy?: string | null; live: boolean };
};

export const getCapabilities = () =>
  request<Capabilities>("/public/capabilities", { anonymous: true });

/** One bar of the volume chart. */
export type Bucket = { label: string; total: number; alerted: number };

/**
 * Screening volume over the recent past, bucketed by hour.
 *
 * Derived from the analyses themselves because no endpoint reports a time
 * series. That is a real limitation and the screen says so: the chart covers
 * the most recent `limit` analyses, not a fixed window of time. On a quiet day
 * that is a long period; during a replay it may be minutes.
 */
export function bucketByHour(rows: Analysis[], hours = 12): Bucket[] {
  const now = Date.now();
  const HOUR = 3_600_000;
  const buckets: Bucket[] = Array.from({ length: hours }, (_, i) => {
    const at = new Date(now - (hours - 1 - i) * HOUR);
    return { label: `${at.getHours()}`.padStart(2, "0"), total: 0, alerted: 0 };
  });

  for (const row of rows) {
    const t = Date.parse(row.created_at);
    if (Number.isNaN(t)) continue;
    const age = Math.floor((now - t) / HOUR);
    if (age < 0 || age >= hours) continue;
    const b = buckets[hours - 1 - age];
    b.total += 1;
    if (row.alert_sent) b.alerted += 1;
  }
  return buckets;
}

export type Overview = {
  stats: Statistics | null;
  capabilities: Capabilities | null;
  recent: Analysis[];
  /** Which parts failed, so the screen can be honest rather than showing zeros. */
  failed: string[];
};

/**
 * All three, in parallel, with partial failure allowed.
 *
 * A screen that renders zeros when a call failed is lying — "nothing was
 * screened" and "we could not ask" look identical and mean opposite things.
 * Each piece comes back null on failure and is named in `failed`.
 */
export async function loadOverview(limit = 200): Promise<Overview> {
  const failed: string[] = [];

  const [stats, capabilities, recent] = await Promise.all([
    getStatistics().catch(() => {
      failed.push("statistics");
      return null;
    }),
    getCapabilities().catch(() => {
      failed.push("detector status");
      return null;
    }),
    listAnalyses({ limit }).catch(() => {
      failed.push("recent analyses");
      return [] as Analysis[];
    }),
  ]);

  return { stats, capabilities, recent, failed };
}
