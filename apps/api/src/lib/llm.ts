import type { ChunkRanker, OrchestratorLlm } from "@feeforensics/agent";
import { chatComplete, rerank, VultrNotConfiguredError } from "./vultr.js";
import { env, isVultrConfigured } from "../config/env.js";

/**
 * The live model boundaries handed to `runAudit` (dependency points app →
 * package: the agent package never imports Vultr).
 *
 * - `createAuditRanker` — the PRIMARY workflow transport (hackathon
 *   requirement): a VultronRetriever model on /v1/rerank scores document
 *   chunks for every retrieval step (2, 3, and the step-7 loop). It scores,
 *   it never generates.
 * - `createAuditLlm` — the secondary generation transport: chatComplete at
 *   temperature 0 for planning, clause-to-JSON transcription, and report
 *   prose. (VultronRetriever models cannot serve chat, so a chat-capable
 *   model fills this role, as the rules permit for secondary tasks.)
 *
 * One retry on transient failure for both: the orchestrator already degrades
 * any failed call to a deterministic fallback + warning, so a single retry is
 * cheap insurance for a live demo. Misconfiguration is not transient — it
 * never retries.
 */

const RETRY_DELAY_MS = 500;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function withOneRetry<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (error instanceof VultrNotConfiguredError) throw error;
    await delay(RETRY_DELAY_MS);
    return call();
  }
}

export function createAuditLlm(): OrchestratorLlm | null {
  if (!isVultrConfigured) return null;
  return (messages) => withOneRetry(() => chatComplete(messages, { temperature: 0 }));
}

export function createAuditRanker(): ChunkRanker | null {
  const model = env.VULTR_INFERENCE_RETRIEVER_MODEL;
  if (!isVultrConfigured || !model) return null;
  return (query, documents) => withOneRetry(() => rerank(query, documents, { model }));
}
