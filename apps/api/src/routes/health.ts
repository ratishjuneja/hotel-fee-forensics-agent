import type { FastifyInstance } from "fastify";
import { env } from "../config/env.js";
import { vultrStatus } from "../lib/vultr.js";

/**
 * Liveness probe. Public and unauthenticated, so it deliberately discloses only
 * that the service is up. Config diagnostics (env, whether Vultr is wired, model
 * name) are recon for an attacker and are exposed only outside production.
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async () => {
    const base = {
      status: "ok",
      service: "@feeforensics/api",
      timestamp: new Date().toISOString(),
    };
    if (env.NODE_ENV === "production") return base;
    return { ...base, env: env.NODE_ENV, vultr: vultrStatus() };
  });
}
