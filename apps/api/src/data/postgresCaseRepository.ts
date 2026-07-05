import pg from "pg";

import type { AuditReport } from "@feeforensics/shared";

import type { CaseRepository } from "./caseRepository.js";

const { Pool } = pg;

/**
 * Derive node-postgres Pool config from a connection URL.
 *
 * Vultr Managed PostgreSQL serves TLS with a per-cluster **self-signed CA** that
 * is not in the system trust store. Recent node-postgres treats
 * `sslmode=require` *in the connection string* as full chain verification (and
 * it overrides an explicit `ssl` option), so a `sslmode=require` URL throws
 * `SELF_SIGNED_CERT_IN_CHAIN` at connect time. We therefore strip `sslmode` from
 * the URL and drive TLS purely through the `ssl` option: the connection stays
 * encrypted, but chain verification is relaxed. (A future hardening could pass
 * the cluster CA via `ssl.ca` for verify-full.)
 */
export function poolConfigFromConnectionString(connectionString: string): pg.PoolConfig {
  const sslModes = /^(require|prefer|verify-ca|verify-full)$/i;
  try {
    const url = new URL(connectionString);
    const mode = url.searchParams.get("sslmode");
    const requiresSsl = mode != null && sslModes.test(mode);
    if (url.searchParams.has("sslmode")) {
      url.searchParams.delete("sslmode");
    }
    return {
      connectionString: url.toString(),
      ...(requiresSsl ? { ssl: { rejectUnauthorized: false } } : {}),
    };
  } catch {
    // Not a parseable URL — leave it as-is and detect the mode textually.
    const requiresSsl = /sslmode=(require|prefer|verify-ca|verify-full)/i.test(connectionString);
    return {
      connectionString,
      ...(requiresSsl ? { ssl: { rejectUnauthorized: false } } : {}),
    };
  }
}

/**
 * `CaseRepository` backed by **Vultr Managed PostgreSQL**.
 *
 * Reports are stored as `jsonb` keyed by case id (node-postgres serializes a
 * plain object parameter to JSON and parses `jsonb` back to an object, so the
 * `AuditReport` round-trips without manual `JSON.stringify`). `saveReport`
 * upserts so re-running an audit replaces the prior report for that case.
 *
 * A boot-time `CREATE TABLE IF NOT EXISTS` (`init`) keeps the single-VM demo
 * deployment migration-free; a real product would move this to a migration
 * tool. Case-metadata and uploaded-file tables land with the BYO-upload work.
 */
export class PostgresCaseRepository implements CaseRepository {
  private readonly pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new Pool(poolConfigFromConnectionString(connectionString));
  }

  async init(): Promise<void> {
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS reports (
         case_id    text PRIMARY KEY,
         report     jsonb NOT NULL,
         updated_at timestamptz NOT NULL DEFAULT now()
       )`,
    );
  }

  async saveReport(caseId: string, report: AuditReport): Promise<void> {
    await this.pool.query(
      `INSERT INTO reports (case_id, report, updated_at)
         VALUES ($1, $2, now())
       ON CONFLICT (case_id)
         DO UPDATE SET report = EXCLUDED.report, updated_at = now()`,
      [caseId, report],
    );
  }

  async getReport(caseId: string): Promise<AuditReport | null> {
    const result = await this.pool.query<{ report: AuditReport }>(
      `SELECT report FROM reports WHERE case_id = $1`,
      [caseId],
    );
    return result.rows[0]?.report ?? null;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
