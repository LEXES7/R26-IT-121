import { request } from "./client";

/**
 * The operator assistant, the same one the web console serves.
 *
 * It answers by calling the platform's own tools (case search, the graph,
 * detector health) and returns every call it made, so an answer about an
 * account comes with the evidence it was built from.
 */

export type AssistantCapabilities = {
  available: boolean;
  reason?: string | null;
  tools: { name: string; description: string }[];
  llm_configured: boolean;
};

export type AssistantStep = {
  tool: string;
  arguments: Record<string, unknown>;
  result: unknown;
  error: string | null;
};

export type AssistantAnswer = {
  answer: string;
  steps: AssistantStep[];
  used_llm: boolean;
  truncated: boolean;
};

export type Turn = { role: "user" | "assistant"; content: string };

export const getAssistantCapabilities = () =>
  request<AssistantCapabilities>("/api/assistant/capabilities");

/** Tools and a language model take time; the read deadline would cut it off. */
export const askAssistant = (question: string, history: Turn[]) =>
  request<AssistantAnswer>("/api/assistant", {
    method: "POST",
    body: { question, history: history.slice(-20) },
    timeoutMs: 90_000,
  });
