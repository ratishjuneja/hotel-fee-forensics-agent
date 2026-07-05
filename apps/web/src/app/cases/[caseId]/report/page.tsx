import Link from "next/link";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import type {
  AuditReport,
  CaseDocumentsResponse,
  CaseStatusResponse,
} from "@feeforensics/shared";
import { ApiError, getCaseDocuments, getCaseStatus, getReport } from "@/lib/api";
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
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Link
          href={`/cases/${caseId}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Case status
        </Link>
        <div className="mt-4 card border-amber-200 bg-amber-50 p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <h2 className="font-semibold text-amber-900">
                {notReady ? "No audit has been run for this case yet." : "Could not load this report."}
              </h2>
              <p className="mt-1 text-sm text-amber-800">
                {notReady
                  ? "Run the agent first, then the findings and memo will appear here."
                  : "The report API could not be reached. This is an uploaded case, so it is not replaced with the demo report."}
              </p>
              <Link
                href={`/cases/${caseId}/run`}
                className="mt-3 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
              >
                {notReady ? "Run the audit" : "Retry the run"}
              </Link>
            </div>
          </div>
        </div>
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
