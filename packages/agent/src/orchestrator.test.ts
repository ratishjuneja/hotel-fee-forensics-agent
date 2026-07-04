import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { runAudit, type OrchestratorLlm, type RunAuditInput } from "./orchestrator.js";
import type { LlmMessage } from "./tools/ruleExtractor.js";

const demoFile = (name: string) =>
  readFileSync(
    fileURLToPath(new URL(`../../../data/demo/${name}`, import.meta.url)),
    "utf8",
  );

const RUN_AT = "2026-07-04T12:00:00.000Z";
const now = () => RUN_AT;

// --- Scripted fake LLM --------------------------------------------------------
// One injected boundary serves every tool; the fake dispatches on each tool's
// system prompt (same pattern as ruleExtractor.test.ts) and answers by reading
// the REAL prompt content — chunk indices are looked up from the prompt's
// `[i] (label)` lines, never hard-coded, so retrieval stays order-independent.

const chunkIndexEntries = (user: string): Array<[number, string]> =>
  [...user.matchAll(/\[(\d+)\] \(([^)]+)\)/g)].map((m) => [Number(m[1]), m[2]!]);

/** JSON selection of every prompt chunk whose label matches a pattern. */
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
    // The re-retrieval loop: pick the centralized-services evidence records.
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

function proseResponse(user: string): string {
  if (user.includes('"identified": "$0"')) {
    return JSON.stringify({
      executiveSummary:
        "The operator's fee charges reconcile to the management agreement — no fee issues identified.",
      emailBody:
        "Hi team,\n\nOur review of the operating package found no fee issues; no action is needed.\n\nThank you.",
    });
  }
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

function scriptedLlm() {
  const calls: LlmMessage[][] = [];
  const llm: OrchestratorLlm = async (messages) => {
    calls.push(messages);
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
    if (system.includes("draft two short pieces")) return proseResponse(user);
    throw new Error(`unscripted prompt: ${system.slice(0, 60)}`);
  };
  return { llm, calls };
}

// --- Inputs ---------------------------------------------------------------------

const harborlineInput = (): RunAuditInput => ({
  caseId: "case_demo_harborline_001",
  hotelName: "The Harborline Hotel",
  auditMonth: "June 2026",
  period: "2026-06",
  priorPeriod: "2026-05",
  operatorName: "Meridian Hotel Management",
  ownerName: "Cascadia Hotel Owner LP",
  documents: {
    hma: {
      docId: "doc_hma",
      name: "Hotel Management Agreement",
      text: demoFile("01_HMA_excerpt.txt"),
    },
    statement: {
      docId: "doc_operating_statement_june",
      name: "Monthly Operating Statement — June (USALI)",
      csv: demoFile("02_operating_statement_june.csv"),
    },
    miscBreakout: {
      docId: "doc_misc_income_breakout_june",
      name: "Misc Income Breakout — June",
      csv: demoFile("02b_misc_income_breakout_june.csv"),
    },
    priorStatement: {
      docId: "doc_operating_statement_may",
      name: "Monthly Operating Statement — May (USALI)",
      csv: demoFile("03_operating_statement_may.csv"),
    },
    supportPack: {
      docId: "doc_support_pack",
      name: "Support / Invoice Pack",
      csv: demoFile("04_support_invoice_pack.csv"),
    },
  },
});

// A synthetic stable month: fees computed correctly, no excluded revenue, no
// pass-through charge, prior month within a few percent — nothing to flag.
const STABLE_HEADER = "section,line_item,amount,usali_layer,note";
const STABLE_CURRENT_CSV = [
  STABLE_HEADER,
  "OPERATING REVENUE,Rooms,1000000,operating_revenue,",
  "OPERATING REVENUE,Food & Beverage,500000,operating_revenue,",
  "OPERATING REVENUE,Total Operating Revenue,1500000,operating_revenue_total,",
  "DEPARTMENTAL EXPENSES,Rooms,400000,departmental_expense,",
  "UNDISTRIBUTED OPERATING EXPENSES,Utilities,200000,undistributed_expense,",
  "SUBTOTAL,Gross Operating Profit (GOP),900000,gop,",
  "MANAGEMENT FEES,Base Management Fee,45000,fee_charged,3.0% of 1500000",
  "MANAGEMENT FEES,Incentive Management Fee,90000,fee_charged,10% of GOP 900000",
].join("\n");
const STABLE_PRIOR_CSV = [
  STABLE_HEADER,
  "OPERATING REVENUE,Rooms,980000,operating_revenue,",
  "OPERATING REVENUE,Food & Beverage,490000,operating_revenue,",
  "DEPARTMENTAL EXPENSES,Rooms,395000,departmental_expense,",
  "UNDISTRIBUTED OPERATING EXPENSES,Utilities,195000,undistributed_expense,",
  "MANAGEMENT FEES,Base Management Fee,44100,fee_charged,",
  "MANAGEMENT FEES,Incentive Management Fee,88000,fee_charged,",
].join("\n");

const stableInput = (): RunAuditInput => ({
  caseId: "case_stable_001",
  hotelName: "The Harborline Hotel",
  auditMonth: "April 2026",
  period: "2026-04",
  priorPeriod: "2026-03",
  operatorName: "Meridian Hotel Management",
  ownerName: "Cascadia Hotel Owner LP",
  documents: {
    hma: {
      docId: "doc_hma",
      name: "Hotel Management Agreement",
      text: demoFile("01_HMA_excerpt.txt"),
    },
    statement: {
      docId: "doc_statement_apr",
      name: "Monthly Operating Statement — April (USALI)",
      csv: STABLE_CURRENT_CSV,
    },
    priorStatement: {
      docId: "doc_statement_mar",
      name: "Monthly Operating Statement — March (USALI)",
      csv: STABLE_PRIOR_CSV,
    },
  },
});

// --- Golden end-to-end: the Harborline demo case ---------------------------------

describe("runAudit — golden end-to-end (real data/demo files)", () => {
  const { llm } = scriptedLlm();
  const resultPromise = runAudit(harborlineInput(), { llm, now });

  it("reproduces the $36,580 ground truth from parsed documents alone", async () => {
    const result = await resultPromise;
    expect(result.status).toBe("completed");
    expect(result.report.calculationResult.expectedTotalFees).toBe(239620);
    expect(result.report.calculationResult.chargedTotalFees).toBe(276200);
    expect(result.report.calculationResult.variance).toBe(36580);
    expect(result.report.calculationResult.expectedBaseFee).toBe(104220);
    expect(result.report.calculationResult.expectedIncentiveFee).toBe(135400);
  });

  it("produces the three expected findings with the right dispositions", async () => {
    const result = await resultPromise;
    expect(result.findings.map((f) => f.suspectedImpact)).toEqual([1980, 6600, 28000]);
    expect(result.findings.map((f) => f.recommendedAction)).toEqual([
      "dispute",
      "dispute",
      "request_explanation",
    ]);
    expect(result.findings[2]).toMatchObject({
      issueType: "IMPROPER_PASS_THROUGH",
      checkLabel: "Check 5: Reclassification/approval",
      severity: "high",
    });
    // F3 carries the missing-approval evidence and the May baseline citation.
    const f3Labels = result.findings[2]!.citations.map((c) => c.sectionLabel ?? "");
    expect(f3Labels.some((l) => l.includes("APPROVAL-0612-03"))).toBe(true);
    expect(
      result.findings[2]!.citations.some(
        (c) => c.documentId === "doc_operating_statement_may",
      ),
    ).toBe(true);
  });

  it("scores confidence 96 as a visible sum of components", async () => {
    const result = await resultPromise;
    expect(result.confidence).toBe(0.96);
    expect(result.confidenceBreakdown!.map((c) => c.points)).toEqual([25, 25, 20, 16, 10]);
  });

  it("emits the 10-step agent trace matching the mock's tools and kinds", async () => {
    const result = await resultPromise;
    expect(result.trace).toHaveLength(10);
    expect(result.trace.map((s) => s.stepNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(result.trace.map((s) => s.tool)).toEqual([
      "planner",
      "retriever",
      "retriever",
      "rule_extractor",
      "fee_calculator",
      "anomaly_checker",
      "retriever",
      "anomaly_checker",
      "decision_engine",
      "report_generator",
    ]);
    expect(result.trace.map((s) => s.kind)).toEqual([
      "LLM", "LLM", "LLM", "LLM", "TOOL", "TOOL", "LLM", "TOOL", "TOOL", "LLM",
    ]);
    // Retrieval happens more than once — the "agent, not single-shot RAG" proof.
    expect(result.trace.filter((s) => s.tool === "retriever")).toHaveLength(3);
    // The anomaly check flags → warning; the loop step names the re-retrieval.
    expect(result.trace[5]!.status).toBe("warning");
    expect(result.trace[6]!.title).toContain("retrieve prior month + support pack");
    for (const step of result.trace) {
      expect(step.caseId).toBe("case_demo_harborline_001");
      expect(step.timestamp).toBe(RUN_AT);
      expect(step.inputSummary.length).toBeGreaterThan(0);
      expect(step.outputSummary.length).toBeGreaterThan(0);
    }
  });

  it("generates the cited memo and dispute email around the LLM prose", async () => {
    const result = await resultPromise;
    expect(result.memo).toContain("APPROVAL-0612-03");
    expect(result.memo).toContain("$36,580");
    expect(result.memo).toContain("96");
    expect(result.emailDraft.subject).toContain("The Harborline Hotel");
    expect(result.emailDraft.subject).toContain("$36,580");
    // The scripted prose used only context amounts, so the number guard kept it.
    expect(result.report.executiveSummary).toContain("$36,580");
    expect(result.report.executiveSummary).not.toContain("reconcile to the management agreement");
  });

  it("completes the golden path with no warnings", async () => {
    const result = await resultPromise;
    expect(result.warnings).toEqual([]);
  });
});

// --- Conditional loop: stable months skip steps 7–8 -------------------------------

describe("runAudit — stable months (no anomaly, no re-retrieval loop)", () => {
  const { llm } = scriptedLlm();
  const resultPromise = runAudit(stableInput(), { llm, now });

  it("finds no fee issues and renumbers the trace without the loop steps", async () => {
    const result = await resultPromise;
    expect(result.status).toBe("completed");
    expect(result.findings).toEqual([]);
    expect(result.report.calculationResult.variance).toBe(0);
    expect(result.trace).toHaveLength(8);
    expect(result.trace.map((s) => s.stepNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(result.trace.map((s) => s.tool)).toEqual([
      "planner",
      "retriever",
      "retriever",
      "rule_extractor",
      "fee_calculator",
      "anomaly_checker",
      "decision_engine",
      "report_generator",
    ]);
    expect(result.trace[5]!.status).toBe("completed");
    expect(result.trace.some((s) => s.title.includes("support pack"))).toBe(false);
  });

  it("reports a clean memo with prior-month credit in the confidence sum", async () => {
    const result = await resultPromise;
    expect(result.memo.toLowerCase()).toContain("no fee issues");
    // 25 clarity + 17 completeness (no breakout) + 20 match + 20 evidence + 10 prior.
    expect(result.confidence).toBe(0.92);
    expect(result.warnings).toEqual([]);
  });
});

// --- Degraded mode: the model is down, the audit still completes honestly ---------

describe("runAudit — LLM transport failure mid-run", () => {
  const failingLlm: OrchestratorLlm = async () => {
    throw new Error("connect ECONNREFUSED (Vultr inference unreachable)");
  };
  const resultPromise = runAudit(harborlineInput(), { llm: failingLlm, now });

  it("completes with deterministic fallbacks instead of failing or inventing", async () => {
    const result = await resultPromise;
    expect(result.status).toBe("completed");
    expect(result.trace).toHaveLength(10); // anomaly loop is deterministic — still runs
    expect(result.memo.length).toBeGreaterThan(0);
    expect(result.emailDraft.body).toContain("Meridian Hotel Management");
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.trace.filter((s) => s.status === "warning").length).toBeGreaterThanOrEqual(4);
  });

  it("routes the unexplained variance to human review — never fabricated findings", async () => {
    const result = await resultPromise;
    // Without extracted rules there is no recompute to assert; the whole charged
    // variance lands in a single NEEDS_REVIEW finding.
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      issueType: "NEEDS_REVIEW",
      recommendedAction: "human_review",
      suspectedImpact: 276200,
    });
  });

  it("degrades the confidence score and zeroes contract clarity", async () => {
    const result = await resultPromise;
    expect(result.confidence).toBeLessThan(0.6);
    expect(result.confidenceBreakdown![0]!.points).toBe(0);
  });
});
