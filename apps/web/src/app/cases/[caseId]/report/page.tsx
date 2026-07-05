import Link from "next/link";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import type {
  AuditReport,
  CaseDocumentsResponse,
  CaseStatusResponse,
} from "@feeforensics/shared";
import { ApiError, getCaseDocuments, getCaseStatus, getReport } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ReportView } from "@/components/ReportView";
import { buildCaseDocumentRegistry } from "@/lib/caseDocuments";

// Always fetch live per request (never prerender at build time).
export const dynamic = "force-dynamic";

export default async function CaseReportPage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;

  let report: AuditReport;
  let status: CaseStatusResponse | null = null;
  let documents: CaseDocumentsResponse | null = null;
  try {
    // The report is required; status/documents only enrich the labels + evidence
    // viewer, so a failure there degrades gracefully to the report alone.
    [report, status, documents] = await Promise.all([
      getReport(caseId),
      getCaseStatus(caseId).catch(() => null),
      getCaseDocuments(caseId).catch(() => null),
    ]);
  } catch (err) {
    const notReady = err instanceof ApiError && err.status === 404;
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href={`/cases/${caseId}`}>
            <ArrowLeft className="h-4 w-4" />
            Case status
          </Link>
        </Button>
        <Card className="mt-4 border-warning/30 bg-warning-soft/40 p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning-soft-foreground" />
            <div>
              <h2 className="font-semibold text-foreground">
                {notReady
                  ? "No audit has been run for this case yet."
                  : "Could not load this report."}
              </h2>
              <p className="mt-1 text-sm text-muted">
                {notReady
                  ? "Run the agent first, then the findings and memo will appear here."
                  : "The report API could not be reached. This is an uploaded case, so it is not replaced with any canned report."}
              </p>
              <Button asChild size="sm" className="mt-4">
                <Link href={`/cases/${caseId}/run`}>
                  {notReady ? "Run the audit" : "Retry the run"}
                </Link>
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const hotel = status?.hotelName || "Uploaded Case";
  const period = status?.auditMonth || "";
  const subtitle = period ? `${hotel} · ${period}` : hotel;
  const registry = documents
    ? buildCaseDocumentRegistry(documents.documents)
    : undefined;

  return (
    <ReportView
      report={report}
      subtitle={subtitle}
      backHref={`/cases/${caseId}/run`}
      memoFilename={`fee-audit-memo-${caseId}.md`}
      packetFilename={`dispute-packet-${caseId}.md`}
      {...(registry ? { documents: registry } : {})}
      disputeContext={{ hotel, period: period || "the audit period" }}
    />
  );
}
