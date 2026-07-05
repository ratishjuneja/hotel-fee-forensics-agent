"use client";

import { useState } from "react";
import { HelpCircle, Quote } from "lucide-react";
import type {
  Citation,
  PendingQuestion,
  RunAuditResponse,
} from "@feeforensics/shared";
import { ApiError, answerQuestions } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

/**
 * The human-in-the-loop step, in the agent's voice: when the audit hits a charge
 * it cannot verify or a fee it cannot recompute, it does NOT guess — it pauses
 * and asks the owner, showing the exact clause/line it is unsure about and what
 * each answer will do. Answering POSTs to /answers, which replays the run and
 * returns the resumed result (completed, or another question).
 */

const citationLabel = (c: Citation): string =>
  c.sectionLabel ?? c.lineLabel ?? c.documentName;

export function PendingQuestions({
  caseId,
  questions,
  onResolved,
}: {
  caseId: string;
  questions: PendingQuestion[];
  onResolved: (result: RunAuditResponse) => void;
}) {
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allAnswered = questions.every((q) => choices[q.id]);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      onResolved(await answerQuestions(caseId, choices));
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `Could not submit your answers (${err.status}). Please try again.`
          : "Could not submit your answers.",
      );
      setSubmitting(false);
    }
  };

  return (
    <section className="mt-8 animate-fade-up rounded-xl border border-warning/30 bg-warning-soft/40 p-5 sm:p-6">
      <div className="flex items-center gap-2 text-warning-soft-foreground">
        <HelpCircle className="h-5 w-5" />
        <h2 className="text-base font-semibold">
          The agent needs your input to continue
        </h2>
      </div>
      <p className="mt-1.5 text-sm text-muted">
        It found{" "}
        {questions.length === 1 ? "a charge" : `${questions.length} items`} it
        can&apos;t verify from the documents alone. Rather than guess, it&apos;s
        asking you — your answer is merged in and the audit re-runs.
      </p>

      <ol className="mt-5 space-y-4">
        {questions.map((q) => (
          <li key={q.id} className="rounded-lg border border-border bg-surface p-4">
            <p className="font-medium text-foreground">{q.question}</p>

            {q.citations.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Quote className="h-3.5 w-3.5 text-subtle" />
                {[...new Set(q.citations.map(citationLabel))].map((label) => (
                  <span
                    key={label}
                    className="rounded-md bg-surface-2 px-2 py-0.5 text-xs font-medium text-muted"
                  >
                    {label}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-3 space-y-2">
              {q.options.map((opt) => {
                const selected = choices[q.id] === opt.id;
                return (
                  <label
                    key={opt.id}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                      selected
                        ? "border-primary bg-primary-soft/60 ring-1 ring-primary"
                        : "border-border hover:border-border-strong hover:bg-surface-2",
                    )}
                  >
                    <input
                      type="radio"
                      name={q.id}
                      value={opt.id}
                      checked={selected}
                      onChange={() =>
                        setChoices((c) => ({ ...c, [q.id]: opt.id }))
                      }
                      className="mt-0.5 h-4 w-4 accent-primary"
                    />
                    <span>
                      <span className="block text-sm font-medium text-foreground">
                        {opt.label}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted">
                        {opt.consequence}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </li>
        ))}
      </ol>

      {error && (
        <p className="mt-3 text-sm font-medium text-danger">{error}</p>
      )}

      <Button
        type="button"
        onClick={submit}
        disabled={!allAnswered}
        loading={submitting}
        className="mt-5"
      >
        {submitting ? "Resuming the audit…" : "Submit answer & resume audit"}
      </Button>
    </section>
  );
}
