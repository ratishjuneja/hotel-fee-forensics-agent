/**
 * FeeForensics shared type contract (v1).
 *
 * Source of truth for the data model is docs/Schema.md. These types are the
 * agreed API/UI contract between the backend (Person A) and frontend (Person B).
 * Treat this file as freeze-v1: coordinate before changing shapes other code
 * already depends on (see docs/Workflow.md §6).
 *
 * NOTE ON DOCUMENT SET: docs/AppFlow.md was refined to an audited set of four
 * documents (HMA, Monthly Operating Statement, Prior-Month Statement, Support /
 * Invoice Pack) with P&L and revenue detail living *inside* the operating
 * package. `DocumentType` follows that newer model and adds `SUPPORT_PACK`.
 * docs/Schema.md still lists the older 7-type enum and needs a resync by the
 * docs owner (Person C).
 */

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export type DocumentType =
  | "HMA"
  | "OPERATING_STATEMENT"
  | "PRIOR_MONTH"
  | "SUPPORT_PACK";

/** Whether a document drives the audit or is only shown for reference. */
export type DocumentRole = "audited" | "reference";

export type DocumentStatus = "loaded" | "parsed" | "failed";

export interface DocumentRef {
  id: string;
  caseId: string;
  name: string;
  type: DocumentType;
  role: DocumentRole;
  /** One-line description of why this document is in the case. */
  purpose: string;
  storagePath: string;
  parsedTextPath?: string;
  status: DocumentStatus;
}

export interface DocumentChunk {
  id: string;
  documentId: string;
  caseId: string;
  text: string;
  page?: number;
  sectionLabel?: string;
  /** Human-readable citation label, e.g. "HMA §4.2 Incentive Fee". */
  citationLabel: string;
}

// ---------------------------------------------------------------------------
// Case
// ---------------------------------------------------------------------------

export type CaseStatus = "created" | "running" | "completed" | "failed";

export interface Case {
  id: string;
  hotelName: string;
  auditMonth: string;
  status: CaseStatus;
  documents: DocumentRef[];
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Citations
// ---------------------------------------------------------------------------

export interface Citation {
  documentId: string;
  documentName: string;
  chunkId?: string;
  /** 1-based page in a paginated source (PDF), when the extractor provides it. */
  page?: number;
  /** 1-based row in a tabular source (CSV), header counted as row 1. */
  row?: number;
  /** The specific line the row represents, e.g. "Centralized Services". */
  lineLabel?: string;
  sectionLabel?: string;
  quote?: string;
}

// ---------------------------------------------------------------------------
// Fee rules (extracted from the HMA)
// ---------------------------------------------------------------------------

export type ProfitMetric = "GOP" | "AGOP" | "NOI";

export interface FeeRules {
  baseManagementFee?: {
    percentage: number;
    revenueBase: string;
    excludedRevenue: string[];
    /**
     * Normalized categories stripped from the base-fee revenue base for this
     * HMA (e.g. Harborline §4.3 excludes both cancellation *and* insurance
     * revenue). Optional: when omitted the calculator falls back to its
     * built-in default so existing cases keep their behavior.
     */
    excludedCategories?: NormalizedCategory[];
    citation: Citation;
  };
  incentiveFee?: {
    percentage: number;
    profitMetric: ProfitMetric;
    threshold?: number;
    ownerPriorityReturn?: number;
    excludedItems: string[];
    /** Normalized categories deducted from the profit metric (GOP/AGOP). See above. */
    excludedCategories?: NormalizedCategory[];
    citation: Citation;
  };
  passThroughRules?: {
    allowedCategories: string[];
    excludedCategories: string[];
    approvalThreshold?: number;
    citation: Citation;
  };
  auditRights?: {
    exists: boolean;
    correctionWindowDays?: number;
    citation: Citation;
  };
}

// ---------------------------------------------------------------------------
// Financial inputs
// ---------------------------------------------------------------------------

export type NormalizedCategory =
  | "ROOM_REVENUE"
  | "FNB_REVENUE"
  | "BANQUET_REVENUE"
  | "OTHER_OPERATED_REVENUE"
  | "MISC_INCOME"
  | "CANCELLATION_REVENUE"
  | "INSURANCE_PROCEEDS"
  | "OPERATING_EXPENSE"
  | "CORPORATE_OVERHEAD"
  | "BRAND_FEE"
  | "MANAGEMENT_FEE"
  | "OTHER";

export interface FinancialLineItem {
  id: string;
  caseId: string;
  sourceDocumentId: string;
  period: string;
  category: string;
  description: string;
  amount: number;
  normalizedCategory: NormalizedCategory;
  citation: Citation;
}

export type ChargedFeeType =
  | "BASE_MANAGEMENT_FEE"
  | "INCENTIVE_MANAGEMENT_FEE"
  | "BRAND_SYSTEM_FEE"
  | "PASS_THROUGH_EXPENSE";

export interface ChargedFee {
  id: string;
  caseId: string;
  feeType: ChargedFeeType;
  chargedAmount: number;
  period: string;
  citation: Citation;
}

// ---------------------------------------------------------------------------
// Calculation results (deterministic calculator output)
// ---------------------------------------------------------------------------

export type IssueType =
  | "EXCLUDED_REVENUE_INCLUDED"
  | "INFLATED_PROFIT_METRIC"
  | "IMPROPER_PASS_THROUGH"
  | "APPROVAL_THRESHOLD_EXCEEDED"
  | "NEEDS_REVIEW";

export interface LineItemImpact {
  issueType: IssueType;
  description: string;
  amountImpact: number;
  relatedLineItems: string[];
  citations: Citation[];
}

export interface CalculationResult {
  caseId: string;
  expectedBaseFee: number;
  expectedIncentiveFee: number;
  expectedTotalFees: number;
  chargedTotalFees: number;
  variance: number;
  lineItemImpacts: LineItemImpact[];
}

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

export type Severity = "high" | "medium" | "low" | "review";

export type RecommendedAction =
  | "dispute"
  | "request_explanation"
  | "approve"
  | "human_review";

export interface Finding {
  id: string;
  caseId: string;
  title: string;
  severity: Severity;
  suspectedImpact: number;
  explanation: string;
  recommendedAction: RecommendedAction;
  citations: Citation[];
  /** 0..1 fraction (the UI renders it as a percentage). */
  confidence: number;
  /** Which calculator issue produced this finding (tracker §8.6 gap 2). */
  issueType?: IssueType;
  /** Human-readable detection-check tag, e.g. "Check 2: Inclusion". */
  checkLabel?: string;
}

// ---------------------------------------------------------------------------
// Confidence breakdown (tracker §8.6 gap 1)
// ---------------------------------------------------------------------------

/**
 * One component of the transparent confidence heuristic. The overall report
 * confidence renders as a visible SUM of these, per CLAUDE.md §confidence and
 * data/demo/05_expected_answer.md (25 + 25 + 20 + 16 + 10 = 96 for Harborline).
 */
export interface ConfidenceComponent {
  key: string;
  label: string;
  points: number;
  max: number;
  explanation: string;
}

// ---------------------------------------------------------------------------
// Agent trace
// ---------------------------------------------------------------------------

export type AgentTool =
  | "planner"
  | "retriever"
  | "rule_extractor"
  | "fee_calculator"
  | "anomaly_checker"
  | "decision_engine"
  | "report_generator";

/** Whether a trace step is model reasoning or deterministic code. */
export type TraceStepKind = "LLM" | "TOOL";

export type TraceStepStatus = "completed" | "warning" | "failed";

export interface AgentTraceStep {
  id: string;
  caseId: string;
  stepNumber: number;
  title: string;
  tool: AgentTool;
  kind: TraceStepKind;
  inputSummary: string;
  outputSummary: string;
  status: TraceStepStatus;
  evidenceCount?: number;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

export interface DisputeEmail {
  subject: string;
  body: string;
}

export interface AuditReport {
  id: string;
  caseId: string;
  executiveSummary: string;
  totalSuspectedOvercharge: number;
  confidence: number;
  confidenceBreakdown?: ConfidenceComponent[];
  findings: Finding[];
  calculationResult: CalculationResult;
  memoMarkdown: string;
  disputeEmail: DisputeEmail;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// API response shapes
// ---------------------------------------------------------------------------

/** Response body for GET /api/demo-case. */
export interface DemoCaseResponse {
  case: Case;
  expectedOutputs: string[];
}

/** Async parse lifecycle of an uploaded (BYO) case. */
export type CaseParseStatus = "parsing" | "ready" | "failed";

/** Per-document parse feedback surfaced while the frontend polls. */
export interface CaseParseWarning {
  /** Upload role, e.g. "hma" | "statement" | "support_pack". */
  role: string;
  documentName: string;
  warnings: string[];
}

/** Response body for GET /api/cases/:caseId (upload parse-status polling). */
export interface CaseStatusResponse {
  caseId: string;
  status: CaseParseStatus;
  hotelName: string;
  auditMonth: string;
  parseWarnings: CaseParseWarning[];
}

/**
 * One parsed source document of an uploaded case, served verbatim so the
 * evidence viewer renders what the agent actually read — never a stand-in.
 */
export interface CaseSourceDocument {
  docId: string;
  name: string;
  format: "text" | "csv";
  content: string;
}

/** Response body for GET /api/cases/:caseId/documents. */
export interface CaseDocumentsResponse {
  caseId: string;
  documents: CaseSourceDocument[];
}

/** Response body for POST /api/cases/:caseId/run-audit. */
export interface RunAuditResponse {
  caseId: string;
  status: CaseStatus;
  trace: AgentTraceStep[];
  findings: Finding[];
  memo: string;
  /** Omitted when the case opted out of email generation (draftEmail=false). */
  emailDraft?: DisputeEmail;
  confidence: number;
  confidenceBreakdown?: ConfidenceComponent[];
}
