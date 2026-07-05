import { env, isPersistenceConfigured } from "../config/env.js";
import type { CaseRepository } from "../data/caseRepository.js";
import { PostgresCaseRepository } from "../data/postgresCaseRepository.js";

/**
 * Resolve the production persistence boundary from the environment (dependency
 * points app → package; the agent package never imports the database).
 *
 * Returns a Vultr Managed PostgreSQL repository when `DATABASE_URL` is set, or
 * `null` when it is not — in which case the audit routes 503 rather than fall
 * back to an in-memory store (there is no in-memory production path; see
 * docs/Rules.md). Tests bypass this factory and inject the in-memory fake.
 */
export function createCaseRepository(): CaseRepository | null {
  if (!isPersistenceConfigured || !env.DATABASE_URL) return null;
  return new PostgresCaseRepository(env.DATABASE_URL);
}
