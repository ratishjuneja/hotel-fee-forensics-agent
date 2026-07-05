import { describe, expect, it, vi } from "vitest";

import type { PdfExtractionResult, PdfExtractor } from "@feeforensics/agent";

import { makeOcrExtractor, type Ocr, type PageRasterizer } from "./ocrExtractor.js";

/**
 * Unit-tests the PURE OCR ladder with injected fakes — no real tesseract/canvas
 * WASM ever loads here (those are slow, heavy, and non-deterministic; the real
 * engines are exercised only by the opt-in smoke script + the VM smoke). The
 * ladder decides, per page, whether pdfjs already gave usable text (rung 1) or
 * the page must be rasterized + OCR'd (rung 2).
 */

const buf = Buffer.from("%PDF-1.7 fake");

/** Fake digital (pdfjs) rung: returns the given per-page text verbatim. */
const digitalReturning = (pages: { page: number; text: string }[]): PdfExtractor => {
  const fn = async (): Promise<PdfExtractionResult> => ({
    text: pages.map((p) => p.text).join("\n\n"),
    pageCount: pages.length,
    pages: pages.map((p) => ({ ...p })),
  });
  return vi.fn(fn);
};

/** Fake rasterizer: hands back a tiny stand-in bitmap for each requested page. */
const fakeRasterizer = (): PageRasterizer =>
  vi.fn(async (_b: Buffer, nums: number[]) => {
    const out = new Map<number, Buffer>();
    for (const n of nums) out.set(n, Buffer.from(`raster-of-page-${n}`));
    return out;
  });

/** Fake OCR: transcribes the stand-in bitmap back to deterministic page text. */
const fakeOcr = (perPage: Record<number, string>): Ocr =>
  vi.fn(async (image: Buffer) => {
    const match = /raster-of-page-(\d+)/.exec(image.toString());
    const n = match ? Number(match[1]) : NaN;
    return perPage[n] ?? "";
  });

describe("makeOcrExtractor — per-page OCR ladder", () => {
  it("OCRs a fully-scanned page: pdfjs empty → rasterize → OCR text becomes the page text", async () => {
    const digital = digitalReturning([{ page: 1, text: "   " }]);
    const rasterize = fakeRasterizer();
    const ocr = fakeOcr({ 1: "5.1 CENTRALIZED SERVICES.\nOwner approval required." });

    const extract = makeOcrExtractor({ digital, rasterize, ocr });
    const result = await extract(buf);

    expect(rasterize).toHaveBeenCalledWith(buf, [1]);
    expect(ocr).toHaveBeenCalledTimes(1);
    expect(result.pages?.[0]?.text).toContain("CENTRALIZED SERVICES");
    expect(result.text).toContain("CENTRALIZED SERVICES");
    expect(result.pageCount).toBe(1);
  });

  it("routes a MIXED doc per page: digital page kept, only the scanned page OCR'd", async () => {
    const digital = digitalReturning([
      { page: 1, text: "4.1 BASE MANAGEMENT FEE.\nThree percent of revenue." },
      { page: 2, text: "" },
    ]);
    const rasterize = fakeRasterizer();
    const ocr = fakeOcr({ 2: "5.1 CENTRALIZED SERVICES.\nOwner approval required." });

    const result = await makeOcrExtractor({ digital, rasterize, ocr })(buf);

    // Only page 2 is rasterized/OCR'd — page 1's real text layer is untouched.
    expect(rasterize).toHaveBeenCalledWith(buf, [2]);
    expect(ocr).toHaveBeenCalledTimes(1);
    expect(result.pages?.[0]?.text).toContain("BASE MANAGEMENT FEE");
    expect(result.pages?.[1]?.text).toContain("CENTRALIZED SERVICES");
  });

  it("adds ZERO cost on a fully-digital doc: rasterizer and OCR never run", async () => {
    const digital = digitalReturning([
      { page: 1, text: "4.1 BASE MANAGEMENT FEE.\nThree percent of revenue." },
      { page: 2, text: "4.2 INCENTIVE MANAGEMENT FEE.\nTen percent of profit." },
    ]);
    const rasterize = fakeRasterizer();
    const ocr = fakeOcr({});

    const result = await makeOcrExtractor({ digital, rasterize, ocr })(buf);

    expect(rasterize).not.toHaveBeenCalled();
    expect(ocr).not.toHaveBeenCalled();
    expect(result.text).toContain("INCENTIVE MANAGEMENT FEE");
  });

  it("yields empty text (no fabricated chunks) when OCR also finds nothing", async () => {
    const digital = digitalReturning([{ page: 1, text: "" }]);
    const rasterize = fakeRasterizer();
    const ocr = fakeOcr({ 1: "   " }); // truly blank/garbage scan

    const result = await makeOcrExtractor({ digital, rasterize, ocr })(buf);

    expect(ocr).toHaveBeenCalledTimes(1);
    // Downstream (documentParser/caseAssembler) raises ScannedPdfError on empty text.
    expect(result.text.trim()).toBe("");
  });

  it("caps OCR at maxOcrPages and warns honestly instead of silently truncating", async () => {
    const digital = digitalReturning([
      { page: 1, text: "" },
      { page: 2, text: "" },
      { page: 3, text: "" },
    ]);
    const rasterize = fakeRasterizer();
    const ocr = fakeOcr({ 1: "clause one text here", 2: "clause two text here", 3: "clause three" });

    const result = await makeOcrExtractor({ digital, rasterize, ocr, maxOcrPages: 2 })(buf);

    // Only the first two scanned pages are rasterized; the third is not.
    expect(rasterize).toHaveBeenCalledWith(buf, [1, 2]);
    expect(ocr).toHaveBeenCalledTimes(2);
    expect(result.pages?.[2]?.text.trim()).toBe("");
    expect(result.warnings?.join(" ")).toMatch(/OCR limited to the first 2 of 3/i);
  });

  it("warns (not crashes) when a page cannot be rasterized", async () => {
    const digital = digitalReturning([{ page: 1, text: "" }]);
    const rasterize: PageRasterizer = vi.fn(async () => new Map()); // rasterizer returns nothing
    const ocr = fakeOcr({ 1: "would-be text" });

    const result = await makeOcrExtractor({ digital, rasterize, ocr })(buf);

    expect(ocr).not.toHaveBeenCalled();
    expect(result.text.trim()).toBe("");
    expect(result.warnings?.join(" ")).toMatch(/could not rasterize page 1/i);
  });
});
