"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Cpu,
  Loader2,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import type { AgentTraceStep, RunAuditResponse } from "@feeforensics/shared";
import { runAudit } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { ApiErrorPanel } from "@/components/ApiErrorPanel";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";

/** A step is part of the re-retrieval loop if it re-fetches after a warning. */
function isLoopStep(step: AgentTraceStep): boolean {
  return /re-retrieval|ambiguous/i.test(`${step.title} ${step.outputSummary}`);
}

const STEP_DELAY_MS = 750;

export default function RunPage() {
  const [result, setResult] = useState<RunAuditResponse | null>(null);
  const [visible, setVisible] = useState(0);
  const [error, setError] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Kick off the audit run once.
  useEffect(() => {
    let cancelled = false;
    runAudit()
      .then((r) => !cancelled && setResult(r))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, []);

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

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <ApiErrorPanel message="The agent run could not start." />
      </div>
    );
  }

  const steps = result?.trace ?? [];
  const shown = steps.slice(0, visible);
  const done = result !== null && visible >= steps.length;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Agent Investigation
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Grand Harbor Hotel · June 2026 — the agent plans, retrieves,
            recomputes, and loops back on ambiguity.
          </p>
        </div>
        {!done ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-700">
            <Loader2 className="h-4 w-4 animate-spin" />
            Running
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            Complete
          </span>
        )}
      </header>

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

      {done && result && (
        <div className="mt-8 card flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <p className="text-sm text-slate-600">Suspected overcharge</p>
            <p className="text-2xl font-bold text-rose-600">
              {formatCurrency(
                result.findings.reduce((s, f) => s + f.suspectedImpact, 0),
              )}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {result.findings.length} findings · {formatPercent(result.confidence)}{" "}
              confidence
            </p>
          </div>
          <Link
            href="/cases/demo/report"
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

function TraceRow({ step }: { step: AgentTraceStep }) {
  const isTool = step.kind === "TOOL";
  const isWarning = step.status === "warning";
  const loop = isLoopStep(step);

  return (
    <li
      className={cn(
        "card animate-[fadein_0.3s_ease-out] p-4",
        isWarning && "border-amber-200 bg-amber-50/60",
        loop && "border-brand-300 bg-brand-50/50",
      )}
    >
      <div className="flex gap-3">
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
            isTool
              ? "bg-emerald-100 text-emerald-700"
              : "bg-brand-100 text-brand-700",
          )}
        >
          {loop ? <RotateCcw className="h-4 w-4" /> : step.stepNumber}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-900">{step.title}</span>
            <KindBadge isTool={isTool} />
            {isWarning && (
              <Badge className="bg-amber-100 text-amber-800">
                <AlertTriangle className="h-3 w-3" />
                variance
              </Badge>
            )}
            {loop && (
              <Badge className="bg-brand-100 text-brand-700">
                re-retrieval loop
              </Badge>
            )}
            {typeof step.evidenceCount === "number" && (
              <span className="text-xs text-slate-400">
                {step.evidenceCount} evidence
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-600">{step.outputSummary}</p>
          <p className="mt-0.5 text-xs text-slate-400">{step.inputSummary}</p>
        </div>
      </div>
    </li>
  );
}

function KindBadge({ isTool }: { isTool: boolean }) {
  return isTool ? (
    <Badge className="bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200">
      <Cpu className="h-3 w-3" />
      TOOL
    </Badge>
  ) : (
    <Badge className="bg-brand-100 text-brand-700 ring-1 ring-brand-200">
      <Sparkles className="h-3 w-3" />
      LLM
    </Badge>
  );
}
