import { describe, expect, it } from "vitest";

import type { Finding, IssueType } from "@feeforensics/shared";

import { planHumanReview } from "./humanReview.js";

const CASE = "case_x";

const finding = (over: Partial<Finding> & { issueType: IssueType }): Finding => ({
  id: `${CASE}_finding_1`,
  caseId: CASE,
  title: "Centralized Services passed through without verified support",
  severity: "high",
  suspectedImpact: 28000,
  explanation: "No approval on file.",
  recommendedAction: "human_review",
  citations: [
    {
      documentId: "doc_hma",
      documentName: "Hotel Management Agreement",
      sectionLabel: "HMA §5.1 — Centralized Services",
    },
  ],
  confidence: 0.75,
  ...over,
});

describe("planHumanReview", () => {
  it("turns a human_review pass-through finding into a cited question with a stable id", () => {
    const f = finding({ issueType: "IMPROPER_PASS_THROUGH" });
    const plan = planHumanReview(CASE, [f]);

    expect(plan.questions).toHaveLength(1);
    const q = plan.questions[0]!;
    expect(q.id).toBe("case_x_q_improper_pass_through");
    expect(q.subject).toBe("Centralized Services");
    expect(q.question).toMatch(/\$28,000/);
    expect(q.citations).toEqual(f.citations); // never uncited
    expect(q.options.map((o) => o.resultingAction)).toEqual(["approve", "request_explanation"]);
    // Nothing answered yet → the run must pause on it.
    expect(plan.unanswered).toHaveLength(1);
    expect(plan.answerNotes).toHaveLength(0);
    expect(plan.resolvedFindings[0]!.recommendedAction).toBe("human_review");
  });

  it("resolves an answered question to the chosen disposition (approve → excluded)", () => {
    const f = finding({ issueType: "IMPROPER_PASS_THROUGH" });
    const plan = planHumanReview(CASE, [f], { case_x_q_improper_pass_through: "authorized" });

    expect(plan.unanswered).toHaveLength(0);
    expect(plan.answerNotes[0]).toMatch(/Centralized Services — Owner instruction:/);
    const resolved = plan.resolvedFindings[0]!;
    expect(resolved.recommendedAction).toBe("approve");
    expect(resolved.explanation).toMatch(/^Owner instruction:/);
  });

  it("resolves not_authorized → request_explanation (approval-or-reversal)", () => {
    const f = finding({ issueType: "IMPROPER_PASS_THROUGH" });
    const plan = planHumanReview(CASE, [f], { case_x_q_improper_pass_through: "not_authorized" });
    expect(plan.resolvedFindings[0]!.recommendedAction).toBe("request_explanation");
    expect(plan.unanswered).toHaveLength(0);
  });

  it("treats an unknown option id as unanswered (re-asks rather than guessing)", () => {
    const f = finding({ issueType: "IMPROPER_PASS_THROUGH" });
    const plan = planHumanReview(CASE, [f], { case_x_q_improper_pass_through: "maybe" });
    expect(plan.unanswered).toHaveLength(1);
    expect(plan.resolvedFindings[0]!.recommendedAction).toBe("human_review");
  });

  it("offers dispute/accept for a NEEDS_REVIEW finding", () => {
    const f = finding({
      issueType: "NEEDS_REVIEW",
      title: "Calculation input missing — human review required",
      suspectedImpact: 5000,
    });
    const plan = planHumanReview(CASE, [f]);
    const q = plan.questions[0]!;
    expect(q.id).toBe("case_x_q_needs_review");
    expect(q.options.map((o) => o.id)).toEqual(["dispute", "accept"]);
  });

  it("passes non-human_review findings through untouched and raises no questions", () => {
    const dispute = finding({
      issueType: "EXCLUDED_REVENUE_INCLUDED",
      title: "Excluded revenue left in the base management fee base",
      recommendedAction: "dispute",
      suspectedImpact: 1980,
    });
    const plan = planHumanReview(CASE, [dispute]);
    expect(plan.questions).toHaveLength(0);
    expect(plan.unanswered).toHaveLength(0);
    expect(plan.resolvedFindings[0]).toBe(dispute);
  });

  it("derives the same question id on replay (deterministic — answer keeps resolving it)", () => {
    const f = finding({ issueType: "IMPROPER_PASS_THROUGH" });
    const first = planHumanReview(CASE, [f]).questions[0]!.id;
    const second = planHumanReview(CASE, [f]).questions[0]!.id;
    expect(first).toBe(second);
  });
});
