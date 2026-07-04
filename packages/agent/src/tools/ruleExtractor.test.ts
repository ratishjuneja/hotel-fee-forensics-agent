import type { DocumentChunk } from "@feeforensics/shared";
import { describe, expect, it } from "vitest";

import { calculateFees } from "./feeCalculator.js";
import {
  RuleExtractionError,
  extractFeeRules,
  type LlmMessage,
  type RuleExtractorLlm,
} from "./ruleExtractor.js";
import {
  HARBORLINE_CASE_ID,
  harborlineChargedFees,
  harborlineLineItems,
} from "../fixtures/harborlineCase.js";

const chunk = (id: string, label: string, text: string): DocumentChunk => ({
  id,
  documentId: "doc_hma",
  caseId: HARBORLINE_CASE_ID,
  text,
  sectionLabel: label,
  citationLabel: label,
});

const CHUNKS: DocumentChunk[] = [
  chunk("hma_c1", "HMA §4.1 — Base Management Fee",
    "Base Management Fee equal to 3.0% of Total Operating Revenue, subject to §4.3 exclusions."),
  chunk("hma_c2", "HMA §4.2 — Incentive Management Fee",
    "Incentive Fee equal to 10.0% of GOP; GOP excludes §4.3 items and is not Total Operating Revenue."),
  chunk("hma_c3", "HMA §4.3 — Revenue Exclusions",
    "Excluded from revenue and GOP: insurance proceeds; cancellation, attrition, and no-show revenue."),
  chunk("hma_c4", "HMA §5.1 — Centralized Services",
    "Any centralized-services charge over $10,000 in a month requires prior written owner approval."),
  chunk("hma_c5", "HMA §9.2 — Audit Rights and True-Up",
    "Owner may audit within twelve (12) months; overcharges corrected by true-up within 30 days."),
];

const DOCUMENT_NAME = "Hotel Management Agreement";

/** A fake VultronRetriever model that returns a canned extraction and records prompts. */
const fakeLlm = (response: string) => {
  const calls: LlmMessage[][] = [];
  const fn: RuleExtractorLlm = async (messages) => {
    calls.push(messages);
    return response;
  };
  return { fn, calls };
};

const FULL_EXTRACTION = JSON.stringify({
  baseManagementFee: {
    found: true,
    ratePercent: 3.0,
    revenueBase: "Total Operating Revenue",
    excludedRevenue: ["insurance proceeds", "cancellation revenue"],
    excludedCategories: ["CANCELLATION_REVENUE", "INSURANCE_PROCEEDS"],
    sourceIndex: 0,
    quote: "Base Management Fee equal to 3.0% of Total Operating Revenue",
  },
  incentiveFee: {
    found: true,
    ratePercent: 10.0,
    profitMetric: "GOP",
    threshold: 0,
    excludedItems: ["insurance proceeds", "cancellation revenue"],
    excludedCategories: ["CANCELLATION_REVENUE", "INSURANCE_PROCEEDS"],
    sourceIndex: 1,
    quote: "Incentive Fee equal to 10.0% of GOP",
  },
  passThroughRules: {
    found: true,
    allowedCategories: ["OPERATING_EXPENSE"],
    excludedCategories: ["CORPORATE_OVERHEAD"],
    approvalThreshold: 10000,
    sourceIndex: 3,
    quote: "over $10,000 in a month requires prior written owner approval",
  },
  auditRights: {
    found: true,
    correctionWindowDays: 365,
    sourceIndex: 4,
    quote: "audit within twelve (12) months",
  },
});

describe("extractFeeRules — Harborline HMA", () => {
  it("extracts the base management fee as a fraction, cited to its clause", async () => {
    const { fn } = fakeLlm(FULL_EXTRACTION);
    const { rules } = await extractFeeRules(CHUNKS, { llm: fn, documentName: DOCUMENT_NAME });

    const base = rules.baseManagementFee;
    expect(base?.percentage).toBe(0.03); // 3.0% normalized in code, not by the model
    expect(base?.revenueBase).toContain("Total Operating Revenue");
    expect(base?.excludedCategories).toEqual(["CANCELLATION_REVENUE", "INSURANCE_PROCEEDS"]);
    expect(base?.citation.chunkId).toBe("hma_c1");
    expect(base?.citation.documentName).toBe(DOCUMENT_NAME);
    expect(base?.citation.sectionLabel).toContain("§4.1");
  });

  it("extracts the incentive fee (10% of GOP) cited to §4.2", async () => {
    const { fn } = fakeLlm(FULL_EXTRACTION);
    const { rules } = await extractFeeRules(CHUNKS, { llm: fn, documentName: DOCUMENT_NAME });

    expect(rules.incentiveFee?.percentage).toBe(0.1);
    expect(rules.incentiveFee?.profitMetric).toBe("GOP");
    expect(rules.incentiveFee?.threshold).toBe(0);
    expect(rules.incentiveFee?.citation.chunkId).toBe("hma_c2");
  });

  it("extracts the §5.1 approval threshold and the audit window", async () => {
    const { fn } = fakeLlm(FULL_EXTRACTION);
    const { rules } = await extractFeeRules(CHUNKS, { llm: fn, documentName: DOCUMENT_NAME });

    expect(rules.passThroughRules?.approvalThreshold).toBe(10000);
    expect(rules.passThroughRules?.excludedCategories).toContain("CORPORATE_OVERHEAD");
    expect(rules.passThroughRules?.citation.chunkId).toBe("hma_c4");
    expect(rules.auditRights?.exists).toBe(true);
    expect(rules.auditRights?.correctionWindowDays).toBe(365);
  });

  it("produces rules the deterministic calculator turns into the $36,580 answer", async () => {
    const { fn } = fakeLlm(FULL_EXTRACTION);
    const { rules } = await extractFeeRules(CHUNKS, { llm: fn, documentName: DOCUMENT_NAME });

    const result = calculateFees({
      caseId: HARBORLINE_CASE_ID,
      rules,
      lineItems: harborlineLineItems,
      chargedFees: harborlineChargedFees,
    });
    expect(result.variance).toBe(36580);
    expect(result.expectedTotalFees).toBe(239620);
  });

  it("normalizes free-text exclusions to categories in code when the model omits them", async () => {
    // Live models transcribe the clause words into excludedRevenue/excludedItems
    // reliably but volunteer the enum labels only sometimes (run-to-run, even at
    // temperature 0). The words → enum mapping is deterministic — code's job.
    const envelope = JSON.parse(FULL_EXTRACTION);
    envelope.baseManagementFee.excludedCategories = [];
    envelope.incentiveFee.excludedCategories = [];
    const { fn } = fakeLlm(JSON.stringify(envelope));
    const { rules } = await extractFeeRules(CHUNKS, { llm: fn, documentName: DOCUMENT_NAME });

    expect(rules.baseManagementFee!.excludedCategories).toEqual(
      expect.arrayContaining(["INSURANCE_PROCEEDS", "CANCELLATION_REVENUE"]),
    );
    expect(rules.incentiveFee!.excludedCategories).toEqual(
      expect.arrayContaining(["INSURANCE_PROCEEDS", "CANCELLATION_REVENUE"]),
    );
    // The normalized rules still reproduce the golden answer end-to-end.
    const result = calculateFees({
      caseId: HARBORLINE_CASE_ID,
      rules,
      lineItems: harborlineLineItems,
      chargedFees: harborlineChargedFees,
    });
    expect(result.variance).toBe(36580);
    expect(result.expectedTotalFees).toBe(239620);
  });

  it("falls back to the retrieved exclusions clause when the model returns no exclusions at all", async () => {
    // Worst observed live behavior (temperature 0 is not deterministic across
    // runs): the model maps §4.1/§4.2 but never connects the "subject to the
    // exclusions in Section 4.3" cross-reference, returning empty exclusion
    // arrays. The §4.3 chunk is right there in the prompt — code derives the
    // categories from it so the golden attribution never depends on a coin flip.
    const envelope = JSON.parse(FULL_EXTRACTION);
    envelope.baseManagementFee.excludedRevenue = [];
    envelope.baseManagementFee.excludedCategories = [];
    envelope.incentiveFee.excludedItems = [];
    envelope.incentiveFee.excludedCategories = [];
    const { fn } = fakeLlm(JSON.stringify(envelope));
    const { rules } = await extractFeeRules(CHUNKS, { llm: fn, documentName: DOCUMENT_NAME });

    expect(rules.baseManagementFee!.excludedCategories).toEqual(
      expect.arrayContaining(["INSURANCE_PROCEEDS", "CANCELLATION_REVENUE"]),
    );
    expect(rules.incentiveFee!.excludedCategories).toEqual(
      expect.arrayContaining(["INSURANCE_PROCEEDS", "CANCELLATION_REVENUE"]),
    );
    const result = calculateFees({
      caseId: HARBORLINE_CASE_ID,
      rules,
      lineItems: harborlineLineItems,
      chargedFees: harborlineChargedFees,
    });
    expect(result.variance).toBe(36580);
    expect(result.expectedTotalFees).toBe(239620);
  });

  it("feeds the real clause text to the model (grounded extraction, not a stub)", async () => {
    const { fn, calls } = fakeLlm(FULL_EXTRACTION);
    await extractFeeRules(CHUNKS, { llm: fn, documentName: DOCUMENT_NAME });
    const prompt = calls.flat().map((m) => m.content).join("\n");
    expect(prompt).toContain("Total Operating Revenue");
    expect(prompt).toContain("HMA §4.3 — Revenue Exclusions");
  });

  it("pins the exact envelope field names in the prompt — live models must not guess the schema", async () => {
    // First live run failed here: the prompt named only the four top-level keys,
    // so the model invented its own fields (rate/basis/clauseText) and padded
    // them with full clause text until the completion cap truncated the JSON.
    const { fn, calls } = fakeLlm(FULL_EXTRACTION);
    await extractFeeRules(CHUNKS, { llm: fn, documentName: DOCUMENT_NAME });
    const system = calls[0]![0]!.content;
    const fields = [
      '"baseManagementFee"',
      '"incentiveFee"',
      '"passThroughRules"',
      '"auditRights"',
      '"found"',
      '"ratePercent"',
      '"revenueBase"',
      '"excludedRevenue"',
      '"excludedCategories"',
      '"profitMetric"',
      '"threshold"',
      '"ownerPriorityReturn"',
      '"excludedItems"',
      '"allowedCategories"',
      '"approvalThreshold"',
      '"correctionWindowDays"',
      '"sourceIndex"',
      '"quote"',
    ];
    for (const field of fields) {
      expect(system, `prompt must spell out ${field}`).toContain(field);
    }
    // Quotes must be bounded excerpts or a verbose model blows the token cap.
    expect(system).toContain("200 characters");
  });

  it("omits a clause the model could not find instead of inventing it", async () => {
    const { fn } = fakeLlm(
      JSON.stringify({
        baseManagementFee: {
          found: true,
          ratePercent: 3.0,
          revenueBase: "Total Operating Revenue",
          excludedRevenue: ["insurance"],
          excludedCategories: ["INSURANCE_PROCEEDS"],
          sourceIndex: 0,
        },
        incentiveFee: { found: false },
      }),
    );
    const { rules, warnings } = await extractFeeRules(CHUNKS, {
      llm: fn,
      documentName: DOCUMENT_NAME,
    });
    expect(rules.baseManagementFee).toBeDefined();
    expect(rules.incentiveFee).toBeUndefined();
    expect(warnings.some((w) => /incentive/i.test(w))).toBe(true);
  });

  it("keeps a rule but flags it when the model cites a chunk that doesn't exist", async () => {
    const { fn } = fakeLlm(
      JSON.stringify({
        baseManagementFee: {
          found: true,
          ratePercent: 3.0,
          revenueBase: "Total Operating Revenue",
          excludedRevenue: ["insurance"],
          excludedCategories: ["INSURANCE_PROCEEDS"],
          sourceIndex: 99, // hallucinated index
          quote: "3.0% of Total Operating Revenue",
        },
      }),
    );
    const { rules, warnings } = await extractFeeRules(CHUNKS, {
      llm: fn,
      documentName: DOCUMENT_NAME,
    });
    expect(rules.baseManagementFee?.percentage).toBe(0.03);
    expect(rules.baseManagementFee?.citation.documentName).toBe(DOCUMENT_NAME);
    expect(rules.baseManagementFee?.citation.chunkId).toBeUndefined();
    expect(warnings.some((w) => /source|chunk|cit/i.test(w))).toBe(true);
  });

  it("throws a clear error when the model output is not valid JSON", async () => {
    const { fn } = fakeLlm("Sorry, I could not read the agreement.");
    await expect(
      extractFeeRules(CHUNKS, { llm: fn, documentName: DOCUMENT_NAME }),
    ).rejects.toBeInstanceOf(RuleExtractionError);
  });
});
