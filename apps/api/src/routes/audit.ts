import type { FastifyInstance } from "fastify";
import type { AuditReport, RunAuditResponse } from "@feeforensics/shared";
import { DEMO_CASE_ID } from "../data/demoCase.js";
import { mockAuditReport, mockRunAuditResponse } from "../data/mockAudit.js";

interface CaseParams {
  caseId: string;
}

/**
 * Mock audit routes.
 *
 * These return a hand-authored, contract-shaped result for the demo case so the
 * frontend can build every screen against a live API. The real agent
 * (packages/agent) will replace the internals while keeping these response
 * shapes. Only the preloaded demo case is supported for now.
 */
export async function auditRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/cases/:caseId/run-audit
  app.post<{ Params: CaseParams }>(
    "/api/cases/:caseId/run-audit",
    async (request, reply): Promise<RunAuditResponse | void> => {
      if (request.params.caseId !== DEMO_CASE_ID) {
        return reply.code(404).send({
          error: "case_not_found",
          message: `Only the demo case (${DEMO_CASE_ID}) is available in the MVP.`,
        });
      }
      // Mock is instant; the real agent will be async and may stream the trace.
      return mockRunAuditResponse;
    },
  );

  // GET /api/cases/:caseId/report
  app.get<{ Params: CaseParams }>(
    "/api/cases/:caseId/report",
    async (request, reply): Promise<AuditReport | void> => {
      if (request.params.caseId !== DEMO_CASE_ID) {
        return reply.code(404).send({
          error: "case_not_found",
          message: `Only the demo case (${DEMO_CASE_ID}) is available in the MVP.`,
        });
      }
      return mockAuditReport;
    },
  );
}
