import type { AuditReport } from "@feeforensics/shared";
import type { CaseRepository } from "./caseRepository.js";

/**
 * TEST DOUBLE — never wire this into production (`buildServer`'s default is the
 * Postgres repository or `null`; see `docs/Rules.md`, "no in-memory fallback").
 *
 * An in-memory `CaseRepository` for route/unit tests so the API can be exercised
 * without a live Vultr Managed PostgreSQL. It stores reports in a `Map` and
 * clones on the way in and out so a test can't accidentally mutate persisted
 * state through a shared reference (the Postgres impl round-trips through JSON,
 * so this mirrors that isolation).
 */
export class InMemoryCaseRepository implements CaseRepository {
  private readonly reports = new Map<string, AuditReport>();

  async init(): Promise<void> {
    // No schema to migrate for the in-memory double.
  }

  async saveReport(caseId: string, report: AuditReport): Promise<void> {
    this.reports.set(caseId, structuredClone(report));
  }

  async getReport(caseId: string): Promise<AuditReport | null> {
    const report = this.reports.get(caseId);
    return report ? structuredClone(report) : null;
  }

  async close(): Promise<void> {
    this.reports.clear();
  }
}
