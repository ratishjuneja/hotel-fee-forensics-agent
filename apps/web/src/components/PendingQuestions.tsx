"use client";

import { useState } from "react";
import { HelpCircle, Loader2, Quote } from "lucide-react";
import type {
  Citation,
  PendingQuestion,
  RunAuditResponse,
} from "@feeforensics/shared";
import { ApiError, answerQuestions } from "@/lib/api";

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
    <section className="mt-8 rounded-xl border border-amber-200 bg-amber-50/70 p-5">
      <div className="flex items-center gap-2 text-amber-900">
        <HelpCircle className="h-5 w-5" />
        <h2 className="text-base font-semibold">
          The agent needs your input to continue
        </h2>
      </div>
      <p className="mt-1 text-sm text-amber-800">
        It found {questions.length === 1 ? "a charge" : `${questions.length} items`} it
        cannot verify from the documents alone. Rather than guess, it is asking you —
        your answer is merged in and the audit re-runs.
      </p>

      <ol className="mt-4 space-y-4">
        {questions.map((q) => (
          <li key={q.id} className="rounded-lg border border-amber-200 bg-white p-4">
            <p className="font-medium text-slate-900">{q.question}</p>

            {q.citations.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Quote className="h-3.5 w-3.5 text-slate-400" />
                {[...new Set(q.citations.map(citationLabel))].map((label) => (
                  <span
                    key={label}
                    className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
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
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${
                      selected
                        ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500"
                        : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name={q.id}
                      value={opt.id}
                      checked={selected}
                      onChange={() =>
                        setChoices((c) => ({ ...c, [q.id]: opt.id }))
                      }
                      className="mt-0.5 h-4 w-4 accent-brand-600"
                    />
                    <span>
                      <span className="block text-sm font-medium text-slate-900">
                        {opt.label}
                      </span>
                      <span className="block text-xs text-slate-500">
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

      {error && <p className="mt-3 text-sm font-medium text-rose-700">{error}</p>}

      <button
        type="button"
        onClick={submit}
        disabled={!allAnswered || submitting}
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
        {submitting ? "Resuming the audit…" : "Submit answer & resume audit"}
      </button>
    </section>
  );
}
