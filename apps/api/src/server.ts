import { pathToFileURL } from "node:url";
import Fastify from "fastify";
import type { FastifyError } from "fastify";
import cors from "@fastify/cors";
import type { OrchestratorLlm } from "@feeforensics/agent";
import { corsOrigins, env, isVultrConfigured } from "./config/env.js";
import { createAuditLlm } from "./lib/llm.js";
import { createRateLimiter } from "./lib/rateLimit.js";
import { healthRoutes } from "./routes/health.js";
import { demoCaseRoutes } from "./routes/demoCase.js";
import { auditRoutes } from "./routes/audit.js";

export interface BuildServerOptions {
  /**
   * LLM transport for the audit agent. Omit for the default (live Vultr
   * `chatComplete` when configured, otherwise null → run-audit 503s). Tests
   * inject a scripted fake here so no VULTR_* env vars are needed.
   */
  llm?: OrchestratorLlm | null;
}

export async function buildServer(options: BuildServerOptions = {}) {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === "development" ? "info" : "warn",
    },
    // Bound request bodies — the demo posts tiny payloads; anything large is abuse.
    bodyLimit: 256 * 1024,
  });

  await app.register(cors, { origin: corsOrigins });

  // Basic security headers on every response (no extra dependency).
  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("x-content-type-options", "nosniff");
    reply.header("x-frame-options", "DENY");
    reply.header("referrer-policy", "no-referrer");
    reply.header("cross-origin-resource-policy", "same-origin");
    return payload;
  });

  // Throttle every request per-IP so the expensive audit route can't be looped to
  // drain Vultr credits. Generous enough for the demo's handful of calls.
  app.addHook("onRequest", createRateLimiter({ windowMs: 60_000, max: 60 }));

  // Don't leak internals: log the real error server-side, return a generic message.
  // Known 4xx client errors (bad route/validation) keep their safe message.
  app.setErrorHandler((error: FastifyError, _request, reply) => {
    const status = error.statusCode ?? 500;
    app.log.error(error);
    if (status < 500) {
      reply.code(status).send({ error: "request_error", message: error.message });
    } else {
      reply.code(500).send({ error: "internal_error", message: "Internal server error." });
    }
  });

  await app.register(healthRoutes);
  await app.register(demoCaseRoutes);
  await app.register(auditRoutes, {
    llm: options.llm !== undefined ? options.llm : createAuditLlm(),
  });

  return app;
}

async function start() {
  const app = await buildServer();
  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    if (!isVultrConfigured) {
      app.log.warn(
        "Vultr inference is NOT configured — /api/demo-case works, but audit runs will fail until VULTR_* env vars are set.",
      );
    }
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// Only auto-start when run as the entry point (`tsx src/server.ts`); importing
// `buildServer` from tests must not open a port.
const isEntryPoint =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  start();
}
