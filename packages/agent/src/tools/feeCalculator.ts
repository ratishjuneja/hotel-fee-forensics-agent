/**
 * Deterministic fee calculator.
 *
 * ALL fee arithmetic happens here, in code — never in the LLM (see CLAUDE.md
 * "deterministic math, never LLM arithmetic"). The calculator independently
 * recomputes the *expected* base and incentive fees from the operating
 * statement + extracted rules, compares them to the fees the operator actually
 * *charged*, and attributes any variance to the three MVP leakage scenarios,
 * each carrying its own citations.
 *
 * Reconciliation invariant: the sum of `lineItemImpacts` always equals
 * `variance`. Anything the calculator cannot attribute to a specific clause
 * becomes a single `NEEDS_REVIEW` residual rather than a silently dropped or
 * invented number ("don't hallucinate on missing data").
 */

import type {
  CalculationResult,
  ChargedFee,
  FeeRules,
  FinancialLineItem,
  LineItemImpact,
  NormalizedCategory,
} from "@feeforensics/shared";

export interface FeeCalculatorInput {
  caseId: string;
  rules: FeeRules;
  lineItems: FinancialLineItem[];
  chargedFees: ChargedFee[];
}

// --- Category policy --------------------------------------------------------
// MVP simplification: fee families map to fixed sets of normalized categories.
// Whether an "excludable" category is actually stripped is gated on the
// corresponding rule declaring exclusions, so the behaviour stays rule-driven.

const BASE_REVENUE_CATEGORIES = new Set<NormalizedCategory>([
  "ROOM_REVENUE",
  "FNB_REVENUE",
  "BANQUET_REVENUE",
  "OTHER_OPERATED_REVENUE",
  "MISC_INCOME",
]);
/** Default categories excluded from the base-fee revenue base (e.g. HMA §4.1(b)). */
const DEFAULT_EXCLUDED_BASE_CATEGORIES: NormalizedCategory[] = ["CANCELLATION_REVENUE"];

/** Operating revenue counted toward the profit metric (AGOP). */
const AGOP_REVENUE_CATEGORIES = BASE_REVENUE_CATEGORIES;
const OPERATING_EXPENSE_CATEGORIES = new Set<NormalizedCategory>(["OPERATING_EXPENSE"]);
/** Default non-recurring / other income deducted from AGOP (e.g. HMA §4.2). */
const DEFAULT_EXCLUDED_AGOP_CATEGORIES: NormalizedCategory[] = ["INSURANCE_PROCEEDS"];

/**
 * The categories a rule strips are contract-specific: some HMAs exclude the same
 * items (e.g. cancellation *and* insurance revenue) from both the base and the
 * profit metric (Harborline §4.3). A rule may declare `excludedCategories`; when
 * it doesn't, we fall back to the built-in default so existing cases are
 * unaffected.
 */
const excludedSet = (
  declared: NormalizedCategory[] | undefined,
  fallback: NormalizedCategory[],
): Set<NormalizedCategory> =>
  new Set(declared && declared.length > 0 ? declared : fallback);

// --- Money helpers ----------------------------------------------------------

/** Round to whole cents, avoiding binary-float drift (e.g. 0.12 × 81250). */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const money = (n: number): string =>
  `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

const sumBy = (
  items: FinancialLineItem[],
  categories: Set<NormalizedCategory>,
): number =>
  items
    .filter((i) => categories.has(i.normalizedCategory))
    .reduce((acc, i) => acc + i.amount, 0);

interface FeeComponent {
  expectedFee: number;
  impacts: LineItemImpact[];
}

// --- Base management fee -----------------------------------------------------

export function computeBaseFee(
  rules: FeeRules,
  lineItems: FinancialLineItem[],
  reviewNotes: string[],
): FeeComponent {
  const rule = rules.baseManagementFee;
  if (!rule) {
    reviewNotes.push("base management fee rule not found");
    return { expectedFee: 0, impacts: [] };
  }

  const includedRevenue = sumBy(lineItems, BASE_REVENUE_CATEGORIES);
  const expectedFee = round2(rule.percentage * includedRevenue);

  const excludedCategories = excludedSet(
    rule.excludedCategories,
    DEFAULT_EXCLUDED_BASE_CATEGORIES,
  );
  // A rule declares exclusions in free text, normalized categories, or both —
  // an extractor that grounded only the categories still declared them.
  const declaresExclusions =
    rule.excludedRevenue.length > 0 || (rule.excludedCategories?.length ?? 0) > 0;
  const excludedItems = declaresExclusions
    ? lineItems.filter(
        (i) => excludedCategories.has(i.normalizedCategory) && i.amount !== 0,
      )
    : [];

  const impacts = excludedItems.map(
    (i): LineItemImpact => ({
      issueType: "EXCLUDED_REVENUE_INCLUDED",
      description: `${i.description} (${money(i.amount)}) was included in the base-fee revenue base.`,
      amountImpact: round2(rule.percentage * i.amount),
      relatedLineItems: [i.description],
      citations: [i.citation, rule.citation],
    }),
  );

  return { expectedFee, impacts };
}

// --- Incentive fee -----------------------------------------------------------

export function computeIncentiveFee(
  rules: FeeRules,
  lineItems: FinancialLineItem[],
  reviewNotes: string[],
): FeeComponent {
  const rule = rules.incentiveFee;
  if (!rule) {
    reviewNotes.push("incentive fee rule not found");
    return { expectedFee: 0, impacts: [] };
  }

  const threshold = rule.threshold ?? 0;
  const profitRevenue = sumBy(lineItems, AGOP_REVENUE_CATEGORIES);
  const operatingExpense = sumBy(lineItems, OPERATING_EXPENSE_CATEGORIES);
  const baseAGOP = profitRevenue - operatingExpense;

  const excludedCategories = excludedSet(
    rule.excludedCategories,
    DEFAULT_EXCLUDED_AGOP_CATEGORIES,
  );
  // Same as the base fee: categories alone are a declared exclusion.
  const declaresExclusions =
    rule.excludedItems.length > 0 || (rule.excludedCategories?.length ?? 0) > 0;
  const excludedItems = declaresExclusions
    ? lineItems.filter(
        (i) => excludedCategories.has(i.normalizedCategory) && i.amount !== 0,
      )
    : [];
  const excludedTotal = excludedItems.reduce((acc, i) => acc + i.amount, 0);

  // Threshold-aware: the fee only moves for AGOP above the owner-priority line.
  const feeAt = (agop: number) =>
    round2(rule.percentage * Math.max(0, agop - threshold));
  const expectedFee = feeAt(baseAGOP); // excluded items removed
  const reportedFee = feeAt(baseAGOP + excludedTotal); // as the operator computed it
  const impactAmount = round2(reportedFee - expectedFee);

  const impacts: LineItemImpact[] =
    impactAmount !== 0 && excludedItems.length > 0
      ? [
          {
            issueType: "INFLATED_PROFIT_METRIC",
            description:
              `${excludedItems.map((i) => `${i.description} (${money(i.amount)})`).join(", ")} ` +
              `left in AGOP inflated the incentive fee by ${money(impactAmount)}.`,
            amountImpact: impactAmount,
            relatedLineItems: excludedItems.map((i) => i.description),
            citations: [...excludedItems.map((i) => i.citation), rule.citation],
          },
        ]
      : [];

  return { expectedFee, impacts };
}

// --- Pass-through expenses ---------------------------------------------------

export function computePassThrough(
  rules: FeeRules,
  lineItems: FinancialLineItem[],
): LineItemImpact[] {
  const rule = rules.passThroughRules;
  if (!rule) return [];

  const excludedCategories = new Set<string>(rule.excludedCategories);
  // §5.1-style clauses state a $ approval threshold, not a category ban, so an
  // honest extractor may return no excluded categories at all. The threshold
  // comparison is arithmetic — it lives here, never with the model.
  const exceedsApprovalThreshold = (i: FinancialLineItem): boolean =>
    rule.approvalThreshold != null &&
    i.normalizedCategory === "CORPORATE_OVERHEAD" &&
    Math.abs(i.amount) > rule.approvalThreshold;
  const improper = lineItems.filter(
    (i) =>
      (excludedCategories.has(i.normalizedCategory) || exceedsApprovalThreshold(i)) &&
      i.amount !== 0,
  );

  return improper.map(
    (i): LineItemImpact => ({
      issueType: "IMPROPER_PASS_THROUGH",
      description:
        `${i.description} (${money(i.amount)}) was passed through to the owner without the ` +
        `approval required above ${money(rule.approvalThreshold ?? 0)}.`,
      amountImpact: round2(i.amount),
      relatedLineItems: [i.description],
      citations: [i.citation, rule.citation],
    }),
  );
}

// --- Orchestration -----------------------------------------------------------

const sumImpacts = (impacts: LineItemImpact[]): number =>
  impacts.reduce((acc, i) => acc + i.amountImpact, 0);

export function calculateFees(input: FeeCalculatorInput): CalculationResult {
  const { caseId, rules, lineItems, chargedFees } = input;
  const reviewNotes: string[] = [];

  const base = computeBaseFee(rules, lineItems, reviewNotes);
  const incentive = computeIncentiveFee(rules, lineItems, reviewNotes);
  const passThroughImpacts = computePassThrough(rules, lineItems);

  const expectedBaseFee = base.expectedFee;
  const expectedIncentiveFee = incentive.expectedFee;
  const expectedTotalFees = round2(expectedBaseFee + expectedIncentiveFee);
  const chargedTotalFees = round2(
    chargedFees.reduce((acc, f) => acc + f.chargedAmount, 0),
  );
  const variance = round2(chargedTotalFees - expectedTotalFees);

  const lineItemImpacts: LineItemImpact[] = [
    ...base.impacts,
    ...incentive.impacts,
    ...passThroughImpacts,
  ];

  // Reconciliation: attribute any leftover variance to a NEEDS_REVIEW residual
  // so the impacts always tie out to the dollar figure the owner sees.
  const residual = round2(variance - sumImpacts(lineItemImpacts));
  if (Math.abs(residual) >= 0.01) {
    const reasons = reviewNotes.length > 0 ? ` (${reviewNotes.join("; ")})` : "";
    lineItemImpacts.push({
      issueType: "NEEDS_REVIEW",
      description:
        `Unexplained variance of ${money(residual)} could not be tied to a specific ` +
        `clause${reasons} — human review required.`,
      amountImpact: residual,
      relatedLineItems: [],
      citations: [],
    });
  }

  return {
    caseId,
    expectedBaseFee,
    expectedIncentiveFee,
    expectedTotalFees,
    chargedTotalFees,
    variance,
    lineItemImpacts,
  };
}
