"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import type { RunAuditResponse } from "@feeforensics/shared";
import { runAudit } from "@/lib/api";
import { CACHED_RUN } from "@/lib/cachedRun";
import { TraceRow } from "@/components/TraceRow";
import { formatCurrency, formatPercent } from "@/lib/utils";

const STEP_DELAY_MS = 750;
/** No first trace event within this window → replay the bundled run (AppFlow §6). */
const FALLBACK_MS = 10_000;

export default function RunPage() {
  const [result, setResult] = useState<RunAuditResponse | null>(null);
  const [visible, setVisible] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Kick off the audit run, but never let the demo stall: whichever of the live
  // run or the ~10s fallback timer resolves first "wins", and later arrivals are
  // ignored so the trace never swaps mid-run. If the API is unreachable we replay
  // immediately. The fallback is SILENT — no audience-visible error (AppFlow §6).
  useEffect(() => {
    let alive = true;
    let committed = false;

    const commit = (r: RunAuditResponse, cached: boolean) => {
      if (!alive || committed) return;
      committed = true;
      if (cached) {
        console.info(
          "[FeeForensics] Live run unavailable — replaying bundled run.",
        );
      }
      setResult(r);
    };

    runAudit()
      .then((r) => commit(r, false))
      .catch(() => commit(CACHED_RUN, true)); // API unreachable → replay now

    const fallback = setTimeout(() => commit(CACHED_RUN, true), FALLBACK_MS);
    return () => {
      alive = false;
      clearTimeout(fallback);
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
            The Harborline Hotel · June 2026 — the agent plans, retrieves,
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
