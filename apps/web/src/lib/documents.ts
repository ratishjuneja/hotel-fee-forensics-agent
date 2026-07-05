import type { Citation } from "@feeforensics/shared";

/**
 * Evidence-viewer document SHAPE + citation resolver.
 *
 * There are deliberately NO bundled documents here: every source document the
 * evidence drawer shows is built at runtime from the case's own parsed uploads
 * (GET /api/cases/:id/documents → lib/caseDocuments.ts). This module only
 * defines the `SourceDocument` shape those uploads are mapped into and resolves
 * a citation to the specific clause/line to highlight.
 */

export type DocKind = "contract" | "statement" | "invoice";

/** A clause in a contract-style document. */
export interface DocSection {
  /** Stable anchor for scroll-to + highlight. */
  anchor: string;
  /** Section reference token, e.g. "§4.3" — matched against citation labels. */
  ref: string;
  heading: string;
  /** Body text; a cited `quote` is expected to appear verbatim here. */
  body: string;
}

/** A line in a statement- or invoice-style document. */
export interface DocLine {
  anchor: string;
  label: string;
  amount?: number;
  note?: string;
  emphasis?: "subtotal" | "total";
  /** Highlighted because a finding depends on it. */
  flagged?: boolean;
  /** Lowercased tokens used to match a citation to this line. */
  keywords?: string[];
}

export interface DocGroup {
  title: string;
  lines: DocLine[];
}

export interface SourceDocument {
  id: string;
  name: string;
  kind: DocKind;
  synopsis: string;
  /** Contract documents use sections; statements/invoices use groups. */
  sections?: DocSection[];
  groups?: DocGroup[];
}

export interface EvidenceTarget {
  doc: SourceDocument;
  /** Anchor of the section/line to scroll to and highlight, if resolved. */
  anchor?: string;
}

/**
 * Resolve a citation to its source document and the specific clause/line to
 * highlight. Matches sections by the longest section ref present in the
 * citation label (so "§4.1(b)" would win over "§4.1"), and statement/invoice
 * lines by keyword overlap with the citation label or quote.
 *
 * `registry` is built from the uploaded case's parsed documents (see
 * lib/caseDocuments.ts). It defaults to empty: a citation whose document is not
 * in the registry resolves to `null`, so the pill renders as plain text rather
 * than a broken drawer link.
 */
export function resolveCitation(
  citation: Citation,
  registry: Record<string, SourceDocument> = {},
): EvidenceTarget | null {
  const doc = registry[citation.documentId];
  if (!doc) return null;

  const label = citation.sectionLabel ?? "";
  const hay = `${label} ${citation.quote ?? ""}`.toLowerCase();

  if (doc.sections) {
    const matches = doc.sections
      .filter((s) => s.ref && label.includes(s.ref))
      .sort((a, b) => b.ref.length - a.ref.length);
    if (matches[0]) return { doc, anchor: matches[0].anchor };
    // Fallback: the section whose body contains the quoted text.
    const byQuote = doc.sections.find(
      (s) => citation.quote && s.body.includes(citation.quote),
    );
    return { doc, anchor: byQuote?.anchor };
  }

  if (doc.groups) {
    const line = doc.groups
      .flatMap((g) => g.lines)
      .find((l) => l.keywords?.some((k) => hay.includes(k)));
    return { doc, anchor: line?.anchor };
  }

  return { doc };
}
