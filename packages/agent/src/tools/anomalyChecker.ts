/**
 * Month-over-month anomaly checker (deterministic — no LLM).
 *
 * Compares the audit month against the prior month and flags material swings:
 * statement line items summed by `normalizedCategory`, charged fees summed by
 * `feeType`. Charged fees matter — in parsed statements "Centralized Services"
 * is a `PASS_THROUGH_EXPENSE` charged fee, and its May $7,500 → June $28,000
 * jump (+273% on flat revenue) is the signal that sends the orchestrator back
 * to retrieve the support pack (where approval APPROVAL-0612-03 turns out to be
 * missing).
 *
 * A change is anomalous only when it clears BOTH gates — |percent change| ≥
 * `minPercent` AND |dollar change| ≥ `minAbsolute` — so ordinary growth (rooms
 * +2% / +$50k) stays quiet while a 273% / +$20.5k pass-through jump does not.
 * A key with no prior-month counterpart is a new item: its percent change is
 * `null` (never Infinity), it gates on dollars alone, and it is always high
 * severity. `triggersReview` marks material *increases* in expense-side keys —
 * those are what warrant pulling invoices and approvals; revenue swings are
 * the fee calculator's job.
 */

import type {
  ChargedFee,
  Citation,
  FinancialLineItem,
} from "@feeforensics/shared";

export interface AnomalyThresholds {
  /** Minimum |month-over-month change| as a ratio of the prior amount (0.5 = 50%). */
  minPercent?: number;
  /** Minimum |month-over-month change| in dollars. */
  minAbsolute?: number;
}

export const DEFAULT_ANOMALY_THRESHOLDS: Required<AnomalyThresholds> = {
  minPercent: 0.5,
  minAbsolute: 5000,
};

export type AnomalyKind = "line_item" | "charged_fee";

export type AnomalySeverity = "high" | "medium" | "low";

export interface Anomaly {
  /** Grouping key: a `NormalizedCategory` or a `ChargedFeeType`. */
  key: string;
  label: string;
  kind: AnomalyKind;
  currentAmount: number;
  priorAmount: number;
  absoluteChange: number;
  /** Change as a ratio of the prior amount; null for a new item (prior = 0). */
  percentChange: number | null;
  severity: AnomalySeverity;
  /** True for a material increase in an expense-side key — retrieve support. */
  triggersReview: boolean;
  reason: string;
  currentCitation?: Citation;
  priorCitation?: Citation;
}

export interface AnomalyCheckerInput {
  currentLineItems: FinancialLineItem[];
  priorLineItems: FinancialLineItem[];
  currentChargedFees?: ChargedFee[];
  priorChargedFees?: ChargedFee[];
}

// --- Labels and review keys ---------------------------------------------------

const KEY_LABELS: Record<string, string> = {
  ROOM_REVENUE: "Rooms revenue",
  FNB_REVENUE: "Food & beverage revenue",
  BANQUET_REVENUE: "Banquet revenue",
  OTHER_OPERATED_REVENUE: "Other operated departments revenue",
  MISC_INCOME: "Miscellaneous income",
  CANCELLATION_REVENUE: "Cancellation revenue",
  INSURANCE_PROCEEDS: "Insurance proceeds",
  OPERATING_EXPENSE: "Operating expenses",
  CORPORATE_OVERHEAD: "Corporate overhead",
  BRAND_FEE: "Brand fee",
  MANAGEMENT_FEE: "Management fees",
  OTHER: "Other / unclassified",
  BASE_MANAGEMENT_FEE: "Base management fee",
  INCENTIVE_MANAGEMENT_FEE: "Incentive management fee",
  BRAND_SYSTEM_FEE: "Brand / system fee",
  PASS_THROUGH_EXPENSE: "Pass-through / centralized charges",
};

/**
 * Expense-side keys where a material INCREASE means the owner is being charged
 * more — the orchestrator should go retrieve supporting invoices/approvals.
 * Revenue keys are deliberately absent: revenue swings feed the deterministic
 * fee recompute, not the review loop.
 */
const REVIEW_KEYS = new Set<string>([
  "OPERATING_EXPENSE",
  "CORPORATE_OVERHEAD",
  "BRAND_FEE",
  "MANAGEMENT_FEE",
  "PASS_THROUGH_EXPENSE",
  "BRAND_SYSTEM_FEE",
]);

const labelFor = (key: string): string =>
  KEY_LABELS[key] ??
  key.toLowerCase().replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

// --- Formatting (deterministic, no locale dependence) -------------------------

const formatMoney = (n: number): string => {
  const sign = n < 0 ? "-" : "";
  const [int = "0", frac = "00"] = Math.abs(n).toFixed(2).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return frac === "00" ? `${sign}$${grouped}` : `${sign}$${grouped}.${frac}`;
};

const formatPercent = (ratio: number): string => `${(ratio * 100).toFixed(1)}%`;

// --- Grouping ------------------------------------------------------------------

interface Group {
  total: number;
  /** Citation of the largest-|amount| row — the group's representative evidence. */
  citation?: Citation;
  citationAmount: number;
}

function accumulate(
  groups: Map<string, Group>,
  key: string,
  amount: number,
  citation: Citation,
): void {
  const group = groups.get(key) ?? { total: 0, citationAmount: -1 };
  group.total += amount;
  if (Math.abs(amount) > group.citationAmount) {
    group.citation = citation;
    group.citationAmount = Math.abs(amount);
  }
  groups.set(key, group);
}

const groupLineItems = (items: FinancialLineItem[]): Map<string, Group> => {
  const groups = new Map<string, Group>();
  for (const item of items) {
    accumulate(groups, item.normalizedCategory, item.amount, item.citation);
  }
  return groups;
};

const groupChargedFees = (fees: ChargedFee[]): Map<string, Group> => {
  const groups = new Map<string, Group>();
  for (const fee of fees) {
    accumulate(groups, fee.feeType, fee.chargedAmount, fee.citation);
  }
  return groups;
};

// --- Comparison ------------------------------------------------------------------

function compareGroups(
  kind: AnomalyKind,
  current: Map<string, Group>,
  prior: Map<string, Group>,
  thresholds: Required<AnomalyThresholds>,
): Anomaly[] {
  const anomalies: Anomaly[] = [];
  const keys = new Set([...current.keys(), ...prior.keys()]);

  for (const key of keys) {
    const currentGroup = current.get(key);
    const priorGroup = prior.get(key);
    const currentAmount = currentGroup?.total ?? 0;
    const priorAmount = priorGroup?.total ?? 0;
    const absoluteChange = currentAmount - priorAmount;
    const isNewItem = priorAmount === 0;
    const percentChange = isNewItem ? null : absoluteChange / Math.abs(priorAmount);

    if (Math.abs(absoluteChange) < thresholds.minAbsolute) continue;
    if (percentChange !== null && Math.abs(percentChange) < thresholds.minPercent) {
      continue;
    }

    const label = labelFor(key);
    const severity: AnomalySeverity =
      isNewItem || Math.abs(percentChange!) >= 1
        ? "high"
        : Math.abs(percentChange!) >= 0.75
          ? "medium"
          : "low";
    const triggersReview = REVIEW_KEYS.has(key) && absoluteChange > 0;

    let reason: string;
    if (isNewItem) {
      reason = `${label} appears this month with no prior-month counterpart ($0 → ${formatMoney(currentAmount)}).`;
    } else if (currentAmount === 0) {
      reason = `${label} dropped to $0 from ${formatMoney(priorAmount)} in the prior month.`;
    } else {
      const direction = absoluteChange > 0 ? "rose" : "fell";
      reason =
        `${label} ${direction} ${formatPercent(Math.abs(percentChange!))} month-over-month ` +
        `(${formatMoney(priorAmount)} → ${formatMoney(currentAmount)}).`;
    }
    if (triggersReview) {
      reason +=
        " Material increase in an owner-charged expense — retrieve supporting invoices and approvals before accepting.";
    }

    const anomaly: Anomaly = {
      key,
      label,
      kind,
      currentAmount,
      priorAmount,
      absoluteChange,
      percentChange,
      severity,
      triggersReview,
      reason,
    };
    if (currentGroup?.citation) anomaly.currentCitation = currentGroup.citation;
    if (priorGroup?.citation) anomaly.priorCitation = priorGroup.citation;
    anomalies.push(anomaly);
  }

  return anomalies;
}

const SEVERITY_RANK: Record<AnomalySeverity, number> = { high: 2, medium: 1, low: 0 };

/**
 * Compare the audit month against the prior month and return the material
 * anomalies, most material first (review-triggering, then severity, then
 * dollar magnitude).
 */
export function checkAnomalies(
  input: AnomalyCheckerInput,
  thresholds?: AnomalyThresholds,
): Anomaly[] {
  const gates = { ...DEFAULT_ANOMALY_THRESHOLDS, ...thresholds };

  const anomalies = [
    ...compareGroups(
      "line_item",
      groupLineItems(input.currentLineItems),
      groupLineItems(input.priorLineItems),
      gates,
    ),
    ...compareGroups(
      "charged_fee",
      groupChargedFees(input.currentChargedFees ?? []),
      groupChargedFees(input.priorChargedFees ?? []),
      gates,
    ),
  ];

  return anomalies.sort(
    (a, b) =>
      Number(b.triggersReview) - Number(a.triggersReview) ||
      SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
      Math.abs(b.absoluteChange) - Math.abs(a.absoluteChange) ||
      a.key.localeCompare(b.key),
  );
}
