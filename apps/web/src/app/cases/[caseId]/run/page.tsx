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
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAutoScroll } from "@/lib/useAutoScroll";
import { formatCurrency, formatPercent } from "@/lib/utils";

const STEP_DELAY_MS = 750;

/**
 * Agent run for an uploaded case. There is deliberately no bundled-replay
 * fallback: replaying canned output for someone else's documents would fake an
 * analysis. Every trace step, finding, and number comes from the live run;
 * failures surface honestly instead. As the trace reveals, the viewport keeps
 * re-centering on the working frontier.
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
  const completed = done && result?.status === "completed";

  // Keep the newest revealed step / result re-centered as work progresses.
  const frontierRef = useAutoScroll<HTMLDivElement>(
    `${visible}:${done}:${awaiting}`,
    { enabled: !error && (visible > 0 || done) },
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-subtle">
            Agent investigation
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {caseInfo ? caseInfo.hotelName : "Running the audit"}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {caseInfo?.auditMonth ? `${caseInfo.auditMonth} · ` : ""}
            The agent plans, retrieves, recomputes, and loops back on ambiguity —
            every step below is real.
          </p>
        </div>
        <RunStatus error={!!error} done={done} awaiting={!!awaiting} />
      </header>

      {error && (
        <Card className="mt-8 border-warning/30 bg-warning-soft/40 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning-soft-foreground" />
            <div>
              <p className="font-semibold text-foreground">
                The audit could not run.
              </p>
              <p className="mt-1 text-sm text-muted">{error.message}</p>
              <div className="mt-4 flex flex-wrap gap-3">
                {error.status === 409 ? (
                  <Button asChild size="sm">
                    <Link href={`/cases/${caseId}`}>Back to parsing status</Link>
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => setAttempt((a) => a + 1)}>
                    Retry the run
                  </Button>
                )}
                <Button asChild variant="outline" size="sm">
                  <Link href="/cases/new">Upload different documents</Link>
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {!error && (
        <ol className="mt-8">
          {shown.map((step, i) => (
            <TraceRow
              key={step.id}
              step={step}
              isLast={done && i === shown.length - 1}
            />
          ))}
          {!done && <FrontierNode label={result ? "Working…" : "Contacting the agent…"} />}
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

      {completed && result && (
        <Card className="mt-8 flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
          <div>
            <p className="text-sm text-muted">Suspected overcharge</p>
            <p className="mt-0.5 font-mono text-3xl font-semibold tabular-nums text-danger">
              {formatCurrency(
                result.findings.reduce((s, f) => s + f.suspectedImpact, 0),
              )}
            </p>
            <p className="mt-1 text-xs text-subtle">
              {result.findings.length}{" "}
              {result.findings.length === 1 ? "finding" : "findings"} ·{" "}
              {formatPercent(result.confidence)} confidence
            </p>
          </div>
          <Button asChild size="lg">
            <Link href={`/cases/${caseId}/report`}>
              See the findings
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </Card>
      )}

      {/* Auto-scroll target: the working frontier / final result. */}
      <div ref={frontierRef} aria-hidden className="h-px" />
    </div>
  );
}

function RunStatus({
  error,
  done,
  awaiting,
}: {
  error: boolean;
  done: boolean;
  awaiting: boolean;
}) {
  if (error) {
    return (
      <Pill className="bg-warning-soft text-warning-soft-foreground">
        <AlertTriangle className="h-4 w-4" />
        Failed
      </Pill>
    );
  }
  if (!done) {
    return (
      <Pill className="bg-primary-soft text-primary-soft-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Running
      </Pill>
    );
  }
  if (awaiting) {
    return (
      <Pill className="bg-warning-soft text-warning-soft-foreground">
        <HelpCircle className="h-4 w-4" />
        Needs your input
      </Pill>
    );
  }
  return (
    <Pill className="bg-success-soft text-success-soft-foreground">
      <CheckCircle2 className="h-4 w-4" />
      Complete
    </Pill>
  );
}

function Pill({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${className ?? ""}`}
    >
      {children}
    </span>
  );
}

/** The pulsing node at the head of the rail while the agent is still working. */
function FrontierNode({ label }: { label: string }) {
  return (
    <li className="relative flex animate-fade-in items-center gap-4">
      <span className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-surface">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-primary" />
      </span>
      <span className="flex items-center gap-2 text-sm text-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        {label}
      </span>
    </li>
  );
}
