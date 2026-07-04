import { env, isVultrConfigured } from "../config/env.js";

/**
 * Minimal Vultr Serverless Inference client.
 *
 * Vultr exposes an OpenAI-compatible chat-completions API, so this is a thin
 * fetch wrapper rather than a full SDK. All LLM calls in FeeForensics must go
 * through here so Vultr stays in the core path (see docs/TechSpec.md §3).
 *
 * This is the v1 stub for feat/backend-api: the transport is real, but no
 * agent step calls it yet. Callers get a loud, typed error when Vultr is not
 * configured instead of a silent fallback.
 */

export class VultrNotConfiguredError extends Error {
  constructor() {
    super(
      "Vultr Serverless Inference is not configured. Set VULTR_INFERENCE_API_KEY, " +
        "VULTR_INFERENCE_BASE_URL and VULTR_INFERENCE_MODEL (see .env.example).",
    );
    this.name = "VultrNotConfiguredError";
  }
}

export class VultrRequestError extends Error {
  readonly status: number;
  /**
   * Raw upstream response body. Kept for server-side logging ONLY — never put it
   * in `message`, which the API's error handler may surface to clients (an
   * upstream body can echo request/prompt content and provider account detail).
   */
  readonly upstreamBody: string;
  constructor(status: number, body: string) {
    super(`Vultr inference request failed (${status})`);
    this.name = "VultrRequestError";
    this.status = status;
    this.upstreamBody = body;
  }
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompleteOptions {
  temperature?: number;
  model?: string;
  maxTokens?: number;
  signal?: AbortSignal;
  /** Abort the request after this many ms when no `signal` is supplied (default 30s). */
  timeoutMs?: number;
}

/** Default ceiling on completion length so a runaway/steered response can't inflate cost. */
const DEFAULT_MAX_TOKENS = 1500;
/** Default per-request timeout; an unbounded inference call can hang the whole audit. */
const DEFAULT_TIMEOUT_MS = 30_000;

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

/**
 * Send a chat completion to Vultr and return the assistant's text content.
 * Throws {@link VultrNotConfiguredError} if credentials are missing.
 */
export async function chatComplete(
  messages: ChatMessage[],
  options: ChatCompleteOptions = {},
): Promise<string> {
  if (!isVultrConfigured) {
    throw new VultrNotConfiguredError();
  }

  // Caller-provided signal wins; otherwise bound the call so it can't hang forever.
  const signal =
    options.signal ??
    AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  const response = await fetch(
    `${env.VULTR_INFERENCE_BASE_URL}/chat/completions`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.VULTR_INFERENCE_API_KEY}`,
      },
      body: JSON.stringify({
        model: options.model ?? env.VULTR_INFERENCE_MODEL,
        messages,
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
      }),
      signal,
    },
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "<no body>");
    throw new VultrRequestError(response.status, body);
  }

  const data = (await response.json()) as ChatCompletionResponse;
  return data.choices?.[0]?.message?.content ?? "";
}

/** Non-secret status for health/diagnostics surfaces. */
export function vultrStatus(): { configured: boolean; model: string | null } {
  return {
    configured: isVultrConfigured,
    model: env.VULTR_INFERENCE_MODEL ?? null,
  };
}
