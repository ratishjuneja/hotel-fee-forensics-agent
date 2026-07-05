"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { ConfidenceComponent } from "@feeforensics/shared";
import { cn, formatPercent } from "@/lib/utils";

/**
 * Confidence shown as a number that expands to its heuristic components
 * (docs/AppFlow.md §7 / CLAUDE.md §confidence). The per-component breakdown is
 * the report's real `confidenceBreakdown` — computed from the user's run, never
 * seeded. When the run carries no breakdown, only the bare number + bar render;
 * nothing is fabricated to fill the expansion.
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

  const number = (
    <span className="text-2xl font-bold text-slate-900">
      {formatPercent(confidence)}
    </span>
  );

  return (
    <div>
      {expandable ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 text-left"
          aria-expanded={open}
        >
          {number}
          <ChevronDown
            className={cn(
              "h-4 w-4 text-slate-400 transition",
              open && "rotate-180",
            )}
          />
        </button>
      ) : (
        number
      )}
      <div className="mt-1 h-2 w-40 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-brand-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      {expandable && open && (
        <ul className="mt-3 space-y-1.5">
          {components.map((c) => (
            <li
              key={c.key}
              title={c.explanation}
              className="flex items-center justify-between gap-4 text-xs"
            >
              <span className="text-slate-600">{c.label}</span>
              <span
                className={cn(
                  "font-mono font-medium",
                  c.points === 0 ? "text-slate-400" : "text-slate-700",
                )}
              >
                +{c.points}
                <span className="text-slate-400">/{c.max}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
