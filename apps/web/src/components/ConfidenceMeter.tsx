"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn, formatPercent } from "@/lib/utils";

/**
 * Confidence shown as a number that expands to its heuristic components
 * (docs/AppFlow.md §7 / CLAUDE.md §confidence). The component values are the
 * authored ground truth for the Harborline case (data/demo/05_expected_answer.md):
 * a visible SUM to 96, where F3's missing owner approval is the only deduction
 * (evidence support 16/20). TODO(contract): once the API returns a
 * `confidenceBreakdown`, drive these from the response instead of this constant.
 */
const COMPONENTS = [
  { label: "Contract clarity", points: 25, max: 25 },
  { label: "Data completeness", points: 25, max: 25 },
  { label: "Calculation match", points: 20, max: 20 },
  { label: "Evidence support", points: 16, max: 20 },
  { label: "Prior-month consistency", points: 10, max: 10 },
];

export function ConfidenceMeter({ confidence }: { confidence: number }) {
  const [open, setOpen] = useState(false);
  const pct = Math.round(confidence * 100);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-left"
      >
        <span className="text-2xl font-bold text-slate-900">
          {formatPercent(confidence)}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-slate-400 transition",
            open && "rotate-180",
          )}
        />
      </button>
      <div className="mt-1 h-2 w-40 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-brand-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      {open && (
        <ul className="mt-3 space-y-1.5">
          {COMPONENTS.map((c) => (
            <li
              key={c.label}
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
