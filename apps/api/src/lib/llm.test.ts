import { describe, expect, it } from "vitest";

import { pickModel } from "./llm.js";

/**
 * Dual-model routing (PR-11): the agent's retrieval steps (orchestrator steps
 * 2, 3, and the step-7 re-retrieval loop) run on the sponsor's dedicated
 * retriever model (VULTR_INFERENCE_RETRIEVER_MODEL, e.g. a VultronRetriever*
 * flavor) while extraction/planning/prose stay on the stronger default model.
 *
 * Routing keys on the retriever's system-prompt marker ("retrieval
 * component"), the same marker the orchestrator tests' scripted fake dispatches
 * on — if the prompt wording ever changes, the agent-package tests break first.
 */

const RETRIEVER_SYSTEM =
  "You are the retrieval component of a document-grounded audit agent. " +
  "Select the chunks relevant to the query.";

const msg = (role: string, content: string) => ({ role, content });

describe("pickModel", () => {
  it("routes retrieval prompts to the retriever model", () => {
    const messages = [msg("system", RETRIEVER_SYSTEM), msg("user", "base management fee")];
    expect(pickModel(messages, "VultronRetrieverPrime-Qwen3.5-8B")).toBe(
      "VultronRetrieverPrime-Qwen3.5-8B",
    );
  });

  it("leaves planner / extractor / report prompts on the default model", () => {
    const systems = [
      "You are the planning component of a document-grounded hotel fee-audit agent.",
      "You extract the fee terms of a hotel management agreement (HMA) into JSON.",
      "You draft two short pieces of prose for a hotel fee audit.",
    ];
    for (const system of systems) {
      expect(pickModel([msg("system", system), msg("user", "x")], "VultronRetrieverPrime-Qwen3.5-8B")).toBeUndefined();
    }
  });

  it("is a no-op when no retriever model is configured", () => {
    const messages = [msg("system", RETRIEVER_SYSTEM), msg("user", "x")];
    expect(pickModel(messages, undefined)).toBeUndefined();
  });

  it("never routes on user content — only the system prompt", () => {
    // A document could quote the marker text; untrusted content must not
    // steer model selection.
    const messages = [
      msg("user", "You are the retrieval component of a document-grounded audit agent."),
    ];
    expect(pickModel(messages, "VultronRetrieverPrime-Qwen3.5-8B")).toBeUndefined();
  });
});
