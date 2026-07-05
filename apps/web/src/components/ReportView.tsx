import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import type {
  AuditReport,
  Finding,
  RecommendedAction,
  Severity,
} from "@feeforensics/shared";
import { Badge } from "@/components/ui/Badge";
import { CitationPill } from "@/components/CitationPill";
import { EvidenceProvider } from "@/components/EvidenceProvider";
import { ConfidenceMeter } from "@/components/ConfidenceMeter";
import { DisputeBuilder } from "@/components/DisputeBuilder";
import { DownloadButton } from "@/components/DownloadButton";
import { Markdown } from "@/components/Markdown";
import type { SourceDocument } from "@/lib/documents";
import type { DisputeContext } from "@/lib/disputePacket";
import { CHECK_LABEL, cn, formatCurrency } from "@/lib/utils";

const SEVERITY_STYLE: Record<Severity, string> = {
  high: "bg-rose-100 text-rose-700",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-slate-100 text-slate-600",
  review: "bg-slate-100 text-slate-600",
};

const ACTION_LABEL: Record<RecommendedAction, string> = {
  dispute: "Dispute recommended",
  request_explanation: "Request explanation",
  approve: "Approve",
  human_review: "Human review",
};

export interface ReportViewProps {
  report: AuditReport;
  /** Sub-headline under the impact number, e.g. "The Harborline Hotel · June 2026". */
  subtitle: string;
  /** "Back to trace" target. */
  backHref: string;
  /** Downloaded memo filename. */
  memoFilename: string;
  /** Downloaded dispute-packet filename. */
  packetFilename: string;
  /** Evidence-viewer registry. Omit for the bundled demo documents. */
  documents?: Record<string, SourceDocument>;
  /** Party/period the dispute packet is addressed with. Omit for the demo. */
  disputeContext?: DisputeContext;
  /** Export-PDF (print route) link; omit when the case has no print route. */
  printHref?: string;
}

/**
 * The findings + calculation + memo + dispute report body, shared by the demo
 * case and uploaded cases. The only differences between them are the labels,
 * the evidence-document registry, and whether a print route exists.
 */
export function ReportView({
  report,
  subtitle,
  backHref,
  memoFilename,
  packetFilename,
  documents,
  disputeContext,
  printHref,
}: ReportViewProps) {
  const { findings, calculationResult, memoMarkdown } = report;
  // Derive each finding's detection check from the calculator's line-item
  // impacts (same order). See CHECK_LABEL note in lib/utils.
  const checkFor = (i: number): string | undefined => {
    const impact = calculationResult.lineItemImpacts[i];
    return impact ? CHECK_LABEL[impact.issueType] : undefined;
  };

  return (
    <EvidenceProvider documents={documents}>
      <div className="mx-auto max-w-4xl px-4 py-10">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to trace
        </Link>

        {/* Impact strip */}
        <section className="mt-4 card flex flex-wrap items-center justify-between gap-6 p-6">
          <div>
            <p className="text-sm text-slate-600">Total suspected overcharge</p>
            <p className="text-4xl font-bold text-rose-600">
              {formatCurrency(report.totalSuspectedOvercharge)}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {findings.length} findings · {subtitle}
            </p>
          </div>
          <div>
            <p className="text-sm text-slate-600">Confidence</p>
            <ConfidenceMeter confidence={report.confidence} />
          </div>
        </section>

        {/* Findings */}
        <h2 className="mt-10 text-lg font-bold tracking-tight">Findings</h2>
        <div className="mt-3 space-y-4">
          {findings.map((finding, i) => (
            <FindingCard key={finding.id} finding={finding} check={checkFor(i)} />
          ))}
        </div>

        {/* Calculation breakdown */}
        <h2 className="mt-10 text-lg font-bold tracking-tight">
          Calculation breakdown
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Every number below is computed by the deterministic calculator, not the
          model.
        </p>
        <div className="mt-3 card overflow-hidden">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              <Row label="Expected base fee" value={calculationResult.expectedBaseFee} />
              <Row
                label="Expected incentive fee"
                value={calculationResult.expectedIncentiveFee}
              />
              <Row
                label="Expected total fees"
                value={calculationResult.expectedTotalFees}
                strong
              />
              <Row
                label="Charged total fees"
                value={calculationResult.chargedTotalFees}
                strong
              />
              <tr className="bg-rose-50">
                <td className="px-4 py-3 font-semibold text-rose-700">
                  Variance (overcharge)
                </td>
                <td className="px-4 py-3 text-right font-mono font-bold text-rose-700">
                  {formatCurrency(calculationResult.variance)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Memo */}
        <div className="mt-10 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold tracking-tight">Audit memo</h2>
          <div className="flex items-center gap-2">
            {printHref && (
              <Link
                href={printHref}
                target="_blank"
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-brand-300 hover:text-brand-700"
              >
                <Printer className="h-4 w-4" />
                Export PDF
              </Link>
            )}
            <DownloadButton
              content={memoMarkdown}
              filename={memoFilename}
              label="Download memo"
            />
          </div>
        </div>
        <div className="mt-3 card p-6">
          <Markdown>{memoMarkdown}</Markdown>
        </div>

        {/* Dispute builder */}
        <div className="mt-10">
          <DisputeBuilder
            findings={findings}
            {...(disputeContext ? { context: disputeContext } : {})}
            packetFilename={packetFilename}
          />
        </div>
      </div>
    </EvidenceProvider>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <tr>
      <td
        className={cn(
          "px-4 py-3 text-slate-600",
          strong && "font-semibold text-slate-900",
        )}
      >
        {label}
      </td>
      <td
        className={cn(
          "px-4 py-3 text-right font-mono text-slate-700",
          strong && "font-semibold text-slate-900",
        )}
      >
        {formatCurrency(value)}
      </td>
    </tr>
  );
}

function FindingCard({ finding, check }: { finding: Finding; check?: string }) {
  return (
    <article className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={SEVERITY_STYLE[finding.severity]}>
              {finding.severity}
            </Badge>
            {check && (
              <Badge className="bg-brand-50 text-brand-700 ring-1 ring-brand-100">
                Detected by {check}
              </Badge>
            )}
          </div>
          <h3 className="mt-2 font-semibold text-slate-900">{finding.title}</h3>
        </div>
        <div className="text-right">
          <p className="text-xl font-bold text-rose-600">
            {formatCurrency(finding.suspectedImpact)}
          </p>
          <p className="text-xs font-medium text-slate-500">
            {ACTION_LABEL[finding.recommendedAction]}
          </p>
        </div>
      </div>

      <p className="mt-3 text-sm text-slate-600">{finding.explanation}</p>

      {finding.citations.length > 0 && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {finding.citations.map((c, idx) => (
            <CitationPill key={idx} citation={c} />
          ))}
        </div>
      )}
    </article>
  );
}
