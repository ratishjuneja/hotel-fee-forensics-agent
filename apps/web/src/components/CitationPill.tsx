"use client";

import { FileText, PanelRightOpen } from "lucide-react";
import type { Citation } from "@feeforensics/shared";
import { useEvidence } from "./EvidenceProvider";

/**
 * Renders a clause/line citation with its quote visible (per docs/Design.md,
 * citations must be visible without deep interaction). When the citation
 * resolves to a bundled source document, the pill becomes a button that opens
 * the evidence drawer with the exact clause/line highlighted.
 */
export function CitationPill({ citation }: { citation: Citation }) {
  const { open, canOpen } = useEvidence();
  const label = citation.sectionLabel ?? citation.documentName;
  const clickable = canOpen(citation);

  const inner = (
    <>
      <div className="flex items-center gap-1.5 text-xs font-semibold text-brand-700">
        <FileText className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 flex-1">{label}</span>
        {clickable && (
          <PanelRightOpen className="h-3.5 w-3.5 shrink-0 text-brand-400 transition group-hover:text-brand-600" />
        )}
      </div>
      {citation.quote && (
        <p className="mt-1 text-xs italic text-slate-500">“{citation.quote}”</p>
      )}
    </>
  );

  if (!clickable) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
        {inner}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => open(citation)}
      title="View source document"
      className="group w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-left transition hover:border-brand-300 hover:bg-brand-50/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
    >
      {inner}
    </button>
  );
}
