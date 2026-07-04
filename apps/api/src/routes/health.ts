import type { FastifyInstance } from "fastify";
import { env } from "../config/env.js";
import { vultrStatus } from "../lib/vultr.js";

/** Liveness + non-secret config diagnostics. */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async () => ({
    status: "ok",
    service: "@feeforensics/api",
    env: env.NODE_ENV,
    vultr: vultrStatus(),
    timestamp: new Date().toISOString(),
  }));
}
