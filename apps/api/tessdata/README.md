# Bundled Tesseract language data (offline OCR)

`eng.traineddata.gz` is the standard English model for the OCR ladder that reads
**scanned** PDF uploads (see `src/lib/tesseractOcr.ts`). It is bundled here — not
fetched from a CDN at runtime — so OCR is **deterministic and works offline** (the
demo VM allows only inbound SSH + :80; a judge may run with no network).

- **Source:** `https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz` — the
  exact artifact tesseract.js downloads by default (LSTM model, compatible with
  the `tesseract.js-core` engine installed via npm).
- **License:** Apache-2.0 (Google `tessdata`). Redistribution is permitted; this
  is a third-party asset, not original project work.

The WASM core (`tesseract.js-core`) and worker are resolved from `node_modules`
(installed by `npm ci`), so only this language file needs to live in the repo.
