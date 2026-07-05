import type { RunAuditInput } from "@feeforensics/agent";

import type { CaseParseWarning } from "../data/caseRepository.js";

/**
 * Turn uploaded BYO files into the orchestrator's `RunAuditInput`.
 *
 * Role → orchestrator mapping (see docs/tracker.md PR-14b):
 *   hma            → documents.hma           (text: .txt/.md; digital PDF in PR-14c)
 *   statement      → documents.statement     (CSV)
 *   statement_prior→ documents.priorStatement(CSV)
 *   support_pack   → documents.supportPack   (CSV)
 *   supplementary  → documents.miscBreakout  (CSV — details a statement roll-up)
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
  | "supplementary";

export interface UploadedFile {
  filename: string;
  buffer: Buffer;
}

export interface CaseUpload {
  files: Partial<Record<UploadRole, UploadedFile>>;
  ownerNotes?: string;
  draftEmail: boolean;
  hotelName?: string;
  auditMonth?: string;
}

export interface AssembledCase {
  input: RunAuditInput;
  warnings: CaseParseWarning[];
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
} as const;

const extensionOf = (filename: string): string =>
  filename.slice(filename.lastIndexOf(".") + 1).toLowerCase();

const looksBinary = (buf: Buffer): boolean => buf.subarray(0, 8000).includes(0);

const isPdf = (buf: Buffer): boolean => buf.subarray(0, 5).toString("latin1") === "%PDF-";

function defaultAuditMonth(now: Date): string {
  return now.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/**
 * Decode a text document (HMA). `.txt`/`.md` decode as UTF-8. PDFs are rejected
 * for now (digital-PDF text extraction lands in PR-14c) with a clear warning
 * rather than a garbled decode.
 */
function decodeTextDoc(file: UploadedFile, warnings: string[]): string | null {
  const ext = extensionOf(file.filename);
  if (isPdf(file.buffer) || ext === "pdf") {
    warnings.push(
      "PDF text extraction is not available yet (coming in PR-14c). Upload a .txt or .md export for now.",
    );
    return null;
  }
  if (file.buffer.length === 0) {
    warnings.push("File is empty.");
    return null;
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

export function assembleCase(
  caseId: string,
  upload: CaseUpload,
  now: Date = new Date(),
): AssembledCase {
  const warnings: CaseParseWarning[] = [];
  const record = (role: UploadRole, w: string[]): void => {
    warnings.push({ role, documentName: DOC[role].name, warnings: w });
  };

  const hmaFile = upload.files.hma;
  const statementFile = upload.files.statement;
  if (!hmaFile) throw new CaseAssemblyError("Missing required document: hma.", warnings);
  if (!statementFile) {
    throw new CaseAssemblyError("Missing required document: statement.", warnings);
  }

  const hmaWarnings: string[] = [];
  const hmaText = decodeTextDoc(hmaFile, hmaWarnings);
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

  // Optional CSV roles: an unreadable optional doc drops out with a warning
  // instead of failing the whole case.
  const optionalCsv = (
    role: "statement_prior" | "support_pack" | "supplementary",
  ): string | null => {
    const file = upload.files[role];
    if (!file) return null;
    const w: string[] = [];
    const csv = decodeCsvDoc(file, w);
    record(role, w);
    return csv;
  };

  const priorCsv = optionalCsv("statement_prior");
  if (priorCsv !== null) {
    documents.priorStatement = {
      docId: DOC.statement_prior.id,
      name: DOC.statement_prior.name,
      csv: priorCsv,
    };
  }
  const supportCsv = optionalCsv("support_pack");
  if (supportCsv !== null) {
    documents.supportPack = {
      docId: DOC.support_pack.id,
      name: DOC.support_pack.name,
      csv: supportCsv,
    };
  }
  const supplementaryCsv = optionalCsv("supplementary");
  if (supplementaryCsv !== null) {
    // Supplementary is the flexible slot; a CSV here is treated as the
    // misc-income breakout (the orchestrator foots it against the roll-up).
    documents.miscBreakout = {
      docId: DOC.supplementary.id,
      name: DOC.supplementary.name,
      csv: supplementaryCsv,
    };
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

  return { input, warnings };
}
