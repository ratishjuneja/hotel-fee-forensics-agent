/**
 * SYNTHETIC fixture — no real hotel, contract, or customer data.
 *
 * Reproduces the Grand Harbor Hotel (June 2026) demo case: the exact inputs a
 * deterministic recompute must turn into the known-good answer of a $18,750
 * overcharge ($6,000 base + $9,750 incentive + $3,000 pass-through).
 *
 * These numbers are the contract between this calculator, the hand-authored demo
 * in apps/api/src/data/mockAudit.ts, and the synthetic financials Person C is
 * building under data/demo/. Keep them in sync.
 */

import type {
  ChargedFee,
  Citation,
  FeeRules,
  FinancialLineItem,
} from "@feeforensics/shared";

export const GRAND_HARBOR_CASE_ID = "case_demo_hotel_001";

const PERIOD = "2026-06";

const HMA_DOC = "doc_hma";
const OPS_DOC = "doc_operating_statement";
const SUPPORT_DOC = "doc_support_pack";

const cite = (
  documentId: string,
  documentName: string,
  sectionLabel: string,
  quote: string,
): Citation => ({ documentId, documentName, sectionLabel, quote });

// --- Extracted fee rules (as the rule extractor would produce) --------------

export const grandHarborRules: FeeRules = {
  baseManagementFee: {
    percentage: 0.03,
    revenueBase: "Gross Operating Revenue",
    excludedRevenue: ["cancellation fees", "liquidated damages"],
    citation: cite(
      HMA_DOC,
      "Hotel Management Agreement",
      "HMA §4.1(b) — Excluded Revenue",
      "Gross Operating Revenue excludes cancellation fees and liquidated damages.",
    ),
  },
  incentiveFee: {
    percentage: 0.12,
    profitMetric: "AGOP",
    threshold: 500000,
    excludedItems: ["insurance recoveries", "non-recurring items"],
    citation: cite(
      HMA_DOC,
      "Hotel Management Agreement",
      "HMA §4.2 — Incentive Fee / AGOP",
      "AGOP is computed after deducting non-recurring items and insurance recoveries.",
    ),
  },
  passThroughRules: {
    allowedCategories: ["OPERATING_EXPENSE"],
    excludedCategories: ["CORPORATE_OVERHEAD"],
    approvalThreshold: 2500,
    citation: cite(
      HMA_DOC,
      "Hotel Management Agreement",
      "HMA §6.3 — Reimbursable Expenses / Approval",
      "Corporate overhead is not reimbursable unless approved in writing above $2,500.",
    ),
  },
  auditRights: {
    exists: true,
    correctionWindowDays: 90,
    citation: cite(
      HMA_DOC,
      "Hotel Management Agreement",
      "HMA §9 — Audit Rights",
      "Owner may audit and demand correction within the correction window.",
    ),
  },
};

// --- Monthly financial line items (as reported by the operator) -------------

let lineSeq = 0;
const line = (
  description: string,
  amount: number,
  normalizedCategory: FinancialLineItem["normalizedCategory"],
  citation: Citation,
): FinancialLineItem => ({
  id: `line_${++lineSeq}`,
  caseId: GRAND_HARBOR_CASE_ID,
  sourceDocumentId: citation.documentId,
  period: PERIOD,
  category: normalizedCategory,
  description,
  amount,
  normalizedCategory,
  citation,
});

const opsCite = (sectionLabel: string, quote: string) =>
  cite(OPS_DOC, "Monthly Operating Statement (USALI)", sectionLabel, quote);

export const grandHarborLineItems: FinancialLineItem[] = [
  // Operating revenue that legitimately belongs in the fee base + AGOP.
  line("Room revenue", 1200000, "ROOM_REVENUE",
    opsCite("Operating Statement — Rooms", "Room revenue: $1,200,000.")),
  line("Food & beverage revenue", 500000, "FNB_REVENUE",
    opsCite("Operating Statement — F&B", "Food & beverage revenue: $500,000.")),
  line("Banquet revenue", 300000, "BANQUET_REVENUE",
    opsCite("Operating Statement — Banquets", "Banquet revenue: $300,000.")),
  // Excluded from the base fee (HMA §4.1(b)) but included by the operator.
  line("Banquet cancellation revenue", 200000, "CANCELLATION_REVENUE",
    opsCite("Operating Statement — Banquet Revenue",
      "Banquet cancellation revenue: $200,000 (included in fee base).")),
  // One-time other income that inflates AGOP (excluded by HMA §4.2).
  line("Insurance proceeds", 81250, "INSURANCE_PROCEEDS",
    opsCite("Operating Statement — Other Income",
      "Insurance proceeds: $81,250 (not deducted from AGOP).")),
  // Operating expenses (AGOP = operating revenue − operating expense = $650,000).
  line("Total operating expenses", 1350000, "OPERATING_EXPENSE",
    opsCite("Operating Statement — Operating Expenses", "Total operating expenses: $1,350,000.")),
  // Corporate overhead passed through without approval (HMA §6.3).
  line("Corporate IT support allocation", 3000, "CORPORATE_OVERHEAD",
    cite(SUPPORT_DOC, "Support / Invoice Pack", "Support Pack — Invoice #GH-2291",
      "Corporate IT support allocation: $3,000. No owner approval attached.")),
];

// --- Fees charged by the operator -------------------------------------------

let feeSeq = 0;
const charged = (
  feeType: ChargedFee["feeType"],
  chargedAmount: number,
  citation: Citation,
): ChargedFee => ({
  id: `charged_${++feeSeq}`,
  caseId: GRAND_HARBOR_CASE_ID,
  feeType,
  chargedAmount,
  period: PERIOD,
  citation,
});

export const grandHarborChargedFees: ChargedFee[] = [
  // 3% × $2,200,000 (fee base wrongly includes the $200,000 cancellation revenue).
  charged("BASE_MANAGEMENT_FEE", 66000,
    opsCite("Operating Statement — Base Management Fee", "Base management fee charged: $66,000.")),
  // 12% × ($731,250 AGOP − $500,000 threshold); AGOP inflated by insurance proceeds.
  charged("INCENTIVE_MANAGEMENT_FEE", 27750,
    opsCite("Operating Statement — Incentive Fee", "Incentive fee charged: $27,750.")),
  // Corporate IT support billed straight through to the owner.
  charged("PASS_THROUGH_EXPENSE", 3000,
    cite(SUPPORT_DOC, "Support / Invoice Pack", "Support Pack — Invoice #GH-2291",
      "Corporate IT support allocation billed to owner: $3,000.")),
];
