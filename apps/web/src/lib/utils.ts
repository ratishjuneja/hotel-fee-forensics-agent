import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { IssueType } from "@feeforensics/shared";

/** Tailwind-aware className combiner (shadcn convention). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Whole-dollar currency, e.g. 18750 -> "$18,750". */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

/** 0.86 -> "86%". */
export function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

/**
 * Human label for the detection check that produced a line-item impact.
 * AppFlow §4/§7 require each finding to be tagged with its check. Findings
 * carry no issueType yet, so the report screen zips findings with
 * calculationResult.lineItemImpacts (same order) to look this up.
 * TODO(contract): ask Person A to add issueType/checkLabel onto Finding.
 */
export const CHECK_LABEL: Record<IssueType, string> = {
  EXCLUDED_REVENUE_INCLUDED: "Check 2 — Inclusion",
  INFLATED_PROFIT_METRIC: "Check 3 — GOP/AGOP",
  IMPROPER_PASS_THROUGH: "Check 5 — Reclassification / approval",
  APPROVAL_THRESHOLD_EXCEEDED: "Check 5 — Reclassification / approval",
  NEEDS_REVIEW: "Human review",
};
