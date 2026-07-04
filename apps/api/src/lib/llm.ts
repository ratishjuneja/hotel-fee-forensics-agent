import type { OrchestratorLlm } from "@feeforensics/agent";
import { chatComplete, VultrNotConfiguredError } from "./vultr.js";
import { isVultrConfigured } from "../config/env.js";

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
 */

const RETRY_DELAY_MS = 500;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function createAuditLlm(): OrchestratorLlm | null {
  if (!isVultrConfigured) return null;
  return async (messages) => {
    try {
      return await chatComplete(messages, { temperature: 0 });
    } catch (error) {
      if (error instanceof VultrNotConfiguredError) throw error;
      await delay(RETRY_DELAY_MS);
      return chatComplete(messages, { temperature: 0 });
    }
  };
}
