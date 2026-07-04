import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { CalculationResult, Citation } from "@feeforensics/shared";
import { describe, expect, it } from "vitest";

import { checkAnomalies } from "./anomalyChecker.js";
import { checkSupport, parseSupportPack } from "./caseHistoryRetriever.js";
import {
  decideFindings,
  scoreConfidence,
  type ConfidenceInput,
  type DecisionInput,
} from "./decisionEngine.js";
import { calculateFees } from "./feeCalculator.js";
import { parseOperatingStatement } from "./statementParser.js";
import {
  HARBORLINE_CASE_ID,
  harborlineChargedFees,
  harborlineLineItems,
  harborlineRules,
} from "../fixtures/harborlineCase.js";

const demoFile = (name: string) =>
  readFileSync(
    fileURLToPath(new URL(`../../../../data/demo/${name}`, import.meta.url)),
    "utf8",
  );

// --- Assemble the real Harborline pipeline inputs ----------------------------

const calculation = calculateFees({
  caseId: HARBORLINE_CASE_ID,
  rules: harborlineRules,
  lineItems: harborlineLineItems,
  chargedFees: harborlineChargedFees,
});

const june = parseOperatingStatement(demoFile("02_operating_statement_june.csv"), {
  caseId: HARBORLINE_CASE_ID,
  sourceDocumentId: "doc_operating_statement_june",
  documentName: "Monthly Operating Statement — June (USALI)",
  period: "2026-06",
});
const may = parseOperatingStatement(demoFile("03_operating_statement_may.csv"), {
  caseId: HARBORLINE_CASE_ID,
  sourceDocumentId: "doc_operating_statement_may",
  documentName: "Monthly Operating Statement — May (USALI)",
  period: "2026-05",
});

const anomalies = checkAnomalies({
  currentLineItems: june.lineItems,
  priorLineItems: may.lineItems,
  currentChargedFees: june.chargedFees,
  priorChargedFees: may.chargedFees,
});

const pack = parseSupportPack(demoFile("04_support_invoice_pack.csv"), {
  sourceDocumentId: "doc_support_pack",
  documentName: "Support / Invoice Pack — June",
});

const centralizedCheck = checkSupport(
  { subject: "Centralized Services", amount: 28000, approvalThreshold: 10000 },
  pack.records,
);

const harborlineDecision: DecisionInput = {
  caseId: HARBORLINE_CASE_ID,
  rules: harborlineRules,
  calculation,
  anomalies,
  supportChecks: [{ subject: "Centralized Services", result: centralizedCheck }],
};

const findings = decideFindings(harborlineDecision);

// --- Findings ------------------------------------------------------------------

describe("decideFindings — Harborline golden case (real pipeline outputs)", () => {
  it("produces the three expected findings in calculator order", () => {
    expect(findings).toHaveLength(3);
    expect(findings.map((f) => f.issueType)).toEqual([
      "EXCLUDED_REVENUE_INCLUDED",
      "INFLATED_PROFIT_METRIC",
      "IMPROPER_PASS_THROUGH",
    ]);
    expect(findings.map((f) => f.suspectedImpact)).toEqual([1980, 6600, 28000]);
    for (const finding of findings) {
      expect(finding.caseId).toBe(HARBORLINE_CASE_ID);
      expect(finding.citations.length).toBeGreaterThan(0);
    }
  });

  it("F1 — excluded revenue: medium-severity dispute tagged to Check 2", () => {
    expect(findings[0]).toMatchObject({
      severity: "medium",
      recommendedAction: "dispute",
      checkLabel: "Check 2: Inclusion",
      confidence: 0.98,
    });
  });

  it("F2 — inflated profit metric: names the metric from the extracted rules", () => {
    expect(findings[1]).toMatchObject({
      severity: "medium",
      recommendedAction: "dispute",
      checkLabel: "Check 3: GOP/AGOP",
      confidence: 0.95,
    });
    expect(findings[1]!.title).toContain("Gross Operating Profit");
  });

  it("F3 — unsupported pass-through: approval-or-reversal, not auto-clawback", () => {
    const f3 = findings[2]!;
    expect(f3).toMatchObject({
      severity: "high",
      recommendedAction: "request_explanation", // owner may still approve retroactively
      checkLabel: "Check 5: Reclassification/approval",
      confidence: 0.9,
    });
    expect(f3.title.toLowerCase()).toContain("without required owner approval");
    expect(f3.explanation).toContain("APPROVAL-0612-03");
  });

  it("F3 cites the support pack and the prior-month anomaly evidence", () => {
    const docIds = findings[2]!.citations.map((c) => c.documentId);
    expect(docIds).toContain("doc_support_pack");
    expect(docIds).toContain("doc_operating_statement_may"); // the May $7,500 baseline
  });
});

// --- Confidence -----------------------------------------------------------------

const harborlineConfidence: ConfidenceInput = {
  rules: harborlineRules,
  calculation,
  findings,
  inputsPresent: { statement: true, revenueBreakout: true, priorMonth: true },
  anomalyCheckRan: true,
};

describe("scoreConfidence — Harborline golden case (96)", () => {
  const score = scoreConfidence(harborlineConfidence);

  it("renders as a visible sum: 25 + 25 + 20 + 16 + 10 = 96", () => {
    expect(score.points).toBe(96);
    expect(score.confidence).toBe(0.96);
    expect(score.breakdown.map((c) => c.points)).toEqual([25, 25, 20, 16, 10]);
    expect(score.breakdown.map((c) => c.max)).toEqual([25, 25, 20, 20, 10]);
  });

  it("uses the exact labels the ConfidenceMeter renders", () => {
    expect(score.breakdown.map((c) => c.label)).toEqual([
      "Contract clarity",
      "Data completeness",
      "Calculation match",
      "Evidence support",
      "Prior-month consistency",
    ]);
  });

  it("keeps the sum invariant and explains every component", () => {
    const sum = score.breakdown.reduce((acc, c) => acc + c.points, 0);
    expect(sum).toBe(score.points);
    for (const component of score.breakdown) {
      expect(component.explanation).toBeTruthy();
      expect(component.points).toBeGreaterThanOrEqual(0);
      expect(component.points).toBeLessThanOrEqual(component.max);
    }
  });

  it("deducts prior-month points when May is missing", () => {
    const score = scoreConfidence({
      ...harborlineConfidence,
      inputsPresent: { statement: true, revenueBreakout: true, priorMonth: false },
      anomalyCheckRan: false,
    });
    const byKey = Object.fromEntries(score.breakdown.map((c) => [c.key, c.points]));
    expect(byKey["prior_month_consistency"]).toBe(0);
    expect(byKey["data_completeness"]).toBe(17); // 2 of 3 inputs, rounded
  });

  it("deducts contract clarity when a fee clause was not found", () => {
    const { passThroughRules: _dropped, ...partialRules } = harborlineRules;
    const score = scoreConfidence({ ...harborlineConfidence, rules: partialRules });
    const clarity = score.breakdown.find((c) => c.key === "contract_clarity")!;
    expect(clarity.points).toBe(17); // 2 of 3 clauses, rounded
    expect(clarity.explanation.toLowerCase()).toContain("pass-through");
  });
});

// --- Synthetic edge cases ---------------------------------------------------------

const cite = (): Citation => ({ documentId: "d", documentName: "n" });

const syntheticCalc = (
  impacts: CalculationResult["lineItemImpacts"],
): CalculationResult => ({
  caseId: "c",
  expectedBaseFee: 100,
  expectedIncentiveFee: 0,
  expectedTotalFees: 100,
  chargedTotalFees: 100 + impacts.reduce((acc, i) => acc + i.amountImpact, 0),
  variance: impacts.reduce((acc, i) => acc + i.amountImpact, 0),
  lineItemImpacts: impacts,
});

describe("decideFindings / scoreConfidence — edge cases", () => {
  it("returns no findings and full confidence for a clean audit", () => {
    const calc = syntheticCalc([]);
    const cleanFindings = decideFindings({ caseId: "c", rules: harborlineRules, calculation: calc });
    expect(cleanFindings).toEqual([]);

    const score = scoreConfidence({
      rules: harborlineRules,
      calculation: calc,
      findings: cleanFindings,
      inputsPresent: { statement: true, revenueBreakout: true, priorMonth: true },
      anomalyCheckRan: true,
    });
    expect(score.points).toBe(100);
    expect(score.confidence).toBe(1);
  });

  it("routes a NEEDS_REVIEW impact to a human, never a dispute", () => {
    const calc = syntheticCalc([
      {
        issueType: "NEEDS_REVIEW",
        description: "Base fee clause not found — expected base fee not computed.",
        amountImpact: 15000,
        relatedLineItems: ["x"],
        citations: [cite()],
      },
    ]);
    const reviewFindings = decideFindings({ caseId: "c", rules: {}, calculation: calc });

    expect(reviewFindings[0]).toMatchObject({
      severity: "review",
      recommendedAction: "human_review",
      confidence: 0.4,
    });

    const score = scoreConfidence({
      rules: harborlineRules,
      calculation: calc,
      findings: reviewFindings,
      inputsPresent: { statement: true, revenueBreakout: true, priorMonth: true },
      anomalyCheckRan: true,
    });
    const byKey = Object.fromEntries(score.breakdown.map((c) => [c.key, c.points]));
    expect(byKey["calculation_match"]).toBe(10); // reconciled, but with open reviews
    expect(byKey["evidence_support"]).toBe(0); // a human still has to look
  });

  it("downgrades an unverified pass-through to human review", () => {
    // The calculator flagged it, but no support check ran — we cannot assert
    // the approval is missing, only that verification is outstanding.
    const calc = syntheticCalc([
      {
        issueType: "IMPROPER_PASS_THROUGH",
        description: "Corporate support charge passed through to owner.",
        amountImpact: 3000,
        relatedLineItems: ["x"],
        citations: [cite()],
      },
    ]);
    const unverified = decideFindings({ caseId: "c", rules: harborlineRules, calculation: calc });

    expect(unverified[0]).toMatchObject({
      severity: "medium",
      recommendedAction: "human_review",
      confidence: 0.75,
    });
  });
});
