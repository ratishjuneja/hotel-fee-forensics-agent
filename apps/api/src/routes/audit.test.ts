import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { LlmMessage, OrchestratorLlm } from "@feeforensics/agent";
import type { AuditReport, Finding, RunAuditResponse } from "@feeforensics/shared";

import { buildServer } from "../server.js";
import { DEMO_CASE_ID } from "../data/demoCase.js";

/**
 * Route tests for the REAL audit pipeline (PR-10): POST run-audit executes
 * `runAudit` from @feeforensics/agent against the data/demo documents, with the
 * LLM boundary injected through `buildServer({ llm })` so no Vultr env vars are
 * needed here.
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

// --- Scripted fake LLM --------------------------------------------------------
// Same pattern as packages/agent/src/orchestrator.test.ts: dispatch on each
// tool's system-prompt marker and answer by reading the REAL prompt content —
// chunk indices come from the prompt's `[i] (label)` lines, never hard-coded.

const chunkIndexEntries = (user: string): Array<[number, string]> =>
  [...user.matchAll(/\[(\d+)\] \(([^)]+)\)/g)].map((m) => [Number(m[1]), m[2]!]);

function pickChunks(user: string, patterns: RegExp[]): string {
  const selections = chunkIndexEntries(user)
    .filter(([, label]) => patterns.some((re) => re.test(label)))
    .map(([index], rank) => ({ index, score: 0.95 - rank * 0.01, reason: "relevant" }));
  return JSON.stringify(selections);
}

function retrieverResponse(user: string): string {
  if (user.includes("base management fee")) {
    return pickChunks(user, [/§4\.1/, /§4\.2/]);
  }
  if (user.includes("excluded revenue")) {
    return pickChunks(user, [/§4\.2/, /§4\.3/, /§5\.1/, /§9\.2/]);
  }
  if (user.includes("supporting invoice")) {
    return pickChunks(user, [/0612-03/]);
  }
  throw new Error(`unscripted retrieval query: ${user.slice(0, 80)}`);
}

function extractionResponse(user: string): string {
  const idx = (re: RegExp): number | null => {
    const hit = chunkIndexEntries(user).find(([, label]) => re.test(label));
    return hit ? hit[0] : null;
  };
  return JSON.stringify({
    baseManagementFee: {
      found: true,
      ratePercent: 3.0,
      revenueBase: "Total Operating Revenue",
      excludedRevenue: ["insurance proceeds", "cancellation / attrition / no-show revenue"],
      excludedCategories: ["CANCELLATION_REVENUE", "INSURANCE_PROCEEDS"],
      sourceIndex: idx(/§4\.1/),
      quote: "Base Management Fee equal to three percent (3.0%) of Total Operating Revenue",
    },
    incentiveFee: {
      found: true,
      ratePercent: 10.0,
      profitMetric: "GOP",
      threshold: 0,
      excludedItems: ["insurance proceeds", "cancellation revenue"],
      excludedCategories: ["CANCELLATION_REVENUE", "INSURANCE_PROCEEDS"],
      sourceIndex: idx(/§4\.2/),
      quote: "Incentive Management Fee equal to ten percent (10.0%) of Gross Operating Profit",
    },
    passThroughRules: {
      found: true,
      allowedCategories: ["OPERATING_EXPENSE"],
      excludedCategories: ["CORPORATE_OVERHEAD"],
      approvalThreshold: 10000,
      sourceIndex: idx(/§5\.1/),
      quote: "exceeding Ten Thousand Dollars ($10,000) shall require Owner's PRIOR WRITTEN APPROVAL",
    },
    auditRights: {
      found: true,
      correctionWindowDays: 365,
      sourceIndex: idx(/§9\.2/),
      quote: "Owner may audit within twelve (12) months",
    },
  });
}

function proseResponse(): string {
  // Uses ONLY amounts present verbatim in the context, so the number guard passes.
  return JSON.stringify({
    executiveSummary:
      "The June 2026 review identified $36,580 of fee issues — $8,580 in hard overcharges " +
      "plus $28,000 of centralized-services charges unsupported pending owner approval, " +
      "all recoverable within the audit window.",
    emailBody:
      "Hi Meridian Hotel Management,\n\nOur June 2026 fee review identified $36,580 of issues — " +
      "$8,580 in overcharges and $28,000 unsupported pending approval. Please confirm a " +
      "true-up on the disputed fees and provide the written approval or reverse the " +
      "centralized-services charge.\n\nThank you,\nCascadia Hotel Owner LP",
  });
}

function scriptedLlm(): OrchestratorLlm {
  return async (messages: LlmMessage[]) => {
    const system = messages[0]?.content ?? "";
    const user = messages[1]?.content ?? "";
    if (system.includes("planning component")) {
      return (
        "Verify the base management fee, incentive fee, and centralized-services " +
        "pass-through against HMA Articles 4 and 5; recompute fees deterministically " +
        "and cross-check against the prior month."
      );
    }
    if (system.includes("retrieval component")) return retrieverResponse(user);
    if (system.includes("extract the fee terms")) return extractionResponse(user);
    if (system.includes("draft two short pieces")) return proseResponse();
    throw new Error(`unscripted prompt: ${system.slice(0, 60)}`);
  };
}

const runAuditUrl = (caseId: string) => `/api/cases/${caseId}/run-audit`;
const reportUrl = (caseId: string) => `/api/cases/${caseId}/report`;

// --- Golden route test: the real pipeline behind POST run-audit -----------------

describe("POST /api/cases/:caseId/run-audit — real pipeline (scripted LLM)", () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let body: AuditRouteBody;

  beforeAll(async () => {
    app = await buildServer({ llm: scriptedLlm() });
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

  it("emits the 10-step trace with the re-retrieval loop, on a live clock (not the mock)", () => {
    expect(body.trace).toHaveLength(10);
    expect(body.trace.filter((s) => s.tool === "retriever")).toHaveLength(3);
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
    const app = await buildServer({ llm: scriptedLlm() });
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
    const app = await buildServer({ llm: scriptedLlm() });
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

// --- Degraded mode: inference down mid-run → 200 with honest fallbacks -----------

describe("run-audit when the LLM transport fails mid-run", () => {
  it("still completes with warnings and a single human-review finding — the demo never 500s", async () => {
    const failingLlm: OrchestratorLlm = async () => {
      throw new Error("connect ECONNREFUSED (Vultr inference unreachable)");
    };
    const app = await buildServer({ llm: failingLlm });
    try {
      const res = await app.inject({ method: "POST", url: runAuditUrl(DEMO_CASE_ID) });
      expect(res.statusCode).toBe(200);
      const body: AuditRouteBody = res.json();
      expect(body.status).toBe("completed");
      expect(body.warnings.length).toBeGreaterThan(0);
      expect(body.findings).toHaveLength(1);
      expect(body.findings[0]).toMatchObject({
        issueType: "NEEDS_REVIEW",
        recommendedAction: "human_review",
        suspectedImpact: 276200,
      });
    } finally {
      await app.close();
    }
  });
});

// --- Unconfigured Vultr: fail loudly up front, don't fake an audit ----------------

describe("run-audit when Vultr inference is not configured", () => {
  it("returns 503 instead of a degraded result", async () => {
    // `llm: null` = "no transport available" (what default wiring resolves to
    // when the VULTR_* env vars are missing).
    const app = await buildServer({ llm: null });
    try {
      const res = await app.inject({ method: "POST", url: runAuditUrl(DEMO_CASE_ID) });
      expect(res.statusCode).toBe(503);
      expect(res.json().error).toBe("vultr_not_configured");
    } finally {
      await app.close();
    }
  });
});

// --- PR #16 hardening still intact (smoke) ----------------------------------------

describe("hardening smoke checks", () => {
  it("keeps the per-IP rate limit", async () => {
    const app = await buildServer({ llm: scriptedLlm() });
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
    const app = await buildServer({ llm: scriptedLlm() });
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
