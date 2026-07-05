import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright drives the DEPLOYED FeeForensics site (no local server) so the UAT
 * drives are reproducible against the same target a human tester uses.
 *
 * Override the target with UAT_BASE_URL, e.g.
 *   UAT_BASE_URL=http://localhost:3000 npx playwright test
 *
 * NOTE: the default target is HTTP (insecure context). Some browser APIs
 * (navigator.clipboard) are unavailable there — the specs assert around that,
 * see happy-path.spec.ts. Each spec uploads SYNTHETIC files and creates a real
 * (synthetic) case in Vultr Postgres; a handful of runs is expected.
 */
export default defineConfig({
  testDir: ".",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  // Audit runs call Vultr + animate the trace reveal — give each step room.
  timeout: 120_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL: process.env.UAT_BASE_URL ?? "http://65.20.86.52",
    headless: true,
    actionTimeout: 30_000,
    navigationTimeout: 45_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Best-effort; ignored on insecure-context origins (documented in the specs).
    permissions: ["clipboard-read", "clipboard-write"],
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
