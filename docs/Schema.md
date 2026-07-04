# Schema: FeeForensics

## 1. Purpose

This document defines the core data objects for the MVP.

The goal is to keep data simple enough for a 20-hour hackathon while supporting a credible agent workflow.

## 2. Core Entities

### Case

Represents one hotel fee audit.

```ts
type Case = {
  id: string;
  hotelName: string;
  auditMonth: string;
  status: "created" | "running" | "completed" | "failed";
  documents: DocumentRef[];
  createdAt: string;
  updatedAt: string;
};
```

### DocumentRef

Represents a source document.

```ts
type DocumentRef = {
  id: string;
  caseId: string;
  name: string;
  type:
    | "HMA"
    | "OPERATING_STATEMENT"
    | "PNL"
    | "REVENUE_SCHEDULE"
    | "GOP_CALCULATION"
    | "PRIOR_MONTH"
    | "FEE_SCHEDULE";
  storagePath: string;
  parsedTextPath?: string;
  status: "loaded" | "parsed" | "failed";
};
```

### DocumentChunk

Represents searchable text from a document.

```ts
type DocumentChunk = {
  id: string;
  documentId: string;
  caseId: string;
  text: string;
  page?: number;
  sectionLabel?: string;
  citationLabel: string;
};
```

Example citation label:

```text
HMA §4.2 Incentive Fee
```

### FeeRules

Structured rules extracted from the hotel management agreement.

```ts
type FeeRules = {
  baseManagementFee?: {
    percentage: number;
    revenueBase: string;
    excludedRevenue: string[];
    citation: Citation;
  };
  incentiveFee?: {
    percentage: number;
    profitMetric: "GOP" | "AGOP" | "NOI";
    threshold?: number;
    ownerPriorityReturn?: number;
    excludedItems: string[];
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
};
```

### FinancialLineItem

Represents one financial row from a statement or schedule.

```ts
type FinancialLineItem = {
  id: string;
  caseId: string;
  sourceDocumentId: string;
  period: string;
  category: string;
  description: string;
  amount: number;
  normalizedCategory:
    | "ROOM_REVENUE"
    | "FNB_REVENUE"
    | "BANQUET_REVENUE"
    | "CANCELLATION_REVENUE"
    | "INSURANCE_PROCEEDS"
    | "OPERATING_EXPENSE"
    | "CORPORATE_OVERHEAD"
    | "BRAND_FEE"
    | "MANAGEMENT_FEE"
    | "OTHER";
  citation: Citation;
};
```

### ChargedFee

Represents the fees charged by the operator.

```ts
type ChargedFee = {
  id: string;
  caseId: string;
  feeType:
    | "BASE_MANAGEMENT_FEE"
    | "INCENTIVE_MANAGEMENT_FEE"
    | "BRAND_SYSTEM_FEE"
    | "PASS_THROUGH_EXPENSE";
  chargedAmount: number;
  period: string;
  citation: Citation;
};
```

### CalculationResult

Output from deterministic calculator.

```ts
type CalculationResult = {
  caseId: string;
  expectedBaseFee: number;
  expectedIncentiveFee: number;
  expectedTotalFees: number;
  chargedTotalFees: number;
  variance: number;
  lineItemImpacts: LineItemImpact[];
};
```

### LineItemImpact

```ts
type LineItemImpact = {
  issueType:
    | "EXCLUDED_REVENUE_INCLUDED"
    | "INFLATED_PROFIT_METRIC"
    | "IMPROPER_PASS_THROUGH"
    | "APPROVAL_THRESHOLD_EXCEEDED"
    | "NEEDS_REVIEW";
  description: string;
  amountImpact: number;
  relatedLineItems: string[];
  citations: Citation[];
};
```

### Finding

Final issue shown to the user.

```ts
type Finding = {
  id: string;
  caseId: string;
  title: string;
  severity: "high" | "medium" | "low" | "review";
  suspectedImpact: number;
  explanation: string;
  recommendedAction:
    | "dispute"
    | "request_explanation"
    | "approve"
    | "human_review";
  citations: Citation[];
  confidence: number;
};
```

### Citation

```ts
type Citation = {
  documentId: string;
  documentName: string;
  chunkId?: string;
  page?: number;
  sectionLabel?: string;
  quote?: string;
};
```

### AgentTraceStep

```ts
type AgentTraceStep = {
  id: string;
  caseId: string;
  stepNumber: number;
  title: string;
  tool:
    | "planner"
    | "retriever"
    | "rule_extractor"
    | "fee_calculator"
    | "anomaly_checker"
    | "decision_engine"
    | "report_generator";
  inputSummary: string;
  outputSummary: string;
  status: "completed" | "warning" | "failed";
  evidenceCount?: number;
  timestamp: string;
};
```

### AuditReport

```ts
type AuditReport = {
  id: string;
  caseId: string;
  executiveSummary: string;
  totalSuspectedOvercharge: number;
  confidence: number;
  findings: Finding[];
  calculationResult: CalculationResult;
  memoMarkdown: string;
  disputeEmail: {
    subject: string;
    body: string;
  };
  createdAt: string;
};
```

## 3. MVP Storage

For speed, use JSON files or in-memory objects with sample data.

Recommended demo files:

```text
/data/demo/case.json
/data/demo/documents/hotel-management-agreement.md
/data/demo/documents/monthly-operating-statement.csv
/data/demo/documents/pnl.csv
/data/demo/documents/gross-revenue-schedule.csv
/data/demo/documents/prior-months.csv
/data/demo/documents/brand-fee-schedule.md
```

## 4. Stretch Database Tables

If using PostgreSQL:

```text
cases
documents
document_chunks
agent_runs
agent_trace_steps
findings
audit_reports
```

Do not overbuild DB schema unless the MVP is already working.
