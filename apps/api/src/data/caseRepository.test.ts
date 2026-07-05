import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { AuditReport } from "@feeforensics/shared";

import type { CaseRepository } from "./caseRepository.js";
import { InMemoryCaseRepository } from "./caseRepository.fake.js";
import { PostgresCaseRepository } from "./postgresCaseRepository.js";

/**
 * One contract exercised by BOTH implementations: the in-memory test double
 * (always) and the real Vultr Managed PostgreSQL adapter (only when
 * `DATABASE_URL` is set, so local/CI without a database just skips it). Keeping
 * the assertions identical is what lets the fake stand in for Postgres in the
 * route tests without hiding a divergence in behavior.
 */

const sampleReport = (caseId: string): AuditReport => ({
  id: `report_${caseId}`,
  caseId,
  executiveSummary: "Synthetic report for persistence tests.",
  totalSuspectedOvercharge: 36580,
  confidence: 0.96,
  confidenceBreakdown: [
    { key: "clause_found", label: "Clause found", points: 25, max: 25, explanation: "ok" },
  ],
  findings: [],
  calculationResult: {
    caseId,
    expectedBaseFee: 0,
    expectedIncentiveFee: 0,
    expectedTotalFees: 239620,
    chargedTotalFees: 276200,
    variance: 36580,
    lineItemImpacts: [],
  },
  memoMarkdown: "# Memo\nCites APPROVAL-0612-03.",
  disputeEmail: { subject: "Fee dispute", body: "Please review." },
  createdAt: "2026-07-04T00:00:00.000Z",
});

interface RepoUnderTest {
  name: string;
  create: () => CaseRepository;
}

const repos: RepoUnderTest[] = [
  { name: "InMemoryCaseRepository", create: () => new InMemoryCaseRepository() },
];

// The real adapter only runs where a database is configured.
if (process.env.DATABASE_URL) {
  repos.push({
    name: "PostgresCaseRepository",
    create: () => new PostgresCaseRepository(process.env.DATABASE_URL!),
  });
}

describe.each(repos)("CaseRepository contract — $name", ({ create }) => {
  let repo: CaseRepository;
  // Unique per test so a shared live database never collides across runs.
  const caseId = `case_test_${Math.random().toString(36).slice(2)}`;

  beforeEach(async () => {
    repo = create();
    await repo.init();
  });
  afterEach(async () => {
    await repo.close();
  });

  it("init() is idempotent (safe to call again)", async () => {
    await expect(repo.init()).resolves.toBeUndefined();
  });

  it("returns null for a case with no saved report", async () => {
    expect(await repo.getReport(caseId)).toBeNull();
  });

  it("saves a report and reads it back", async () => {
    const report = sampleReport(caseId);
    await repo.saveReport(caseId, report);
    const read = await repo.getReport(caseId);
    expect(read).not.toBeNull();
    expect(read!.caseId).toBe(caseId);
    expect(read!.totalSuspectedOvercharge).toBe(36580);
    expect(read!.confidence).toBe(0.96);
    expect(read!.calculationResult.variance).toBe(36580);
    expect(read!.memoMarkdown).toContain("APPROVAL-0612-03");
  });

  it("upserts — the latest saved report wins", async () => {
    await repo.saveReport(caseId, sampleReport(caseId));
    const updated = { ...sampleReport(caseId), totalSuspectedOvercharge: 999 };
    await repo.saveReport(caseId, updated);
    const read = await repo.getReport(caseId);
    expect(read!.totalSuspectedOvercharge).toBe(999);
  });

  it("isolates persisted state from later mutation of the returned object", async () => {
    await repo.saveReport(caseId, sampleReport(caseId));
    const first = await repo.getReport(caseId);
    first!.totalSuspectedOvercharge = -1;
    const second = await repo.getReport(caseId);
    expect(second!.totalSuspectedOvercharge).toBe(36580);
  });
});
