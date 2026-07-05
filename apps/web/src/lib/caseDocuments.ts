import type { CaseSourceDocument } from "@feeforensics/shared";
import type { DocGroup, DocKind, DocLine, DocSection, SourceDocument } from "./documents";

/**
 * Turn the API's parsed source documents (GET /api/cases/:id/documents) into
 * the evidence viewer's `SourceDocument` shape, so an uploaded case's citations
 * open the documents the agent ACTUALLY read — not the bundled demo stand-ins.
 *
 * Nothing here is invented: the HMA text is split into its own clauses and each
 * CSV row is rendered verbatim. Section refs (`§4.2`) and per-row keywords are
 * derived from the content so citations from the deterministic parsers resolve
 * to the right clause/line, matching the demo registry's contract.
 */

const KIND_BY_DOC: Record<string, { kind: DocKind; synopsis: string }> = {
  doc_hma: {
    kind: "contract",
    synopsis: "The uploaded hotel management agreement — fee clauses, exclusions, and audit rights.",
  },
  doc_operating_statement: {
    kind: "statement",
    synopsis: "The uploaded operating statement — the revenue and profit the fees were billed on.",
  },
  doc_prior_month: {
    kind: "statement",
    synopsis: "The uploaded prior-month statement — the baseline for the anomaly checks.",
  },
  doc_misc_breakout: {
    kind: "statement",
    synopsis: "The uploaded supplementary schedule detailing a statement roll-up line.",
  },
  doc_support_pack: {
    kind: "invoice",
    synopsis: "The uploaded support / invoice pack backing the month's charges.",
  },
};

const slug = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "x";

/** Split an HMA's plain text into clause sections keyed by their number. */
function textToSections(docId: string, text: string): DocSection[] {
  const lines = text.split(/\r?\n/);
  const sections: DocSection[] = [];
  // A clause starts on a line like "4.1  BASE MANAGEMENT FEE." or "§4.3 ...".
  const headingRe = /^\s*§?\s*(\d+\.\d+(?:\.\d+)?)\s+(.+?)\.?\s*$/;

  let current: { ref: string; heading: string; body: string[] } | null = null;
  let preamble: string[] = [];
  const flush = () => {
    if (!current) return;
    const ref = `§${current.ref}`;
    sections.push({
      anchor: `${docId}-${slug(current.ref)}`,
      ref,
      heading: `${ref} — ${current.heading}`,
      body: current.body.join(" ").replace(/\s+/g, " ").trim(),
    });
    current = null;
  };

  for (const raw of lines) {
    const m = raw.match(headingRe);
    // Only treat a numbered line as a heading if it also has title-ish text
    // (avoids splitting on inline "(a) 4.3" cross-references).
    if (m && /[A-Za-z]/.test(m[2])) {
      flush();
      current = { ref: m[1], heading: m[2].trim(), body: [] };
    } else if (current) {
      current.body.push(raw.trim());
    } else if (raw.trim()) {
      preamble.push(raw.trim());
    }
  }
  flush();

  if (sections.length === 0) {
    // No clause structure detected — show the whole document as one section.
    return [
      {
        anchor: `${docId}-body`,
        ref: "",
        heading: "Document",
        body: text.replace(/\s+/g, " ").trim(),
      },
    ];
  }
  if (preamble.length > 0) {
    sections.unshift({
      anchor: `${docId}-preamble`,
      ref: "",
      heading: "Preamble",
      body: preamble.join(" ").replace(/\s+/g, " ").trim(),
    });
  }
  return sections;
}

/** Minimal RFC-4180-ish CSV row split (handles quoted cells with commas). */
function splitCsvRow(row: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < row.length; i++) {
    const c = row[i];
    if (inQuotes) {
      if (c === '"' && row[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      cells.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

const toAmount = (cell: string): number | undefined => {
  const n = Number(cell.replace(/[$,\s]/g, ""));
  return cell !== "" && Number.isFinite(n) ? n : undefined;
};

/** Render a CSV verbatim as one group of rows, keyworded for citation matching. */
function csvToGroups(docId: string, csv: string): DocGroup[] {
  const rows = csv
    .split(/\r?\n/)
    .map((r) => r.trim())
    .filter((r) => r.length > 0)
    .map(splitCsvRow);
  if (rows.length === 0) return [];

  const header = rows[0].map((h) => h.toLowerCase());
  const amountCol = header.findIndex((h) => /amount|total|value|\$/.test(h));

  const lines: DocLine[] = rows.slice(1).map((cells, i) => {
    const amount =
      amountCol >= 0
        ? toAmount(cells[amountCol] ?? "")
        : cells.map(toAmount).find((n) => n !== undefined);
    // Label = the meaningful non-numeric cells joined; keeps every value visible.
    const label =
      cells
        .filter((c, idx) => idx !== amountCol && c !== "" && toAmount(c) === undefined)
        .join(" · ") || cells.join(" · ");
    return {
      anchor: `${docId}-r${i}`,
      label,
      ...(amount !== undefined ? { amount } : {}),
      keywords: cells
        .join(" ")
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length > 2),
    };
  });

  return [{ title: rows[0].join(" · "), lines }];
}

function toSourceDocument(doc: CaseSourceDocument): SourceDocument {
  const meta = KIND_BY_DOC[doc.docId] ?? {
    kind: (doc.format === "text" ? "contract" : "statement") as DocKind,
    synopsis: "Uploaded source document.",
  };
  return {
    id: doc.docId,
    name: doc.name,
    kind: meta.kind,
    synopsis: meta.synopsis,
    ...(doc.format === "text"
      ? { sections: textToSections(doc.docId, doc.content) }
      : { groups: csvToGroups(doc.docId, doc.content) }),
  };
}

/** Build a citation-resolver registry from an uploaded case's parsed documents. */
export function buildCaseDocumentRegistry(
  docs: CaseSourceDocument[],
): Record<string, SourceDocument> {
  const registry: Record<string, SourceDocument> = {};
  for (const doc of docs) registry[doc.docId] = toSourceDocument(doc);
  return registry;
}
