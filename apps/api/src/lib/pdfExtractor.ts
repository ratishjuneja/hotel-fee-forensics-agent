import type { PdfExtractor } from "@feeforensics/agent";

/**
 * Digital-PDF text extraction via **pdfjs-dist** (pure-JS legacy build — no
 * native deps, rights-clean). Concrete implementation injected into
 * documentParser's `PdfExtractor` seam (dependency points app → package).
 *
 * Line structure matters: the clause chunker splits on newlines/headings, so we
 * reconstruct line breaks from pdfjs's `hasEOL` markers instead of flattening a
 * page into one space-joined blob. A page with no extractable text (a scan)
 * yields empty text — the caller (documentParser / the parse job) then raises a
 * ScannedPdfError; OCR for scans lands in PR-16.
 */
export const pdfjsExtractor: PdfExtractor = async (buffer) => {
  // Legacy ESM build works in Node without a worker (fake worker on the main
  // thread) — fine for text extraction, which needs no canvas/rendering.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    // Don't fetch external fonts/cmaps in Node; text extraction doesn't need them.
    useSystemFonts: false,
  }).promise;

  const pages: { page: number; text: string }[] = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      let line = "";
      const lines: string[] = [];
      for (const item of content.items) {
        if (!("str" in item)) continue;
        line += item.str;
        if (item.hasEOL) {
          lines.push(line);
          line = "";
        }
      }
      if (line) lines.push(line);
      pages.push({ page: n, text: lines.join("\n").trim() });
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }

  return {
    text: pages.map((p) => p.text).join("\n\n"),
    pageCount: pages.length,
    pages,
  };
};
