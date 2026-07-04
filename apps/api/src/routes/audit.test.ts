import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { ChunkRanker } from "@feeforensics/agent";
import type { AuditReport, Finding, RunAuditResponse } from "@feeforensics/shared";

import { buildServer } from "../server.js";
import { DEMO_CASE_ID } from "../data/demoCase.js";

/**
 * Route tests for the VultronRetriever-only audit pipeline: POST run-audit
 * executes `runAudit` from @feeforensics/agent against the data/demo documents
 * with exactly ONE model boundary — the reranker — injected through
 * `buildServer({ ranker })`, so no Vultr env vars are needed here. Everything
 * else in the pipeline (plan, extraction, calculation, decisions, report) is
 * deterministic code.
 */

type AuditRouteBody = RunAuditResponse & { warnings: string[] };

/** The mock's fixed clock — a real run must NOT carry this timestamp. */
const MOCK_RUN_AT = "2026-07-04T12:00:00.000Z";

/** Document ids the frontend evidence viewer (apps/web/src/lib/documents.ts) keys on. */
const KNOWN_DOC_IDS = new Set([
  "doc_hma",
  "doc_operating_statement",
  "doc_misc_breakout",
  "doc_prior_month",
  "doc_support_pack",
]);

/**
 * Scripted VultronRetriever reranker (keyword overlap), mirroring the live
 * /v1/rerank response shape: (index, unbounded relevance score) pairs, sorted
 * descending. It scores — it never generates — exactly like the real model.
 */
const scriptedRanker: ChunkRanker = async (query, documents) => {
  const terms = query.toLowerCase().split(/\W+/).filter((t) => t.length > 2);
  return documents
    .map((doc, index) => ({
      index,
      score: terms.filter((t) => doc.toLowerCase().includes(t)).length,
    }))
    .sort((a, b) => b.score - a.score);
};

const runAuditUrl = (caseId: string) => `/api/cases/${caseId}/run-audit`;
const reportUrl = (caseId: string) => `/api/cases/${caseId}/report`;

// --- Golden route test: the real pipeline behind POST run-audit -----------------

describe("POST /api/cases/:caseId/run-audit — VultronRetriever-only pipeline", () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let body: AuditRouteBody;

  beforeAll(async () => {
    app = await buildServer({ ranker: scriptedRanker });
    const res = await app.inject({ method: "POST", url: runAuditUrl(DEMO_CASE_ID) });
    expect(res.statusCode).toBe(200);
    body = res.json();
  });
  afterAll(() => app.close());

  it("returns the golden Harborline result computed from data/demo", () => {
    expect(body.caseId).toBe(DEMO_CASE_ID);
    expect(body.status).toBe("completed");
    expect(body.findings.map((f: Finding) => f.suspectedImpact)).toEqual([1980, 6600, 28000]);
    expect(body.confidence).toBe(0.96);
    expect(body.confidenceBreakdown!.map((c) => c.points)).toEqual([25, 25, 20, 16, 10]);
    expect(body.memo).toContain("APPROVAL-0612-03");
    expect(body.memo).toContain("$36,580");
    expect(body.warnings).toEqual([]);
  });

  it("badges the reranker as the ONLY model in the 10-step trace, on a live clock", () => {
    expect(body.trace).toHaveLength(10);
    expect(body.trace.filter((s) => s.tool === "retriever")).toHaveLength(3);
    // Model steps are exactly the three retrievals; the rest is deterministic.
    expect(body.trace.filter((s) => s.kind === "LLM").map((s) => s.tool)).toEqual([
      "retriever",
      "retriever",
      "retriever",
    ]);
    for (const step of body.trace) {
      // The mock is frozen at RUN_AT; the real orchestrator stamps each step live.
      expect(step.timestamp).not.toBe(MOCK_RUN_AT);
      expect(step.caseId).toBe(DEMO_CASE_ID);
    }
  });

  it("keys every citation to a document id the evidence viewer resolves", () => {
    for (const finding of body.findings) {
      for (const citation of finding.citations) {
        expect(KNOWN_DOC_IDS.has(citation.documentId)).toBe(true);
      }
    }
    // F3 carries the support-pack evidence and the May baseline citation.
    const f3DocIds = body.findings[2]!.citations.map((c) => c.documentId);
    expect(f3DocIds).toContain("doc_support_pack");
    expect(f3DocIds).toContain("doc_prior_month");
  });

  it("404s for a case other than the preloaded demo", async () => {
    const res = await app.inject({ method: "POST", url: runAuditUrl("case_unknown") });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("case_not_found");
  });
});

// --- Report round-trip -----------------------------------------------------------

describe("GET /api/cases/:caseId/report", () => {
  it("serves the report from the most recent real run", async () => {
    const app = await buildServer({ ranker: scriptedRanker });
    try {
      await app.inject({ method: "POST", url: runAuditUrl(DEMO_CASE_ID) });
      const res = await app.inject({ method: "GET", url: reportUrl(DEMO_CASE_ID) });
      expect(res.statusCode).toBe(200);
      const report: AuditReport = res.json();
      expect(report.caseId).toBe(DEMO_CASE_ID);
      expect(report.totalSuspectedOvercharge).toBe(36580);
      expect(report.confidence).toBe(0.96);
      expect(report.calculationResult.variance).toBe(36580);
      expect(report.calculationResult.expectedTotalFees).toBe(239620);
      expect(report.calculationResult.chargedTotalFees).toBe(276200);
      expect(report.memoMarkdown).toContain("APPROVAL-0612-03");
    } finally {
      await app.close();
    }
  });

  it("tells the caller to run the audit first when no run exists — never the mock", async () => {
    const app = await buildServer({ ranker: scriptedRanker });
    try {
      const res = await app.inject({ method: "GET", url: reportUrl(DEMO_CASE_ID) });
      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.error).toBe("report_not_ready");
      expect(body.message).toMatch(/run.*audit/i);
    } finally {
      await app.close();
    }
  });
});

// --- Degraded mode: reranker down mid-run → 200, warnings, and STILL the numbers --

describe("run-audit when the reranker fails mid-run", () => {
  it("degrades to deterministic supersets and still lands the golden answer", async () => {
    const failingRanker: ChunkRanker = async () => {
      throw new Error("connect ECONNREFUSED (Vultr inference unreachable)");
    };
    const app = await buildServer({ ranker: failingRanker });
    try {
      const res = await app.inject({ method: "POST", url: runAuditUrl(DEMO_CASE_ID) });
      expect(res.statusCode).toBe(200);
      const body: AuditRouteBody = res.json();
      expect(body.status).toBe("completed");
      expect(body.warnings.length).toBeGreaterThanOrEqual(3);
      // Retrieval falls back to the all-clauses superset; extraction and the
      // memo are deterministic — an inference outage cannot lose the numbers.
      expect(body.findings.map((f: Finding) => f.suspectedImpact)).toEqual([
        1980, 6600, 28000,
      ]);
      expect(body.confidence).toBe(0.96);
    } finally {
      await app.close();
    }
  });
});

// --- Unconfigured Vultr: fail loudly up front, don't fake an audit ----------------

describe("run-audit when the VultronRetriever is not configured", () => {
  it("returns 503 instead of an audit that never touched Vultr", async () => {
    // `ranker: null` = what default wiring resolves to when the VULTR_* env
    // vars are missing.
    const app = await buildServer({ ranker: null });
    try {
      const res = await app.inject({ method: "POST", url: runAuditUrl(DEMO_CASE_ID) });
      expect(res.statusCode).toBe(503);
      const body = res.json();
      expect(body.error).toBe("vultr_not_configured");
      expect(body.message).toContain("VULTR_INFERENCE_RETRIEVER_MODEL");
    } finally {
      await app.close();
    }
  });
});

// --- PR #16 hardening still intact (smoke) ----------------------------------------

describe("hardening smoke checks", () => {
  it("keeps the per-IP rate limit", async () => {
    const app = await buildServer({ ranker: scriptedRanker });
    try {
      for (let i = 0; i < 60; i++) {
        const res = await app.inject({ method: "GET", url: "/health" });
        expect(res.statusCode).toBe(200);
      }
      const throttled = await app.inject({ method: "GET", url: "/health" });
      expect(throttled.statusCode).toBe(429);
      expect(throttled.headers["retry-after"]).toBeDefined();
    } finally {
      await app.close();
    }
  });

  it("keeps the request body cap", async () => {
    const app = await buildServer({ ranker: scriptedRanker });
    try {
      const res = await app.inject({
        method: "POST",
        url: runAuditUrl(DEMO_CASE_ID),
        headers: { "content-type": "application/json" },
        payload: JSON.stringify({ padding: "x".repeat(300 * 1024) }),
      });
      expect(res.statusCode).toBe(413);
    } finally {
      await app.close();
    }
  });
});
