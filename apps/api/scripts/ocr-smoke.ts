/**
 * Opt-in OCR smoke — runs the REAL ladder (pdfjs + pdf-to-img rasterizer +
 * tesseract.js) on the committed synthetic scanned fixture. Kept OUT of the
 * vitest suite because real OCR/canvas WASM is slow and heavy; run it by hand
 * (and on the VM after deploy, with the network off) to prove scanned PDFs
 * transcribe end-to-end:
 *
 *   npm run smoke:ocr --workspace=@feeforensics/api
 *
 * Exits non-zero if the fixture does not OCR to the expected clause text.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parseDocument } from "@feeforensics/agent";

import { createOcrPdfExtractor } from "../src/lib/ocrExtractor.js";

const FIXTURE = fileURLToPath(
  new URL("../test-fixtures/scanned-hma-excerpt.pdf", import.meta.url),
);
const EXPECTED = ["BASE MANAGEMENT FEE", "CENTRALIZED SERVICES"];

async function main(): Promise<void> {
  const buffer = readFileSync(FIXTURE);
  const extract = createOcrPdfExtractor();

  const started = Date.now();
  const result = await extract(buffer);
  const ms = Date.now() - started;

  console.log(`OCR ladder ran in ${ms}ms — pageCount=${result.pageCount}`);
  if (result.warnings?.length) console.log("warnings:", result.warnings);
  console.log("--- extracted text ---");
  console.log(result.text);
  console.log("----------------------");

  // Prove the transcribed text still chunks into citable clauses (PR-15 chain).
  const chunks = await parseDocument(
    { caseId: "case_smoke", documentId: "doc_hma", fileName: "scan.pdf", citationPrefix: "HMA", buffer },
    { pdfExtractor: extract },
  );
  const clauseLabels = chunks
    .filter((c) => /§\d+\.\d+/.test(c.citationLabel))
    .map((c) => c.citationLabel);
  console.log("clause chunks:", clauseLabels);

  const missing = EXPECTED.filter((needle) => !result.text.toUpperCase().includes(needle));
  if (missing.length > 0) {
    console.error(`FAIL — OCR text missing expected clauses: ${missing.join(", ")}`);
    process.exit(1);
  }
  console.log("PASS — scanned PDF transcribed to the expected clause text.");
}

main().catch((err) => {
  console.error("OCR smoke errored:", err);
  process.exit(1);
});
