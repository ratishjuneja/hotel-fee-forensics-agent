import Fastify from "fastify";
import cors from "@fastify/cors";
import { corsOrigins, env, isVultrConfigured } from "./config/env.js";
import { healthRoutes } from "./routes/health.js";
import { demoCaseRoutes } from "./routes/demoCase.js";
import { auditRoutes } from "./routes/audit.js";

export async function buildServer() {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === "development" ? "info" : "warn",
    },
  });

  await app.register(cors, { origin: corsOrigins });

  await app.register(healthRoutes);
  await app.register(demoCaseRoutes);
  await app.register(auditRoutes);

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

start();
