/**
 * Base URL of the FeeForensics API. Prepended to every `/api/...` path.
 *
 * Resolution order:
 *   1. `NEXT_PUBLIC_API_BASE_URL` if set (inlined at build time) — use this to
 *      point the browser at an explicit API origin.
 *   2. In the browser with nothing configured → "" (same-origin, relative URLs
 *      like `/api/cases`). The deploy host must proxy `/api/*` to the backend.
 *      This is what keeps a dev-only `localhost:4000` out of the prod bundle —
 *      the browser can't reach the VM's localhost, so baking it in is a footgun.
 *   3. Server-side (SSR / build) with nothing configured → `http://localhost:4000`,
 *      where the Fastify API is reachable on the same machine.
 */
function resolveApiBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (explicit) return explicit;
  if (typeof window !== "undefined") return "";
  return "http://localhost:4000";
}

export const API_BASE_URL = resolveApiBaseUrl();
