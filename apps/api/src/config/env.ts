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
  // Bind to loopback by default; set HOST=0.0.0.0 explicitly to expose the API
  // (do that only behind a firewall / TLS-terminating reverse proxy).
  HOST: z.string().default("127.0.0.1"),
  /** Comma-separated list of allowed CORS origins for the web app. */
  CORS_ORIGIN: z.string().default("http://localhost:3000"),

  // Vultr Serverless Inference (core path). Optional so the API still boots
  // for local UI work; inference calls fail loudly when unconfigured.
  VULTR_INFERENCE_API_KEY: z.string().optional(),
  // Require HTTPS (except localhost) so the Bearer API key is never sent in
  // plaintext to a misconfigured http:// endpoint.
  VULTR_INFERENCE_BASE_URL: z
    .string()
    .url()
    .refine(
      (u) => {
        try {
          const { protocol, hostname } = new URL(u);
          return (
            protocol === "https:" ||
            hostname === "localhost" ||
            hostname === "127.0.0.1"
          );
        } catch {
          return false;
        }
      },
      { message: "VULTR_INFERENCE_BASE_URL must use https:// (http is allowed only for localhost)" },
    )
    .optional(),
  VULTR_INFERENCE_MODEL: z.string().optional(),
  /**
   * Optional dedicated model for the agent's retrieval steps (e.g. a
   * VultronRetriever* flavor). Unset → every call uses VULTR_INFERENCE_MODEL.
   */
  VULTR_INFERENCE_RETRIEVER_MODEL: z.string().optional(),
});

export const env = EnvSchema.parse(process.env);

export const isVultrConfigured = Boolean(
  env.VULTR_INFERENCE_API_KEY &&
    env.VULTR_INFERENCE_BASE_URL &&
    env.VULTR_INFERENCE_MODEL,
);

/**
 * The audit pipeline's ONE required model: the VultronRetriever reranker.
 * (VULTR_INFERENCE_MODEL / chat is optional side infrastructure.)
 */
export const isRankerConfigured = Boolean(
  env.VULTR_INFERENCE_API_KEY &&
    env.VULTR_INFERENCE_BASE_URL &&
    env.VULTR_INFERENCE_RETRIEVER_MODEL,
);

export const corsOrigins = env.CORS_ORIGIN.split(",")
  .map((o) => o.trim())
  .filter(Boolean);
