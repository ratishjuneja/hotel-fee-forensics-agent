import { AlertTriangle, Cpu, RotateCcw, Sparkles } from "lucide-react";
import type { AgentTraceStep } from "@feeforensics/shared";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";

/** A step is part of the re-retrieval loop if it re-fetches after a warning. */
export function isLoopStep(step: AgentTraceStep): boolean {
  return /re-retrieval|ambiguous/i.test(`${step.title} ${step.outputSummary}`);
}

export function TraceRow({ step }: { step: AgentTraceStep }) {
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

export function KindBadge({ isTool }: { isTool: boolean }) {
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
