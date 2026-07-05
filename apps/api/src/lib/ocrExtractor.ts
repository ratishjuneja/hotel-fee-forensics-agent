import type { PdfExtractionResult, PdfExtractor } from "@feeforensics/agent";

import { pdfjsExtractor } from "./pdfExtractor.js";
import { rasterizePdfPages } from "./pageRasterizer.js";
import { tesseractOcr } from "./tesseractOcr.js";

/**
 * OCR ladder for scanned (image-only) PDFs — a per-page fallback that slots in
 * behind documentParser's existing `PdfExtractor` seam, so the digital path and
 * the golden demo are byte-for-byte unchanged.
 *
 * ── Why this is NOT "a model in the audit path" ──────────────────────────────
 * OCR (tesseract.js) is a DETERMINISTIC transcriber: pixels → characters. Like
 * the pdfjs text extractor, it runs BEFORE the audit pipeline as a pre-processing
 * step. It does not reason, generate, decide, or interpret — it just recovers the
 * text a scanner would otherwise have hidden in an image. Using a vision LLM for
 * this WOULD violate the rule; OCR does not. The pipeline's only model remains the
 * VultronRetrieverPrime reranker (see docs/Rules.md).
 *
 * ── The ladder (decided per page, not per document) ──────────────────────────
 *   Rung 1  pdfjs text layer — fast, exact, no OCR. If a page yields real text we
 *           use it as-is. A PDF can be MIXED (some digital pages, some scanned).
 *   Rung 2  For a page with no/negligible text layer, rasterize just that page to
 *           a bitmap and OCR it; the transcript becomes that page's text. Page
 *           numbers still line up, so PR-15 page-level citation provenance holds.
 *
 * A fully-digital document (the demo, every .txt/.md/digital-PDF upload) triggers
 * NO rasterizer and NO OCR — zero added latency. Only a truly blank/garbage scan
 * (OCR also finds nothing on every page) falls through to an empty result, which
 * documentParser/caseAssembler then reports as an unreadable scan — never empty
 * chunks fabricated from nothing.
 */

/** Deterministic OCR of one rasterized page image (pixels → characters). */
export type Ocr = (pageImage: Buffer) => Promise<string>;

/**
 * Rasterizes the requested 1-based pages of a PDF to bitmap buffers in one pass
 * (opening the document once). Returns a page→image map; a page absent from the
 * map could not be rendered.
 */
export type PageRasterizer = (buffer: Buffer, pages: number[]) => Promise<Map<number, Buffer>>;

export interface OcrLadderDeps {
  /** Rung 1: the digital text extractor (pdfjs) — must return per-page text. */
  digital: PdfExtractor;
  /** Rung 2a: page → bitmap. */
  rasterize: PageRasterizer;
  /** Rung 2b: bitmap → text (deterministic OCR). */
  ocr: Ocr;
  /**
   * Safety cap: OCR at most this many scanned pages per document. OCR is
   * seconds/page and the demo VM is 1 vCPU — bounding it keeps one huge scan from
   * pegging the box. Pages beyond the cap are left empty with an honest warning.
   */
  maxOcrPages?: number;
  /** A page whose trimmed text is shorter than this is treated as scanned. */
  minPageTextChars?: number;
}

const DEFAULT_MAX_OCR_PAGES = 10;
const DEFAULT_MIN_PAGE_TEXT_CHARS = 12;

/**
 * Wrap a digital `PdfExtractor` with a per-page OCR fallback. Returns a
 * `PdfExtractor` with the identical `{ text, pageCount, pages }` contract, so
 * every downstream consumer (chunkPages, caseAssembler) is untouched.
 */
export function makeOcrExtractor(deps: OcrLadderDeps): PdfExtractor {
  const maxOcrPages = deps.maxOcrPages ?? DEFAULT_MAX_OCR_PAGES;
  const minChars = deps.minPageTextChars ?? DEFAULT_MIN_PAGE_TEXT_CHARS;

  return async (buffer: Buffer): Promise<PdfExtractionResult> => {
    const base = await deps.digital(buffer);

    // OCR is inherently per-page; without a per-page breakdown there is nothing
    // to fall back on, so return the digital result unchanged.
    if (!base.pages || base.pages.length === 0) return base;

    // Work on copies so a fully-digital doc is returned byte-for-byte unchanged.
    const pages = base.pages.map((p) => ({ ...p }));
    const scanned = pages.filter((p) => p.text.trim().length < minChars);

    // Fully-digital fast path: no rasterizer, no OCR, no added latency.
    if (scanned.length === 0) return base;

    const warnings = [...(base.warnings ?? [])];
    const toOcr = scanned.slice(0, maxOcrPages);
    const dropped = scanned.length - toOcr.length;

    const images = await deps.rasterize(
      buffer,
      toOcr.map((p) => p.page),
    );

    for (const page of toOcr) {
      const image = images.get(page.page);
      if (!image) {
        warnings.push(`Could not rasterize page ${page.page} for OCR.`);
        continue;
      }
      const text = (await deps.ocr(image)).trim();
      if (text) page.text = text;
    }

    if (dropped > 0) {
      warnings.push(
        `OCR limited to the first ${maxOcrPages} of ${scanned.length} scanned pages; ` +
          `${dropped} page(s) were not transcribed.`,
      );
    }

    const text = pages
      .map((p) => p.text)
      .join("\n\n")
      .trim();

    return {
      text,
      pageCount: base.pageCount,
      pages,
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  };
}

/**
 * Production extractor: pdfjs text layer + tesseract.js OCR fallback (pages
 * rasterized via pdfjs + @napi-rs/canvas). The concrete rasterizer and OCR
 * engines lazy-load their native/WASM parts only when a scanned page is actually
 * encountered, so importing this costs nothing on the digital path.
 */
export function createOcrPdfExtractor(): PdfExtractor {
  return makeOcrExtractor({
    digital: pdfjsExtractor,
    rasterize: rasterizePdfPages,
    ocr: tesseractOcr,
  });
}
