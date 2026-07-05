import { describe, expect, it } from "vitest";

import { poolConfigFromConnectionString } from "./postgresCaseRepository.js";

/**
 * Unit tests for the Pool config derivation. The bug this guards against:
 * recent node-postgres treats `sslmode=require` IN THE CONNECTION STRING as full
 * CA verification, which throws SELF_SIGNED_CERT_IN_CHAIN against Vultr Managed
 * PostgreSQL (per-cluster self-signed CA, not in the system trust store) and
 * overrides an explicit `ssl` option. So we strip `sslmode` from the URL and
 * drive TLS purely through the `ssl` option.
 */
describe("poolConfigFromConnectionString", () => {
  const url =
    "postgres://vultradmin:secretpw@vultr-prod-abc123-vultr-prod-6751.vultrdb.com:16751/defaultdb?sslmode=require";

  it("strips sslmode from the connection string", () => {
    const cfg = poolConfigFromConnectionString(url);
    expect(cfg.connectionString).not.toContain("sslmode");
  });

  it("enables TLS with relaxed verification when sslmode requires it", () => {
    const cfg = poolConfigFromConnectionString(url);
    expect(cfg.ssl).toEqual({ rejectUnauthorized: false });
  });

  it("preserves credentials, host, port, and database", () => {
    const cfg = poolConfigFromConnectionString(url);
    const parsed = new URL(cfg.connectionString!);
    expect(parsed.username).toBe("vultradmin");
    expect(parsed.password).toBe("secretpw");
    expect(parsed.hostname).toBe("vultr-prod-abc123-vultr-prod-6751.vultrdb.com");
    expect(parsed.port).toBe("16751");
    expect(parsed.pathname).toBe("/defaultdb");
  });

  it("treats verify-full the same (relaxed, since we lack the cluster CA)", () => {
    const cfg = poolConfigFromConnectionString(url.replace("sslmode=require", "sslmode=verify-full"));
    expect(cfg.ssl).toEqual({ rejectUnauthorized: false });
    expect(cfg.connectionString).not.toContain("sslmode");
  });

  it("leaves a plain local connection string untouched (no TLS)", () => {
    const local = "postgres://localhost:5432/feeforensics";
    const cfg = poolConfigFromConnectionString(local);
    expect(cfg.connectionString).toBe(local);
    expect(cfg.ssl).toBeUndefined();
  });
});
