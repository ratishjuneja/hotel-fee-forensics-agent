import type { FastifyInstance } from "fastify";
import type { DemoCaseResponse } from "@feeforensics/shared";
import { demoCaseResponse } from "../data/demoCase.js";

/**
 * GET /api/demo-case
 * Returns the preloaded synthetic case so the demo runs without any upload.
 */
export async function demoCaseRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/demo-case", async (): Promise<DemoCaseResponse> => {
    return demoCaseResponse;
  });
}
