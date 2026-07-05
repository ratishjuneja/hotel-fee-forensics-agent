import pg from "pg";

import type { AuditReport } from "@feeforensics/shared";

import type { CaseRepository } from "./caseRepository.js";

const { Pool } = pg;

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
    // Vultr Managed PostgreSQL requires TLS. When the URL asks for it, enable
    // ssl explicitly — the managed CA is not in the system trust store, so
    // verification is relaxed (the connection is still encrypted). Local dev
    // without sslmode gets a plain connection.
    const requiresSsl = /sslmode=(require|verify-ca|verify-full)/i.test(connectionString);
    this.pool = new Pool({
      connectionString,
      ...(requiresSsl ? { ssl: { rejectUnauthorized: false } } : {}),
    });
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
