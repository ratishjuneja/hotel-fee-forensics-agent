"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { ConfidenceComponent } from "@feeforensics/shared";
import { cn, formatPercent } from "@/lib/utils";

/**
 * Confidence shown as a number + meter that expands to its heuristic components
 * (docs/AppFlow.md §7 / CLAUDE.md §confidence). The per-component breakdown is
 * the report's real `confidenceBreakdown` — computed from the user's run, never
 * seeded. When the run carries no breakdown, only the bare number + meter
 * render; nothing is fabricated to fill the expansion.
 */
export function ConfidenceMeter({
  confidence,
  breakdown,
}: {
  confidence: number;
  breakdown?: ConfidenceComponent[];
}) {
  const [open, setOpen] = useState(false);
  const pct = Math.round(confidence * 100);
  const components = breakdown ?? [];
  const expandable = components.length > 0;

  const head = (
    <div className="flex items-baseline gap-2">
      <span className="font-mono text-3xl font-semibold tabular-nums text-foreground">
        {formatPercent(confidence)}
      </span>
      {expandable && (
        <ChevronDown
          className={cn(
            "h-4 w-4 text-subtle transition-transform",
            open && "rotate-180",
          )}
        />
      )}
    </div>
  );

  return (
    <div className="w-full min-w-[13rem]">
      {expandable ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between text-left"
          aria-expanded={open}
        >
          {head}
          <span className="text-xs text-subtle">
            {open ? "Hide" : "How it's scored"}
          </span>
        </button>
      ) : (
        head
      )}

      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-3">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>

      {expandable && open && (
        <ul className="mt-4 space-y-3">
          {components.map((c) => {
            const full = c.points >= c.max;
            return (
              <li key={c.key}>
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="font-medium text-foreground">{c.label}</span>
                  <span className="shrink-0 font-mono tabular-nums text-muted">
                    <span className={cn(full ? "text-success" : "text-foreground")}>
                      +{c.points}
                    </span>
                    <span className="text-subtle">/{c.max}</span>
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      full ? "bg-success" : c.points === 0 ? "bg-danger/50" : "bg-primary",
                    )}
                    style={{ width: `${c.max ? (c.points / c.max) * 100 : 0}%` }}
                  />
                </div>
                {c.explanation && (
                  <p className="mt-1 text-xs leading-relaxed text-muted">
                    {c.explanation}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
