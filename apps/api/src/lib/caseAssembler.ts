import type { PdfExtractor, RunAuditInput } from "@feeforensics/agent";
import type { CaseSourceDocument } from "@feeforensics/shared";

import type { CaseParseWarning } from "../data/caseRepository.js";

/**
 * Turn uploaded BYO files into the orchestrator's `RunAuditInput`.
 *
 * Role → orchestrator mapping (see docs/tracker.md PR-14b):
 *   hma            → documents.hma           (text: .txt/.md; digital PDF via extractor)
 *   statement      → documents.statement     (CSV)
 *   statement_prior→ documents.priorStatement(CSV)
 *   support_pack   → documents.supportPack   (CSV)
 *   supplementary  → documents.miscBreakout  (CSV — details a statement roll-up)
 *   extra_docs     → (none)                  — stored + shown, never calculated on
 *
 * Every role carries an ARRAY of files. Required roles use the first file. The
 * optional roles merge or pick a primary so the single-slot pipeline is untouched:
 *   - support_pack   → the CSVs are concatenated (same schema → more records).
 *   - statement_prior→ the first is the anomaly baseline; extras are archived.
 *   - supplementary  → the first is footed; extras are archived.
 *   - extra_docs     → decoded for the evidence viewer only (never RunAuditInput).
 *
 * Doc ids reuse the demo's canonical scheme so citations and the evidence viewer
 * resolve uniformly. Nothing is guessed: an unreadable file records a warning and
 * (for a required role) fails the case rather than fabricating content.
 */

export type UploadRole =
  | "hma"
  | "statement"
  | "statement_prior"
  | "support_pack"
  | "supplementary"
  | "extra_docs";

export interface UploadedFile {
  filename: string;
  buffer: Buffer;
}

export interface CaseUpload {
  files: Partial<Record<UploadRole, UploadedFile[]>>;
  ownerNotes?: string;
  draftEmail: boolean;
  hotelName?: string;
  auditMonth?: string;
}

export interface AssembledCase {
  input: RunAuditInput;
  warnings: CaseParseWarning[];
  /**
   * Decoded "Extra documents" for the evidence viewer. Stored with the case but
   * deliberately absent from `input`, so they never reach the calculator. Absent
   * when nothing extra was uploaded (or none of it was text/CSV-decodable).
   */
  extraDocuments?: CaseSourceDocument[];
}

/** Thrown when a required role is missing or unreadable — the case cannot run. */
export class CaseAssemblyError extends Error {
  constructor(
    message: string,
    readonly warnings: CaseParseWarning[],
  ) {
    super(message);
    this.name = "CaseAssemblyError";
  }
}

const DOC = {
  hma: { id: "doc_hma", name: "Hotel Management Agreement" },
  statement: { id: "doc_operating_statement", name: "Monthly Operating Statement" },
  statement_prior: { id: "doc_prior_month", name: "Prior-Month Operating Statement" },
  support_pack: { id: "doc_support_pack", name: "Support / Invoice Pack" },
  supplementary: { id: "doc_misc_breakout", name: "Miscellaneous Income Breakout" },
  extra_docs: { id: "doc_extra", name: "Extra document" },
} as const;

const extensionOf = (filename: string): string =>
  filename.slice(filename.lastIndexOf(".") + 1).toLowerCase();

const looksBinary = (buf: Buffer): boolean => buf.subarray(0, 8000).includes(0);

const isPdf = (buf: Buffer): boolean => buf.subarray(0, 5).toString("latin1") === "%PDF-";

function defaultAuditMonth(now: Date): string {
  return now.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/**
 * Decode a text document (HMA). `.txt`/`.md` decode as UTF-8; a PDF is run
 * through the injected `pdfExtractor`. In production that extractor is the OCR
 * ladder (pdfjs text layer + tesseract.js fallback for scanned pages), so a
 * scanned HMA now parses; only a truly blank/garbage scan (no text even after
 * OCR) is rejected clearly rather than yielding empty content.
 */
async function decodeTextDoc(
  file: UploadedFile,
  warnings: string[],
  pdfExtractor?: PdfExtractor,
): Promise<string | null> {
  const ext = extensionOf(file.filename);
  if (file.buffer.length === 0) {
    warnings.push("File is empty.");
    return null;
  }
  if (isPdf(file.buffer) || ext === "pdf") {
    if (!pdfExtractor) {
      warnings.push("PDF text extraction is not available here. Upload a .txt or .md export.");
      return null;
    }
    try {
      const { text, warnings: extractWarnings } = await pdfExtractor(file.buffer);
      // Surface any extractor notes (e.g. "OCR limited to the first N pages").
      if (extractWarnings) warnings.push(...extractWarnings);
      if (text.trim().length < 20) {
        warnings.push(
          "PDF has no recoverable text — no text layer, and OCR found nothing (blank or " +
            "unreadable scan). Upload a clearer scan, a digital PDF, or a .txt/.md export.",
        );
        return null;
      }
      return text;
    } catch (err) {
      warnings.push(`PDF could not be read: ${String(err)}`);
      return null;
    }
  }
  if (looksBinary(file.buffer)) {
    warnings.push("File does not look like text (binary content). Upload a .txt/.md export.");
    return null;
  }
  return file.buffer.toString("utf8");
}

/** Decode a CSV document (statements / support pack / breakout). */
function decodeCsvDoc(file: UploadedFile, warnings: string[]): string | null {
  const ext = extensionOf(file.filename);
  if (ext !== "csv") {
    warnings.push(`Expected a .csv for this slot but got ".${ext}". Parsed as text anyway.`);
  }
  if (file.buffer.length === 0) {
    warnings.push("File is empty.");
    return null;
  }
  if (isPdf(file.buffer) || looksBinary(file.buffer)) {
    warnings.push("File is not a readable CSV (binary/PDF content). Upload a .csv export.");
    return null;
  }
  return file.buffer.toString("utf8");
}

/** First non-empty line of a CSV, trimmed — used to dedupe repeated headers. */
function headerLine(csv: string): string {
  for (const line of csv.split(/\r?\n/)) {
    if (line.trim().length > 0) return line.trim();
  }
  return "";
}

/**
 * Concatenate CSV files that share a schema (e.g. several invoice / approval
 * exports) into one document: the first file is kept whole; each later file
 * contributes its data rows with a leading header line dropped when it matches
 * the first file's header. Per-file decode notes and a merge summary are pushed
 * to `warnings`. Returns null when nothing decoded.
 */
function mergeCsvDocs(files: UploadedFile[], warnings: string[]): string | null {
  const decoded: { name: string; csv: string }[] = [];
  for (const file of files) {
    const w: string[] = [];
    const csv = decodeCsvDoc(file, w);
    warnings.push(...w.map((m) => `${file.filename}: ${m}`));
    if (csv !== null) decoded.push({ name: file.filename, csv });
  }
  const first = decoded[0];
  if (!first) return null;
  if (decoded.length === 1) return first.csv;

  const header = headerLine(first.csv);
  const chunks = [first.csv.trim()];
  for (const doc of decoded.slice(1)) {
    const lines = doc.csv.split(/\r?\n/);
    const firstIdx = lines.findIndex((l) => l.trim().length > 0);
    // Drop a repeated header row so the merged CSV has one header + all rows.
    if (firstIdx >= 0 && lines[firstIdx]?.trim() === header) lines.splice(firstIdx, 1);
    const body = lines.join("\n").trim();
    if (body.length > 0) chunks.push(body);
  }
  warnings.push(
    `Merged ${decoded.length} files into one document (${decoded
      .map((d) => d.name)
      .join(", ")}).`,
  );
  return `${chunks.join("\n")}\n`;
}

/**
 * Decode an "extra" attachment for DISPLAY only. Text/CSV decode as UTF-8;
 * binary/PDF attachments are stored with the case (by the route) but not shown,
 * since we don't run the OCR ladder on non-audit attachments. Returns null when
 * there is nothing to show.
 */
function decodeExtraDoc(
  file: UploadedFile,
  warnings: string[],
): { content: string; format: "text" | "csv" } | null {
  if (file.buffer.length === 0) {
    warnings.push(`"${file.filename}" is empty and was skipped.`);
    return null;
  }
  if (isPdf(file.buffer) || looksBinary(file.buffer)) {
    warnings.push(
      `"${file.filename}" is stored with the case but not shown in the evidence viewer ` +
        `(binary/PDF attachment).`,
    );
    return null;
  }
  const ext = extensionOf(file.filename);
  return { content: file.buffer.toString("utf8"), format: ext === "csv" ? "csv" : "text" };
}

export interface AssembleOptions {
  /** Digital-PDF text extractor (pdfjs-dist). Omit to reject PDFs. */
  pdfExtractor?: PdfExtractor;
  /** Injectable clock for deterministic default audit-month. */
  now?: Date;
}

export async function assembleCase(
  caseId: string,
  upload: CaseUpload,
  opts: AssembleOptions = {},
): Promise<AssembledCase> {
  const now = opts.now ?? new Date();
  const warnings: CaseParseWarning[] = [];
  const record = (role: UploadRole, w: string[]): void => {
    warnings.push({ role, documentName: DOC[role].name, warnings: w });
  };

  const hmaFile = upload.files.hma?.[0];
  const statementFile = upload.files.statement?.[0];
  if (!hmaFile) throw new CaseAssemblyError("Missing required document: hma.", warnings);
  if (!statementFile) {
    throw new CaseAssemblyError("Missing required document: statement.", warnings);
  }

  const hmaWarnings: string[] = [];
  const hmaText = await decodeTextDoc(hmaFile, hmaWarnings, opts.pdfExtractor);
  record("hma", hmaWarnings);
  if (hmaText === null) {
    throw new CaseAssemblyError("HMA could not be read.", warnings);
  }

  const stmtWarnings: string[] = [];
  const statementCsv = decodeCsvDoc(statementFile, stmtWarnings);
  record("statement", stmtWarnings);
  if (statementCsv === null) {
    throw new CaseAssemblyError("Operating statement could not be read.", warnings);
  }

  const documents: RunAuditInput["documents"] = {
    hma: { docId: DOC.hma.id, name: DOC.hma.name, text: hmaText },
    statement: { docId: DOC.statement.id, name: DOC.statement.name, csv: statementCsv },
  };

  // Optional roles carry arrays. An unreadable optional doc drops out with a
  // warning instead of failing the whole case. The single-slot pipeline is
  // preserved by merging (support pack) or picking a primary (prior/supplementary)
  // BEFORE anything reaches the orchestrator.

  // support_pack: concatenate the CSVs — same schema means more invoice/approval
  // records, which is exactly what parseSupportPack consumes.
  const supportFiles = upload.files.support_pack ?? [];
  if (supportFiles.length > 0) {
    const w: string[] = [];
    const merged = mergeCsvDocs(supportFiles, w);
    record("support_pack", w);
    if (merged !== null) {
      documents.supportPack = {
        docId: DOC.support_pack.id,
        name:
          supportFiles.length > 1
            ? `${DOC.support_pack.name} (${supportFiles.length} files)`
            : DOC.support_pack.name,
        csv: merged,
      };
    }
  }

  // statement_prior: the anomaly baseline expects exactly one prior month — use
  // the first, and archive (store-only) any extras with an informational note.
  const priorFiles = upload.files.statement_prior ?? [];
  const priorPrimary = priorFiles[0];
  if (priorPrimary) {
    const w: string[] = [];
    const csv = decodeCsvDoc(priorPrimary, w);
    if (priorFiles.length > 1) {
      w.push(
        `${priorFiles.length} comparison statements uploaded; "${priorPrimary.filename}" is ` +
          `used as the anomaly baseline. The rest are stored with the case but not used in the ` +
          `calculation: ${priorFiles.slice(1).map((f) => f.filename).join(", ")}.`,
      );
    }
    record("statement_prior", w);
    if (csv !== null) {
      documents.priorStatement = {
        docId: DOC.statement_prior.id,
        name: DOC.statement_prior.name,
        csv,
      };
    }
  }

  // supplementary: one breakout is footed against the roll-up — use the first,
  // archive extras. A CSV here is treated as the misc-income breakout.
  const supplementaryFiles = upload.files.supplementary ?? [];
  const supplementaryPrimary = supplementaryFiles[0];
  if (supplementaryPrimary) {
    const w: string[] = [];
    const csv = decodeCsvDoc(supplementaryPrimary, w);
    if (supplementaryFiles.length > 1) {
      w.push(
        `${supplementaryFiles.length} supplementary schedules uploaded; ` +
          `"${supplementaryPrimary.filename}" is used. The rest are stored with the case but ` +
          `not used in the calculation: ${supplementaryFiles.slice(1).map((f) => f.filename).join(", ")}.`,
      );
    }
    record("supplementary", w);
    if (csv !== null) {
      documents.miscBreakout = {
        docId: DOC.supplementary.id,
        name: DOC.supplementary.name,
        csv,
      };
    }
  }

  // extra_docs: stored + surfaced verbatim in the evidence viewer, but never part
  // of `RunAuditInput` — the deterministic calculator must not see them.
  const extraFiles = upload.files.extra_docs ?? [];
  const extraDocuments: CaseSourceDocument[] = [];
  if (extraFiles.length > 0) {
    const w: string[] = [];
    extraFiles.forEach((file, i) => {
      const decoded = decodeExtraDoc(file, w);
      if (decoded) {
        extraDocuments.push({
          docId: `${DOC.extra_docs.id}_${i + 1}`,
          name: file.filename || `Extra document ${i + 1}`,
          format: decoded.format,
          content: decoded.content,
        });
      }
    });
    if (w.length > 0) record("extra_docs", w);
  }

  const input: RunAuditInput = {
    caseId,
    hotelName: upload.hotelName?.trim() || "Uploaded Case",
    auditMonth: upload.auditMonth?.trim() || defaultAuditMonth(now),
    period: "current",
    priorPeriod: "prior",
    documents,
    draftEmail: upload.draftEmail,
    ...(upload.ownerNotes?.trim() ? { ownerNotes: upload.ownerNotes.trim() } : {}),
  };

  return {
    input,
    warnings,
    ...(extraDocuments.length > 0 ? { extraDocuments } : {}),
  };
}
