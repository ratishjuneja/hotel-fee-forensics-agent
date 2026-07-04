/**
 * Decision engine + confidence scoring (deterministic — no LLM).
 *
 * Step 9 of the audit workflow: turn the calculator's variance attributions,
 * the anomaly checker's month-over-month signals, and the support-pack
 * verdicts into dispute-ready `Finding`s, then score how much the whole audit
 * can be trusted.
 *
 * Classification rules (per `data/demo/05_expected_answer.md`):
 *   - Recomputed overcharges (excluded revenue, inflated profit metric) are
 *     hard math backed by explicit clauses → `dispute`.
 *   - An unsupported pass-through whose required approval is documented
 *     MISSING is reversible but the owner may still approve retroactively →
 *     `request_explanation` (approval-or-reversal, never auto-clawback).
 *   - A pass-through the support pack could not verify, or any NEEDS_REVIEW
 *     impact, goes to a human — the engine never asserts what it cannot show.
 *
 * The confidence score is the transparent heuristic from CLAUDE.md: five
 * components rendered as a visible sum (Harborline: 25 + 25 + 20 + 16 + 10 =
 * 96, where F3's missing approval is the only deduction). Component labels
 * must stay in sync with the frontend's `ConfidenceMeter`.
 */

import type {
  CalculationResult,
  Citation,
  ConfidenceComponent,
  FeeRules,
  Finding,
  IssueType,
  LineItemImpact,
  RecommendedAction,
  Severity,
} from "@feeforensics/shared";

import type { Anomaly } from "./anomalyChecker.js";
import type { SupportCheckResult } from "./caseHistoryRetriever.js";

// --- Findings --------------------------------------------------------------------

export interface SubjectSupportCheck {
  /** The charge the check verified, e.g. "Centralized Services". */
  subject: string;
  result: SupportCheckResult;
}

export interface DecisionInput {
  caseId: string;
  rules: FeeRules;
  calculation: CalculationResult;
  /** Month-over-month anomalies; enrich pass-through findings with prior-month evidence. */
  anomalies?: Anomaly[];
  /** Support-pack verifications for review-triggering charges. */
  supportChecks?: SubjectSupportCheck[];
}

const CHECK_LABELS: Record<IssueType, string> = {
  EXCLUDED_REVENUE_INCLUDED: "Check 2: Inclusion",
  INFLATED_PROFIT_METRIC: "Check 3: GOP/AGOP",
  IMPROPER_PASS_THROUGH: "Check 5: Reclassification/approval",
  APPROVAL_THRESHOLD_EXCEEDED: "Check 5: Reclassification/approval",
  NEEDS_REVIEW: "Needs review",
};

const PROFIT_METRIC_NAMES: Record<string, string> = {
  GOP: "Gross Operating Profit",
  AGOP: "Adjusted Gross Operating Profit",
  NOI: "Net Operating Income",
};

/**
 * Per-finding confidence constants (0..1, documented so the demo numbers are
 * reproducible): recomputed overcharges are near-certain — the excluded-revenue
 * case has its own evidence schedule (0.98) while the profit-metric case rests
 * on a two-clause definition chain (0.95); a documented-missing approval is
 * high-but-not-certain because the owner may still approve (0.9); an unverified
 * pass-through (0.75) and anything needing review (0.4) rank below that.
 */
const FINDING_CONFIDENCE = {
  excludedRevenue: 0.98,
  inflatedProfitMetric: 0.95,
  unsupportedPassThrough: 0.9,
  unverifiedPassThrough: 0.75,
  needsReview: 0.4,
} as const;

const isPassThrough = (issueType: IssueType): boolean =>
  issueType === "IMPROPER_PASS_THROUGH" || issueType === "APPROVAL_THRESHOLD_EXCEEDED";

function severityFor(issueType: IssueType, amountImpact: number): Severity {
  if (issueType === "NEEDS_REVIEW") return "review";
  const magnitude = Math.abs(amountImpact);
  if (magnitude >= 10000) return "high";
  if (magnitude >= 1000) return "medium";
  return "low";
}

const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Pair a pass-through impact with its support check by subject mention. */
function matchSupportCheck(
  impact: LineItemImpact,
  checks: SubjectSupportCheck[],
  passThroughImpactCount: number,
): SubjectSupportCheck | undefined {
  const description = normalize(impact.description);
  const bySubject = checks.find((c) => description.includes(normalize(c.subject)));
  if (bySubject) return bySubject;
  // Unambiguous fallback: one flagged pass-through, one verification.
  if (passThroughImpactCount === 1 && checks.length === 1) return checks[0];
  return undefined;
}

function dedupeCitations(citations: Citation[]): Citation[] {
  const seen = new Set<string>();
  return citations.filter((c) => {
    const key = `${c.documentId}|${c.sectionLabel ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * The calculator attributes variance per line item (Harborline: cancellation
 * $1,230 + insurance $750 are separate impacts); findings are the memo's unit,
 * one per issue type ($1,980 excluded revenue = F1). Same-type impacts merge:
 * amounts sum, evidence unions.
 */
function groupImpactsByIssue(impacts: LineItemImpact[]): LineItemImpact[] {
  const groups = new Map<IssueType, LineItemImpact>();
  for (const impact of impacts) {
    const group = groups.get(impact.issueType);
    if (!group) {
      groups.set(impact.issueType, { ...impact });
    } else {
      group.amountImpact = Math.round((group.amountImpact + impact.amountImpact) * 100) / 100;
      group.description = `${group.description} ${impact.description}`;
      group.relatedLineItems = [...group.relatedLineItems, ...impact.relatedLineItems];
      group.citations = [...group.citations, ...impact.citations];
    }
  }
  return [...groups.values()];
}

export function decideFindings(input: DecisionInput): Finding[] {
  const checks = input.supportChecks ?? [];
  const anomalies = input.anomalies ?? [];
  const impacts = groupImpactsByIssue(input.calculation.lineItemImpacts);
  const passThroughImpactCount = impacts.filter((i) =>
    isPassThrough(i.issueType),
  ).length;

  return impacts.map((impact, index) => {
    const issueType = impact.issueType;
    let title: string;
    let recommendedAction: RecommendedAction;
    let confidence: number;
    let explanation = impact.description;
    const citations: Citation[] = [...impact.citations];

    if (issueType === "EXCLUDED_REVENUE_INCLUDED") {
      title = "Excluded revenue left in the base management fee base";
      recommendedAction = "dispute";
      confidence = FINDING_CONFIDENCE.excludedRevenue;
    } else if (issueType === "INFLATED_PROFIT_METRIC") {
      const metric = input.rules.incentiveFee?.profitMetric;
      const metricName = (metric && PROFIT_METRIC_NAMES[metric]) ?? "the profit base";
      title = `Incentive fee calculated on inflated ${metricName}`;
      recommendedAction = "dispute";
      confidence = FINDING_CONFIDENCE.inflatedProfitMetric;
    } else if (isPassThrough(issueType)) {
      const check = matchSupportCheck(impact, checks, passThroughImpactCount);
      const subject = check?.subject ?? "Pass-through expense";

      if (check && check.result.verdict === "unsupported") {
        const missingApproval = check.result.missing.includes("owner_approval");
        title = missingApproval
          ? `${subject} charged without required owner approval`
          : `${subject} charged without supporting documentation`;
        // The owner may still approve retroactively — request approval-or-
        // reversal rather than asserting a hard overcharge.
        recommendedAction = "request_explanation";
        confidence = FINDING_CONFIDENCE.unsupportedPassThrough;
        explanation = `${impact.description} ${check.result.explanation}`;
        citations.push(...check.result.citations);
      } else {
        // No verification ran (or it was inconclusive): the rule flags the
        // charge, but we cannot assert support is missing — send to a human.
        title = `${subject} passed through without verified support`;
        recommendedAction = "human_review";
        confidence = FINDING_CONFIDENCE.unverifiedPassThrough;
        if (check) {
          explanation = `${impact.description} ${check.result.explanation}`;
          citations.push(...check.result.citations);
        }
      }

      // Weave in the month-over-month evidence (this is what the demo's
      // re-retrieval loop is built on: the May baseline makes June anomalous).
      const anomaly = anomalies.find(
        (a) => a.kind === "charged_fee" && a.key === "PASS_THROUGH_EXPENSE",
      );
      if (anomaly) {
        explanation = `${explanation} Month-over-month: ${anomaly.reason}`;
        if (anomaly.currentCitation) citations.push(anomaly.currentCitation);
        if (anomaly.priorCitation) citations.push(anomaly.priorCitation);
      }
    } else {
      title = "Calculation input missing — human review required";
      recommendedAction = "human_review";
      confidence = FINDING_CONFIDENCE.needsReview;
    }

    return {
      id: `${input.caseId}_finding_${index + 1}`,
      caseId: input.caseId,
      title,
      severity: severityFor(issueType, impact.amountImpact),
      suspectedImpact: impact.amountImpact,
      explanation,
      recommendedAction,
      citations: dedupeCitations(citations),
      confidence,
      issueType,
      checkLabel: CHECK_LABELS[issueType],
    };
  });
}

// --- Confidence -------------------------------------------------------------------

export interface ConfidenceInput {
  rules: FeeRules;
  calculation: CalculationResult;
  findings: Finding[];
  /** Which audit inputs were actually loaded (never assumed). */
  inputsPresent: {
    statement: boolean;
    revenueBreakout: boolean;
    priorMonth: boolean;
  };
  /** True when the month-over-month anomaly check ran against the prior month. */
  anomalyCheckRan: boolean;
}

export interface ConfidenceScore {
  /** 0..1 fraction (the UI renders it as a percentage). */
  confidence: number;
  /** The same value as visible points out of 100. */
  points: number;
  breakdown: ConfidenceComponent[];
}

/**
 * Evidence credit per finding, by how actionable the evidence made it:
 * a dispute is fully proven (1.0); a request-explanation rests on a documented
 * absence — enough to assert, not enough to close (0.4); anything a human
 * still has to look at earns nothing yet.
 */
const EVIDENCE_CREDIT: Record<RecommendedAction, number> = {
  dispute: 1,
  approve: 1,
  request_explanation: 0.4,
  human_review: 0,
};

export function scoreConfidence(input: ConfidenceInput): ConfidenceScore {
  const breakdown: ConfidenceComponent[] = [];

  // Contract clarity — were the fee clauses actually found in the HMA?
  const clauses: Array<[string, boolean]> = [
    ["base fee", Boolean(input.rules.baseManagementFee)],
    ["incentive fee", Boolean(input.rules.incentiveFee)],
    ["pass-through", Boolean(input.rules.passThroughRules)],
  ];
  const foundClauses = clauses.filter(([, found]) => found);
  const missingClauses = clauses.filter(([, found]) => !found);
  breakdown.push({
    key: "contract_clarity",
    label: "Contract clarity",
    points: Math.round((25 * foundClauses.length) / clauses.length),
    max: 25,
    explanation:
      missingClauses.length === 0
        ? "All fee clauses located and explicit (base, incentive, pass-through)."
        : `Clause(s) not found: ${missingClauses.map(([name]) => name).join(", ")}.`,
  });

  // Data completeness — statement, revenue breakout, prior month.
  const inputs: Array<[string, boolean]> = [
    ["operating statement", input.inputsPresent.statement],
    ["revenue breakout", input.inputsPresent.revenueBreakout],
    ["prior-month statement", input.inputsPresent.priorMonth],
  ];
  const presentInputs = inputs.filter(([, present]) => present);
  const missingInputs = inputs.filter(([, present]) => !present);
  breakdown.push({
    key: "data_completeness",
    label: "Data completeness",
    points: Math.round((25 * presentInputs.length) / inputs.length),
    max: 25,
    explanation:
      missingInputs.length === 0
        ? "Statement, revenue breakout, and prior month all present."
        : `Input(s) missing: ${missingInputs.map(([name]) => name).join(", ")}.`,
  });

  // Calculation match — does the recompute reconcile, with nothing unexplained?
  const impactSum = input.calculation.lineItemImpacts.reduce(
    (acc, i) => acc + i.amountImpact,
    0,
  );
  const reconciled = Math.abs(input.calculation.variance - impactSum) <= 0.01;
  const hasOpenReviews = input.calculation.lineItemImpacts.some(
    (i) => i.issueType === "NEEDS_REVIEW",
  );
  breakdown.push({
    key: "calculation_match",
    label: "Calculation match",
    points: !reconciled ? 0 : hasOpenReviews ? 10 : 20,
    max: 20,
    explanation: !reconciled
      ? "Recomputed fees do not reconcile to the charged variance."
      : hasOpenReviews
        ? "Variance reconciles, but some fees could not be recomputed (open reviews)."
        : "Every variance dollar is attributed; non-flagged fees reproduce exactly.",
  });

  // Evidence support — how actionable the evidence made each finding.
  const credits = input.findings.map((f) => EVIDENCE_CREDIT[f.recommendedAction]);
  const partialCount = input.findings.filter(
    (f) => f.recommendedAction === "request_explanation",
  ).length;
  const evidencePoints =
    credits.length === 0
      ? 20
      : Math.round((20 * credits.reduce((a, b) => a + b, 0)) / credits.length);
  breakdown.push({
    key: "evidence_support",
    label: "Evidence support",
    points: evidencePoints,
    max: 20,
    explanation:
      credits.length === 0
        ? "No findings to evidence."
        : partialCount > 0
          ? `${credits.filter((c) => c === 1).length} finding(s) fully evidenced; ${partialCount} rest(s) on a documented absence (partial).`
          : "Every finding fully evidenced with clause and line citations.",
  });

  // Prior-month consistency — was the anomaly cross-checked against last month?
  const priorChecked = input.inputsPresent.priorMonth && input.anomalyCheckRan;
  breakdown.push({
    key: "prior_month_consistency",
    label: "Prior-month consistency",
    points: priorChecked ? 10 : 0,
    max: 10,
    explanation: priorChecked
      ? "Findings cross-checked against the prior-month statement."
      : "No prior-month cross-check ran.",
  });

  const points = breakdown.reduce((acc, c) => acc + c.points, 0);
  return { confidence: points / 100, points, breakdown };
}
