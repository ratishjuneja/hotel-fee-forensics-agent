import type {
  AgentTraceStep,
  AuditReport,
  CalculationResult,
  Citation,
  Finding,
  RunAuditResponse,
} from "@feeforensics/shared";
import { DEMO_CASE_ID } from "./constants";

/**
 * BUNDLED REPLAY — demo-safety fallback for the Harborline Hotel case.
 *
 * This is a hand-authored, contract-shaped snapshot of a good agent run. It is
 * SYNTHETIC and NOT computed. The run/report pages replay it *silently* when the
 * live API stalls (no first trace event in ~10s) or is unreachable, so a demo is
 * never blocked by a slow inference call or a down backend (see docs/AppFlow.md §6).
 *
 * It is intentionally inlined (not imported from apps/api) so the replay survives
 * even if the backend is offline. Keep it byte-faithful to the API's mock
 * (apps/api/src/data/mockAudit.ts) and the ground truth in
 * data/demo/05_expected_answer.md ($36,580 across three findings, confidence 96%).
 */

const RUN_AT = "2026-07-04T12:00:00.000Z";

const cite = (
  documentId: string,
  documentName: string,
  sectionLabel: string,
  quote: string,
): Citation => ({ documentId, documentName, sectionLabel, quote });

const HMA = "Hotel Management Agreement";
const OPS = "Monthly Operating Statement (USALI)";
const PRIOR = "Prior-Month Operating Statement";
const SUPPORT = "Support / Invoice Pack";

// --- Findings (sum of suspectedImpact = 36,580) ----------------------------

const findings: Finding[] = [
  {
    id: "finding_excluded_revenue",
    caseId: DEMO_CASE_ID,
    title: "Excluded revenue left in the base management fee base",
    severity: "medium",
    suspectedImpact: 1980,
    explanation:
      "$66,000 of excluded revenue — Banquet Cancellation $41,000 and Insurance " +
      "Proceeds $25,000 — was included in Total Operating Revenue for the 3.0% base " +
      "fee. HMA §4.3(a)/(c) exclude insurance and cancellation revenue from the fee " +
      "base, so the base fee was overstated by 3.0% × $66,000 = $1,980 " +
      "(charged $106,200 vs. correct $104,220).",
    recommendedAction: "dispute",
    citations: [
      cite("doc_hma", HMA, "HMA §4.3(a),(c) — Revenue Exclusions",
        "cancellation, attrition, and no-show revenue, including banquet and group cancellation charges"),
      cite("doc_operating_statement", OPS, "Operating Statement — Misc Income breakout",
        "Banquet Cancellation Revenue $41,000 + Insurance Proceeds $25,000 = $66,000 excluded per HMA 4.3."),
    ],
    confidence: 0.98,
  },
  {
    id: "finding_inflated_gop",
    caseId: DEMO_CASE_ID,
    title: "Incentive fee calculated on inflated Gross Operating Profit",
    severity: "medium",
    suspectedImpact: 6600,
    explanation:
      "The 10% incentive fee was charged on reported GOP of $1,420,000. HMA §4.2 " +
      "defines GOP to exclude the §4.3 items, so true GOP is $1,354,000 " +
      "($1,420,000 − $66,000). The fee should be 10% × $1,354,000 = $135,400, not the " +
      "$142,000 charged — an overcharge of $6,600.",
    recommendedAction: "dispute",
    citations: [
      cite("doc_hma", HMA, "HMA §4.2 — Incentive Management Fee",
        "The Incentive Management Fee shall be calculated on GOP as so defined, and not on Total Operating Revenue."),
      cite("doc_operating_statement", OPS, "Operating Statement — Gross Operating Profit",
        "Gross Operating Profit (GOP): $1,420,000 (operator's incentive base)."),
    ],
    confidence: 0.95,
  },
  {
    id: "finding_unapproved_centralized",
    caseId: DEMO_CASE_ID,
    title: "Centralized services charged without required owner approval",
    severity: "high",
    suspectedImpact: 28000,
    explanation:
      "Centralized services of $28,000 were charged in June — up 273% from $7,500 in " +
      "May on flat revenue. HMA §5.1 requires prior written owner approval for any " +
      "centralized charge above $10,000. Invoice INV-0612-03 is on file but the " +
      "required APPROVAL-0612-03 is missing, so the full $28,000 is unsupported and " +
      "reversible pending approval.",
    recommendedAction: "request_explanation",
    citations: [
      cite("doc_hma", HMA, "HMA §5.1 — Centralized Services",
        "any centralized-services charge exceeding Ten Thousand Dollars ($10,000) in any single fiscal month shall require Owner's PRIOR WRITTEN APPROVAL"),
      cite("doc_support_pack", SUPPORT, "Support Pack — APPROVAL-0612-03 (missing)",
        "APPROVAL-0612-03 (owner approval for the $28,000 centralized charge): MISSING."),
      cite("doc_prior_month", PRIOR, "Prior-Month Statement — Centralized Services",
        "Centralized Services: $7,500 (May) vs. $28,000 (June) — +273% anomaly."),
    ],
    confidence: 0.9,
  },
];

// --- Deterministic calculation breakdown -----------------------------------

const calculationResult: CalculationResult = {
  caseId: DEMO_CASE_ID,
  expectedBaseFee: 104220,
  expectedIncentiveFee: 135400,
  expectedTotalFees: 239620,
  chargedTotalFees: 276200,
  variance: 36580,
  lineItemImpacts: [
    {
      issueType: "EXCLUDED_REVENUE_INCLUDED",
      description:
        "Excluded revenue ($66,000: banquet cancellation $41,000 + insurance $25,000) left in base-fee base.",
      amountImpact: 1980,
      relatedLineItems: ["Banquet Cancellation Revenue", "Insurance Proceeds"],
      citations: findings[0]!.citations,
    },
    {
      issueType: "INFLATED_PROFIT_METRIC",
      description:
        "Incentive fee charged on reported GOP $1,420,000 instead of true GOP $1,354,000.",
      amountImpact: 6600,
      relatedLineItems: ["Gross Operating Profit (GOP)"],
      citations: findings[1]!.citations,
    },
    {
      issueType: "APPROVAL_THRESHOLD_EXCEEDED",
      description:
        "Centralized services $28,000 charged without the owner approval required above $10,000 (APPROVAL-0612-03 missing).",
      amountImpact: 28000,
      relatedLineItems: ["Centralized Services"],
      citations: findings[2]!.citations,
    },
  ],
};

// --- Agent trace (LLM/TOOL badges; note the re-retrieval loop at step 7) ----

const step = (
  stepNumber: number,
  title: string,
  tool: AgentTraceStep["tool"],
  kind: AgentTraceStep["kind"],
  inputSummary: string,
  outputSummary: string,
  status: AgentTraceStep["status"] = "completed",
  evidenceCount?: number,
): AgentTraceStep => ({
  id: `trace_${stepNumber}`,
  caseId: DEMO_CASE_ID,
  stepNumber,
  title,
  tool,
  kind,
  inputSummary,
  outputSummary,
  status,
  evidenceCount,
  timestamp: RUN_AT,
});

const trace: AgentTraceStep[] = [
  step(1, "Plan audit scope", "planner", "LLM",
    "The Harborline Hotel, June 2026 operating package",
    "Identified fee families: base, incentive, centralized services."),
  step(2, "Retrieve base + incentive fee clauses", "retriever", "LLM",
    "Query: base management fee, incentive fee",
    "Found HMA §4.1 (3.0% base) and §4.2 (10% of GOP incentive).", "completed", 2),
  step(3, "Retrieve revenue exclusions + GOP definition", "retriever", "LLM",
    "Query: excluded revenue, GOP basis",
    "Found §4.3 exclusions (insurance, cancellation) and §4.2 GOP definition.", "completed", 2),
  step(4, "Extract fee rules to structured JSON", "rule_extractor", "LLM",
    "Clauses §4.1, §4.2, §4.3, §5.1",
    "Rules: base 3% (excl. §4.3 items), incentive 10% of GOP, centralized > $10k needs approval."),
  step(5, "Recompute base + incentive fees", "fee_calculator", "TOOL",
    "June statement + Misc Income breakout + extracted rules",
    "Recomputed base $104,220 (vs $106,200) and incentive $135,400 (vs $142,000)."),
  step(6, "Run inclusion + GOP checks", "anomaly_checker", "TOOL",
    "Fee base, GOP, and prior-month baseline",
    "Base/incentive overstated by $8,580; centralized services +273% vs May — flag.", "warning", 2),
  step(7, "Centralized-services anomaly — retrieve prior month + support pack", "retriever", "LLM",
    "Query: May baseline, centralized-services approval",
    "Retrieved May statement ($7,500) and support pack (re-retrieval loop).", "completed", 2),
  step(8, "Re-run checks with new evidence", "anomaly_checker", "TOOL",
    "New evidence + current checks",
    "Invoice INV-0612-03 present but APPROVAL-0612-03 missing — $28,000 unsupported.", "completed", 2),
  step(9, "Classify findings + compute confidence", "decision_engine", "TOOL",
    "3 candidate issues",
    "3 findings (2 overcharge, 1 unsupported); confidence 96%."),
  step(10, "Generate audit memo + dispute notice", "report_generator", "LLM",
    "Findings + calculation breakdown",
    "Produced cited memo and draft dispute notice."),
];

// --- Memo + email ----------------------------------------------------------

const memoMarkdown = `## Fee Audit Memo — The Harborline Hotel (June 2026)

**Total identified fee issues: $36,580 · Confidence: 96% · $8,580 overcharge + $28,000 unsupported**

### Executive summary
The operator's June 2026 fee charges show **$36,580** of identified fee issues across
three items — **$8,580** in hard overcharges (base and incentive fees) and **$28,000**
of centralized-services charges that are unsupported pending owner approval. All three
are grounded in the Hotel Management Agreement and the monthly operating package, and
fall within the 12-month audit window (HMA §9.2), so a true-up is available.

### Findings
| # | Finding | Impact | Type | Clause | Action |
|---|---------|-------:|------|--------|--------|
| 1 | Excluded revenue in base-fee base | $1,980 | overcharge | HMA §4.3 | Dispute / true-up |
| 2 | Incentive fee on inflated GOP | $6,600 | overcharge | HMA §4.2 | Dispute / true-up |
| 3 | Centralized services without approval | $28,000 | unsupported | HMA §5.1 | Approve or reverse |

### Calculation breakdown
- Expected fees: **$239,620** (base $104,220 + incentive $135,400)
- Charged fees: **$276,200** (incl. $28,000 centralized pending approval)
- **Overcharge (F1 + F2): $8,580 · Unsupported (F3): $28,000 · Total: $36,580**

### Recommended next action
Send a dispute notice requesting a true-up on Findings 1 and 2, and either written
approval or reversal of Finding 3, citing the audit-rights clause (HMA §9.2) before the
audit window closes.
`;

const disputeEmail = {
  subject:
    "The Harborline Hotel — June 2026 operator fee review ($36,580: $8,580 overcharge + $28,000 unsupported)",
  body:
    "Hi [Operator — Meridian Hotel Management],\n\n" +
    "During our review of the June 2026 operating package we identified $36,580 of " +
    "fee issues — $8,580 in overcharges and $28,000 in charges that are unsupported " +
    "pending approval:\n\n" +
    "1. Base fee: $66,000 of excluded revenue (banquet cancellation $41,000 + " +
    "insurance proceeds $25,000) was included in the fee base, which HMA §4.3 excludes " +
    "(+$1,980).\n" +
    "2. Incentive fee: the 10% fee was charged on reported GOP of $1,420,000 rather " +
    "than the true GOP of $1,354,000 required by HMA §4.2 (+$6,600).\n" +
    "3. Centralized services: $28,000 was charged without the owner approval required " +
    "by HMA §5.1 for charges above $10,000 (APPROVAL-0612-03 is not on file). This is " +
    "unsupported pending approval (+$28,000).\n\n" +
    "Could you confirm a corrected base and incentive fee (true-up on items 1–2), and " +
    "either provide the written approval or reverse the centralized-services charge " +
    "(item 3)? Per the audit-rights clause (HMA §9.2) we'd like to resolve this within " +
    "the true-up window.\n\n" +
    "Thank you,\n[Owner — Cascadia Hotel Owner LP]",
};

// --- Assembled fallbacks ---------------------------------------------------

/** Bundled `RunAuditResponse` replayed by the run page when the live run stalls. */
export const CACHED_RUN: RunAuditResponse = {
  caseId: DEMO_CASE_ID,
  status: "completed",
  trace,
  findings,
  memo: memoMarkdown,
  emailDraft: disputeEmail,
  confidence: 0.96,
};

/** Bundled `AuditReport` served by the report page when the live API is unreachable. */
export const CACHED_REPORT: AuditReport = {
  id: "report_demo_hotel_001",
  caseId: DEMO_CASE_ID,
  executiveSummary:
    "June 2026 fees show $36,580 of identified issues: $8,580 overcharge (base + incentive) plus $28,000 unsupported centralized-services charges pending approval.",
  totalSuspectedOvercharge: 36580,
  confidence: 0.96,
  findings,
  calculationResult,
  memoMarkdown,
  disputeEmail,
  createdAt: RUN_AT,
};
