import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { z } from "zod";

// Load the repo-root .env first (running via `npm run dev -w @feeforensics/api`
// sets cwd to apps/api), then any local .env as an override for convenience.
loadEnv({ path: resolve(process.cwd(), "../../.env") });
loadEnv();

const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default("0.0.0.0"),
  /** Comma-separated list of allowed CORS origins for the web app. */
  CORS_ORIGIN: z.string().default("http://localhost:3000"),

  // Vultr Serverless Inference (core path). Optional so the API still boots
  // for local UI work; inference calls fail loudly when unconfigured.
  VULTR_INFERENCE_API_KEY: z.string().optional(),
  VULTR_INFERENCE_BASE_URL: z.string().url().optional(),
  VULTR_INFERENCE_MODEL: z.string().optional(),
});

export const env = EnvSchema.parse(process.env);

export const isVultrConfigured = Boolean(
  env.VULTR_INFERENCE_API_KEY &&
    env.VULTR_INFERENCE_BASE_URL &&
    env.VULTR_INFERENCE_MODEL,
);

export const corsOrigins = env.CORS_ORIGIN.split(",")
  .map((o) => o.trim())
  .filter(Boolean);
