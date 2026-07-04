import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { ChargedFee, FinancialLineItem } from "@feeforensics/shared";
import { describe, expect, it } from "vitest";

import {
  checkAnomalies,
  DEFAULT_ANOMALY_THRESHOLDS,
  type AnomalyCheckerInput,
} from "./anomalyChecker.js";
import {
  parseMiscIncomeBreakout,
  parseOperatingStatement,
  type ParseOptions,
} from "./statementParser.js";

const demoFile = (name: string) =>
  readFileSync(
    fileURLToPath(new URL(`../../../../data/demo/${name}`, import.meta.url)),
    "utf8",
  );

const opts = (docId: string, name: string, period: string): ParseOptions => ({
  caseId: "case_demo_harborline_001",
  sourceDocumentId: docId,
  documentName: name,
  period,
});

const june = parseOperatingStatement(
  demoFile("02_operating_statement_june.csv"),
  opts("doc_operating_statement_june", "Monthly Operating Statement — June (USALI)", "2026-06"),
);
const may = parseOperatingStatement(
  demoFile("03_operating_statement_may.csv"),
  opts("doc_operating_statement_may", "Monthly Operating Statement — May (USALI)", "2026-05"),
);
const juneMisc = parseMiscIncomeBreakout(
  demoFile("02b_misc_income_breakout_june.csv"),
  opts("doc_misc_income_breakout_june", "Misc Income Breakout — June", "2026-06"),
);

// --- The demo signal: June vs May statements (real data/demo CSVs) ----------

describe("checkAnomalies — Harborline June vs May (real data/demo CSVs)", () => {
  const anomalies = checkAnomalies({
    currentLineItems: june.lineItems,
    priorLineItems: may.lineItems,
    currentChargedFees: june.chargedFees,
    priorChargedFees: may.chargedFees,
  });

  it("flags the centralized-services jump as the only anomaly", () => {
    // Centralized Services parses as a ChargedFee (PASS_THROUGH_EXPENSE), so the
    // checker must compare charged fees, not just statement line items.
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]).toMatchObject({
      key: "PASS_THROUGH_EXPENSE",
      kind: "charged_fee",
      currentAmount: 28000,
      priorAmount: 7500,
      absoluteChange: 20500,
      severity: "high",
      triggersReview: true,
    });
    expect(anomalies[0]!.percentChange).toBeCloseTo(2.7333, 3); // +273% on flat revenue
    expect(anomalies[0]!.reason).toBeTruthy();
  });

  it("ignores the stable revenue and expense categories", () => {
    // Rooms rose +$50k but only +2.1%; expenses +$38k / +1.8%; base fee +$4,140;
    // incentive +$10k / +7.6% — none clear the 50% month-over-month gate.
    const keys = anomalies.map((a) => a.key);
    expect(keys).not.toContain("ROOM_REVENUE");
    expect(keys).not.toContain("FNB_REVENUE");
    expect(keys).not.toContain("OPERATING_EXPENSE");
    expect(keys).not.toContain("BASE_MANAGEMENT_FEE");
    expect(keys).not.toContain("INCENTIVE_MANAGEMENT_FEE");
  });

  it("carries citations from both months' source rows", () => {
    const centralized = anomalies[0]!;
    expect(centralized.currentCitation?.documentId).toBe("doc_operating_statement_june");
    expect(centralized.currentCitation?.quote).toContain("28000");
    expect(centralized.priorCitation?.documentId).toBe("doc_operating_statement_may");
    expect(centralized.priorCitation?.quote).toContain("7500");
  });
});

// --- New items: June misc breakout adds §4.3 excluded revenue absent in May --

describe("checkAnomalies — new items and sorting (June + misc breakout vs May)", () => {
  // The breakout details the statement's "Miscellaneous Income" roll-up, so it
  // replaces that line when merged — keeping both would double-count the $140k.
  const juneDetailed = [
    ...june.lineItems.filter((i) => i.description !== "Miscellaneous Income"),
    ...juneMisc.lineItems,
  ];

  const anomalies = checkAnomalies({
    currentLineItems: juneDetailed,
    priorLineItems: may.lineItems,
    currentChargedFees: june.chargedFees,
    priorChargedFees: may.chargedFees,
  });

  const byKey = (key: string) => anomalies.find((a) => a.key === key);

  it("flags revenue lines that appear with no prior-month counterpart", () => {
    // Banquet Cancellation ($41k) and Insurance Proceeds ($25k) exist only in
    // June's breakout — new items report a null percentChange, never Infinity.
    expect(byKey("CANCELLATION_REVENUE")).toMatchObject({
      kind: "line_item",
      currentAmount: 41000,
      priorAmount: 0,
      absoluteChange: 41000,
      percentChange: null,
      severity: "high",
    });
    expect(byKey("INSURANCE_PROCEEDS")).toMatchObject({
      currentAmount: 25000,
      priorAmount: 0,
      percentChange: null,
      severity: "high",
    });
  });

  it("only material increases in expense-side keys trigger review", () => {
    // New *revenue* items are anomalous but do not drive the re-retrieval loop.
    expect(byKey("CANCELLATION_REVENUE")!.triggersReview).toBe(false);
    expect(byKey("INSURANCE_PROCEEDS")!.triggersReview).toBe(false);
    expect(byKey("PASS_THROUGH_EXPENSE")!.triggersReview).toBe(true);
  });

  it("sorts the review-triggering anomaly first, then by dollar magnitude", () => {
    expect(anomalies.map((a) => a.key)).toEqual([
      "PASS_THROUGH_EXPENSE", // the demo signal leads
      "CANCELLATION_REVENUE", // then $41,000
      "INSURANCE_PROCEEDS", // then $25,000
    ]);
  });
});

// --- Threshold gates and edge cases (synthetic inputs) -----------------------

const cite = (documentId = "d") => ({ documentId, documentName: "n" });

const line = (
  amount: number,
  normalizedCategory: FinancialLineItem["normalizedCategory"],
  period = "2026-06",
): FinancialLineItem => ({
  id: `l_${normalizedCategory}_${period}`,
  caseId: "c",
  sourceDocumentId: "d",
  period,
  category: normalizedCategory,
  description: normalizedCategory,
  amount,
  normalizedCategory,
  citation: cite(),
});

const charged = (
  feeType: ChargedFee["feeType"],
  chargedAmount: number,
  period = "2026-06",
): ChargedFee => ({
  id: `f_${feeType}_${period}`,
  caseId: "c",
  feeType,
  chargedAmount,
  period,
  citation: cite(),
});

const onlyLineItems = (
  current: FinancialLineItem[],
  prior: FinancialLineItem[],
): AnomalyCheckerInput => ({ currentLineItems: current, priorLineItems: prior });

describe("checkAnomalies — threshold gates", () => {
  it("does not flag a large-dollar but small-percent change", () => {
    // +$6,000 clears the absolute gate but +6% misses the 50% percent gate.
    const anomalies = checkAnomalies(
      onlyLineItems([line(106000, "OPERATING_EXPENSE")], [line(100000, "OPERATING_EXPENSE", "2026-05")]),
    );
    expect(anomalies).toHaveLength(0);
  });

  it("does not flag a large-percent but small-dollar change", () => {
    // +300% clears the percent gate but +$3,000 misses the $5,000 absolute gate.
    const anomalies = checkAnomalies(
      onlyLineItems([line(4000, "OPERATING_EXPENSE")], [line(1000, "OPERATING_EXPENSE", "2026-05")]),
    );
    expect(anomalies).toHaveLength(0);
  });

  it("honors custom thresholds", () => {
    const anomalies = checkAnomalies(
      onlyLineItems([line(4000, "OPERATING_EXPENSE")], [line(1000, "OPERATING_EXPENSE", "2026-05")]),
      { minAbsolute: 1000 },
    );
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]!.triggersReview).toBe(true); // expense increase, now material
  });

  it("exports the default gates the demo case relies on", () => {
    expect(DEFAULT_ANOMALY_THRESHOLDS).toEqual({ minPercent: 0.5, minAbsolute: 5000 });
  });
});

describe("checkAnomalies — edge cases", () => {
  it("flags a category that disappears as a decrease, without triggering review", () => {
    const anomalies = checkAnomalies(
      onlyLineItems([], [line(20000, "CORPORATE_OVERHEAD", "2026-05")]),
    );
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]).toMatchObject({
      key: "CORPORATE_OVERHEAD",
      currentAmount: 0,
      priorAmount: 20000,
      absoluteChange: -20000,
      percentChange: -1,
      triggersReview: false, // review is for material *increases* only
    });
  });

  it("compares charged fees even when line items are quiet", () => {
    const anomalies = checkAnomalies({
      currentLineItems: [],
      priorLineItems: [],
      currentChargedFees: [charged("PASS_THROUGH_EXPENSE", 28000)],
      priorChargedFees: [charged("PASS_THROUGH_EXPENSE", 7500, "2026-05")],
    });
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]!.kind).toBe("charged_fee");
  });

  it("returns no anomalies for empty inputs", () => {
    expect(checkAnomalies(onlyLineItems([], []))).toHaveLength(0);
  });
});
