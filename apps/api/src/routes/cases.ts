import { randomUUID } from "node:crypto";

import fastifyMultipart from "@fastify/multipart";
import type { PdfExtractor, RunAuditInput } from "@feeforensics/agent";
import type { CaseSourceDocument } from "@feeforensics/shared";
import type { FastifyInstance } from "fastify";

import type { BlobStore } from "../data/blobStore.js";
import type { CaseRecord, CaseRepository } from "../data/caseRepository.js";
import {
  assembleCase,
  CaseAssemblyError,
  type CaseUpload,
  type UploadedFile,
  type UploadRole,
} from "../lib/caseAssembler.js";

export interface CasesRouteOptions {
  caseRepository: CaseRepository | null;
  blobStore: BlobStore | null;
  /** Digital-PDF text extractor (pdfjs-dist). Omit to reject PDF uploads. */
  pdfExtractor?: PdfExtractor;
}

/** Per-file cap for the upload route ONLY — the global JSON bodyLimit is untouched. */
const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Total files accepted per upload — the optional roles allow several files each. */
const MAX_FILES = 24;

const UPLOAD_ROLES: readonly UploadRole[] = [
  "hma",
  "statement",
  "statement_prior",
  "support_pack",
  "supplementary",
  "extra_docs",
];

/**
 * BYO case routes:
 *   POST /api/cases        — multipart upload (typed roles + ownerNotes +
 *                            draftEmail), stores files to Vultr Object Storage,
 *                            creates a case (status "parsing"), kicks an async
 *                            parse job, returns { caseId, status } (202).
 *   GET  /api/cases/:id    — parse status + per-document warnings (frontend polls).
 *   GET  /api/cases/:id/documents — the parsed source documents of a ready case,
 *                            verbatim, so the evidence viewer shows what the
 *                            agent actually read (never the demo stand-ins).
 *
 * Persistence is required: with no case repository or blob store configured the
 * upload route 503s rather than dropping files or using an in-memory store.
 */
export async function casesRoutes(
  app: FastifyInstance,
  options: CasesRouteOptions,
): Promise<void> {
  // Scoped to this plugin: multipart parsing with a 10MB/file cap. Does NOT
  // change the global bodyLimit used by JSON routes.
  await app.register(fastifyMultipart, {
    limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES },
  });

  const persistenceUnconfigured = {
    error: "persistence_not_configured",
    message:
      "Vultr persistence is not configured. Set DATABASE_URL and the VULTR_OBJECT_STORAGE_* " +
      "vars (see .env.example) — uploaded cases are not stored in memory.",
  };

  /** Parse the assembled case in the background; flips status ready/failed. */
  const runParseJob = async (
    repo: CaseRepository,
    base: CaseRecord,
    upload: CaseUpload,
  ): Promise<void> => {
    try {
      const { input, warnings, extraDocuments } = await assembleCase(base.id, upload, {
        ...(options.pdfExtractor ? { pdfExtractor: options.pdfExtractor } : {}),
      });
      await repo.saveCase({
        ...base,
        status: "ready",
        hotelName: input.hotelName,
        auditMonth: input.auditMonth,
        parseWarnings: warnings,
        assembledInput: input,
        ...(extraDocuments ? { extraDocuments } : {}),
      });
    } catch (err) {
      const warnings =
        err instanceof CaseAssemblyError
          ? err.warnings
          : [{ role: "case", documentName: "Upload", warnings: [String(err)] }];
      app.log.error({ caseId: base.id, err }, "case parse failed");
      await repo.saveCase({ ...base, status: "failed", parseWarnings: warnings });
    }
  };

  // POST /api/cases — multipart upload. @fastify/multipart streams the body, so
  // the small global JSON bodyLimit does not apply here; the per-file cap above
  // (busboy fileSize) is the effective limit.
  app.post("/api/cases", async (request, reply) => {
    if (options.caseRepository === null || options.blobStore === null) {
      return reply.code(503).send(persistenceUnconfigured);
    }
    const repo = options.caseRepository;
    const blobStore = options.blobStore;

    // Every role collects an ARRAY of files — the optional roles accept several,
    // and repeated multipart field names arrive as separate parts.
    const files: Partial<Record<UploadRole, Array<UploadedFile & { contentType: string }>>> = {};
    const fields: Record<string, string> = {};

    try {
      for await (const part of request.parts()) {
        if (part.type === "file") {
          if (!UPLOAD_ROLES.includes(part.fieldname as UploadRole)) {
            // Drain unknown file parts so the stream can continue.
            await part.toBuffer();
            continue;
          }
          const role = part.fieldname as UploadRole;
          const buffer = await part.toBuffer();
          (files[role] ??= []).push({
            filename: part.filename,
            buffer,
            contentType: part.mimetype || "application/octet-stream",
          });
        } else {
          fields[part.fieldname] = String(part.value);
        }
      }
    } catch (err) {
      if (err instanceof Error && /file too large|request file too large/i.test(err.message)) {
        return reply.code(413).send({
          error: "file_too_large",
          message: `Each file must be under ${MAX_FILE_BYTES / (1024 * 1024)}MB.`,
        });
      }
      throw err;
    }

    if (!files.hma?.[0] || !files.statement?.[0]) {
      return reply.code(400).send({
        error: "missing_required_document",
        message: "Both an HMA and an operating statement are required.",
      });
    }

    const caseId = `case_${randomUUID()}`;

    // Store every raw file to Object Storage before we accept the case. Keys are
    // indexed per role so multiple files in one role never collide.
    for (const role of UPLOAD_ROLES) {
      const roleFiles = files[role];
      if (!roleFiles) continue;
      let i = 0;
      for (const file of roleFiles) {
        await blobStore.put(
          `${caseId}/${role}/${i}-${file.filename}`,
          file.buffer,
          file.contentType,
        );
        i += 1;
      }
    }

    const draftEmail = fields.draftEmail === undefined ? true : fields.draftEmail !== "false";
    const upload: CaseUpload = {
      files: Object.fromEntries(
        UPLOAD_ROLES.filter((r) => files[r]?.length).map((r) => [
          r,
          files[r]!.map((f) => ({ filename: f.filename, buffer: f.buffer })),
        ]),
      ),
      draftEmail,
      ...(fields.ownerNotes ? { ownerNotes: fields.ownerNotes } : {}),
      ...(fields.hotelName ? { hotelName: fields.hotelName } : {}),
      ...(fields.auditMonth ? { auditMonth: fields.auditMonth } : {}),
    };

    const base: CaseRecord = {
      id: caseId,
      status: "parsing",
      hotelName: upload.hotelName?.trim() || "Uploaded Case",
      auditMonth: upload.auditMonth?.trim() || "",
      createdAt: new Date().toISOString(),
      parseWarnings: [],
      assembledInput: null,
    };
    await repo.saveCase(base);

    // Fire-and-forget the parse job (fast for text/CSV; the async shape lets
    // slower PDF/OCR paths slot in without changing the contract).
    void runParseJob(repo, base, upload);

    return reply.code(202).send({ caseId, status: "parsing" as const });
  });

  // GET /api/cases/:id — parse status + per-document warnings
  app.get<{ Params: { caseId: string } }>(
    "/api/cases/:caseId",
    async (request, reply) => {
      if (options.caseRepository === null) {
        return reply.code(503).send(persistenceUnconfigured);
      }
      const record = await options.caseRepository.getCase(request.params.caseId);
      if (!record) {
        return reply.code(404).send({
          error: "case_not_found",
          message: "No such case.",
        });
      }
      return {
        caseId: record.id,
        status: record.status,
        hotelName: record.hotelName,
        auditMonth: record.auditMonth,
        parseWarnings: record.parseWarnings,
      };
    },
  );

  // GET /api/cases/:id/documents — the parsed source documents, verbatim
  app.get<{ Params: { caseId: string } }>(
    "/api/cases/:caseId/documents",
    async (request, reply) => {
      if (options.caseRepository === null) {
        return reply.code(503).send(persistenceUnconfigured);
      }
      const record = await options.caseRepository.getCase(request.params.caseId);
      if (!record) {
        return reply.code(404).send({
          error: "case_not_found",
          message: "No such case.",
        });
      }
      if (record.status === "parsing") {
        return reply.code(409).send({
          error: "case_not_ready",
          message: "This case is still parsing — poll GET /api/cases/:id until status is ready.",
        });
      }
      if (record.status === "failed" || !record.assembledInput) {
        return reply.code(422).send({
          error: "case_parse_failed",
          message: "This case's documents could not be parsed.",
          parseWarnings: record.parseWarnings,
        });
      }
      const docs = record.assembledInput.documents;
      const documents: CaseSourceDocument[] = [
        { docId: docs.hma.docId, name: docs.hma.name, format: "text", content: docs.hma.text },
        ...(["statement", "miscBreakout", "priorStatement", "supportPack"] as const)
          .map((key): RunAuditInput["documents"]["statement"] | undefined => docs[key])
          .filter((doc) => doc !== undefined)
          .map((doc): CaseSourceDocument => ({
            docId: doc.docId,
            name: doc.name,
            format: "csv",
            content: doc.csv,
          })),
        // Extra documents the owner attached — shown verbatim, never calculated on.
        ...(record.extraDocuments ?? []),
      ];
      return { caseId: record.id, documents };
    },
  );
}
