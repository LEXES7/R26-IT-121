import { API_BASE, REQUEST_TIMEOUT_MS } from "../config";

/**
 * The single path every request to the fusion engine takes.
 *
 * Screens call typed helpers, never fetch directly, so three things are decided
 * once instead of in fourteen places: where the backend is, how long to wait,
 * and what a failure means.
 */

/** A request that reached the server and was refused. `status` is the HTTP code. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * A request that never reached the server.
 *
 * Kept distinct from ApiError because the two need different words on screen.
 * "Wrong password" and "cannot reach the backend" are not the same problem, and
 * showing the second as the first sends someone hunting for a typo that is not
 * there.
 */
export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NetworkError";
  }
}

/** Set after login, cleared on logout or 401. Read on every request. */
let authToken: string | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
}

/**
 * Called when the server rejects the token. Registered by the auth layer so the
 * client can report an expired session without importing navigation.
 */
let onUnauthorised: (() => void) | null = null;

export function setUnauthorisedHandler(fn: (() => void) | null): void {
  onUnauthorised = fn;
}

type Options = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /** Skip the Authorization header — only login needs this. */
  anonymous?: boolean;
  signal?: AbortSignal;
};

export async function request<T>(path: string, opts: Options = {}): Promise<T> {
  if (!API_BASE) {
    throw new NetworkError(
      "No API address is configured. Set EXPO_PUBLIC_API_BASE and restart.",
    );
  }

  const { method = "GET", body, anonymous = false, signal } = opts;

  // Own timeout, and still honour a caller's cancellation. Without this a
  // request on a phone that has drifted off Wi-Fi hangs until the OS gives up.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort);

  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (!anonymous && authToken) headers.Authorization = `Bearer ${authToken}`;

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    const aborted = (err as Error)?.name === "AbortError";
    throw new NetworkError(
      aborted
        ? `The backend did not answer within ${REQUEST_TIMEOUT_MS / 1000}s.`
        : `Cannot reach the backend at ${API_BASE}.`,
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }

  const raw = await response.text();
  const parsed = raw ? safeJson(raw) : null;

  if (!response.ok) {
    // 401 means the token is gone or expired. Handled centrally so no screen
    // has to remember to check for it.
    if (response.status === 401 && !anonymous) {
      setAuthToken(null);
      onUnauthorised?.();
    }
    throw new ApiError(response.status, detailOf(parsed, response.status), parsed);
  }

  return parsed as T;
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/**
 * FastAPI puts the reason in `detail`, which is a string for our own errors and
 * a list of field problems for a 422. Both are worth showing; the fallback is
 * only reached when the server said nothing useful.
 */
function detailOf(body: unknown, status: number): string {
  const detail = (body as { detail?: unknown })?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const first = detail[0] as { loc?: unknown[]; msg?: string } | undefined;
    if (first?.msg) {
      const field = Array.isArray(first.loc) ? first.loc.at(-1) : undefined;
      return field ? `${field}: ${first.msg}` : first.msg;
    }
  }
  if (status === 401) return "Your session has expired. Sign in again.";
  if (status === 403) return "Your account does not have access to this.";
  return `The backend returned ${status}.`;
}

/** GET /health — no authentication, so it also answers "is the address right?" */
export type Health = {
  status: string;
  knowledge_base: boolean;
  meta_classifier: boolean;
  llm_reporter: boolean;
  upstream_bases: Record<string, string>;
};

export const getHealth = () =>
  request<Health>("/health", { anonymous: true });
