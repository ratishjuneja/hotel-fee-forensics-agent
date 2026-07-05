import type { PageRasterizer } from "./ocrExtractor.js";

/**
 * Concrete `PageRasterizer` for the OCR ladder: renders scanned PDF pages to PNG
 * bitmaps using the SAME pdfjs-dist build the text extractor already uses
 * (pdfjs-dist/legacy, pure-JS, no worker) plus **@napi-rs/canvas** (MIT) as the
 * 2D backend.
 *
 * Why @napi-rs/canvas and not `node-canvas`/`canvas`: it ships prebuilt,
 * NAPI-loaded platform binaries, so `npm ci` never invokes a C/C++ compiler and
 * needs no cairo/pango system libraries — the install stays portable and the
 * 1-vCPU demo VM builds cleanly. Why our own pdfjs and not a wrapper lib: a
 * second pdfjs-dist copy (e.g. via pdf-to-img) collides with ours over the fake
 * worker ("API version does not match Worker version"); reusing the single 4.x
 * build we already ship avoids that entirely.
 *
 * The imports are lazy: this module loads nothing heavy until the ladder actually
 * hits a scanned page, so the digital/demo path pays zero cost.
 */

/**
 * Render scale (device-pixel multiplier over the 72dpi PDF base). ~2.5× gives
 * crisp glyphs for OCR while staying cheap on a 1-vCPU box.
 */
const RASTER_SCALE = 2.5;

export const rasterizePdfPages: PageRasterizer = async (buffer, pages) => {
  const out = new Map<number, Buffer>();
  if (pages.length === 0) return out;

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { createCanvas } = await import("@napi-rs/canvas");

  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    useSystemFonts: false,
  }).promise;

  try {
    for (const n of pages) {
      if (n < 1 || n > doc.numPages) continue;
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: RASTER_SCALE });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const context = canvas.getContext("2d");
      // pdfjs's RenderParameters types canvasContext as a DOM CanvasRenderingContext2D;
      // @napi-rs/canvas's context is compatible at runtime (proven by the OCR smoke),
      // so cast through the param type rather than pulling in the DOM lib.
      await page.render(
        { canvasContext: context, viewport } as unknown as Parameters<typeof page.render>[0],
      ).promise;
      out.set(n, canvas.toBuffer("image/png"));
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }
  return out;
};
