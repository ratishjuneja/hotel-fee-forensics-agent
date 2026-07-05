import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { pdfjsExtractor } from "./pdfExtractor.js";

/**
 * Exercises the REAL pdfjs-dist extractor against a committed digital-PDF
 * fixture (`test-fixtures/harborline-hma.pdf` — the synthetic demo HMA rendered
 * to PDF). Guards that we get line-structured text the clause chunker can use.
 */
const fixture = (name: string): Buffer =>
  readFileSync(fileURLToPath(new URL(`../../test-fixtures/${name}`, import.meta.url)));

describe("pdfjsExtractor (real pdfjs-dist)", () => {
  it("extracts line-structured text and page count from a digital PDF", async () => {
    const result = await pdfjsExtractor(fixture("harborline-hma.pdf"));
    expect(result.pageCount).toBeGreaterThanOrEqual(1);
    expect(result.text.length).toBeGreaterThan(200);
    // Clause structure survives so the chunker/ruleExtractor can parse it.
    expect(result.text).toMatch(/incentive/i);
    expect(result.text).toMatch(/4\.\d/);
    // Newlines are preserved (not one space-joined blob).
    expect(result.text.split("\n").length).toBeGreaterThan(5);
    // Per-page text is provided (feeds PR-15 page provenance).
    expect(result.pages).toBeDefined();
    expect(result.pages!.length).toBe(result.pageCount);
  });
});
