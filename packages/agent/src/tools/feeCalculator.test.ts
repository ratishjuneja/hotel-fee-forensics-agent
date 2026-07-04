import type {
  ChargedFee,
  FeeRules,
  FinancialLineItem,
} from "@feeforensics/shared";
import { describe, expect, it } from "vitest";

import { calculateFees, type FeeCalculatorInput } from "./feeCalculator.js";
import {
  GRAND_HARBOR_CASE_ID,
  grandHarborChargedFees,
  grandHarborLineItems,
  grandHarborRules,
} from "../fixtures/grandHarborCase.js";

const sumImpacts = (impacts: { amountImpact: number }[]) =>
  impacts.reduce((acc, i) => acc + i.amountImpact, 0);

describe("calculateFees — Grand Harbor golden case", () => {
  const result = calculateFees({
    caseId: GRAND_HARBOR_CASE_ID,
    rules: grandHarborRules,
    lineItems: grandHarborLineItems,
    chargedFees: grandHarborChargedFees,
  });

  it("recomputes expected fees from the statement, not the charged amounts", () => {
    expect(result.caseId).toBe(GRAND_HARBOR_CASE_ID);
    expect(result.expectedBaseFee).toBe(60000); // 3% × $2,000,000 corrected GOR
    expect(result.expectedIncentiveFee).toBe(18000); // 12% × ($650,000 − $500,000)
    expect(result.expectedTotalFees).toBe(78000);
  });

  it("reads charged fees and reports the $18,750 variance", () => {
    expect(result.chargedTotalFees).toBe(96750); // 66,000 + 27,750 + 3,000
    expect(result.variance).toBe(18750);
  });

  it("attributes the variance to the three MVP leakage scenarios", () => {
    const byIssue = (t: string) =>
      result.lineItemImpacts.find((i) => i.issueType === t);

    expect(byIssue("EXCLUDED_REVENUE_INCLUDED")?.amountImpact).toBe(6000);
    expect(byIssue("INFLATED_PROFIT_METRIC")?.amountImpact).toBe(9750);
    expect(byIssue("IMPROPER_PASS_THROUGH")?.amountImpact).toBe(3000);

    // No unexplained residual on a fully-reconciled case.
    expect(
      result.lineItemImpacts.some((i) => i.issueType === "NEEDS_REVIEW"),
    ).toBe(false);
    expect(result.lineItemImpacts).toHaveLength(3);
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
});
