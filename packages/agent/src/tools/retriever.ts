/**
 * Document retriever — model-driven.
 *
 * Retrieval is a core reasoning step, so it runs on a VultronRetriever model via
 * Vultr Serverless Inference (the challenge requires both retrieval AND core
 * reasoning to use these models). Given a query and the candidate
 * `DocumentChunk[]` produced by the chunker, the model selects the relevant
 * chunks and scores them — this is what lets the agent "retrieve more than once
 * when it needs to" and cite exactly which clauses it relied on.
 *
 * The model is an INJECTED boundary (`RetrieverLlm`) so unit tests are
 * deterministic without hitting the network. The orchestrator wires the real
 * transport by passing `(messages) => chatComplete(messages, { temperature: 0 })`
 * (apps/api owns the Vultr client; the dependency points app -> package, never
 * the reverse).
 *
 * Guardrails: the model may only choose from the indices it was given —
 * hallucinated / out-of-range picks are dropped, not trusted — and an
 * unparseable response is a loud error, never a silent empty retrieval.
 */

import type { DocumentChunk } from "@feeforensics/shared";

export interface RetrieverMessage {
  role: "system" | "user";
  content: string;
}

/** Injected chat transport (a VultronRetriever model via Vultr). */
export type RetrieverLlm = (messages: RetrieverMessage[]) => Promise<string>;

export interface RetrievedChunk {
  chunk: DocumentChunk;
  /** Relevance score in [0, 1] as judged by the model. */
  score: number;
  reason?: string;
}

export interface RetrieveOptions {
  llm: RetrieverLlm;
  /** Max chunks to return (default 4). */
  topK?: number;
  /** Drop anything the model scored below this (default 0). */
  minScore?: number;
  /** Truncate each chunk's text in the prompt to bound token use (default 600). */
  maxSnippetChars?: number;
}

/** Thrown when the model's response contains no parseable selection. */
export class RetrieverParseError extends Error {
  readonly raw: string;
  constructor(raw: string) {
    super(
      "Retriever model did not return a parseable JSON selection — cannot infer " +
        "which chunks are relevant (refusing to return a silent empty result).",
    );
    this.name = "RetrieverParseError";
    this.raw = raw;
  }
}

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

function buildMessages(
  query: string,
  chunks: DocumentChunk[],
  maxSnippetChars: number,
): RetrieverMessage[] {
  const candidates = chunks
    .map((c, i) => {
      const snippet = c.text.replace(/\s+/g, " ").trim().slice(0, maxSnippetChars);
      return `[${i}] (${c.citationLabel}) ${snippet}`;
    })
    .join("\n");

  return [
    {
      role: "system",
      content:
        "You are the retrieval component of a document-grounded audit agent. " +
        "You are given a QUERY and a numbered list of document CHUNKS. Return ONLY " +
        "the chunks relevant to the query, as a JSON array of objects " +
        '{"index": <number>, "score": <0..1>, "reason": <short string>}. ' +
        "Use only the indices provided — never invent one. Order does not matter. " +
        "If nothing is relevant, return []. Output JSON only, no prose.",
    },
    {
      role: "user",
      content: `QUERY: ${query}\n\nCHUNKS:\n${candidates}`,
    },
  ];
}

interface RawSelection {
  index: number;
  score: number;
  reason?: string;
}

/** Pull the JSON array out of a model response that may be fenced or wrapped in prose. */
function parseSelection(raw: string): RawSelection[] {
  const stripped = raw.replace(/```(?:json)?/gi, "");
  const start = stripped.indexOf("[");
  const end = stripped.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) {
    throw new RetrieverParseError(raw);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped.slice(start, end + 1));
  } catch {
    throw new RetrieverParseError(raw);
  }
  if (!Array.isArray(parsed)) throw new RetrieverParseError(raw);

  const selections: RawSelection[] = [];
  for (const entry of parsed) {
    if (entry && typeof entry === "object") {
      const e = entry as Record<string, unknown>;
      if (typeof e.index === "number" && typeof e.score === "number") {
        selections.push({
          index: e.index,
          score: e.score,
          reason: typeof e.reason === "string" ? e.reason : undefined,
        });
      }
    }
  }
  return selections;
}

/**
 * Retrieve the chunks relevant to `query`, as chosen and scored by the model.
 * Returns them ranked by score (desc), filtered by `minScore`, capped at `topK`.
 */
export async function retrieveRelevantChunks(
  query: string,
  chunks: DocumentChunk[],
  options: RetrieveOptions,
): Promise<RetrievedChunk[]> {
  if (chunks.length === 0) return [];

  const topK = options.topK ?? 4;
  const minScore = options.minScore ?? 0;
  const maxSnippetChars = options.maxSnippetChars ?? 600;

  const raw = await options.llm(buildMessages(query, chunks, maxSnippetChars));
  const selections = parseSelection(raw);

  const retrieved: RetrievedChunk[] = [];
  for (const sel of selections) {
    const chunk = chunks[sel.index];
    if (!chunk) continue; // out-of-range / hallucinated index — drop it
    const score = clamp01(sel.score);
    if (score < minScore) continue;
    retrieved.push({ chunk, score, reason: sel.reason });
  }

  retrieved.sort((a, b) => b.score - a.score);
  return retrieved.slice(0, topK);
}
