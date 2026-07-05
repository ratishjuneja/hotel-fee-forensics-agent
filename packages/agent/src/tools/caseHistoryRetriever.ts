/**
 * Case-history / support-pack evidence tool (deterministic — no LLM).
 *
 * This is the evidence side of the agent's re-retrieval loop. When the anomaly
 * checker flags a material jump (centralized services $7,500 → $28,000), the
 * orchestrator comes back for the case history: the prior-month statement goes
 * through `statementParser`, and the support/invoice pack comes through here.
 *
 * `parseSupportPack` turns the pack CSV into structured, cited records —
 * including rows that document an *absence* (the Harborline pack lists
 * `APPROVAL-0612-03` with status MISSING). `checkSupport` then answers Check 5
 * deterministically: is this charge backed by an invoice, does it need owner
 * approval (HMA §5.1 threshold), and is that approval on file?
 *
 * Don't-invent rules: a subject with no matching records is `needs_review`
 * (the pack may simply be incomplete), a documented missing requirement is
 * `unsupported` (dispute-ready), and an amount that doesn't corroborate goes
 * to review — the tool never assumes support exists.
 */

import type { Citation } from "@feeforensics/shared";

import { neutralizeFormula, parseCsv, parseMoney } from "./statementParser.js";

export type SupportDocType = "invoice" | "owner_approval" | "other";

export type SupportStatus = "present" | "missing" | "not_applicable" | "unknown";

export interface SupportRecord {
  /** Pack reference like `INV-0612-03`; null for doc-less annotation rows. */
  docId: string | null;
  type: SupportDocType;
  /** The charge or line the document supports, as written in the pack. */
  relatesTo: string;
  amount: number | null;
  status: SupportStatus;
  note: string;
  citation: Citation;
}

export interface SupportPackParseOptions {
  sourceDocumentId: string;
  documentName: string;
}

export interface ParsedSupportPack {
  records: SupportRecord[];
  warnings: string[];
}

export interface SupportCheckQuery {
  /** The charge being verified, e.g. "Centralized Services". */
  subject: string;
  /** The charged amount the evidence must corroborate. */
  amount: number;
  /** Owner-approval threshold (HMA §5.1 style); omit when approval is not in play. */
  approvalThreshold?: number;
}

export type SupportVerdict =
  | "supported"
  | "unsupported"
  | "needs_review"
  | "not_required";

export interface SupportCheckResult {
  verdict: SupportVerdict;
  approvalRequired: boolean;
  invoice?: SupportRecord;
  approval?: SupportRecord;
  /** Required document types that are not on file. */
  missing: ("invoice" | "owner_approval")[];
  explanation: string;
  citations: Citation[];
}

// --- Header resolution --------------------------------------------------------

type PackColumn = "doc_id" | "type" | "relates_to" | "amount" | "status" | "note";

const PACK_HEADER_ALIASES: Record<PackColumn, string[]> = {
  doc_id: ["doc id", "document id", "id", "ref", "reference"],
  type: ["type", "doc type", "document type"],
  relates_to: ["relates to", "relates", "subject", "for", "charge"],
  amount: ["amount", "value", "usd"],
  status: ["status", "state"],
  note: ["note", "notes", "comment", "comments"],
};

const normalizeHeader = (h: string) =>
  h.trim().toLowerCase().replace(/[_\s]+/g, " ").trim();

function resolvePackHeaders(headerRow: string[]): Record<PackColumn, number> {
  const normalized = headerRow.map(normalizeHeader);
  const idx = {} as Record<PackColumn, number>;
  for (const canonical of Object.keys(PACK_HEADER_ALIASES) as PackColumn[]) {
    const aliases = PACK_HEADER_ALIASES[canonical];
    idx[canonical] = normalized.findIndex((h) => aliases.includes(h));
  }
  return idx;
}

const cell = (row: string[], index: number): string =>
  index >= 0 ? (row[index] ?? "").trim() : "";

// --- Field classification -----------------------------------------------------

function classifyDocType(raw: string): SupportDocType | null {
  const t = raw.trim().toLowerCase().replace(/[_\s]+/g, " ");
  if (t === "invoice") return "invoice";
  if (t === "owner approval" || t === "approval") return "owner_approval";
  return null;
}

function classifyStatus(raw: string): SupportStatus | null {
  const s = raw.trim().toLowerCase().replace(/[_\s/]+/g, " ").trim();
  if (s === "present" || s === "on file") return "present";
  if (s === "missing" || s === "not on file" || s === "absent") return "missing";
  if (s === "n a" || s === "na" || s === "not applicable" || s === "none needed") {
    return "not_applicable";
  }
  return null;
}

// --- Parsing --------------------------------------------------------------------

export function parseSupportPack(
  csv: string,
  opts: SupportPackParseOptions,
): ParsedSupportPack {
  const warnings: string[] = [];
  const records: SupportRecord[] = [];

  const rows = parseCsv(csv);
  if (rows.length === 0) return { records, warnings };

  const cols = resolvePackHeaders(rows[0]!);
  if (cols.relates_to < 0 || cols.status < 0) {
    throw new Error(
      "support pack CSV is missing required 'relates to' / 'status' columns",
    );
  }

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]!;
    const rawDocId = cell(row, cols.doc_id);
    const rawType = cell(row, cols.type);
    const relatesTo = neutralizeFormula(cell(row, cols.relates_to));
    const rawAmount = cell(row, cols.amount);
    const rawStatus = cell(row, cols.status);
    const note = neutralizeFormula(cell(row, cols.note));

    if (relatesTo === "" && rawDocId === "" && rawStatus === "") continue;

    // Doc-less rows are annotations ("no support needed"); typing them "other"
    // without a warning keeps the pack's own commentary from reading as noise.
    let type: SupportDocType;
    if (rawType === "") {
      type = "other";
    } else {
      const classified = classifyDocType(rawType);
      if (!classified) {
        warnings.push(`Unrecognized document type "${rawType}" — kept as "other".`);
      }
      type = classified ?? "other";
    }

    let status: SupportStatus;
    const classifiedStatus = classifyStatus(rawStatus);
    if (!classifiedStatus) {
      warnings.push(
        `Unrecognized status "${rawStatus}" for "${relatesTo}" — kept as "unknown" (treated as not on file).`,
      );
      status = "unknown";
    } else {
      status = classifiedStatus;
    }

    let amount: number | null = null;
    if (rawAmount !== "") {
      try {
        amount = parseMoney(rawAmount);
      } catch {
        warnings.push(
          `Unparseable amount "${rawAmount}" for "${relatesTo}" — recorded without an amount.`,
        );
      }
    }

    const docId = rawDocId === "" ? null : neutralizeFormula(rawDocId);
    records.push({
      docId,
      type,
      relatesTo,
      amount,
      status,
      note,
      citation: {
        documentId: opts.sourceDocumentId,
        documentName: opts.documentName,
        sectionLabel: `Support Pack — ${docId ?? relatesTo}`,
        // r is 0-based with the header at 0, so r + 1 is the 1-based CSV row.
        row: r + 1,
        lineLabel: docId ?? relatesTo,
        quote: `${docId ?? "annotation"}: ${relatesTo} — ${rawStatus}${note ? ` (${note})` : ""}`,
      },
    });
  }

  return { records, warnings };
}

// --- Check 5: support verification ----------------------------------------------

const normalizeSubject = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** "Centralized Services" matches "Centralized Services charge" and vice versa. */
function subjectMatches(subject: string, relatesTo: string): boolean {
  const a = normalizeSubject(subject);
  const b = normalizeSubject(relatesTo);
  if (a === "" || b === "") return false;
  return a.includes(b) || b.includes(a);
}

const formatMoney = (n: number): string => {
  const sign = n < 0 ? "-" : "";
  const [int = "0", frac = "00"] = Math.abs(n).toFixed(2).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return frac === "00" ? `${sign}$${grouped}` : `${sign}$${grouped}.${frac}`;
};

export function checkSupport(
  query: SupportCheckQuery,
  records: SupportRecord[],
): SupportCheckResult {
  const approvalRequired =
    query.approvalThreshold !== undefined && query.amount > query.approvalThreshold;

  const matches = records.filter((r) => subjectMatches(query.subject, r.relatesTo));

  if (matches.length === 0) {
    // The pack may simply be incomplete — flag for a human, never assume.
    const missing: SupportCheckResult["missing"] = approvalRequired
      ? ["invoice", "owner_approval"]
      : ["invoice"];
    return {
      verdict: "needs_review",
      approvalRequired,
      missing,
      explanation:
        `No support documents found for "${query.subject}" (${formatMoney(query.amount)}) ` +
        "in the pack — human review required.",
      citations: [],
    };
  }

  const notApplicable = matches.find((r) => r.status === "not_applicable");
  if (notApplicable) {
    return {
      verdict: "not_required",
      approvalRequired: false,
      missing: [],
      explanation:
        `"${query.subject}" does not require support documentation` +
        (notApplicable.note ? `: ${notApplicable.note}` : "."),
      citations: [notApplicable.citation],
    };
  }

  const invoice = matches.find((r) => r.type === "invoice");
  const approval = matches.find((r) => r.type === "owner_approval");

  const missing: SupportCheckResult["missing"] = [];
  if (!invoice || invoice.status !== "present") missing.push("invoice");
  if (approvalRequired && (!approval || approval.status !== "present")) {
    missing.push("owner_approval");
  }

  const citations = matches
    .filter((r) => r === invoice || r === approval)
    .map((r) => r.citation);

  const result = (verdict: SupportVerdict, explanation: string): SupportCheckResult => {
    const out: SupportCheckResult = {
      verdict,
      approvalRequired,
      missing,
      explanation,
      citations,
    };
    if (invoice) out.invoice = invoice;
    if (approval) out.approval = approval;
    return out;
  };

  if (missing.length > 0) {
    const parts: string[] = [];
    if (invoice?.status === "present") {
      parts.push(
        `Invoice ${invoice.docId ?? ""} is on file for ${formatMoney(invoice.amount ?? query.amount)}`.trim(),
      );
    } else {
      parts.push(`No invoice is on file for the ${formatMoney(query.amount)} charge`);
    }
    if (missing.includes("owner_approval")) {
      const ref = approval?.docId ? ` (${approval.docId})` : "";
      parts.push(
        `the required owner approval${ref} is MISSING — the charge exceeds the ` +
          `${formatMoney(query.approvalThreshold!)} approval threshold`,
      );
    }
    return result(
      "unsupported",
      `${parts.join(", but ")}. The charge is unsupported pending approval or reversal.`,
    );
  }

  if (invoice && invoice.amount !== null && invoice.amount !== query.amount) {
    return result(
      "needs_review",
      `Invoice ${invoice.docId ?? ""} is on file for ${formatMoney(invoice.amount)}, ` +
        `but the charge is ${formatMoney(query.amount)} — amounts do not reconcile; human review required.`,
    );
  }

  return result(
    "supported",
    `Invoice ${invoice?.docId ?? ""} is on file and matches the ${formatMoney(query.amount)} charge` +
      (approvalRequired
        ? `; owner approval ${approval?.docId ?? ""} is on file.`
        : "; no owner approval required."),
  );
}
