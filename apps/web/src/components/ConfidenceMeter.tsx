"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn, formatPercent } from "@/lib/utils";

/**
 * Confidence shown as a number that expands to its heuristic components
 * (docs/AppFlow.md §7 / CLAUDE.md §confidence). NOTE: the API contract only
 * returns a single `confidence` number today, so the component breakdown below
 * is a static demo representation of the heuristic. TODO(contract): ask Person A
 * to return a `confidenceBreakdown` so these numbers are real, not illustrative.
 */
const COMPONENTS = [
  { label: "Clause found", points: 25, max: 25 },
  { label: "Financial inputs found", points: 25, max: 25 },
  { label: "Calculation variance clear", points: 21, max: 25 },
  { label: "Cause explained by evidence", points: 15, max: 15 },
  { label: "Prior-month support", points: 0, max: 10 },
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
