import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  parseMiscIncomeBreakout,
  parseMoney,
  parseOperatingStatement,
  type ParseOptions,
} from "./statementParser.js";

const demoFile = (name: string) =>
  readFileSync(
    fileURLToPath(new URL(`../../../../data/demo/${name}`, import.meta.url)),
    "utf8",
  );

const juneOpts: ParseOptions = {
  caseId: "case_demo_harborline_001",
  sourceDocumentId: "doc_operating_statement_june",
  documentName: "Monthly Operating Statement — June (USALI)",
  period: "2026-06",
};

const miscOpts: ParseOptions = {
  caseId: "case_demo_harborline_001",
  sourceDocumentId: "doc_misc_income_breakout_june",
  documentName: "Misc Income Breakout — June",
  period: "2026-06",
};

const sumAmounts = (items: { amount: number }[]) =>
  items.reduce((acc, i) => acc + i.amount, 0);

// --- Currency / number tolerance --------------------------------------------

describe("parseMoney", () => {
  it("strips currency symbols, thousands separators, and whitespace", () => {
    expect(parseMoney("$3,540,000")).toBe(3540000);
    expect(parseMoney(" 28,000 ")).toBe(28000);
    expect(parseMoney("$ 1,234.56")).toBe(1234.56);
    expect(parseMoney("2400000")).toBe(2400000);
  });

  it("reads accounting-style parentheses as negative", () => {
    expect(parseMoney("(1,000)")).toBe(-1000);
    expect(parseMoney("($2,500.00)")).toBe(-2500);
  });

  it("throws on non-numeric input rather than inventing a value", () => {
    expect(() => parseMoney("")).toThrow();
    expect(() => parseMoney("n/a")).toThrow();
  });
});

// --- Operating statement (USALI) --------------------------------------------

describe("parseOperatingStatement — June (real data/demo CSV)", () => {
  const result = parseOperatingStatement(
    demoFile("02_operating_statement_june.csv"),
    juneOpts,
  );

  const byDescription = (needle: string) =>
    result.lineItems.find((i) =>
      i.description.toLowerCase().includes(needle.toLowerCase()),
    );

  it("maps known revenue lines to normalized categories", () => {
    expect(byDescription("Rooms")).toMatchObject({
      amount: 2400000,
      normalizedCategory: "ROOM_REVENUE",
    });
    expect(byDescription("Food & Beverage")).toMatchObject({
      amount: 820000,
      normalizedCategory: "FNB_REVENUE",
    });
  });

  it("classifies departmental + undistributed detail as OPERATING_EXPENSE ($2,120,000)", () => {
    const expenses = result.lineItems.filter(
      (i) => i.normalizedCategory === "OPERATING_EXPENSE",
    );
    expect(sumAmounts(expenses)).toBe(2120000);
  });

  it("skips totals, subtotals, and GOP (derived aggregates, never line items)", () => {
    for (const derived of [
      "Total Operating Revenue",
      "Total Departmental Expenses",
      "Total Undistributed Expenses",
      "Total Departmental Profit",
      "Gross Operating Profit",
      "Total Fees Charged",
    ]) {
      expect(byDescription(derived)).toBeUndefined();
    }
  });

  it("parses the MANAGEMENT FEES rows into charged fees with typed amounts", () => {
    const feeAmount = (t: string) =>
      result.chargedFees.find((f) => f.feeType === t)?.chargedAmount;
    expect(feeAmount("BASE_MANAGEMENT_FEE")).toBe(106200);
    expect(feeAmount("INCENTIVE_MANAGEMENT_FEE")).toBe(142000);
    expect(feeAmount("PASS_THROUGH_EXPENSE")).toBe(28000);
    expect(result.chargedFees).toHaveLength(3);
  });

  it("maps other-operated and misc income to their included-revenue categories", () => {
    // Both belong in the base-fee revenue base (they are part of the $3,474,000
    // clean base), so they must not fall into OTHER and get dropped from fees.
    expect(byDescription("Other Operated Departments")?.normalizedCategory).toBe(
      "OTHER_OPERATED_REVENUE",
    );
    expect(byDescription("Miscellaneous Income")?.normalizedCategory).toBe("MISC_INCOME");
    expect(result.warnings).toEqual([]);
  });

  it("flags an unrecognized revenue line as OTHER instead of inventing a category", () => {
    const csv = [
      "section,line_item,amount,usali_layer",
      "OPERATING REVENUE,Gift Shop Royalties,12000,operating_revenue",
    ].join("\n");
    const parsed = parseOperatingStatement(csv, juneOpts);
    expect(parsed.lineItems[0]?.normalizedCategory).toBe("OTHER");
    expect(parsed.warnings.some((w) => w.includes("Gift Shop Royalties"))).toBe(true);
  });

  it("carries a citation back to the source document on every parsed row", () => {
    for (const row of [...result.lineItems, ...result.chargedFees]) {
      expect(row.caseId).toBe(juneOpts.caseId);
      expect(row.period).toBe(juneOpts.period);
      expect(row.citation.documentId).toBe(juneOpts.sourceDocumentId);
      expect(row.citation.quote && row.citation.quote.length).toBeGreaterThan(0);
    }
  });

  it("pins each citation to its exact source CSV row and line label", () => {
    // Centralized Services sits on line 21 of 02_operating_statement_june.csv.
    const centralized = result.chargedFees.find((f) =>
      f.citation.lineLabel?.includes("Centralized Services"),
    );
    expect(centralized?.citation.row).toBe(21);
    expect(centralized?.citation.lineLabel).toBe("Centralized Services");

    // The first data row (Rooms) is CSV row 2 — the header is row 1.
    expect(byDescription("Rooms")?.citation.row).toBe(2);
    expect(byDescription("Rooms")?.citation.lineLabel).toBe("Rooms");
  });
});

// --- Misc income breakout ---------------------------------------------------

describe("parseMiscIncomeBreakout — June (real data/demo CSV)", () => {
  const result = parseMiscIncomeBreakout(
    demoFile("02b_misc_income_breakout_june.csv"),
    miscOpts,
  );

  const byDescription = (needle: string) =>
    result.lineItems.find((i) =>
      i.description.toLowerCase().includes(needle.toLowerCase()),
    );

  it("categorizes the two HMA §4.3 excluded items", () => {
    expect(byDescription("Banquet Cancellation")).toMatchObject({
      amount: 41000,
      normalizedCategory: "CANCELLATION_REVENUE",
    });
    expect(byDescription("Insurance Proceeds")).toMatchObject({
      amount: 25000,
      normalizedCategory: "INSURANCE_PROCEEDS",
    });
  });

  it("pins each misc line to its source CSV row (header is row 1)", () => {
    expect(byDescription("Banquet Cancellation")?.citation.row).toBe(4);
    expect(byDescription("Insurance Proceeds")?.citation.row).toBe(5);
  });

  it("keeps legitimately-included misc lines in the fee base as MISC_INCOME", () => {
    expect(byDescription("Space Rental")?.normalizedCategory).toBe("MISC_INCOME");
    expect(byDescription("Commissions")?.normalizedCategory).toBe("MISC_INCOME");
  });

  it("drops the roll-up total and keeps only the four detail rows", () => {
    expect(byDescription("Total Miscellaneous Income")).toBeUndefined();
    expect(result.lineItems).toHaveLength(4);
    expect(sumAmounts(result.lineItems)).toBe(140000);
  });
});

// --- Header tolerance -------------------------------------------------------

describe("parseOperatingStatement — tolerant headers", () => {
  it("parses reordered / renamed / differently-cased headers", () => {
    const csv = [
      "Line Item ,SECTION, Amount , USALI Layer",
      'Rooms,Operating Revenue,"$1,000,000",operating_revenue',
      "Base Management Fee,Management Fees,30000,fee_charged",
    ].join("\n");

    const result = parseOperatingStatement(csv, juneOpts);
    expect(result.lineItems).toHaveLength(1);
    expect(result.lineItems[0]).toMatchObject({
      amount: 1000000,
      normalizedCategory: "ROOM_REVENUE",
    });
    expect(result.chargedFees[0]).toMatchObject({
      feeType: "BASE_MANAGEMENT_FEE",
      chargedAmount: 30000,
    });
  });
});
