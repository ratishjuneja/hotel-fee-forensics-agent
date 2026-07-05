import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import type { Worker } from "tesseract.js"; // type-only — no runtime load

import type { Ocr } from "./ocrExtractor.js";

/**
 * Concrete `Ocr` engine backed by **tesseract.js** (Apache-2.0), a deterministic
 * OCR transcriber (pixels → characters) — NOT a generative/vision model, so it
 * respects the "only the VultronRetriever reranker in the audit path" rule (see
 * ocrExtractor.ts and docs/Rules.md).
 *
 * ── Offline + deterministic ──────────────────────────────────────────────────
 * By default tesseract.js fetches its WASM core and `eng.traineddata` from a CDN
 * at runtime — that is non-deterministic and fails on the demo VM (only SSH+80
 * inbound; a judge may run offline). So both are pinned LOCALLY:
 *   corePath → the installed `tesseract.js-core` package (npm ci)
 *   langPath → the committed `apps/api/tessdata/eng.traineddata.gz` (the standard
 *              4.0.0 eng model — the exact artifact tesseract.js would otherwise
 *              download from its CDN; the accurate variant, not fast)
 * Nothing is fetched at OCR time.
 *
 * A single worker is created lazily on first use and reused across pages/uploads
 * (worker init loads the WASM core + traineddata — the expensive part — so we pay
 * it once). Importing this module loads nothing heavy; the WASM only initializes
 * when the ladder actually meets a scanned page.
 */

const require = createRequire(import.meta.url);

/** Local tesseract WASM core dir (from the installed tesseract.js-core package). */
const corePath = dirname(require.resolve("tesseract.js-core/tesseract-core-simd.wasm"));

/** Committed offline traineddata dir (apps/api/tessdata/eng.traineddata.gz). */
const langPath = fileURLToPath(new URL("../../tessdata", import.meta.url));

let workerPromise: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import("tesseract.js");
      return createWorker("eng", 1, {
        corePath,
        langPath,
        gzip: true, // eng.traineddata.gz
        // Don't write a runtime cache (read-only-friendly, deterministic).
        cacheMethod: "none",
      });
    })();
  }
  return workerPromise;
}

export const tesseractOcr: Ocr = async (pageImage) => {
  const worker = await getWorker();
  const {
    data: { text },
  } = await worker.recognize(pageImage);
  return text;
};
