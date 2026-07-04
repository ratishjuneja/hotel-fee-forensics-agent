import { FileText } from "lucide-react";
import type { Citation } from "@feeforensics/shared";

/**
 * Renders a clause/line citation with its quote visible (no click needed) —
 * per docs/Design.md, citations must be visible without deep interaction.
 */
export function CitationPill({ citation }: { citation: Citation }) {
  const label = citation.sectionLabel ?? citation.documentName;
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-brand-700">
        <FileText className="h-3.5 w-3.5" />
        {label}
      </div>
      {citation.quote && (
        <p className="mt-1 text-xs italic text-slate-500">“{citation.quote}”</p>
      )}
    </div>
  );
}
