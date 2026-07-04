import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { AuditReport } from "@feeforensics/shared";
import { getReport } from "@/lib/api";
import { CACHED_REPORT } from "@/lib/cachedRun";
import { Markdown } from "@/components/Markdown";
import { AutoPrint } from "@/components/AutoPrint";
import { buildEmail } from "@/lib/disputePacket";
import { formatCurrency, formatPercent } from "@/lib/utils";

// Always fetch live (with the same silent fallback the report page uses).
export const dynamic = "force-dynamic";

export default async function ReportPrintPage() {
  let report: AuditReport;
  try {
    report = await getReport();
  } catch {
    report = CACHED_REPORT;
  }

  const { findings, memoMarkdown } = report;
  const email = buildEmail(findings);

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 print:px-0 print:py-0">
      {/* Toolbar — hidden when printing */}
      <div className="mb-8 flex items-center justify-between print:hidden">
        <Link
          href="/cases/demo/report"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to report
        </Link>
        <AutoPrint />
      </div>

      {/* Printable document */}
      <header className="mb-6 border-b border-slate-200 pb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
          FeeForensics · Fee Audit
        </p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">
          The Harborline Hotel — June 2026
        </h1>
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-600">
          <span>
            <strong className="text-rose-600">
              {formatCurrency(report.totalSuspectedOvercharge)}
            </strong>{" "}
            identified fee issues
          </span>
          <span>{findings.length} findings</span>
          <span>{formatPercent(report.confidence)} confidence</span>
        </div>
      </header>

      <Markdown>{memoMarkdown}</Markdown>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-slate-900">
          Draft dispute email
        </h2>
        <p className="mt-2 text-sm">
          <span className="font-semibold text-slate-500">Subject:</span>{" "}
          <span className="text-slate-900">{email.subject}</span>
        </p>
        <pre className="mt-3 whitespace-pre-wrap font-sans text-sm text-slate-700">
          {email.body}
        </pre>
      </section>

      <p className="mt-10 border-t border-slate-200 pt-4 text-center text-xs text-slate-400 print:mt-6">
        Synthetic demonstration document · FeeForensics · not a real hotel,
        contract, or customer data.
      </p>
    </div>
  );
}
