import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  ScannedPdfError,
  chunkPages,
  chunkText,
  detectFormat,
  parseDocument,
  type ChunkContext,
} from "./documentParser.js";

const hmaText = readFileSync(
  fileURLToPath(new URL("../../../../data/demo/01_HMA_excerpt.txt", import.meta.url)),
  "utf8",
);

const ctx: ChunkContext = {
  caseId: "case_demo_harborline_001",
  documentId: "doc_hma",
  citationPrefix: "HMA",
};

const clauseChunks = (chunks: { citationLabel: string }[]) =>
  chunks.filter((c) => /§\d+\.\d+/.test(c.citationLabel));

// --- Format detection -------------------------------------------------------

describe("detectFormat", () => {
  it("recognizes the supported text + pdf formats, case-insensitively", () => {
    expect(detectFormat("01_HMA_excerpt.txt")).toBe("txt");
    expect(detectFormat("notes.md")).toBe("md");
    expect(detectFormat("Contract.PDF")).toBe("pdf");
  });

  it("throws on unsupported formats rather than guessing", () => {
    expect(() => detectFormat("statement.csv")).toThrow();
    expect(() => detectFormat("photo.png")).toThrow();
  });
});

// --- Clause-aware chunking (real HMA) ---------------------------------------

describe("chunkText — Harborline HMA (real data/demo file)", () => {
  const chunks = chunkText(hmaText, ctx);
  const find = (fragment: string) =>
    chunks.find((c) => c.citationLabel.includes(fragment));

  it("splits the HMA into one chunk per numbered clause (4.1–9.2)", () => {
    // §4.1, §4.2, §4.3, §5.1, §5.2, §9.1, §9.2
    expect(clauseChunks(chunks)).toHaveLength(7);
  });

  it("labels each clause with a citation ready to drop into a finding", () => {
    expect(find("§4.1")?.citationLabel).toBe("HMA §4.1 — Base Management Fee");
    expect(find("§4.2")?.citationLabel).toBe("HMA §4.2 — Incentive Management Fee");
    expect(find("§5.1")?.citationLabel).toBe("HMA §5.1 — Centralized Services");
  });

  it("keeps each clause's body with its heading so citations quote real text", () => {
    expect(find("§4.2")?.text.toLowerCase()).toContain("gross operating profit");
    expect(find("§4.3")?.text.toLowerCase()).toContain("insurance");
    expect(find("§4.3")?.text.toLowerCase()).toContain("cancellation");
    expect(find("§5.1")?.text).toContain("$10,000");
  });

  it("captures the preamble but drops empty article headings", () => {
    expect(find("Preamble")).toBeDefined();
    expect(chunks.some((c) => c.citationLabel.includes("ARTICLE"))).toBe(false);
  });

  it("stamps every chunk with case/document ids and non-empty content", () => {
    for (const chunk of chunks) {
      expect(chunk.caseId).toBe(ctx.caseId);
      expect(chunk.documentId).toBe(ctx.documentId);
      expect(chunk.citationLabel.length).toBeGreaterThan(0);
      expect(chunk.text.trim().length).toBeGreaterThan(0);
    }
  });
});

// --- Page-aware chunking (per-page PDF text) --------------------------------

describe("chunkPages — page-level provenance", () => {
  const pages = [
    {
      page: 1,
      text: [
        "PREAMBLE",
        "This management agreement is entered into by the parties.",
        "4.1  BASE MANAGEMENT FEE.",
        "The operator earns 3.0% of Total Operating Revenue.",
      ].join("\n"),
    },
    {
      page: 2,
      text: [
        "4.2  INCENTIVE MANAGEMENT FEE.",
        "The operator earns 10% of Gross Operating Profit.",
      ].join("\n"),
    },
  ];
  const chunks = chunkPages(pages, ctx);
  const find = (fragment: string) =>
    chunks.find((c) => c.citationLabel.includes(fragment));

  it("stamps each chunk with the page its clause starts on", () => {
    expect(find("Preamble")?.page).toBe(1);
    expect(find("§4.1")?.page).toBe(1);
    expect(find("§4.2")?.page).toBe(2);
  });

  it("keeps the same clause bodies as the flat chunker (text unchanged)", () => {
    expect(find("§4.1")?.text.toLowerCase()).toContain("3.0%");
    expect(find("§4.2")?.text.toLowerCase()).toContain("gross operating profit");
  });
});

// --- parseDocument (format handling + injected PDF extractor) ----------------

describe("parseDocument", () => {
  it("chunks a plain-text document from its provided text", async () => {
    const chunks = await parseDocument({
      caseId: ctx.caseId,
      documentId: ctx.documentId,
      fileName: "01_HMA_excerpt.txt",
      citationPrefix: "HMA",
      text: hmaText,
    });
    expect(chunks.find((c) => c.citationLabel.includes("§4.2"))).toBeDefined();
  });

  it("extracts a digital PDF via the injected extractor, then chunks it", async () => {
    const chunks = await parseDocument(
      {
        caseId: ctx.caseId,
        documentId: ctx.documentId,
        fileName: "hma.pdf",
        citationPrefix: "HMA",
        buffer: Buffer.from("ignored-by-fake"),
      },
      { pdfExtractor: async () => ({ text: hmaText, pageCount: 3 }) },
    );
    expect(clauseChunks(chunks)).toHaveLength(7);
  });

  it("threads per-page text through to page-stamped chunks", async () => {
    const chunks = await parseDocument(
      {
        caseId: ctx.caseId,
        documentId: ctx.documentId,
        fileName: "hma.pdf",
        citationPrefix: "HMA",
        buffer: Buffer.from("ignored-by-fake"),
      },
      {
        pdfExtractor: async () => ({
          text: "4.1  BASE MANAGEMENT FEE.\nThree percent.\n4.2  INCENTIVE MANAGEMENT FEE.\nTen percent.",
          pageCount: 2,
          pages: [
            { page: 1, text: "4.1  BASE MANAGEMENT FEE.\nThree percent." },
            { page: 2, text: "4.2  INCENTIVE MANAGEMENT FEE.\nTen percent." },
          ],
        }),
      },
    );
    const find = (fragment: string) =>
      chunks.find((c) => c.citationLabel.includes(fragment));
    expect(find("§4.1")?.page).toBe(1);
    expect(find("§4.2")?.page).toBe(2);
  });

  it("rejects a scanned PDF (no extractable text) clearly", async () => {
    await expect(
      parseDocument(
        {
          caseId: ctx.caseId,
          documentId: ctx.documentId,
          fileName: "scanned.pdf",
          buffer: Buffer.from("image-only"),
        },
        { pdfExtractor: async () => ({ text: "  \n  ", pageCount: 12 }) },
      ),
    ).rejects.toBeInstanceOf(ScannedPdfError);
  });

  it("refuses a PDF when no extractor is available (no silent empty result)", async () => {
    await expect(
      parseDocument({
        caseId: ctx.caseId,
        documentId: ctx.documentId,
        fileName: "x.pdf",
        buffer: Buffer.from("x"),
      }),
    ).rejects.toThrow(/pdf/i);
  });

  it("refuses an unsupported format", async () => {
    await expect(
      parseDocument({
        caseId: ctx.caseId,
        documentId: ctx.documentId,
        fileName: "statement.csv",
        text: "a,b,c",
      }),
    ).rejects.toThrow();
  });
});
