"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileText,
  Loader2,
} from "lucide-react";
import type { CaseStatusResponse } from "@feeforensics/shared";
import { getCaseStatus } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Progress } from "@/components/ui/Progress";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAutoScroll } from "@/lib/useAutoScroll";
import { cn } from "@/lib/utils";

const POLL_MS = 1_500;

/**
 * Parsing screen for an uploaded case: polls GET /api/cases/:id until the async
 * parse job lands, then hands off to the run screen. A failed parse is reported
 * honestly with the per-document warnings — never silently swapped for a demo.
 */
export default function CaseParsingPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const router = useRouter();
  const [status, setStatus] = useState<CaseStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const s = await getCaseStatus(caseId);
        if (!alive) return;
        setStatus(s);
        setError(null);
        if (s.status === "parsing") timer = setTimeout(poll, POLL_MS);
      } catch (err) {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "Could not load the case.");
      }
    };
    poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [caseId]);

  const ready = status?.status === "ready";
  const failed = status?.status === "failed";

  // Give the reader a beat to see "parsed", then move on to the run.
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => router.push(`/cases/${caseId}/run`), 1_400);
    return () => clearTimeout(t);
  }, [ready, caseId, router]);

  // Re-center on the outcome (ready / failed) once parsing resolves.
  const outcomeRef = useAutoScroll<HTMLDivElement>(status?.status, {
    enabled: ready || failed,
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/cases/new">
          <ArrowLeft className="h-4 w-4" />
          New audit
        </Link>
      </Button>

      <header className="mt-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Preparing your case
          </h1>
          <p className="mt-1 text-sm text-muted">
            Documents are stored and parsed before the agent runs — nothing is
            analyzed until every readable document is in.
          </p>
        </div>
        <ParseStatus ready={ready} failed={failed} />
      </header>

      {!ready && !failed && !error && (
        <Progress className="mt-6" label="Parsing documents" />
      )}

      {error && !status && (
        <Card className="mt-6 border-warning/30 bg-warning-soft/40 p-4">
          <p className="font-semibold text-foreground">
            Could not load this case.
          </p>
          <p className="mt-1 text-sm text-muted">{error}</p>
        </Card>
      )}

      <ul className="mt-6 space-y-2.5">
        {status?.parseWarnings.map((doc) => {
          const hasWarnings = doc.warnings.length > 0;
          return (
            <li key={doc.role}>
              <Card
                className={cn(
                  "flex items-start gap-3 p-4",
                  hasWarnings && "border-warning/30 bg-warning-soft/30",
                )}
              >
                <FileText
                  className={cn(
                    "mt-0.5 h-4 w-4 shrink-0",
                    hasWarnings ? "text-warning-soft-foreground" : "text-success",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {doc.documentName}
                  </p>
                  {hasWarnings ? (
                    <ul className="mt-1 space-y-0.5 text-xs text-warning-soft-foreground">
                      {doc.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-0.5 text-xs text-muted">Parsed cleanly.</p>
                  )}
                </div>
              </Card>
            </li>
          );
        })}

        {status?.status === "parsing" &&
          status.parseWarnings.length === 0 &&
          [0, 1].map((i) => (
            <li key={i}>
              <Card className="flex items-center gap-3 p-4">
                <Skeleton className="h-4 w-4 rounded" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-40" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </Card>
            </li>
          ))}
      </ul>

      {ready && status && (
        <Card
          className="mt-6 flex flex-wrap items-center justify-between gap-4 p-5"
          interactive
        >
          <div>
            <p className="font-semibold text-foreground">
              {status.hotelName}
              {status.auditMonth ? ` · ${status.auditMonth}` : ""}
            </p>
            <p className="mt-0.5 text-sm text-muted">
              Case parsed — starting the agent run…
            </p>
          </div>
          <Button asChild>
            <Link href={`/cases/${caseId}/run`}>
              Run the audit
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </Card>
      )}

      {failed && (
        <Card className="mt-6 border-danger/30 bg-danger-soft/40 p-4">
          <p className="font-semibold text-foreground">
            These documents could not be parsed.
          </p>
          <p className="mt-1 text-sm text-muted">
            The warnings above say what went wrong. Nothing was analyzed — fix
            the files and{" "}
            <Link href="/cases/new" className="font-semibold text-primary underline underline-offset-2">
              upload again
            </Link>
            .
          </p>
        </Card>
      )}

      <div ref={outcomeRef} aria-hidden className="h-px" />
    </div>
  );
}

function ParseStatus({ ready, failed }: { ready: boolean; failed: boolean }) {
  if (ready) {
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-success-soft px-3 py-1 text-sm font-medium text-success-soft-foreground">
        <CheckCircle2 className="h-4 w-4" />
        Parsed
      </span>
    );
  }
  if (failed) {
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-danger-soft px-3 py-1 text-sm font-medium text-danger-soft-foreground">
        <AlertTriangle className="h-4 w-4" />
        Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1 text-sm font-medium text-primary-soft-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      Parsing
    </span>
  );
}
