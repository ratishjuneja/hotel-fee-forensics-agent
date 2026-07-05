import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  runAudit,
  type ChunkRanker,
  type RunAuditInput,
  type RunAuditResult,
} from "@feeforensics/agent";
import type { AnswerQuestionsRequest, AuditReport } from "@feeforensics/shared";
import { DEMO_CASE_ID } from "../data/demoCase.js";
import { loadDemoAuditInput } from "../data/demoInput.js";
import type { CaseRepository } from "../data/caseRepository.js";

interface CaseParams {
  caseId: string;
}

export interface AuditRouteOptions {
  /**
   * The pipeline's ONE model: a VultronRetriever flavor on Vultr's /v1/rerank
   * scoring every retrieval step. `null` means it is not configured —
   * run-audit fails loudly with 503 rather than returning an audit that never
   * touched Vultr. (Transient failures DURING a run are a different case: the
   * orchestrator degrades those to deterministic supersets + warnings, so a
   * mid-demo inference hiccup never 500s.)
   */
  ranker: ChunkRanker | null;
  /**
   * Vultr-backed persistence (Managed PostgreSQL). `null` means it is not
   * configured — the audit routes 503 rather than silently skipping the
   * database or falling back to an in-memory store (see docs/Rules.md).
   */
  caseRepository: CaseRepository | null;
}

/** The API response keeps the mock-era contract shape and adds `warnings`. */
type AuditRouteResponse = Omit<RunAuditResult, "report">;

/**
 * Real audit routes: POST run-audit executes the full agent pipeline
 * (packages/agent `runAudit`) synchronously in the request — the web client
 * awaits the POST. The input is either the preloaded demo case
 * (`case_demo_hotel_001`) or an uploaded BYO case's assembled input looked up
 * from the store. The resulting report is persisted to Vultr Managed PostgreSQL
 * (via the injected `CaseRepository`) for GET /report.
 *
 * Human-in-the-loop (PR-17): when the audit cannot decide a finding on evidence
 * alone it returns `status: "awaiting_input"` + cited `pendingQuestions` (HTTP
 * 202) instead of a report. The owner answers via POST /answers, which merges
 * the answers onto the stored case and REPLAYS the audit (no mid-run state is
 * serialized). The demo never pauses, so its flow is unchanged.
 */
export async function auditRoutes(
  app: FastifyInstance,
  options: AuditRouteOptions,
): Promise<void> {
  const persistenceUnconfigured = {
    error: "persistence_not_configured",
    message:
      "Vultr persistence is not configured. Set DATABASE_URL (Vultr Managed PostgreSQL, " +
      "see .env.example) — there is no in-memory fallback.",
  };

  /**
   * Run the audit for a resolved input and shape the reply: 202 +
   * pendingQuestions when it pauses for owner input, else 200 with the persisted
   * report. Shared by run-audit (no answers yet) and /answers (merged answers).
   */
  const runAndReply = async (
    request: FastifyRequest,
    reply: FastifyReply,
    caseId: string,
    input: RunAuditInput,
    answers: Record<string, string> | undefined,
  ): Promise<AuditRouteResponse> => {
    const { report, ...response } = await runAudit(
      { ...input, ...(answers ? { humanAnswers: answers } : {}) },
      { ranker: options.ranker! },
    );
    if (response.warnings.length > 0) {
      request.log.warn(
        { caseId, warnings: response.warnings },
        "audit completed with degraded (fallback) steps",
      );
    }
    if (response.status === "awaiting_input") {
      // Paused for owner input — no report to persist; the client renders the
      // cited pendingQuestions and POSTs answers to resume.
      reply.code(202);
      return response;
    }
    if (report) await options.caseRepository!.saveReport(caseId, report);
    return response;
  };

  // POST /api/cases/:caseId/run-audit
  // Body is intentionally not schema-validated: the run reads the demo case or
  // the stored assembled input. Global `bodyLimit` (server.ts) caps size.
  app.post<{ Params: CaseParams }>(
    "/api/cases/:caseId/run-audit",
    async (request, reply): Promise<AuditRouteResponse | void> => {
      const { caseId } = request.params;
      if (options.ranker === null) {
        return reply.code(503).send({
          error: "vultr_not_configured",
          message:
            "Vultr Serverless Inference is not configured. Set VULTR_INFERENCE_API_KEY, " +
            "VULTR_INFERENCE_BASE_URL and VULTR_INFERENCE_RETRIEVER_MODEL (see .env.example), then retry.",
        });
      }
      if (options.caseRepository === null) {
        // Fail before spending a Vultr call on a run we could not persist.
        return reply.code(503).send(persistenceUnconfigured);
      }

      // Resolve the run input: the preloaded demo case, or an uploaded case's
      // assembled input from the store. Any prior owner answers on the case are
      // merged in, so a re-run of run-audit stays consistent with /answers.
      let input: RunAuditInput;
      let answers: Record<string, string> | undefined;
      if (caseId === DEMO_CASE_ID) {
        input = loadDemoAuditInput();
      } else {
        const record = await options.caseRepository.getCase(caseId);
        if (!record) {
          return reply.code(404).send({
            error: "case_not_found",
            message: "No such case. Upload documents at POST /api/cases first.",
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
        input = record.assembledInput;
        answers = record.humanAnswers;
      }

      return runAndReply(request, reply, caseId, input, answers);
    },
  );

  // POST /api/cases/:caseId/answers — answer human-in-the-loop questions, then
  // REPLAY the audit with them merged in (no mid-run state is serialized). Only
  // uploaded cases can pause; the demo never reaches this. Returns 200 (report
  // now finalized) or 202 (more questions still open).
  app.post<{ Params: CaseParams; Body: AnswerQuestionsRequest }>(
    "/api/cases/:caseId/answers",
    async (request, reply): Promise<AuditRouteResponse | void> => {
      const { caseId } = request.params;
      if (options.ranker === null) {
        return reply.code(503).send({
          error: "vultr_not_configured",
          message:
            "Vultr Serverless Inference is not configured. Set VULTR_INFERENCE_API_KEY, " +
            "VULTR_INFERENCE_BASE_URL and VULTR_INFERENCE_RETRIEVER_MODEL (see .env.example), then retry.",
        });
      }
      if (options.caseRepository === null) {
        return reply.code(503).send(persistenceUnconfigured);
      }

      const body = request.body as AnswerQuestionsRequest | undefined;
      const incoming = body?.answers;
      if (
        !incoming ||
        typeof incoming !== "object" ||
        Array.isArray(incoming) ||
        Object.entries(incoming).some(([k, v]) => typeof k !== "string" || typeof v !== "string")
      ) {
        return reply.code(400).send({
          error: "invalid_answers",
          message: 'Body must be {"answers": { "<questionId>": "<optionId>", ... }} with string values.',
        });
      }

      const record = await options.caseRepository.getCase(caseId);
      if (!record) {
        return reply.code(404).send({
          error: "case_not_found",
          message: "No such case. Upload documents at POST /api/cases first.",
        });
      }
      if (record.status !== "ready" || !record.assembledInput) {
        return reply.code(422).send({
          error: "case_not_ready",
          message: "This case has no runnable audit to answer questions for.",
        });
      }

      // Accumulate answers on the case so a later replay (or another answer)
      // keeps every prior decision.
      const merged = { ...(record.humanAnswers ?? {}), ...incoming };
      await options.caseRepository.saveCase({ ...record, humanAnswers: merged });

      return runAndReply(request, reply, caseId, record.assembledInput, merged);
    },
  );

  // GET /api/cases/:caseId/report
  app.get<{ Params: CaseParams }>(
    "/api/cases/:caseId/report",
    async (request, reply): Promise<AuditReport | void> => {
      const { caseId } = request.params;
      if (options.caseRepository === null) {
        return reply.code(503).send(persistenceUnconfigured);
      }
      const report = await options.caseRepository.getReport(caseId);
      if (!report) {
        return reply.code(404).send({
          error: "report_not_ready",
          message: `No completed audit for this case yet — run the audit first (POST /api/cases/${caseId}/run-audit).`,
        });
      }
      return report;
    },
  );
}
