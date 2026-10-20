import { request } from "./client";

/**
 * The payment graph around one account, proxied by the fusion engine from the
 * relational detector. The detector itself is not reachable from outside, so
 * this inherits the platform's session rather than needing one of its own.
 */
export type Neighbourhood = {
  centre: string;
  scope: string;
  hops: number;
  nodes: {
    id: string;
    score: number;
    is_centre: boolean;
    in_degree: number;
    out_degree: number;
  }[];
  edges: {
    source: string;
    target: string;
    amount: number;
    attention: number;
    step: number | null;
  }[];
  counts: {
    nodes_returned: number;
    edges_returned: number;
    edges_in_ball: number;
    truncated: boolean;
  };
};

/** Kept small: a phone draws every edge it is given, and the server caps it anyway. */
export const getNeighbourhood = (account: string, maxEdges = 40) =>
  request<Neighbourhood>(
    `/graph/neighbourhood?account=${encodeURIComponent(account)}&hops=1&max_edges=${maxEdges}&scope=hops`,
    { timeoutMs: 30_000 },
  );
