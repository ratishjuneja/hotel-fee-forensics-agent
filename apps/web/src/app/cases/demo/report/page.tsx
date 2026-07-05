import type { AuditReport } from "@feeforensics/shared";
import { getReport } from "@/lib/api";
import { CACHED_REPORT } from "@/lib/cachedRun";
import { ReportView } from "@/components/ReportView";

// Always fetch the report live per request (never prerender at build time).
export const dynamic = "force-dynamic";

export default async function ReportPage() {
  // Silent demo-safety fallback: if the live API is unreachable, serve the
  // bundled report so the flow never dead-ends on an error (docs/AppFlow.md §6).
  let report: AuditReport;
  try {
    report = await getReport();
  } catch {
    console.info("[FeeForensics] Report API unreachable — serving bundled report.");
    report = CACHED_REPORT;
  }

  return (
    <ReportView
      report={report}
      subtitle="The Harborline Hotel · June 2026"
      backHref="/cases/demo/run"
      memoFilename="harborline-fee-audit-memo.md"
      packetFilename="harborline-dispute-packet.md"
      printHref="/cases/demo/report/print"
    />
  );
}
