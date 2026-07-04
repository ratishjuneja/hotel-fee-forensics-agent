import type {
  AgentTraceStep,
  AuditReport,
  CalculationResult,
  Citation,
  Finding,
  RunAuditResponse,
} from "@feeforensics/shared";
import { DEMO_CASE_ID } from "./demoCase.js";

/**
 * Mock audit result for the synthetic Grand Harbor Hotel case.
 *
 * PURPOSE: unblock the frontend (Person B) with a realistic, contract-shaped
 * `RunAuditResponse` / `AuditReport` before the real agent exists. Every number
 * here is HAND-AUTHORED and SYNTHETIC — it is NOT computed. The deterministic
 * calculator + orchestrator (later PRs in packages/agent) will replace these
 * internals while keeping the same response shape.
 *
 * Story (matches docs/UserJourney.md §5 and docs/Design.md example numbers):
 * the operator overcharged June 2026 fees by $18,750 across three issues.
 */

const RUN_AT = "2026-07-04T12:00:00.000Z";

// --- Citations -------------------------------------------------------------

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

// --- Findings (sum of suspectedImpact = 18,750) ----------------------------

const findings: Finding[] = [
  {
    id: "finding_excluded_revenue",
    caseId: DEMO_CASE_ID,
    title: "Banquet cancellation revenue included in base-fee revenue base",
    severity: "high",
    suspectedImpact: 6000,
    explanation:
      "$200,000 of banquet cancellation revenue was included in Gross Operating " +
      "Revenue for the 3% base management fee. HMA §4.1(b) excludes cancellation " +
      "and liquidated-damages revenue from the fee base, so the base fee was " +
      "overstated by 3% × $200,000 = $6,000.",
    recommendedAction: "dispute",
    citations: [
      cite("doc_hma", HMA, "HMA §4.1(b) — Excluded Revenue",
        "Gross Operating Revenue excludes cancellation fees and liquidated damages."),
      cite("doc_operating_statement", OPS, "Operating Statement — Banquet Revenue",
        "Banquet cancellation revenue: $200,000 (included in fee base)."),
    ],
    confidence: 0.9,
  },
  {
    id: "finding_inflated_agop",
    caseId: DEMO_CASE_ID,
    title: "Incentive fee calculated on AGOP inflated by one-time insurance proceeds",
    severity: "high",
    suspectedImpact: 9750,
    explanation:
      "$81,250 of one-time insurance proceeds were left in AGOP. HMA §4.2 requires " +
      "non-recurring and insurance recoveries to be deducted before the 12% incentive " +
      "fee. Removing them lowers AGOP above the owner priority threshold by $81,250, " +
      "reducing the incentive fee by 12% × $81,250 = $9,750.",
    recommendedAction: "dispute",
    citations: [
      cite("doc_hma", HMA, "HMA §4.2 — Incentive Fee / AGOP",
        "AGOP is computed after deducting non-recurring items and insurance recoveries."),
      cite("doc_operating_statement", OPS, "Operating Statement — Other Income",
        "Insurance proceeds: $81,250 (not deducted from AGOP)."),
    ],
    confidence: 0.84,
  },
  {
    id: "finding_pass_through",
    caseId: DEMO_CASE_ID,
    title: "Corporate support charged as pass-through without owner approval",
    severity: "medium",
    suspectedImpact: 3000,
    explanation:
      "$3,000 of corporate IT/support cost was passed through to the owner. HMA §6.3 " +
      "makes corporate overhead non-reimbursable unless pre-approved above the $2,500 " +
      "threshold, and no approval is on file in the support pack. Full $3,000 is disputed.",
    recommendedAction: "request_explanation",
    citations: [
      cite("doc_hma", HMA, "HMA §6.3 — Reimbursable Expenses / Approval",
        "Corporate overhead is not reimbursable unless approved in writing above $2,500."),
      cite("doc_support_pack", SUPPORT, "Support Pack — Invoice #GH-2291",
        "Corporate IT support allocation: $3,000. No owner approval attached."),
    ],
    confidence: 0.82,
  },
];

// --- Deterministic calculation breakdown -----------------------------------

const calculationResult: CalculationResult = {
  caseId: DEMO_CASE_ID,
  expectedBaseFee: 60000, // 3% × $2,000,000 corrected Gross Operating Revenue
  expectedIncentiveFee: 18000, // 12% × ($650,000 AGOP − $500,000 threshold)
  expectedTotalFees: 78000,
  chargedTotalFees: 96750, // 66,000 base + 27,750 incentive + 3,000 pass-through
  variance: 18750,
  lineItemImpacts: [
    {
      issueType: "EXCLUDED_REVENUE_INCLUDED",
      description: "Banquet cancellation revenue ($200,000) included in base-fee base.",
      amountImpact: 6000,
      relatedLineItems: ["Banquet cancellation revenue"],
      citations: findings[0]!.citations,
    },
    {
      issueType: "INFLATED_PROFIT_METRIC",
      description: "Insurance proceeds ($81,250) not deducted from AGOP.",
      amountImpact: 9750,
      relatedLineItems: ["Insurance proceeds"],
      citations: findings[1]!.citations,
    },
    {
      issueType: "IMPROPER_PASS_THROUGH",
      description: "Corporate IT support ($3,000) passed through without approval.",
      amountImpact: 3000,
      relatedLineItems: ["Corporate IT support allocation"],
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
    "Grand Harbor Hotel, June 2026 package",
    "Identified fee families: base, incentive, pass-through."),
  step(2, "Retrieve base + incentive fee clauses", "retriever", "LLM",
    "Query: base management fee, incentive fee",
    "Found HMA §4.1 (3% base) and §4.2 (12% incentive).", "completed", 2),
  step(3, "Retrieve revenue exclusions + AGOP deductions", "retriever", "LLM",
    "Query: excluded revenue, AGOP deductions",
    "Found §4.1(b) exclusions and §4.2 AGOP deduction rules.", "completed", 2),
  step(4, "Extract fee rules to structured JSON", "rule_extractor", "LLM",
    "Clauses §4.1, §4.1(b), §4.2, §6.3",
    "Rules: base 3% (excl. cancellations), incentive 12% AGOP > $500k."),
  step(5, "Recompute base + incentive fees", "fee_calculator", "TOOL",
    "Operating statement rows + extracted rules",
    "Expected fees $78,000 vs charged $96,750."),
  step(6, "Run inclusion + AGOP-deduction checks", "anomaly_checker", "TOOL",
    "Fee base + AGOP line items",
    "Variance $18,750 found; two inputs look misclassified.", "warning", 2),
  step(7, "Variance ambiguous — retrieve prior month + support pack", "retriever", "LLM",
    "Query: prior-month baseline, pass-through approvals",
    "Retrieved prior-month statement and support pack (re-retrieval loop).", "completed", 2),
  step(8, "Re-run checks with new evidence", "anomaly_checker", "TOOL",
    "New evidence + current checks",
    "Confirmed anomalies; no owner approval on file for corporate support.", "completed", 2),
  step(9, "Classify findings + compute confidence", "decision_engine", "TOOL",
    "3 candidate issues",
    "3 findings classified (2 dispute, 1 request explanation); confidence 86%."),
  step(10, "Generate audit memo + dispute email", "report_generator", "LLM",
    "Findings + calculation breakdown",
    "Produced cited memo and draft dispute email."),
];

// --- Memo + email ----------------------------------------------------------

const memoMarkdown = `## Fee Audit Memo — Grand Harbor Hotel (June 2026)

**Total suspected overcharge: $18,750 · Confidence: 86% · Recommended action: Dispute and request correction**

### Executive summary
The operator's June 2026 fee charges appear overstated by **$18,750** across three
issues in the base management fee, the incentive fee, and a pass-through expense.
Each is grounded in the Hotel Management Agreement and the monthly operating package.

### Findings
| # | Finding | Impact | Clause | Action |
|---|---------|-------:|--------|--------|
| 1 | Banquet cancellation revenue in base-fee base | $6,000 | HMA §4.1(b) | Dispute |
| 2 | Incentive fee on AGOP inflated by insurance proceeds | $9,750 | HMA §4.2 | Dispute |
| 3 | Corporate support pass-through without approval | $3,000 | HMA §6.3 | Request explanation |

### Calculation breakdown
- Expected total fees: **$78,000** (base $60,000 + incentive $18,000)
- Charged total fees: **$96,750**
- **Variance: $18,750**

### Recommended next action
Dispute findings 1 and 2 and request a written explanation for finding 3, citing the
audit-rights clause (HMA §9) and the correction window.
`;

const disputeEmail = {
  subject: "Grand Harbor Hotel — June 2026 operator fee correction request ($18,750)",
  body:
    "Hi [Operator],\n\n" +
    "During our review of the June 2026 operating package we identified an apparent " +
    "$18,750 overcharge in operator fees:\n\n" +
    "1. Base fee: $200,000 of banquet cancellation revenue was included in the fee " +
    "base, which HMA §4.1(b) excludes (+$6,000).\n" +
    "2. Incentive fee: $81,250 of one-time insurance proceeds was not deducted from " +
    "AGOP as HMA §4.2 requires (+$9,750).\n" +
    "3. Pass-through: $3,000 of corporate IT support was billed without the owner " +
    "approval required by HMA §6.3 (+$3,000).\n\n" +
    "Could you review these against the referenced clauses and confirm a corrected " +
    "fee calculation, or share supporting documentation? Per the audit-rights clause " +
    "(HMA §9) we'd like to resolve this within the correction window.\n\n" +
    "Thank you,\n[Owner / Asset Manager]",
};

// --- Assembled report ------------------------------------------------------

export const mockAuditReport: AuditReport = {
  id: "report_demo_hotel_001",
  caseId: DEMO_CASE_ID,
  executiveSummary:
    "June 2026 operator fees appear overstated by $18,750 across three grounded issues.",
  totalSuspectedOvercharge: 18750,
  confidence: 0.86,
  findings,
  calculationResult,
  memoMarkdown,
  disputeEmail,
  createdAt: RUN_AT,
};

export const mockRunAuditResponse: RunAuditResponse = {
  caseId: DEMO_CASE_ID,
  status: "completed",
  trace,
  findings,
  memo: memoMarkdown,
  emailDraft: disputeEmail,
  confidence: 0.86,
};
