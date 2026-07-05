import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import type {
  AuditReport,
  Finding,
  RecommendedAction,
  Severity,
} from "@feeforensics/shared";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CitationPill } from "@/components/CitationPill";
import { EvidenceProvider } from "@/components/EvidenceProvider";
import { ConfidenceMeter } from "@/components/ConfidenceMeter";
import { DisputeBuilder } from "@/components/DisputeBuilder";
import { DownloadButton } from "@/components/DownloadButton";
import { Markdown } from "@/components/Markdown";
import type { SourceDocument } from "@/lib/documents";
import type { DisputeContext } from "@/lib/disputePacket";
import { CHECK_LABEL, cn, formatCurrency } from "@/lib/utils";

const SEVERITY_VARIANT: Record<Severity, "danger" | "warning" | "neutral"> = {
  high: "danger",
  medium: "warning",
  low: "neutral",
  review: "neutral",
};

const ACTION_LABEL: Record<RecommendedAction, string> = {
  dispute: "Dispute recommended",
  request_explanation: "Request explanation",
  approve: "Approve",
  human_review: "Human review",
};

export interface ReportViewProps {
  report: AuditReport;
  /** Sub-headline under the impact number, e.g. "<hotel name> · <audit month>". */
  subtitle: string;
  /** "Back to trace" target. */
  backHref: string;
  /** Downloaded memo filename. */
  memoFilename: string;
  /** Downloaded dispute-packet filename. */
  packetFilename: string;
  /** Evidence-viewer registry built from the case's parsed uploads. */
  documents?: Record<string, SourceDocument>;
  /** Party/period the dispute packet is addressed with. */
  disputeContext?: DisputeContext;
  /** Export-PDF (print route) link; omit when the case has no print route. */
  printHref?: string;
}

/**
 * The findings + calculation + memo + dispute report for an uploaded case.
 * Everything it renders comes from the case's own run: the report, the evidence
 * registry built from the uploaded documents, and the case's party/period labels.
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
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href={backHref}>
            <ArrowLeft className="h-4 w-4" />
            Back to trace
          </Link>
        </Button>

        {/* Impact strip */}
        <Card className="mt-4 grid gap-6 p-6 sm:grid-cols-[1.2fr_1fr] sm:items-center">
          <div>
            <p className="text-sm text-muted">Total suspected overcharge</p>
            <p className="mt-1 font-mono text-4xl font-semibold tabular-nums text-danger sm:text-5xl">
              {formatCurrency(report.totalSuspectedOvercharge)}
            </p>
            <p className="mt-1.5 text-sm text-subtle">
              {findings.length} {findings.length === 1 ? "finding" : "findings"}{" "}
              · {subtitle}
            </p>
          </div>
          <div className="border-t border-border pt-5 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
            <p className="mb-2 text-sm text-muted">Confidence</p>
            <ConfidenceMeter
              confidence={report.confidence}
              {...(report.confidenceBreakdown
                ? { breakdown: report.confidenceBreakdown }
                : {})}
            />
          </div>
        </Card>

        {/* Findings */}
        <SectionHeading className="mt-10">Findings</SectionHeading>
        <div className="mt-3 space-y-4">
          {findings.map((finding, i) => (
            <FindingCard key={finding.id} finding={finding} check={checkFor(i)} />
          ))}
        </div>

        {/* Calculation ledger */}
        <SectionHeading className="mt-10">Calculation breakdown</SectionHeading>
        <p className="mt-1 text-sm text-muted">
          Every number below is computed by the deterministic calculator, not the
          model.
        </p>
        <Card className="mt-3 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border">
                <LedgerRow
                  label="Expected base fee"
                  value={calculationResult.expectedBaseFee}
                />
                <LedgerRow
                  label="Expected incentive fee"
                  value={calculationResult.expectedIncentiveFee}
                />
                <LedgerRow
                  label="Expected total fees"
                  value={calculationResult.expectedTotalFees}
                  strong
                />
                <LedgerRow
                  label="Charged total fees"
                  value={calculationResult.chargedTotalFees}
                  strong
                />
                <tr className="bg-danger-soft/60">
                  <td className="px-4 py-3 font-semibold text-danger-soft-foreground">
                    Variance (overcharge)
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold tabular-nums text-danger-soft-foreground">
                    {formatCurrency(calculationResult.variance)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>

        {/* Memo */}
        <div className="mt-10 flex flex-wrap items-center justify-between gap-2">
          <SectionHeading>Audit memo</SectionHeading>
          <div className="flex items-center gap-2">
            {printHref && (
              <Button asChild variant="outline" size="sm">
                <Link href={printHref} target="_blank">
                  <Printer className="h-4 w-4" />
                  Export PDF
                </Link>
              </Button>
            )}
            <DownloadButton
              content={memoMarkdown}
              filename={memoFilename}
              label="Download memo"
            />
          </div>
        </div>
        <Card className="mt-3 p-6">
          <Markdown>{memoMarkdown}</Markdown>
        </Card>

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

function SectionHeading({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={cn(
        "text-lg font-semibold tracking-tight text-foreground",
        className,
      )}
    >
      {children}
    </h2>
  );
}

function LedgerRow({
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
          "px-4 py-3 text-muted",
          strong && "font-semibold text-foreground",
        )}
      >
        {label}
      </td>
      <td
        className={cn(
          "px-4 py-3 text-right font-mono tabular-nums text-foreground",
          strong && "font-semibold",
        )}
      >
        {formatCurrency(value)}
      </td>
    </tr>
  );
}

function FindingCard({ finding, check }: { finding: Finding; check?: string }) {
  return (
    <Card className="p-5" interactive>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={SEVERITY_VARIANT[finding.severity]}>
              {finding.severity}
            </Badge>
            {check && <Badge variant="neutral">Detected by {check}</Badge>}
          </div>
          <h3 className="mt-2 font-semibold text-foreground">
            {finding.title}
          </h3>
        </div>
        <div className="text-right">
          <p className="font-mono text-xl font-semibold tabular-nums text-danger">
            {formatCurrency(finding.suspectedImpact)}
          </p>
          <p className="text-xs font-medium text-muted">
            {ACTION_LABEL[finding.recommendedAction]}
          </p>
        </div>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-muted">
        {finding.explanation}
      </p>

      {finding.citations.length > 0 && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {finding.citations.map((c, idx) => (
            <CitationPill key={idx} citation={c} />
          ))}
        </div>
      )}
    </Card>
  );
}
