import type { DocumentChunk } from "@feeforensics/shared";
import { describe, expect, it } from "vitest";

import {
  RetrieverParseError,
  retrieveRelevantChunks,
  type RetrieverLlm,
  type RetrieverMessage,
} from "./retriever.js";

const chunk = (n: number, label: string, text: string): DocumentChunk => ({
  id: `c${n}`,
  documentId: "doc_hma",
  caseId: "case_demo_harborline_001",
  text,
  sectionLabel: label,
  citationLabel: label,
});

const CHUNKS: DocumentChunk[] = [
  chunk(0, "HMA §4.1 — Base Management Fee", "Base fee equal to 3.0% of Total Operating Revenue."),
  chunk(1, "HMA §4.2 — Incentive Management Fee", "Incentive fee equal to 10% of Gross Operating Profit."),
  chunk(2, "HMA §4.3 — Revenue Exclusions", "Insurance proceeds and cancellation revenue are excluded."),
  chunk(3, "HMA §5.1 — Centralized Services", "Charges over $10,000/month require prior written approval."),
];

/** A fake VultronRetriever chat model that returns a canned response and records its prompts. */
const fakeLlm = (response: string) => {
  const calls: RetrieverMessage[][] = [];
  const fn: RetrieverLlm = async (messages) => {
    calls.push(messages);
    return response;
  };
  return { fn, calls };
};

const promptText = (calls: RetrieverMessage[][]) =>
  calls.flat().map((m) => m.content).join("\n");

describe("retrieveRelevantChunks — model-driven retrieval", () => {
  it("returns the chunks the model selected, ranked by score and capped at topK", async () => {
    const { fn } = fakeLlm(
      JSON.stringify([
        { index: 2, score: 0.95, reason: "names the exclusions" },
        { index: 1, score: 0.6, reason: "incentive base" },
        { index: 0, score: 0.2 },
      ]),
    );
    const result = await retrieveRelevantChunks(
      "which revenue is excluded from the fee base?",
      CHUNKS,
      { llm: fn, topK: 2 },
    );

    expect(result).toHaveLength(2);
    expect(result[0]?.chunk.id).toBe("c2");
    expect(result[0]?.score).toBe(0.95);
    expect(result[0]?.reason).toContain("exclusions");
    expect(result[1]?.chunk.id).toBe("c1");
  });

  it("feeds the query and the candidate chunks to the model (real retrieval, not a stub)", async () => {
    const { fn, calls } = fakeLlm("[]");
    await retrieveRelevantChunks("centralized services approval threshold", CHUNKS, {
      llm: fn,
    });
    const text = promptText(calls);
    expect(text).toContain("centralized services approval threshold");
    expect(text).toContain("HMA §5.1 — Centralized Services");
    expect(text).toContain("HMA §4.3 — Revenue Exclusions");
  });

  it("drops hallucinated / out-of-range indices instead of trusting them", async () => {
    const { fn } = fakeLlm(
      JSON.stringify([
        { index: 2, score: 0.9 },
        { index: 99, score: 1 }, // model invented a chunk that doesn't exist
      ]),
    );
    const result = await retrieveRelevantChunks("exclusions", CHUNKS, { llm: fn });
    expect(result).toHaveLength(1);
    expect(result[0]?.chunk.id).toBe("c2");
  });

  it("filters by minScore", async () => {
    const { fn } = fakeLlm(
      JSON.stringify([
        { index: 0, score: 0.9 },
        { index: 1, score: 0.3 },
        { index: 2, score: 0.1 },
      ]),
    );
    const result = await retrieveRelevantChunks("base fee", CHUNKS, {
      llm: fn,
      minScore: 0.5,
      topK: 10,
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.chunk.id).toBe("c0");
  });

  it("returns an empty list when the model finds nothing relevant", async () => {
    const { fn } = fakeLlm("[]");
    const result = await retrieveRelevantChunks("unrelated query", CHUNKS, { llm: fn });
    expect(result).toEqual([]);
  });

  it("tolerates a model that wraps JSON in prose / markdown fences", async () => {
    const { fn } = fakeLlm(
      "Here are the relevant clauses:\n```json\n[{\"index\": 0, \"score\": 1}]\n```\nHope that helps!",
    );
    const result = await retrieveRelevantChunks("base fee", CHUNKS, { llm: fn });
    expect(result).toHaveLength(1);
    expect(result[0]?.chunk.id).toBe("c0");
  });

  it("throws a clear error when the model output has no parseable selection", async () => {
    const { fn } = fakeLlm("I'm not sure which clauses are relevant.");
    await expect(
      retrieveRelevantChunks("anything", CHUNKS, { llm: fn }),
    ).rejects.toBeInstanceOf(RetrieverParseError);
  });

  it("short-circuits on an empty corpus without calling the model", async () => {
    const { fn, calls } = fakeLlm("[]");
    const result = await retrieveRelevantChunks("anything", [], { llm: fn });
    expect(result).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});
