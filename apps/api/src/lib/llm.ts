import type { OrchestratorLlm } from "@feeforensics/agent";
import { chatComplete, VultrNotConfiguredError } from "./vultr.js";
import { env, isVultrConfigured } from "../config/env.js";

/**
 * The live LLM boundary handed to `runAudit` (dependency points app → package:
 * the agent package never imports Vultr).
 *
 * Temperature 0: every call is extraction/selection/templated prose, where we
 * want the most repeatable output for the demo, not creativity.
 *
 * One retry on transient failure: the orchestrator already degrades any failed
 * call to a deterministic fallback + warning, so a single retry is cheap
 * insurance that keeps a one-off network blip or 5xx from downgrading a live
 * demo run. Misconfiguration is not transient — it never retries.
 *
 * Dual-model routing: when VULTR_INFERENCE_RETRIEVER_MODEL is set, the agent's
 * retrieval steps (orchestrator steps 2, 3, and the step-7 re-retrieval loop)
 * run on that dedicated retriever model (e.g. VultronRetrieverPrime); planning,
 * rule extraction, and report prose stay on the stronger default model. Both
 * are Vultr Serverless Inference — this only picks which model id per call.
 */

const RETRY_DELAY_MS = 500;

/**
 * The retriever tool's system-prompt marker. The orchestrator tests' scripted
 * fake LLM dispatches on the same string, so a prompt rewording breaks the
 * agent package's tests before it can silently disable this routing.
 */
const RETRIEVAL_PROMPT_MARKER = "retrieval component";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Model override for one call: the retriever model for retrieval prompts,
 * `undefined` (= the default VULTR_INFERENCE_MODEL) for everything else.
 * Only the trusted system prompt is inspected — document text is untrusted and
 * quoted marker text in a user message must not steer model selection.
 */
export function pickModel(
  messages: ReadonlyArray<{ role: string; content: string }>,
  retrieverModel: string | undefined,
): string | undefined {
  if (!retrieverModel) return undefined;
  const first = messages[0];
  if (!first || first.role !== "system") return undefined;
  return first.content.includes(RETRIEVAL_PROMPT_MARKER) ? retrieverModel : undefined;
}

export function createAuditLlm(): OrchestratorLlm | null {
  if (!isVultrConfigured) return null;
  return async (messages) => {
    const model = pickModel(messages, env.VULTR_INFERENCE_RETRIEVER_MODEL);
    try {
      return await chatComplete(messages, { temperature: 0, model });
    } catch (error) {
      if (error instanceof VultrNotConfiguredError) throw error;
      await delay(RETRY_DELAY_MS);
      return chatComplete(messages, { temperature: 0, model });
    }
  };
}
