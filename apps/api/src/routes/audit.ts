import type { FastifyInstance } from "fastify";
import {
  runAudit,
  type OrchestratorLlm,
  type RunAuditResult,
} from "@feeforensics/agent";
import type { AuditReport } from "@feeforensics/shared";
import { DEMO_CASE_ID } from "../data/demoCase.js";
import { loadDemoAuditInput } from "../data/demoInput.js";

interface CaseParams {
  caseId: string;
}

export interface AuditRouteOptions {
  /**
   * LLM transport handed to the agent. `null` means Vultr inference is not
   * configured — run-audit fails loudly with 503 rather than returning a
   * degraded audit that looks real. (Transient failures DURING a run are a
   * different case: the orchestrator degrades those to cited fallbacks +
   * warnings, so a mid-demo inference hiccup never 500s.)
   */
  llm: OrchestratorLlm | null;
}

/** The API response keeps the mock-era contract shape and adds `warnings`. */
type AuditRouteResponse = Omit<RunAuditResult, "report">;

/**
 * Real audit routes: POST run-audit executes the full agent pipeline
 * (packages/agent `runAudit`) over the preloaded demo documents, synchronously
 * in the request — the web client awaits the POST, exactly as it did with the
 * mock. The resulting report is kept in memory for GET /report. Only the
 * preloaded demo case is supported in the MVP.
 */
export async function auditRoutes(
  app: FastifyInstance,
  options: AuditRouteOptions,
): Promise<void> {
  // Latest completed report per case. In-memory is enough for the single-VM
  // demo — a restart just means re-running the audit (no DB in the MVP).
  const reports = new Map<string, AuditReport>();

  // POST /api/cases/:caseId/run-audit
  // Body is intentionally not schema-validated: the client sends no body and
  // the run reads only the preloaded documents. Global `bodyLimit` (server.ts)
  // caps size; add a body schema when run options become a real input.
  app.post<{ Params: CaseParams }>(
    "/api/cases/:caseId/run-audit",
    async (request, reply): Promise<AuditRouteResponse | void> => {
      const { caseId } = request.params;
      if (caseId !== DEMO_CASE_ID) {
        return reply.code(404).send({
          error: "case_not_found",
          message: `Only the demo case (${DEMO_CASE_ID}) is available in the MVP.`,
        });
      }
      if (options.llm === null) {
        return reply.code(503).send({
          error: "vultr_not_configured",
          message:
            "Vultr Serverless Inference is not configured. Set VULTR_INFERENCE_API_KEY, " +
            "VULTR_INFERENCE_BASE_URL and VULTR_INFERENCE_MODEL (see .env.example), then retry.",
        });
      }

      const { report, ...response } = await runAudit(loadDemoAuditInput(), {
        llm: options.llm,
      });
      reports.set(caseId, report);
      if (response.warnings.length > 0) {
        request.log.warn(
          { caseId, warnings: response.warnings },
          "audit completed with degraded (fallback) steps",
        );
      }
      return response;
    },
  );

  // GET /api/cases/:caseId/report
  app.get<{ Params: CaseParams }>(
    "/api/cases/:caseId/report",
    async (request, reply): Promise<AuditReport | void> => {
      const { caseId } = request.params;
      if (caseId !== DEMO_CASE_ID) {
        return reply.code(404).send({
          error: "case_not_found",
          message: `Only the demo case (${DEMO_CASE_ID}) is available in the MVP.`,
        });
      }
      const report = reports.get(caseId);
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
