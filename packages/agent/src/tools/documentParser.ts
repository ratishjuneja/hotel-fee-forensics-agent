/**
 * Document parser + clause-aware chunker.
 *
 * Turns a source document (.md / .txt / digital .pdf) into `DocumentChunk[]` —
 * the unit the retriever searches and every citation points back to. The
 * chunker is heading-aware: it splits legal text on numbered clauses
 * (e.g. "4.2  INCENTIVE MANAGEMENT FEE.") and markdown headings, so each chunk
 * carries a ready-to-cite label like "HMA §4.2 — Incentive Management Fee" and
 * keeps its own body text for the citation quote.
 *
 * PDF text extraction is an INJECTED boundary (`PdfExtractor`) so tests stay
 * deterministic and the tool never fakes a document. The concrete extractor
 * (pdfjs-dist, optionally wrapped in the apps/api OCR ladder for scanned pages)
 * is wired in by the caller / upload path. A PDF that yields no extractable text
 * even after OCR — pages but truly no recoverable text — is rejected clearly
 * rather than silently yielding empty chunks.
 */

import type { DocumentChunk } from "@feeforensics/shared";

export type DocumentFormat = "md" | "txt" | "pdf";

export interface ChunkContext {
  caseId: string;
  documentId: string;
  /** Citation prefix, e.g. "HMA". Defaults to "Doc". */
  citationPrefix?: string;
}

/** Result of extracting text from a digital PDF. */
export interface PdfExtractionResult {
  /** Full document text (pages joined). */
  text: string;
  pageCount: number;
  /** Per-page text, when the extractor provides it (feeds page-level citations). */
  pages?: { page: number; text: string }[];
  /**
   * Non-fatal extractor notes surfaced to the caller (e.g. the OCR ladder capping
   * how many scanned pages it transcribed). Recorded as case parse warnings.
   */
  warnings?: string[];
}

/** Extracts text from a digital PDF. Concrete impl (pdfjs-dist) is injected. */
export type PdfExtractor = (buffer: Buffer) => Promise<PdfExtractionResult>;

export interface DocumentSource extends ChunkContext {
  fileName: string;
  /** Raw text for .md/.txt (or pre-extracted content). */
  text?: string;
  /** Bytes for .pdf; extracted via the injected `pdfExtractor`. */
  buffer?: Buffer;
}

export interface ParseDocumentOptions {
  pdfExtractor?: PdfExtractor;
}

/** Thrown when a PDF yields no recoverable text — no text layer AND OCR (if the
 * injected extractor runs it) also finds nothing (a blank/garbage scan). */
export class ScannedPdfError extends Error {
  constructor(fileName: string) {
    super(
      `"${fileName}" has no recoverable text — no text layer, and OCR found nothing ` +
        `(blank or unreadable scan). Provide a clearer scan, a digital PDF, or a .txt/.md export.`,
    );
    this.name = "ScannedPdfError";
  }
}

// --- Format detection -------------------------------------------------------

export function detectFormat(fileName: string): DocumentFormat {
  const ext = fileName.slice(fileName.lastIndexOf(".") + 1).toLowerCase();
  if (ext === "md" || ext === "markdown") return "md";
  if (ext === "txt" || ext === "text") return "txt";
  if (ext === "pdf") return "pdf";
  throw new Error(
    `Unsupported document format ".${ext}" (${fileName}); expected .md, .txt, or digital .pdf.`,
  );
}

// --- Heading recognition ----------------------------------------------------

interface Heading {
  /** Clause number like "4.2", or undefined for markdown/article headings. */
  number?: string;
  title: string;
  /** Article headings become boundaries but are dropped if they have no body. */
  isArticle: boolean;
}

const CLAUSE_RE = /^\s*(\d{1,2}\.\d{1,2})\s+([A-Z].*?)\.?\s*$/;
const ARTICLE_RE = /^\s*ARTICLE\s+[0-9IVXLC]+\s*[—–-]\s*(.+?)\s*$/i;
const MARKDOWN_RE = /^\s*#{1,6}\s+(.+?)\s*$/;
const SEPARATOR_RE = /^\s*[-=_]{3,}\s*$/;

function matchHeading(line: string): Heading | null {
  const clause = CLAUSE_RE.exec(line);
  if (clause) return { number: clause[1], title: clause[2]!, isArticle: false };
  const article = ARTICLE_RE.exec(line);
  if (article) return { title: article[1]!, isArticle: true };
  const md = MARKDOWN_RE.exec(line);
  if (md) return { title: md[1]!, isArticle: false };
  return null;
}

const titleCase = (s: string): string =>
  s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

function labelsFor(
  heading: Heading | null,
  prefix: string,
): { sectionLabel: string; citationLabel: string } {
  if (!heading) {
    return { sectionLabel: "Preamble", citationLabel: `${prefix} — Preamble` };
  }
  const title = titleCase(heading.title.trim());
  if (heading.number) {
    return {
      sectionLabel: `§${heading.number} ${title}`,
      citationLabel: `${prefix} §${heading.number} — ${title}`,
    };
  }
  return { sectionLabel: title, citationLabel: `${prefix} — ${title}` };
}

// --- Chunking ---------------------------------------------------------------

interface PendingChunk {
  heading: Heading | null;
  headingLine: string | null;
  body: string[];
  /** Source page the section starts on (heading line, or first body line). */
  page?: number;
}

/** A source line tagged with the page it came from (undefined for flat text). */
interface PagedLine {
  text: string;
  page?: number;
}

/**
 * Cap on raw document size. HMAs and operating packages are tens of KB; a
 * multi-MB input is a mistake or a memory/context-exhaustion attempt. Bounding it
 * here transitively bounds every downstream prompt built from these chunks.
 */
const MAX_DOCUMENT_CHARS = 5 * 1024 * 1024;

/**
 * The clause-aware chunker, operating on page-tagged lines so each chunk can
 * cite the page it starts on. `chunkText` and `chunkPages` are thin wrappers
 * that feed lines in — the splitting logic (and therefore the chunk text) is
 * identical whether or not pages are known.
 */
function chunkPagedLines(lines: PagedLine[], ctx: ChunkContext): DocumentChunk[] {
  const prefix = ctx.citationPrefix ?? "Doc";

  const sections: PendingChunk[] = [];
  let current: PendingChunk = { heading: null, headingLine: null, body: [] };

  for (const line of lines) {
    if (SEPARATOR_RE.test(line.text)) continue; // decorative rules never join a body
    const heading = matchHeading(line.text);
    if (heading) {
      sections.push(current);
      current = {
        heading,
        headingLine: line.text.trim(),
        body: [],
        page: line.page,
      };
    } else {
      current.body.push(line.text);
      if (current.page === undefined) current.page = line.page; // preamble start
    }
  }
  sections.push(current);

  const chunks: DocumentChunk[] = [];
  let seq = 0;
  for (const section of sections) {
    const bodyText = section.body.join("\n").trim();
    // Drop empty article/heading-only sections (e.g. an ARTICLE divider whose
    // body is just the next clause). The preamble and real clauses stay.
    if (bodyText === "" && (section.heading === null || section.heading.isArticle)) {
      continue;
    }
    const { sectionLabel, citationLabel } = labelsFor(section.heading, prefix);
    const text =
      section.headingLine && bodyText
        ? `${section.headingLine}\n${bodyText}`
        : bodyText || section.headingLine || "";

    const chunk: DocumentChunk = {
      id: `${ctx.documentId}_chunk_${++seq}`,
      documentId: ctx.documentId,
      caseId: ctx.caseId,
      text,
      sectionLabel,
      citationLabel,
    };
    if (section.page !== undefined) chunk.page = section.page;
    chunks.push(chunk);
  }

  return chunks;
}

export function chunkText(text: string, ctx: ChunkContext): DocumentChunk[] {
  if (text.length > MAX_DOCUMENT_CHARS) {
    throw new Error(
      `Document is too large (${text.length} chars > ${MAX_DOCUMENT_CHARS} limit).`,
    );
  }
  return chunkPagedLines(
    text.split(/\r?\n/).map((line) => ({ text: line })),
    ctx,
  );
}

/**
 * Chunk a document from its per-page text (as a digital-PDF extractor provides),
 * so every resulting chunk carries the page its clause begins on for
 * page-level citation provenance.
 */
export function chunkPages(
  pages: { page: number; text: string }[],
  ctx: ChunkContext,
): DocumentChunk[] {
  const total = pages.reduce((acc, p) => acc + p.text.length, 0);
  if (total > MAX_DOCUMENT_CHARS) {
    throw new Error(
      `Document is too large (${total} chars > ${MAX_DOCUMENT_CHARS} limit).`,
    );
  }
  const lines: PagedLine[] = [];
  for (const p of pages) {
    for (const line of p.text.split(/\r?\n/)) lines.push({ text: line, page: p.page });
  }
  return chunkPagedLines(lines, ctx);
}

// --- Top-level parse (format + extraction, then chunk) ----------------------

export async function parseDocument(
  source: DocumentSource,
  opts: ParseDocumentOptions = {},
): Promise<DocumentChunk[]> {
  const format = detectFormat(source.fileName);
  const ctx: ChunkContext = {
    caseId: source.caseId,
    documentId: source.documentId,
    citationPrefix: source.citationPrefix,
  };

  if (format === "md" || format === "txt") {
    if (source.text === undefined) {
      throw new Error(
        `No text provided for "${source.fileName}" (.${format}).`,
      );
    }
    return chunkText(source.text, ctx);
  }

  // format === "pdf"
  if (source.text !== undefined) {
    // Caller already extracted the text (e.g. upstream pdf-parse); chunk it.
    return chunkText(source.text, ctx);
  }
  if (!opts.pdfExtractor) {
    throw new Error(
      `Cannot read PDF "${source.fileName}": no pdfExtractor provided ` +
        `(inject pdf-parse or pre-extract the text).`,
    );
  }
  if (!source.buffer) {
    throw new Error(`No buffer provided for PDF "${source.fileName}".`);
  }

  const { text, pageCount, pages } = await opts.pdfExtractor(source.buffer);
  if (text.trim().length < 20 && pageCount > 0) {
    throw new ScannedPdfError(source.fileName);
  }
  // Prefer per-page text so chunks carry page-level provenance; fall back to the
  // flat text when the extractor did not break it out by page.
  return pages && pages.length > 0 ? chunkPages(pages, ctx) : chunkText(text, ctx);
}
