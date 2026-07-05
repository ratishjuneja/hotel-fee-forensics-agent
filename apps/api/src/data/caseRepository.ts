import type { AuditReport } from "@feeforensics/shared";

/**
 * Persistence boundary for audit reports (case metadata + uploaded-file storage
 * arrive with the BYO-upload work in PR-14b).
 *
 * The production implementation talks to **Vultr Managed PostgreSQL** — see
 * `PostgresCaseRepository`. There is deliberately NO in-memory production
 * implementation: an in-memory store standing in for the database reads as
 * "faking the DB" under open-source judging (see `docs/Rules.md`). Tests inject
 * the in-memory fake below, which is a legitimate test double, never wired into
 * `buildServer`'s production default.
 *
 * `buildServer` resolves this to a real Postgres repository when `DATABASE_URL`
 * is configured, or `null` otherwise — in which case the audit routes fail
 * loudly with 503 rather than silently skipping persistence.
 */
export interface CaseRepository {
  /**
   * Run any idempotent schema migration (CREATE TABLE IF NOT EXISTS ...).
   * Safe to call on every boot.
   */
  init(): Promise<void>;

  /** Persist (upsert) the latest audit report for a case. */
  saveReport(caseId: string, report: AuditReport): Promise<void>;

  /** The latest persisted report for a case, or `null` if none exists. */
  getReport(caseId: string): Promise<AuditReport | null>;

  /** Release resources (e.g. the connection pool). Called on server close. */
  close(): Promise<void>;
}
