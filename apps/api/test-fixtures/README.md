# API test fixtures — all SYNTHETIC

These files exist only to exercise the PDF/OCR ingestion paths in tests and the
opt-in OCR smoke. Every one is **synthetic** (fictional content authored for this
project) — no real hotel agreement or customer data.

| File | What it is | Used by |
|---|---|---|
| `harborline-hma.pdf` | The synthetic Harborline HMA excerpt rendered as a **digital** PDF (has a real text layer) | `pdfExtractor.test.ts`, `cases.test.ts` (PDF-HMA reproduces $36,580) |
| `scanned-hma-excerpt.pdf` | A synthetic HMA excerpt rendered as an **image-only** PDF (no text layer — pdfjs extracts 0 chars) | `scripts/ocr-smoke.ts` (real OCR ladder), manual/VM smoke |

`scanned-hma-excerpt.pdf` is a 1-page image-only PDF: text was drawn to a bitmap
and embedded, so there is **no** text layer to extract. It forces the OCR ladder
(rasterize → tesseract.js) and OCRs back to the clauses `4.1 Base Management Fee`
and `5.1 Centralized Services`. The vitest suite never runs real OCR on it (that
uses fakes); only the opt-in `npm run smoke:ocr` and the post-deploy VM smoke do.
