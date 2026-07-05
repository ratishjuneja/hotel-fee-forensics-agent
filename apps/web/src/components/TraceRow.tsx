import { AlertTriangle, Cpu, RotateCcw, Sparkles } from "lucide-react";
import type { AgentTraceStep } from "@feeforensics/shared";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";

/** A step is part of the re-retrieval loop if it re-fetches after a warning. */
export function isLoopStep(step: AgentTraceStep): boolean {
  return /re-retrieval|ambiguous/i.test(`${step.title} ${step.outputSummary}`);
}

/**
 * One node in the agent-trace timeline: a dot on a connector rail (numbered, or
 * a loop glyph on re-retrieval) plus a content card. LLM steps read primary,
 * TOOL steps read success; warnings and loop-backs carry their own accent.
 */
export function TraceRow({
  step,
  isLast,
}: {
  step: AgentTraceStep;
  isLast?: boolean;
}) {
  const isTool = step.kind === "TOOL";
  const isWarning = step.status === "warning";
  const loop = isLoopStep(step);

  return (
    <li className="relative flex animate-fade-up gap-4 pb-3 last:pb-0">
      {/* connector rail */}
      {!isLast && (
        <span
          className="absolute left-5 top-11 h-[calc(100%-2.75rem)] w-px -translate-x-1/2 bg-border"
          aria-hidden
        />
      )}

      {/* node */}
      <span
        className={cn(
          "relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-sm font-semibold",
          loop
            ? "border-primary/40 bg-primary-soft text-primary-soft-foreground"
            : isWarning
              ? "border-warning/40 bg-warning-soft text-warning-soft-foreground"
              : isTool
                ? "border-success/40 bg-success-soft text-success-soft-foreground"
                : "border-primary/40 bg-primary-soft text-primary-soft-foreground",
        )}
      >
        {loop ? <RotateCcw className="h-4 w-4" /> : step.stepNumber}
      </span>

      {/* content */}
      <div
        className={cn(
          "min-w-0 flex-1 rounded-xl border bg-surface p-4 shadow-sm",
          isWarning
            ? "border-warning/30"
            : loop
              ? "border-primary/30"
              : "border-border",
        )}
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <span className="font-semibold text-foreground">{step.title}</span>
          <KindBadge isTool={isTool} />
          {isWarning && (
            <Badge variant="warning">
              <AlertTriangle className="h-3 w-3" />
              variance
            </Badge>
          )}
          {loop && (
            <Badge variant="primary">
              <RotateCcw className="h-3 w-3" />
              re-retrieval loop
            </Badge>
          )}
          {typeof step.evidenceCount === "number" && (
            <span className="ml-auto font-mono text-xs text-subtle">
              {step.evidenceCount} evidence
            </span>
          )}
        </div>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          {step.outputSummary}
        </p>
        {step.inputSummary && (
          <p className="mt-1 text-xs text-subtle">{step.inputSummary}</p>
        )}
      </div>
    </li>
  );
}

export function KindBadge({ isTool }: { isTool: boolean }) {
  return isTool ? (
    <Badge variant="success">
      <Cpu className="h-3 w-3" />
      TOOL
    </Badge>
  ) : (
    <Badge variant="primary">
      <Sparkles className="h-3 w-3" />
      LLM
    </Badge>
  );
}
