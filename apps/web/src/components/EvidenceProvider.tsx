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
import { FileText, Landmark, Receipt, Table2 } from "lucide-react";
import type { Citation } from "@feeforensics/shared";
import {
  resolveCitation,
  type DocKind,
  type EvidenceTarget,
  type SourceDocument,
} from "@/lib/documents";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/Sheet";
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
      <Sheet open={target !== null} onOpenChange={(o) => !o && setTarget(null)}>
        {target && <EvidenceDrawer target={target} />}
      </Sheet>
    </EvidenceContext.Provider>
  );
}

function EvidenceDrawer({ target }: { target: Target }) {
  const { doc, anchor, citation } = target;
  const scrollRef = useRef<HTMLDivElement>(null);
  const Icon = KIND_ICON[doc.kind];

  // Scroll the highlighted clause/line into view once the drawer has mounted.
  useEffect(() => {
    if (!anchor) return;
    const el = scrollRef.current?.querySelector(`#${CSS.escape(anchor)}`);
    el?.scrollIntoView({ block: "center" });
  }, [anchor]);

  return (
    <SheetContent aria-label={`Source: ${doc.name}`} className="max-w-xl">
      <header className="border-b border-border p-5 pr-14">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
          <Icon className="h-4 w-4" />
          {KIND_LABEL[doc.kind]} · source document
        </div>
        <SheetTitle className="mt-1.5">{doc.name}</SheetTitle>
        <SheetDescription className="mt-1">{doc.synopsis}</SheetDescription>
      </header>

      {citation.sectionLabel && (
        <div className="border-b border-warning/20 bg-warning-soft/50 px-5 py-2.5 text-xs text-warning-soft-foreground">
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
                  "rounded-lg border p-4 transition-colors",
                  s.anchor === anchor
                    ? "border-primary/40 bg-primary-soft/50 ring-1 ring-primary/30"
                    : "border-border",
                )}
              >
                <h3 className="text-sm font-bold text-foreground">
                  {s.heading}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
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
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-subtle">
                  {g.title}
                </h3>
                <div className="overflow-hidden rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-border">
                      {g.lines.map((l) => (
                        <tr
                          key={l.anchor}
                          id={l.anchor}
                          className={cn(
                            l.anchor === anchor &&
                              "bg-primary-soft/60 ring-1 ring-inset ring-primary/30",
                            l.anchor !== anchor &&
                              l.flagged &&
                              "bg-warning-soft/40",
                            l.emphasis && "bg-surface-2 font-semibold",
                          )}
                        >
                          <td className="px-3 py-2 align-top">
                            <span
                              className={cn(
                                l.emphasis ? "text-foreground" : "text-muted",
                              )}
                            >
                              {l.label}
                            </span>
                            {l.note && (
                              <span className="mt-0.5 block text-xs italic text-warning-soft-foreground">
                                {l.note}
                              </span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right align-top font-mono tabular-nums text-foreground">
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

        <p className="mt-6 text-center text-xs text-subtle">
          Rendered from your uploaded source document
        </p>
      </div>
    </SheetContent>
  );
}

/** Wrap the cited quote inside the section body with a highlight. */
function highlightQuote(body: string, quote: string): React.ReactNode {
  const at = body.indexOf(quote);
  if (at === -1) return body;
  return (
    <>
      {body.slice(0, at)}
      <mark className="rounded bg-warning/40 px-0.5 text-foreground">
        {quote}
      </mark>
      {body.slice(at + quote.length)}
    </>
  );
}
