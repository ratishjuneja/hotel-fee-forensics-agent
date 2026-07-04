/**
 * SYNTHETIC fixture — no real hotel, contract, or customer data.
 *
 * Reproduces The Harborline Hotel (June vs May 2026) demo case: the exact inputs
 * a deterministic recompute must turn into the known-good answer of $36,580 in
 * identified fee issues — $8,580 hard overcharge (F1 $1,980 base + F2 $6,600
 * incentive) plus $28,000 unsupported centralized-services charge (F3).
 *
 * Every number is lifted from the authoritative ground-truth key at
 * `data/demo/05_expected_answer.md` and foots against the synthetic statements:
 *   - `data/demo/01_HMA_excerpt.txt`             (fee clauses §4.1/§4.2/§4.3/§5.1)
 *   - `data/demo/02_operating_statement_june.csv` (June USALI statement)
 *   - `data/demo/02b_misc_income_breakout_june.csv` (the excluded $66k)
 *   - `data/demo/04_support_invoice_pack.csv`    (invoice present, approval MISSING)
 *
 * The base-fee revenue categories mirror the statement parser's synonym map:
 * the USALI statement's "Other Operated Departments" is OTHER_OPERATED_REVENUE
 * and the legitimately-included Miscellaneous Income (Space Rental +
 * Commissions) is MISC_INCOME, so the fee base foots to the contractually-clean
 * $3,474,000 from the same categories an end-to-end parse produces.
 *
 * Keep these numbers in sync with `data/demo/05_expected_answer.md`.
 */

import type {
  ChargedFee,
  Citation,
  FeeRules,
  FinancialLineItem,
} from "@feeforensics/shared";

export const HARBORLINE_CASE_ID = "case_demo_harborline_001";

const PERIOD = "2026-06";

const HMA_DOC = "doc_hma";
const OPS_DOC = "doc_operating_statement_june";
const MISC_DOC = "doc_misc_income_breakout_june";
const SUPPORT_DOC = "doc_support_pack";

const cite = (
  documentId: string,
  documentName: string,
  sectionLabel: string,
  quote: string,
): Citation => ({ documentId, documentName, sectionLabel, quote });

// --- Extracted fee rules (as the rule extractor would produce) --------------

export const harborlineRules: FeeRules = {
  baseManagementFee: {
    percentage: 0.03,
    revenueBase: "Total Operating Revenue (USALI)",
    excludedRevenue: [
      "insurance proceeds",
      "cancellation / attrition / no-show revenue",
    ],
    // §4.3 excludes BOTH insurance proceeds and cancellation revenue from the
    // base — so both categories are stripped (not the built-in default of
    // cancellation-only). This is why the rule declares its own set.
    excludedCategories: ["CANCELLATION_REVENUE", "INSURANCE_PROCEEDS"],
    citation: cite(
      HMA_DOC,
      "Hotel Management Agreement",
      "HMA §4.1 — Base Management Fee / §4.3 — Revenue Exclusions",
      "Base Management Fee equal to 3.0% of Total Operating Revenue, subject to the exclusions in §4.3.",
    ),
  },
  incentiveFee: {
    percentage: 0.1,
    profitMetric: "GOP",
    // No owner-priority threshold in this HMA: incentive = 10% of GOP, flat.
    threshold: 0,
    excludedItems: [
      "insurance proceeds",
      "cancellation / attrition / no-show revenue",
    ],
    // §4.3 items are also excluded from GOP "for all purposes of calculating
    // fees under Article 4" — the same $66k that inflates the base inflates GOP.
    excludedCategories: ["CANCELLATION_REVENUE", "INSURANCE_PROCEEDS"],
    citation: cite(
      HMA_DOC,
      "Hotel Management Agreement",
      "HMA §4.2 — Incentive Management Fee",
      "Incentive Fee equal to 10.0% of GOP; GOP excludes revenue excluded under §4.3 and is not Total Operating Revenue.",
    ),
  },
  passThroughRules: {
    allowedCategories: ["OPERATING_EXPENSE"],
    excludedCategories: ["CORPORATE_OVERHEAD"],
    approvalThreshold: 10000,
    citation: cite(
      HMA_DOC,
      "Hotel Management Agreement",
      "HMA §5.1 — Centralized Services",
      "Any centralized-services charge exceeding $10,000 in a fiscal month requires Owner's prior written approval; otherwise unsupported and subject to reversal.",
    ),
  },
  auditRights: {
    exists: true,
    correctionWindowDays: 365,
    citation: cite(
      HMA_DOC,
      "Hotel Management Agreement",
      "HMA §9.2 — Audit Rights and True-Up",
      "Owner may audit fee calculations within twelve (12) months; overcharges corrected by true-up within 30 days.",
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
  caseId: HARBORLINE_CASE_ID,
  sourceDocumentId: citation.documentId,
  period: PERIOD,
  category: normalizedCategory,
  description,
  amount,
  normalizedCategory,
  citation,
});

const opsCite = (sectionLabel: string, quote: string) =>
  cite(OPS_DOC, "Monthly Operating Statement — June (USALI)", sectionLabel, quote);

export const harborlineLineItems: FinancialLineItem[] = [
  // --- Operating revenue that legitimately belongs in the base + GOP ($3,474,000).
  line("Rooms revenue", 2400000, "ROOM_REVENUE",
    opsCite("Operating Revenue — Rooms", "Rooms: $2,400,000.")),
  line("Food & beverage revenue", 820000, "FNB_REVENUE",
    opsCite("Operating Revenue — Food & Beverage", "Food & Beverage: $820,000.")),
  line("Other operated departments", 180000, "OTHER_OPERATED_REVENUE",
    opsCite("Operating Revenue — Other Operated Departments",
      "Other Operated Departments: $180,000.")),
  // Legitimately-included Miscellaneous Income: Space Rental ($40,000) +
  // Commissions ($34,000) = $74,000 (the excluded $66k is broken out below).
  line("Misc income — space rental & commissions", 74000, "MISC_INCOME",
    cite(MISC_DOC, "Misc Income Breakout — June",
      "Misc Income — Space Rental / Commissions",
      "Space Rental $40,000 + Commissions $34,000 (legitimately in fee base).")),

  // --- Revenue EXCLUDED from base + GOP by HMA §4.3 but left in by the operator.
  line("Banquet cancellation revenue", 41000, "CANCELLATION_REVENUE",
    cite(MISC_DOC, "Misc Income Breakout — June", "Misc Income — Banquet Cancellation Revenue",
      "Banquet Cancellation Revenue: $41,000 (EXCLUDED per HMA 4.3(c)).")),
  line("Insurance proceeds", 25000, "INSURANCE_PROCEEDS",
    cite(MISC_DOC, "Misc Income Breakout — June", "Misc Income — Insurance Proceeds",
      "Insurance Proceeds: $25,000 (EXCLUDED per HMA 4.3(a)).")),

  // --- Operating expenses ($2,120,000): GOP = $3,474,000 − $2,120,000 = $1,354,000.
  line("Total departmental expenses", 1305000, "OPERATING_EXPENSE",
    opsCite("Departmental Expenses — Total", "Total Departmental Expenses: $1,305,000.")),
  line("Total undistributed operating expenses", 815000, "OPERATING_EXPENSE",
    opsCite("Undistributed Operating Expenses — Total", "Total Undistributed Expenses: $815,000.")),

  // --- Centralized services passed through without the §5.1 approval (F3).
  line("Centralized services (shared accounting / reservations / revenue mgmt)",
    28000, "CORPORATE_OVERHEAD",
    cite(SUPPORT_DOC, "Support / Invoice Pack",
      "Support Pack — INV-0612-03 (approval APPROVAL-0612-03 MISSING)",
      "Centralized Services charge: $28,000. Invoice present; owner approval MISSING (required per HMA 5.1).")),
];

// --- Fees charged by the operator in June -----------------------------------

let feeSeq = 0;
const charged = (
  feeType: ChargedFee["feeType"],
  chargedAmount: number,
  citation: Citation,
): ChargedFee => ({
  id: `charged_${++feeSeq}`,
  caseId: HARBORLINE_CASE_ID,
  feeType,
  chargedAmount,
  period: PERIOD,
  citation,
});

export const harborlineChargedFees: ChargedFee[] = [
  // 3.0% × $3,540,000 — base wrongly computed on Total Operating Revenue incl. the $66k.
  charged("BASE_MANAGEMENT_FEE", 106200,
    opsCite("Management Fees — Base Management Fee",
      "Base Management Fee charged: $106,200 (3.0% of Total Operating Revenue).")),
  // 10% × $1,420,000 reported GOP — should be 10% × $1,354,000 true GOP.
  charged("INCENTIVE_MANAGEMENT_FEE", 142000,
    opsCite("Management Fees — Incentive Management Fee",
      "Incentive Management Fee charged: $142,000 (10% on inflated/wrong base).")),
  // Centralized services billed straight through to the owner.
  charged("PASS_THROUGH_EXPENSE", 28000,
    cite(SUPPORT_DOC, "Support / Invoice Pack", "Support Pack — INV-0612-03",
      "Centralized Services billed to owner: $28,000 (exceeds $10,000 approval threshold).")),
];
