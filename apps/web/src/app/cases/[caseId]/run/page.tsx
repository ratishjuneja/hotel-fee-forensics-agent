"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Calculator,
  CheckCircle2,
  Cpu,
  HelpCircle,
  Loader2,
  Play,
  ScrollText,
  Search,
  Sparkles,
} from "lucide-react";
import type { CaseStatusResponse, RunAuditResponse } from "@feeforensics/shared";
import { ApiError, getCaseStatus, runAudit } from "@/lib/api";
import { PendingQuestions } from "@/components/PendingQuestions";
import { TraceRow } from "@/components/TraceRow";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAutoScroll } from "@/lib/useAutoScroll";
import { formatCurrency, formatPercent } from "@/lib/utils";

// Deliberate per-step reveal pace. The computation is already done by the time
// the trace renders — this only paces the *visible* reveal so a person (or a
// demo-video viewer) can read each step's title and result before the next
// appears. Subtle, for readability, not drama.
const STEP_DELAY_MS = 900;
const FIRST_STEP_MS = 450;

/**
 * Agent run for an uploaded case. There is deliberately no bundled-replay
 * fallback: replaying canned output for someone else's documents would fake an
 * analysis. Every trace step, finding, and number comes from the live run;
 * failures surface honestly instead.
 *
 * The run NEVER auto-starts: the page shows the investigation plan and waits for
 * an explicit "Begin audit" click. Only that click kicks off `runAudit` — no run
 * fires on page load or on navigation here. Once started, the trace reveals step
 * by step and the viewport keeps re-centering on the working frontier.
 */
export default function CaseRunPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const [caseInfo, setCaseInfo] = useState<CaseStatusResponse | null>(null);
  const [started, setStarted] = useState(false);
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

  // The audit runs ONLY after the user clicks "Begin audit" (started === true).
  // Nothing fires on mount, so landing on this page never triggers a run.
  useEffect(() => {
    if (!started) return;
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
  }, [caseId, attempt, started]);

  // Reveal trace steps one at a time so the run reads as live.
  useEffect(() => {
    if (!result) return;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    result.trace.forEach((_, i) => {
      const t = setTimeout(
        () => setVisible((c) => Math.max(c, i + 1)),
        FIRST_STEP_MS + i * STEP_DELAY_MS,
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
            {started ? " every step below is real." : " review the plan, then begin."}
          </p>
        </div>
        <RunStatus
          started={started}
          error={!!error}
          done={done}
          awaiting={!!awaiting}
        />
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

      {!error && !started && <PlanGate onBegin={() => setStarted(true)} />}

      {!error && started && (
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
  started,
  error,
  done,
  awaiting,
}: {
  started: boolean;
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
  if (!started) {
    return (
      <Pill className="bg-surface-2 text-muted ring-1 ring-inset ring-border">
        <Play className="h-4 w-4" />
        Ready to run
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

/** The five-step investigation plan the agent will follow, once told to. */
const PLAN = [
  { kind: "LLM", icon: Sparkles, label: "Plan the investigation" },
  { kind: "TOOL", icon: Search, label: "Retrieve the fee clauses & the month's statements" },
  { kind: "TOOL", icon: Calculator, label: "Recompute every fee, deterministically" },
  { kind: "TOOL", icon: Search, label: "Check for excluded revenue & anomalies" },
  { kind: "LLM", icon: ScrollText, label: "Write the cited memo & dispute email" },
] as const;

/**
 * Pre-run gate: shows the plan the agent will follow and holds until the owner
 * clicks "Begin audit". Nothing runs before that click — the plan is a schematic
 * of the work, not a run in progress.
 */
function PlanGate({ onBegin }: { onBegin: () => void }) {
  return (
    <Card className="mt-8 animate-fade-in p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 rounded-full bg-primary" aria-hidden />
          <span className="text-sm font-semibold text-foreground">
            Investigation plan
          </span>
        </div>
        <span className="text-xs text-subtle">waiting to start</span>
      </div>

      <ol className="relative mt-5">
        <span
          className="absolute bottom-3 left-[1.05rem] top-3 w-px bg-border"
          aria-hidden
        />
        {PLAN.map((step, i) => {
          const isLlm = step.kind === "LLM";
          const Icon = step.icon;
          return (
            <li key={i} className="relative flex items-center gap-3 py-2.5">
              <span
                className={
                  "relative z-10 flex h-[2.1rem] w-[2.1rem] shrink-0 items-center justify-center rounded-full border bg-surface " +
                  (isLlm
                    ? "border-primary/30 text-primary"
                    : "border-success/30 text-success")
                }
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="flex-1 text-sm text-foreground">{step.label}</span>
              <span
                className={
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold " +
                  (isLlm
                    ? "bg-primary-soft text-primary-soft-foreground"
                    : "bg-success-soft text-success-soft-foreground")
                }
              >
                {isLlm ? <Sparkles className="h-3 w-3" /> : <Cpu className="h-3 w-3" />}
                {step.kind}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
        <p className="text-sm text-muted">
          Nothing runs until you start it. Review the plan, then begin.
        </p>
        <Button size="lg" onClick={onBegin}>
          <Play className="h-4 w-4" />
          Begin audit
        </Button>
      </div>
    </Card>
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
