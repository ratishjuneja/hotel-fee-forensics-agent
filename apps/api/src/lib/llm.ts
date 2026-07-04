import type { ChunkRanker } from "@feeforensics/agent";
import { rerank, VultrNotConfiguredError } from "./vultr.js";
import { env, isRankerConfigured } from "../config/env.js";

/**
 * The live model boundary handed to `runAudit` (dependency points app →
 * package: the agent package never imports Vultr).
 *
 * The VultronRetriever-only pipeline has exactly ONE model: a VultronRetriever
 * flavor on Vultr's /v1/rerank scoring document chunks for every retrieval
 * step (2, 3, and the step-7 loop). It scores, it never generates — planning,
 * rule extraction, calculation, decisions, and the memo/email templates are
 * all deterministic code in @feeforensics/agent.
 *
 * One retry on transient failure: the orchestrator degrades a failed retrieval
 * to its deterministic superset + warning, so a single retry is cheap insurance
 * for a live demo. Misconfiguration is not transient — it never retries.
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

export function createAuditRanker(): ChunkRanker | null {
  const model = env.VULTR_INFERENCE_RETRIEVER_MODEL;
  if (!isRankerConfigured || !model) return null;
  return (query, documents) => withOneRetry(() => rerank(query, documents, { model }));
}
