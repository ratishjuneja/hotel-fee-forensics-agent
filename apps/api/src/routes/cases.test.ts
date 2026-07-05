import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import type { ChunkRanker, PdfExtractor } from "@feeforensics/agent";
import type { Finding, RunAuditResponse } from "@feeforensics/shared";

import { buildServer } from "../server.js";
import { InMemoryCaseRepository } from "../data/caseRepository.fake.js";
import { InMemoryBlobStore } from "../data/blobStore.fake.js";
import { makeOcrExtractor } from "../lib/ocrExtractor.js";

/**
 * BYO upload flow: POST /api/cases (multipart) → poll GET /api/cases/:id →
 * run-audit on the assembled case. The headline test drives the REAL demo
 * documents through the upload path and asserts the golden $36,580 reproduces —
 * proving upload → parse → store → run is wired end-to-end. Persistence uses the
 * in-memory doubles (never the production default).
 */

const demoFile = (name: string): Buffer =>
  readFileSync(fileURLToPath(new URL(`../../../../data/demo/${name}`, import.meta.url)));

const fixtureFile = (name: string): Buffer =>
  readFileSync(fileURLToPath(new URL(`../../test-fixtures/${name}`, import.meta.url)));

// Scripted reranker (keyword overlap), same as audit.test.ts.
const scriptedRanker: ChunkRanker = async (query, documents) => {
  const terms = query.toLowerCase().split(/\W+/).filter((t) => t.length > 2);
  return documents
    .map((doc, index) => ({
      index,
      score: terms.filter((t) => doc.toLowerCase().includes(t)).length,
    }))
    .sort((a, b) => b.score - a.score);
};

interface MultipartField {
  name: string;
  value?: string;
  filename?: string;
  contentType?: string;
  content?: Buffer;
}

/** Build a multipart/form-data body with a fixed boundary (no form-data dep). */
function buildMultipart(parts: MultipartField[]): { body: Buffer; contentType: string } {
  const boundary = "----feeforensicstestboundary";
  const chunks: Buffer[] = [];
  for (const part of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    if (part.content !== undefined) {
      chunks.push(
        Buffer.from(
          `Content-Disposition: form-data; name="${part.name}"; filename="${part.filename}"\r\n` +
            `Content-Type: ${part.contentType ?? "application/octet-stream"}\r\n\r\n`,
        ),
      );
      chunks.push(part.content);
      chunks.push(Buffer.from("\r\n"));
    } else {
      chunks.push(
        Buffer.from(`Content-Disposition: form-data; name="${part.name}"\r\n\r\n${part.value ?? ""}\r\n`),
      );
    }
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

const demoUploadParts = (extra: MultipartField[] = []): MultipartField[] => [
  { name: "hma", filename: "hma.txt", contentType: "text/plain", content: demoFile("01_HMA_excerpt.txt") },
  { name: "statement", filename: "os.csv", contentType: "text/csv", content: demoFile("02_operating_statement_june.csv") },
  { name: "supplementary", filename: "breakout.csv", contentType: "text/csv", content: demoFile("02b_misc_income_breakout_june.csv") },
  { name: "statement_prior", filename: "may.csv", contentType: "text/csv", content: demoFile("03_operating_statement_may.csv") },
  { name: "support_pack", filename: "support.csv", contentType: "text/csv", content: demoFile("04_support_invoice_pack.csv") },
  ...extra,
];

type Server = Awaited<ReturnType<typeof buildServer>>;
const newServer = (): Promise<Server> =>
  buildServer({
    ranker: scriptedRanker,
    caseRepository: new InMemoryCaseRepository(),
    blobStore: new InMemoryBlobStore(),
  });

/** Poll the status endpoint until parsing finishes (fast for text/CSV). */
async function waitUntilReady(app: Server, caseId: string): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const res = await app.inject({ method: "GET", url: `/api/cases/${caseId}` });
    const status = res.json().status as string;
    if (status !== "parsing") return status;
    await new Promise((r) => setTimeout(r, 15));
  }
  return "parsing";
}

describe("POST /api/cases — BYO upload → parse → run", () => {
  let app: Server;
  afterEach(async () => {
    if (app) await app.close();
  });

  it("reproduces the golden $36,580 when the demo files are uploaded", async () => {
    app = await newServer();
    const { body, contentType } = buildMultipart(
      demoUploadParts([{ name: "hotelName", value: "The Harborline Hotel" }]),
    );
    const created = await app.inject({
      method: "POST",
      url: "/api/cases",
      headers: { "content-type": contentType },
      payload: body,
    });
    expect(created.statusCode).toBe(202);
    const { caseId, status } = created.json();
    expect(status).toBe("parsing");

    expect(await waitUntilReady(app, caseId)).toBe("ready");

    const run = await app.inject({ method: "POST", url: `/api/cases/${caseId}/run-audit` });
    expect(run.statusCode).toBe(200);
    const audit: RunAuditResponse & { warnings: string[] } = run.json();
    expect(audit.findings.map((f: Finding) => f.suspectedImpact)).toEqual([1980, 6600, 28000]);
    expect(audit.confidence).toBe(0.96);
    expect(audit.memo).toContain("$36,580");
    expect(audit.memo).toContain("APPROVAL-0612-03");
    expect(audit.emailDraft).toBeDefined();

    // Report persisted and retrievable for the uploaded case id.
    const report = await app.inject({ method: "GET", url: `/api/cases/${caseId}/report` });
    expect(report.statusCode).toBe(200);
    expect(report.json().totalSuspectedOvercharge).toBe(36580);
  });

  it("reproduces the golden result when the HMA is uploaded as a digital PDF", async () => {
    app = await newServer();
    // Same case, but the HMA arrives as a PDF — exercises the pdfjs extraction path.
    const parts = demoUploadParts([{ name: "hotelName", value: "The Harborline Hotel" }]).map(
      (p) =>
        p.name === "hma"
          ? { name: "hma", filename: "hma.pdf", contentType: "application/pdf", content: fixtureFile("harborline-hma.pdf") }
          : p,
    );
    const { body, contentType } = buildMultipart(parts);
    const created = await app.inject({
      method: "POST",
      url: "/api/cases",
      headers: { "content-type": contentType },
      payload: body,
    });
    expect(created.statusCode).toBe(202);
    const { caseId } = created.json();
    expect(await waitUntilReady(app, caseId)).toBe("ready");

    const run = await app.inject({ method: "POST", url: `/api/cases/${caseId}/run-audit` });
    expect(run.statusCode).toBe(200);
    const audit: RunAuditResponse = run.json();
    expect(audit.findings.map((f: Finding) => f.suspectedImpact)).toEqual([1980, 6600, 28000]);
    expect(audit.confidence).toBe(0.96);
    expect(audit.memo).toContain("$36,580");
  });

  it("omits emailDraft when draftEmail=false", async () => {
    app = await newServer();
    const { body, contentType } = buildMultipart(
      demoUploadParts([{ name: "draftEmail", value: "false" }]),
    );
    const created = await app.inject({
      method: "POST",
      url: "/api/cases",
      headers: { "content-type": contentType },
      payload: body,
    });
    const { caseId } = created.json();
    await waitUntilReady(app, caseId);
    const run = await app.inject({ method: "POST", url: `/api/cases/${caseId}/run-audit` });
    expect(run.statusCode).toBe(200);
    expect(run.json().emailDraft).toBeUndefined();
  });

  it("400s when a required document is missing", async () => {
    app = await newServer();
    const { body, contentType } = buildMultipart([
      { name: "hma", filename: "hma.txt", contentType: "text/plain", content: demoFile("01_HMA_excerpt.txt") },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/cases",
      headers: { "content-type": contentType },
      payload: body,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("missing_required_document");
  });

  it("404s GET status for an unknown case", async () => {
    app = await newServer();
    const res = await app.inject({ method: "GET", url: "/api/cases/case_nope" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("case_not_found");
  });

  it("run-audit 404s for an unknown (never-uploaded) case", async () => {
    app = await newServer();
    const res = await app.inject({ method: "POST", url: "/api/cases/case_nope/run-audit" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("case_not_found");
  });

  it("serves the parsed source documents for a ready case", async () => {
    app = await newServer();
    const { body, contentType } = buildMultipart(demoUploadParts());
    const created = await app.inject({
      method: "POST",
      url: "/api/cases",
      headers: { "content-type": contentType },
      payload: body,
    });
    const { caseId } = created.json();
    expect(await waitUntilReady(app, caseId)).toBe("ready");

    const res = await app.inject({ method: "GET", url: `/api/cases/${caseId}/documents` });
    expect(res.statusCode).toBe(200);
    const { documents } = res.json();
    expect(documents).toHaveLength(5);

    const hma = documents.find((d: { docId: string }) => d.docId === "doc_hma");
    expect(hma.format).toBe("text");
    expect(hma.name).toBe("Hotel Management Agreement");
    expect(hma.content).toContain("Base Management Fee");

    const statement = documents.find(
      (d: { docId: string }) => d.docId === "doc_operating_statement",
    );
    expect(statement.format).toBe("csv");
    expect(statement.content).toContain("Rooms");
  });

  it("404s the documents of an unknown case", async () => {
    app = await newServer();
    const res = await app.inject({ method: "GET", url: "/api/cases/case_nope/documents" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("case_not_found");
  });

  it("parses a SCANNED-PDF HMA through the OCR ladder and reaches status:ready", async () => {
    // A scanned PDF has pages but no text layer; the OCR ladder rasterizes each
    // such page and transcribes it. Here the whole ladder runs through the parse
    // job with FAKE sub-engines (no real tesseract/canvas WASM in the suite).
    const scannedDigital: PdfExtractor = async () => ({
      text: "",
      pageCount: 1,
      pages: [{ page: 1, text: "" }], // no extractable text — looks scanned
    });
    const ocrExtractor = makeOcrExtractor({
      digital: scannedDigital,
      rasterize: async (_b, nums) =>
        new Map(nums.map((n) => [n, Buffer.from(`bitmap-${n}`)])),
      ocr: async () =>
        "4.1 BASE MANAGEMENT FEE.\nThe operator earns three percent of Total Operating Revenue.",
    });

    app = await buildServer({
      ranker: scriptedRanker,
      caseRepository: new InMemoryCaseRepository(),
      blobStore: new InMemoryBlobStore(),
      pdfExtractor: ocrExtractor,
    });

    const { body, contentType } = buildMultipart([
      { name: "hma", filename: "scan.pdf", contentType: "application/pdf", content: Buffer.from("%PDF-1.7 image-only scan") },
      { name: "statement", filename: "os.csv", contentType: "text/csv", content: Buffer.from("Line Item,Amount\nRooms,100000\n") },
    ]);
    const created = await app.inject({
      method: "POST",
      url: "/api/cases",
      headers: { "content-type": contentType },
      payload: body,
    });
    expect(created.statusCode).toBe(202);
    const { caseId } = created.json();

    expect(await waitUntilReady(app, caseId)).toBe("ready");

    // The OCR'd clause text is what the evidence viewer serves for the HMA.
    const docs = await app.inject({ method: "GET", url: `/api/cases/${caseId}/documents` });
    expect(docs.statusCode).toBe(200);
    const hma = docs.json().documents.find((d: { docId: string }) => d.docId === "doc_hma");
    expect(hma.content).toContain("BASE MANAGEMENT FEE");
  });

  it("pauses an unverifiable upload with 202 + pendingQuestions, then completes via /answers", async () => {
    app = await newServer();
    // Upload the demo files but OMIT the support pack → the centralized-services
    // jump still flags, but F3 cannot be verified → the audit must ask the owner.
    const parts = demoUploadParts([{ name: "hotelName", value: "The Harborline Hotel" }]).filter(
      (p) => p.name !== "support_pack",
    );
    const { body, contentType } = buildMultipart(parts);
    const created = await app.inject({
      method: "POST",
      url: "/api/cases",
      headers: { "content-type": contentType },
      payload: body,
    });
    const { caseId } = created.json();
    expect(await waitUntilReady(app, caseId)).toBe("ready");

    // run-audit pauses (202) with a cited question rather than asserting a memo.
    const run = await app.inject({ method: "POST", url: `/api/cases/${caseId}/run-audit` });
    expect(run.statusCode).toBe(202);
    const paused = run.json();
    expect(paused.status).toBe("awaiting_input");
    expect(paused.pendingQuestions).toHaveLength(1);
    const qid = paused.pendingQuestions[0].id;
    expect(paused.pendingQuestions[0].citations.length).toBeGreaterThan(0);
    // No report is persisted while paused.
    const early = await app.inject({ method: "GET", url: `/api/cases/${caseId}/report` });
    expect(early.statusCode).toBe(404);

    // Answer → the audit REPLAYS with the answer merged and completes (200).
    const answered = await app.inject({
      method: "POST",
      url: `/api/cases/${caseId}/answers`,
      payload: { answers: { [qid]: "not_authorized" } },
    });
    expect(answered.statusCode).toBe(200);
    const done = answered.json();
    expect(done.status).toBe("completed");
    expect(done.pendingQuestions).toBeUndefined();
    expect(done.memo).toContain("Owner instruction");
    expect(done.trace.some((s: { kind: string }) => s.kind === "HUMAN")).toBe(true);

    // The report is now persisted and foots to $36,580 (not_authorized == F3 disputed).
    const report = await app.inject({ method: "GET", url: `/api/cases/${caseId}/report` });
    expect(report.statusCode).toBe(200);
    expect(report.json().totalSuspectedOvercharge).toBe(36580);
  });

  it("400s an /answers body that is not a string→string map", async () => {
    app = await newServer();
    const res = await app.inject({
      method: "POST",
      url: "/api/cases/case_anything/answers",
      payload: { answers: { q1: 5 } }, // non-string value
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_answers");
  });

  it("404s /answers for an unknown case", async () => {
    app = await newServer();
    const res = await app.inject({
      method: "POST",
      url: "/api/cases/case_nope/answers",
      payload: { answers: {} },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("case_not_found");
  });

  it("503s the upload when object storage is not configured", async () => {
    app = await buildServer({
      ranker: scriptedRanker,
      caseRepository: new InMemoryCaseRepository(),
      blobStore: null,
    });
    const { body, contentType } = buildMultipart(demoUploadParts());
    const res = await app.inject({
      method: "POST",
      url: "/api/cases",
      headers: { "content-type": contentType },
      payload: body,
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe("persistence_not_configured");
  });
});
