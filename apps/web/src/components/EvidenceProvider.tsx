"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { FileText, Landmark, Receipt, Table2, X } from "lucide-react";
import type { Citation } from "@feeforensics/shared";
import {
  resolveCitation,
  type DocKind,
  type EvidenceTarget,
  type SourceDocument,
} from "@/lib/documents";
import { cn, formatCurrency } from "@/lib/utils";

interface Target extends EvidenceTarget {
  citation: Citation;
}

interface EvidenceContextValue {
  /** Open the evidence drawer for a citation (no-op if the doc is unknown). */
  open: (citation: Citation) => void;
  /** Whether the citation resolves to a viewable source document. */
  canOpen: (citation: Citation) => boolean;
}

const EvidenceContext = createContext<EvidenceContextValue | null>(null);

/** Opens the source-document drawer for a citation. Safe to call outside a
 * provider — returns a no-op so citations still render as plain pills. */
export function useEvidence(): EvidenceContextValue {
  return (
    useContext(EvidenceContext) ?? { open: () => {}, canOpen: () => false }
  );
}

const KIND_ICON: Record<DocKind, typeof FileText> = {
  contract: Landmark,
  statement: Table2,
  invoice: Receipt,
};

const KIND_LABEL: Record<DocKind, string> = {
  contract: "Agreement",
  statement: "Operating statement",
  invoice: "Invoice / support",
};

export function EvidenceProvider({
  children,
  documents,
}: {
  children: React.ReactNode;
  /**
   * Source-document registry citations resolve against, built from the case's
   * parsed uploaded documents so a citation opens what the agent actually read.
   * Omit (or pass none) and citations render as plain, non-clickable pills.
   */
  documents?: Record<string, SourceDocument>;
}) {
  const [target, setTarget] = useState<Target | null>(null);

  const open = useCallback(
    (citation: Citation) => {
      const resolved = resolveCitation(citation, documents);
      if (resolved) setTarget({ ...resolved, citation });
    },
    [documents],
  );

  const canOpen = useCallback(
    (citation: Citation) => resolveCitation(citation, documents) !== null,
    [documents],
  );

  const value = useMemo(() => ({ open, canOpen }), [open, canOpen]);

  return (
    <EvidenceContext.Provider value={value}>
      {children}
      {target && (
        <EvidenceDrawer target={target} onClose={() => setTarget(null)} />
      )}
    </EvidenceContext.Provider>
  );
}

function EvidenceDrawer({
  target,
  onClose,
}: {
  target: Target;
  onClose: () => void;
}) {
  const { doc, anchor, citation } = target;
  const scrollRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const Icon = KIND_ICON[doc.kind];

  // Close on Escape; move focus to the close button on open.
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Scroll the highlighted clause/line into view.
  useEffect(() => {
    if (!anchor) return;
    const el = scrollRef.current?.querySelector(`#${CSS.escape(anchor)}`);
    el?.scrollIntoView({ block: "center" });
  }, [anchor]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-slate-900/40 animate-[fadein_0.15s_ease-out]"
        onClick={onClose}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Source: ${doc.name}`}
        className="relative flex h-full w-full max-w-xl flex-col bg-white shadow-2xl animate-[slidein_0.2s_ease-out]"
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand-600">
              <Icon className="h-4 w-4" />
              {KIND_LABEL[doc.kind]} · source document
            </div>
            <h2 className="mt-1 text-lg font-bold text-slate-900">{doc.name}</h2>
            <p className="mt-1 text-sm text-slate-500">{doc.synopsis}</p>
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="Close source document"
            className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {citation.sectionLabel && (
          <div className="border-b border-amber-100 bg-amber-50/70 px-5 py-2.5 text-xs text-amber-800">
            <span className="font-semibold">Cited here:</span>{" "}
            {citation.sectionLabel}
          </div>
        )}

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-5">
          {doc.sections && (
            <div className="space-y-4">
              {doc.sections.map((s) => (
                <section
                  key={s.anchor}
                  id={s.anchor}
                  className={cn(
                    "rounded-lg border p-4 transition",
                    s.anchor === anchor
                      ? "border-brand-300 bg-brand-50/60 ring-1 ring-brand-200"
                      : "border-slate-100",
                  )}
                >
                  <h3 className="text-sm font-bold text-slate-900">
                    {s.heading}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                    {s.anchor === anchor && citation.quote
                      ? highlightQuote(s.body, citation.quote)
                      : s.body}
                  </p>
                </section>
              ))}
            </div>
          )}

          {doc.groups && (
            <div className="space-y-6">
              {doc.groups.map((g) => (
                <section key={g.title}>
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                    {g.title}
                  </h3>
                  <div className="overflow-hidden rounded-lg border border-slate-100">
                    <table className="w-full text-sm">
                      <tbody className="divide-y divide-slate-100">
                        {g.lines.map((l) => (
                          <tr
                            key={l.anchor}
                            id={l.anchor}
                            className={cn(
                              l.anchor === anchor && "bg-brand-50 ring-1 ring-inset ring-brand-200",
                              l.anchor !== anchor && l.flagged && "bg-amber-50/50",
                              l.emphasis && "bg-slate-50 font-semibold",
                            )}
                          >
                            <td className="px-3 py-2 align-top">
                              <span
                                className={cn(
                                  l.emphasis
                                    ? "text-slate-900"
                                    : "text-slate-600",
                                )}
                              >
                                {l.label}
                              </span>
                              {l.note && (
                                <span className="mt-0.5 block text-xs italic text-amber-700">
                                  {l.note}
                                </span>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-right align-top font-mono text-slate-700">
                              {typeof l.amount === "number"
                                ? formatCurrency(l.amount)
                                : ""}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))}
            </div>
          )}

          <p className="mt-6 text-center text-xs text-slate-400">
            Rendered from your uploaded source document
          </p>
        </div>
      </aside>
    </div>
  );
}

/** Wrap the cited quote inside the section body with a highlight. */
function highlightQuote(body: string, quote: string): React.ReactNode {
  const at = body.indexOf(quote);
  if (at === -1) return body;
  return (
    <>
      {body.slice(0, at)}
      <mark className="rounded bg-amber-200/70 px-0.5 text-slate-900">
        {quote}
      </mark>
      {body.slice(at + quote.length)}
    </>
  );
}
