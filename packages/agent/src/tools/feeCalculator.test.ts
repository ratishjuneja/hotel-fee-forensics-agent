import type {
  ChargedFee,
  FeeRules,
  FinancialLineItem,
} from "@feeforensics/shared";
import { describe, expect, it } from "vitest";

import { calculateFees, type FeeCalculatorInput } from "./feeCalculator.js";
import {
  HARBORLINE_CASE_ID,
  harborlineChargedFees,
  harborlineLineItems,
  harborlineRules,
} from "../fixtures/harborlineCase.js";

const sumImpacts = (impacts: { amountImpact: number }[]) =>
  impacts.reduce((acc, i) => acc + i.amountImpact, 0);

describe("calculateFees — Harborline golden case ($36,580)", () => {
  const result = calculateFees({
    caseId: HARBORLINE_CASE_ID,
    rules: harborlineRules,
    lineItems: harborlineLineItems,
    chargedFees: harborlineChargedFees,
  });

  const totalBy = (t: string) =>
    sumImpacts(result.lineItemImpacts.filter((i) => i.issueType === t));

  it("recomputes expected fees from the statement, not the charged amounts", () => {
    expect(result.caseId).toBe(HARBORLINE_CASE_ID);
    expect(result.expectedBaseFee).toBe(104220); // 3.0% × $3,474,000 clean base
    expect(result.expectedIncentiveFee).toBe(135400); // 10% × $1,354,000 true GOP
    expect(result.expectedTotalFees).toBe(239620);
  });

  it("reads charged fees and reports the $36,580 variance", () => {
    expect(result.chargedTotalFees).toBe(276200); // 106,200 + 142,000 + 28,000
    expect(result.variance).toBe(36580);
  });

  it("attributes the variance to the three Harborline findings", () => {
    // F1 — excluded revenue (insurance + cancellation, $66k) in the base fee.
    expect(totalBy("EXCLUDED_REVENUE_INCLUDED")).toBe(1980); // 3.0% × $66,000
    // F2 — incentive fee on GOP inflated by the same $66k.
    expect(totalBy("INFLATED_PROFIT_METRIC")).toBe(6600); // 10% × $66,000
    // F3 — centralized services passed through without §5.1 approval.
    expect(totalBy("IMPROPER_PASS_THROUGH")).toBe(28000);

    // Hard overcharge $8,580 (F1 + F2) + unsupported $28,000 (F3) = $36,580.
    expect(totalBy("EXCLUDED_REVENUE_INCLUDED") + totalBy("INFLATED_PROFIT_METRIC")).toBe(8580);

    // No unexplained residual on a fully-reconciled case.
    expect(
      result.lineItemImpacts.some((i) => i.issueType === "NEEDS_REVIEW"),
    ).toBe(false);
  });

  it("keeps the sum of impacts reconciled to the variance (invariant)", () => {
    expect(sumImpacts(result.lineItemImpacts)).toBeCloseTo(result.variance, 2);
  });

  it("cites evidence for every impact (nothing unsupported)", () => {
    for (const impact of result.lineItemImpacts) {
      expect(impact.citations.length).toBeGreaterThan(0);
      expect(impact.relatedLineItems.length).toBeGreaterThan(0);
    }
  });
});

// --- Focused edge cases -----------------------------------------------------

const cite = () => ({ documentId: "d", documentName: "n" });

const line = (
  amount: number,
  normalizedCategory: FinancialLineItem["normalizedCategory"],
): FinancialLineItem => ({
  id: `l_${normalizedCategory}_${amount}`,
  caseId: "c",
  sourceDocumentId: "d",
  period: "2026-06",
  category: normalizedCategory,
  description: normalizedCategory,
  amount,
  normalizedCategory,
  citation: cite(),
});

const charged = (
  feeType: ChargedFee["feeType"],
  chargedAmount: number,
): ChargedFee => ({
  id: `f_${feeType}`,
  caseId: "c",
  feeType,
  chargedAmount,
  period: "2026-06",
  citation: cite(),
});

const baseRule: FeeRules["baseManagementFee"] = {
  percentage: 0.03,
  revenueBase: "GOR",
  excludedRevenue: ["cancellation fees"],
  citation: cite(),
};
const incentiveRule = (threshold: number): FeeRules["incentiveFee"] => ({
  percentage: 0.12,
  profitMetric: "AGOP",
  threshold,
  excludedItems: ["insurance recoveries"],
  citation: cite(),
});

describe("calculateFees — edge cases", () => {
  it("charges no incentive fee when AGOP is below the threshold", () => {
    // AGOP = 500,000 − 100,000 = 400,000; even with insurance still < 1,000,000.
    const input: FeeCalculatorInput = {
      caseId: "c",
      rules: { baseManagementFee: baseRule, incentiveFee: incentiveRule(1000000) },
      lineItems: [
        line(500000, "ROOM_REVENUE"),
        line(100000, "OPERATING_EXPENSE"),
        line(50000, "INSURANCE_PROCEEDS"),
      ],
      chargedFees: [
        charged("BASE_MANAGEMENT_FEE", 15000), // 3% × 500,000
        charged("INCENTIVE_MANAGEMENT_FEE", 0),
      ],
    };
    const result = calculateFees(input);

    expect(result.expectedIncentiveFee).toBe(0);
    expect(result.variance).toBe(0);
    expect(result.lineItemImpacts).toHaveLength(0);
  });

  it("reports zero variance and no impacts for a clean statement", () => {
    const input: FeeCalculatorInput = {
      caseId: "c",
      rules: { baseManagementFee: baseRule, incentiveFee: incentiveRule(500000) },
      lineItems: [
        line(1000000, "ROOM_REVENUE"),
        line(200000, "OPERATING_EXPENSE"),
      ],
      chargedFees: [
        charged("BASE_MANAGEMENT_FEE", 30000), // 3% × 1,000,000
        charged("INCENTIVE_MANAGEMENT_FEE", 36000), // 12% × (800,000 − 500,000)
      ],
    };
    const result = calculateFees(input);

    expect(result.expectedBaseFee).toBe(30000);
    expect(result.expectedIncentiveFee).toBe(36000);
    expect(result.variance).toBe(0);
    expect(result.lineItemImpacts).toHaveLength(0);
  });

  it("flags NEEDS_REVIEW instead of inventing a base fee when the rule is missing", () => {
    const input: FeeCalculatorInput = {
      caseId: "c",
      rules: { incentiveFee: incentiveRule(500000) }, // no baseManagementFee
      lineItems: [
        line(1000000, "ROOM_REVENUE"),
        line(200000, "OPERATING_EXPENSE"),
      ],
      chargedFees: [charged("BASE_MANAGEMENT_FEE", 30000)],
    };
    const result = calculateFees(input);

    expect(result.expectedBaseFee).toBe(0); // not invented from the charged amount
    expect(
      result.lineItemImpacts.some((i) => i.issueType === "NEEDS_REVIEW"),
    ).toBe(true);
    // Everything still reconciles.
    expect(sumImpacts(result.lineItemImpacts)).toBeCloseTo(result.variance, 2);
  });

  it("flags an above-threshold pass-through from the $ threshold alone — no extracted exclusion list needed", () => {
    // §5.1 states an approval threshold, not a category ban, so a live
    // extractor honestly returns excludedCategories: [] — the first live Vultr
    // run proved it. The threshold comparison is arithmetic and must live in
    // this calculator, never depend on the model volunteering a category.
    const rules: FeeRules = {
      ...harborlineRules,
      passThroughRules: {
        ...harborlineRules.passThroughRules!,
        excludedCategories: [],
      },
    };
    const result = calculateFees({
      caseId: HARBORLINE_CASE_ID,
      rules,
      lineItems: harborlineLineItems,
      chargedFees: harborlineChargedFees,
    });
    const passThrough = result.lineItemImpacts.filter(
      (i) => i.issueType === "IMPROPER_PASS_THROUGH",
    );
    expect(passThrough.map((i) => i.amountImpact)).toEqual([28000]);
    // And the full variance still reconciles to the golden $36,580.
    expect(sumImpacts(result.lineItemImpacts)).toBeCloseTo(result.variance, 2);
  });

  const passRules = (approvalThreshold: number): FeeRules["passThroughRules"] => ({
    allowedCategories: ["OPERATING_EXPENSE"],
    excludedCategories: ["CORPORATE_OVERHEAD"],
    approvalThreshold,
    citation: cite(),
  });

  it("clears a within-threshold §5.1 pass-through as a valid reimbursement (no residual)", () => {
    // A centralized-services charge is a cost reimbursement, not a formula fee:
    // at or under the §5.1 threshold it is valid and must reconcile as expected,
    // never surface as unexplained variance (which would escalate to a human).
    const result = calculateFees({
      caseId: "c",
      rules: {
        baseManagementFee: baseRule,
        incentiveFee: incentiveRule(500000),
        passThroughRules: passRules(10000),
      },
      lineItems: [line(1000000, "ROOM_REVENUE"), line(200000, "OPERATING_EXPENSE")],
      chargedFees: [
        charged("BASE_MANAGEMENT_FEE", 30000), // 3% × 1,000,000
        charged("INCENTIVE_MANAGEMENT_FEE", 36000), // 12% × (800,000 − 500,000)
        charged("PASS_THROUGH_EXPENSE", 8800), // ≤ $10,000 → valid, nothing to recompute
      ],
    });

    expect(result.expectedTotalFees).toBe(74800); // 30,000 + 36,000 + 8,800 reimbursement
    expect(result.variance).toBe(0);
    expect(result.lineItemImpacts).toHaveLength(0);
    expect(
      result.lineItemImpacts.some((i) => i.issueType === "NEEDS_REVIEW"),
    ).toBe(false);
  });

  it("reads the §5.1 threshold per contract: $11,200 clears at $15k but not at $10k", () => {
    const inputs = (approvalThreshold: number): FeeCalculatorInput => ({
      caseId: "c",
      rules: {
        baseManagementFee: baseRule,
        incentiveFee: incentiveRule(500000),
        passThroughRules: passRules(approvalThreshold),
      },
      lineItems: [line(1000000, "ROOM_REVENUE"), line(200000, "OPERATING_EXPENSE")],
      chargedFees: [
        charged("BASE_MANAGEMENT_FEE", 30000),
        charged("INCENTIVE_MANAGEMENT_FEE", 36000),
        charged("PASS_THROUGH_EXPENSE", 11200),
      ],
    });

    // Cedarcrest ($15k contract): $11,200 ≤ $15,000 → valid, reconciles, unflagged.
    const cedarcrest = calculateFees(inputs(15000));
    expect(cedarcrest.variance).toBe(0);
    expect(cedarcrest.lineItemImpacts).toHaveLength(0);

    // The identical charge under a $10,000 contract is NOT auto-cleared — the
    // threshold value drives the outcome, so nothing is hard-coded.
    const tighter = calculateFees(inputs(10000));
    expect(tighter.variance).toBe(11200);
    expect(
      tighter.lineItemImpacts.some((i) => i.issueType === "NEEDS_REVIEW"),
    ).toBe(true);
  });
});
