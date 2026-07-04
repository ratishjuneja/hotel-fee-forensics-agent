import type { Case, DemoCaseResponse, DocumentRef } from "@feeforensics/shared";

/**
 * Preloaded synthetic demo case.
 *
 * IMPORTANT: everything here is SYNTHETIC — no real hotel, contract, or customer
 * data. This is a placeholder metadata stub owned by the API. Once Person C's
 * synthetic documents land in data/demo/, the demo-case route should read from
 * there and this file becomes the wiring point.
 *
 * The document set follows the refined docs/AppFlow.md: four audited documents
 * (P&L and revenue detail live inside the operating package, not as separate
 * uploads).
 */

export const DEMO_CASE_ID = "case_demo_hotel_001";

const now = "2026-07-01T00:00:00.000Z";

const documents: DocumentRef[] = [
  {
    id: "doc_hma",
    caseId: DEMO_CASE_ID,
    name: "Hotel Management Agreement",
    type: "HMA",
    role: "audited",
    purpose: "Source of fee rules: base fee, incentive fee, exclusions, approvals.",
    storagePath: "data/demo/documents/hotel-management-agreement.md",
    status: "loaded",
  },
  {
    id: "doc_operating_statement",
    caseId: DEMO_CASE_ID,
    name: "Monthly Operating Statement (USALI)",
    type: "OPERATING_STATEMENT",
    role: "audited",
    purpose: "Current-month revenue, GOP/AGOP, and charged operator fees.",
    storagePath: "data/demo/documents/monthly-operating-statement.csv",
    status: "loaded",
  },
  {
    id: "doc_prior_month",
    caseId: DEMO_CASE_ID,
    name: "Prior-Month Operating Statement",
    type: "PRIOR_MONTH",
    role: "audited",
    purpose: "Anomaly baseline for detecting unexplained fee or expense spikes.",
    storagePath: "data/demo/documents/prior-month-statement.csv",
    status: "loaded",
  },
  {
    id: "doc_support_pack",
    caseId: DEMO_CASE_ID,
    name: "Support / Invoice Pack",
    type: "SUPPORT_PACK",
    role: "audited",
    purpose: "Evidence for pass-through expenses and owner-approval checks.",
    storagePath: "data/demo/documents/support-pack.md",
    status: "loaded",
  },
];

export const demoCase: Case = {
  id: DEMO_CASE_ID,
  hotelName: "Grand Harbor Hotel",
  auditMonth: "2026-06",
  status: "created",
  documents,
  createdAt: now,
  updatedAt: now,
};

export const demoCaseResponse: DemoCaseResponse = {
  case: demoCase,
  expectedOutputs: [
    "Fee audit memo with clause and evidence citations",
    "Findings table with suspected overcharge amounts",
    "Deterministic calculation breakdown (charged vs. expected)",
    "Confidence score with component explanation",
    "Draft dispute email",
  ],
};
