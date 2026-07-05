/**
 * Human-in-the-loop planning (deterministic — no LLM).
 *
 * A finding the decision engine could not resolve on evidence alone is a
 * `human_review` finding (an unverified pass-through, or a fee it could not
 * recompute). Rather than silently emit it, the audit turns each one into a
 * cited {@link PendingQuestion} — options, consequences, and the clause/line
 * evidence — and STOPS until the owner answers.
 *
 * The answer is merged back by **replay**: `runAudit` re-runs with
 * `input.humanAnswers` (question id → chosen option id), and this planner
 * resolves any answered finding to the option's disposition. Nothing about a
 * paused run is serialized — the same inputs always derive the same question
 * ids, so an answer keeps resolving the same question deterministically.
 *
 * The demo never reaches here: its findings are dispute / dispute /
 * request_explanation, so there are zero questions and the golden run does not
 * pause.
 */

import type {
  Citation,
  Finding,
  IssueType,
  PendingQuestion,
  PendingQuestionOption,
} from "@feeforensics/shared";

export interface HumanReviewPlan {
  /** Every question derived from a `human_review` finding this run. */
  questions: PendingQuestion[];
  /** Questions with no valid answer yet — the run pauses while any remain. */
  unanswered: PendingQuestion[];
  /**
   * Findings with each answered question resolved to its chosen disposition;
   * unanswered `human_review` findings and all other findings pass through
   * unchanged. Same order as the input.
   */
  resolvedFindings: Finding[];
  /** One "<subject> — Owner instruction: <label>." line per answered question. */
  answerNotes: string[];
}

/** Stable, replay-safe id for the question a finding raises (keyed on issue type). */
const questionId = (caseId: string, issueType: IssueType): string =>
  `${caseId}_q_${issueType.toLowerCase()}`;

const formatMoney = (n: number): string =>
  `$${Math.abs(Math.round(n)).toLocaleString("en-US")}`;

const isPassThrough = (t: IssueType): boolean =>
  t === "IMPROPER_PASS_THROUGH" || t === "APPROVAL_THRESHOLD_EXCEEDED";

/**
 * The charge in plain words, taken from the UPLOADED DOCUMENT itself — nothing
 * hardcoded, so it works for any case an owner uploads. Prefer the exact line
 * the charge sits on (the parsed CSV row's `lineLabel`, PR-15 provenance), so the
 * question names whatever that document calls the line. Failing that, recover the
 * name from the finding title (the support check writes it there when it ran). If
 * the document carries no label at all, stay neutral — never invent a name.
 */
function subjectOf(finding: Finding): string {
  const lineLabel = finding.citations
    .map((c) => c.lineLabel?.trim())
    .find((l): l is string => Boolean(l));
  if (lineLabel) return lineLabel;

  const fromTitle = finding.title
    .replace(/\s+(passed through|charged|left in|calculated on).*/i, "")
    .trim();
  // Only use the title when it actually names the charge — not the generic
  // category ("Pass-through expense") or the missing-input placeholder.
  if (fromTitle && !/^(pass-through expense|calculation input missing)/i.test(fromTitle)) {
    return fromTitle;
  }

  const issueType = finding.issueType ?? "NEEDS_REVIEW";
  return isPassThrough(issueType) ? "this charge" : "this fee";
}

/** Build the cited question a `human_review` finding asks the owner. */
function questionFor(caseId: string, finding: Finding): PendingQuestion {
  const issueType = finding.issueType ?? "NEEDS_REVIEW";
  const subject = subjectOf(finding);
  const amount = formatMoney(finding.suspectedImpact);
  const citations: Citation[] = finding.citations;

  const options: PendingQuestionOption[] = isPassThrough(issueType)
    ? [
        {
          id: "authorized",
          label: "Yes — the owner authorized this charge",
          consequence: "Accepted as authorized; excluded from the dispute total.",
          resultingAction: "approve",
        },
        {
          id: "not_authorized",
          label: "No — there is no approval on file",
          consequence:
            "Added to the dispute as an unsupported charge (approval-or-reversal).",
          resultingAction: "request_explanation",
        },
      ]
    : [
        {
          id: "dispute",
          label: "Treat the unexplained amount as an overcharge",
          consequence: "Added to the dispute total.",
          resultingAction: "dispute",
        },
        {
          id: "accept",
          label: "Accept the charge as correct",
          consequence: "Excluded from the dispute total.",
          resultingAction: "approve",
        },
      ];

  const question = isPassThrough(issueType)
    ? `Did the owner authorize the ${subject} charge of ${amount}? ` +
      `The audit found no supporting approval on file, so it cannot decide this alone.`
    : `The audit could not recompute ${subject} (${amount}). ` +
      `How should this amount be treated?`;

  return {
    id: questionId(caseId, issueType),
    issueType,
    subject,
    question,
    consequence:
      "Held for your review and excluded from the dispute total until you answer.",
    citations,
    options,
  };
}

/**
 * Plan the human-in-the-loop step: derive questions from `human_review`
 * findings, resolve any that `answers` covers, and report which remain open.
 */
export function planHumanReview(
  caseId: string,
  findings: Finding[],
  answers: Record<string, string> = {},
): HumanReviewPlan {
  const questions: PendingQuestion[] = [];
  const unanswered: PendingQuestion[] = [];
  const answerNotes: string[] = [];

  const resolvedFindings = findings.map((finding) => {
    if (finding.recommendedAction !== "human_review") return finding;

    const question = questionFor(caseId, finding);
    questions.push(question);

    const choice = answers[question.id];
    const option = question.options.find((o) => o.id === choice);
    if (!option) {
      // No answer (or an unknown option) — keep the finding open and re-ask.
      unanswered.push(question);
      return finding;
    }

    answerNotes.push(`${question.subject} — Owner instruction: ${option.label}.`);
    return {
      ...finding,
      recommendedAction: option.resultingAction,
      explanation: `Owner instruction: ${option.label}. ${finding.explanation}`,
    };
  });

  return { questions, unanswered, resolvedFindings, answerNotes };
}
