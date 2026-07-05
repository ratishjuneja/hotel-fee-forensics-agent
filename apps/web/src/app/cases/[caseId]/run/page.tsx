"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  HelpCircle,
  Loader2,
} from "lucide-react";
import type { CaseStatusResponse, RunAuditResponse } from "@feeforensics/shared";
import { ApiError, getCaseStatus, runAudit } from "@/lib/api";
import { PendingQuestions } from "@/components/PendingQuestions";
import { TraceRow } from "@/components/TraceRow";
import { formatCurrency, formatPercent } from "@/lib/utils";

const STEP_DELAY_MS = 750;

/**
 * Agent run for an uploaded case. There is deliberately no bundled-replay
 * fallback: replaying canned output for someone else's documents would fake an
 * analysis. Every trace step, finding, and number comes from the live run;
 * failures surface honestly instead.
 */
export default function CaseRunPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const [caseInfo, setCaseInfo] = useState<CaseStatusResponse | null>(null);
  const [result, setResult] = useState<RunAuditResponse | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(
    null,
  );
  const [attempt, setAttempt] = useState(0);
  const [visible, setVisible] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    getCaseStatus(caseId).then(setCaseInfo, () => {});
  }, [caseId]);

  useEffect(() => {
    let alive = true;
    setError(null);
    setResult(null);
    setVisible(0);
    runAudit(caseId).then(
      (r) => alive && setResult(r),
      (err) =>
        alive &&
        setError(
          err instanceof ApiError
            ? { status: err.status, message: err.message }
            : { status: 0, message: "The audit run failed." },
        ),
    );
    return () => {
      alive = false;
    };
  }, [caseId, attempt]);

  // Reveal trace steps one at a time so the run reads as live.
  useEffect(() => {
    if (!result) return;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    result.trace.forEach((_, i) => {
      const t = setTimeout(
        () => setVisible((c) => Math.max(c, i + 1)),
        400 + i * STEP_DELAY_MS,
      );
      timers.current.push(t);
    });
    return () => timers.current.forEach(clearTimeout);
  }, [result]);

  const steps = result?.trace ?? [];
  const shown = steps.slice(0, visible);
  const done = result !== null && visible >= steps.length;
  const awaiting = result?.status === "awaiting_input";

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Agent Investigation
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {caseInfo
              ? `${caseInfo.hotelName} · ${caseInfo.auditMonth}`
              : "Uploaded case"}{" "}
            — the agent plans, retrieves, recomputes, and loops back on
            ambiguity.
          </p>
        </div>
        {error ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 text-sm font-medium text-rose-700">
            <AlertTriangle className="h-4 w-4" />
            Failed
          </span>
        ) : !done ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-700">
            <Loader2 className="h-4 w-4 animate-spin" />
            Running
          </span>
        ) : awaiting ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-800">
            <HelpCircle className="h-4 w-4" />
            Needs your input
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            Complete
          </span>
        )}
      </header>

      {error && (
        <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-semibold">The audit could not run.</p>
          <p className="mt-1">{error.message}</p>
          <div className="mt-3 flex flex-wrap gap-3">
            {error.status === 409 ? (
              <Link
                href={`/cases/${caseId}`}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
              >
                Back to parsing status
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => setAttempt((a) => a + 1)}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
              >
                Retry the run
              </button>
            )}
            <Link
              href="/cases/new"
              className="rounded-lg border border-amber-300 px-4 py-2 text-sm font-semibold text-amber-900 transition hover:bg-amber-100"
            >
              Upload different documents
            </Link>
          </div>
        </div>
      )}

      {!error && (
        <ol className="mt-8 space-y-3">
          {shown.map((step) => (
            <TraceRow key={step.id} step={step} />
          ))}
          {!done && result && (
            <li className="flex items-center gap-2 pl-11 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Working…
            </li>
          )}
          {!result && (
            <li className="flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Contacting agent…
            </li>
          )}
        </ol>
      )}

      {done && awaiting && result && (
        <PendingQuestions
          key={(result.pendingQuestions ?? []).map((q) => q.id).join(",")}
          caseId={caseId}
          questions={result.pendingQuestions ?? []}
          onResolved={setResult}
        />
      )}

      {done && result?.status === "completed" && (
        <div className="mt-8 card flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <p className="text-sm text-slate-600">Suspected overcharge</p>
            <p className="text-2xl font-bold text-rose-600">
              {formatCurrency(
                result.findings.reduce((s, f) => s + f.suspectedImpact, 0),
              )}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {result.findings.length} findings ·{" "}
              {formatPercent(result.confidence)} confidence
            </p>
          </div>
          <Link
            href={`/cases/${caseId}/report`}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-3 font-semibold text-white shadow-sm transition hover:bg-brand-700"
          >
            View findings &amp; memo
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}
    </div>
  );
}
