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
import { cn } from "@/lib/utils";

const POLL_MS = 1_500;

/**
 * Parsing screen for an uploaded case: polls GET /api/cases/:id until the async
 * parse job lands, then hands off to the run screen. A failed parse is reported
 * honestly with the per-document warnings — never silently swapped for the demo.
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
    const t = setTimeout(() => router.push(`/cases/${caseId}/run`), 1_200);
    return () => clearTimeout(t);
  }, [ready, caseId, router]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link
        href="/cases/new"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" />
        New audit
      </Link>

      <header className="mt-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Preparing your case
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Documents are stored and parsed before the agent runs — nothing is
            analyzed until every readable document is in.
          </p>
        </div>
        {ready ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            Parsed
          </span>
        ) : failed ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 text-sm font-medium text-rose-700">
            <AlertTriangle className="h-4 w-4" />
            Failed
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-700">
            <Loader2 className="h-4 w-4 animate-spin" />
            Parsing
          </span>
        )}
      </header>

      {error && !status && (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Could not load this case.</p>
          <p className="mt-1">{error}</p>
        </div>
      )}

      {status && (
        <ul className="mt-6 space-y-2">
          {status.parseWarnings.map((doc) => (
            <li
              key={doc.role}
              className={cn(
                "card flex items-start gap-3 p-4",
                doc.warnings.length > 0 && "border-amber-200 bg-amber-50/60",
              )}
            >
              <FileText
                className={cn(
                  "mt-0.5 h-4 w-4 shrink-0",
                  doc.warnings.length > 0 ? "text-amber-600" : "text-emerald-600",
                )}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800">
                  {doc.documentName}
                </p>
                {doc.warnings.length > 0 ? (
                  <ul className="mt-1 space-y-0.5 text-xs text-amber-800">
                    {doc.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-0.5 text-xs text-slate-500">Parsed cleanly.</p>
                )}
              </div>
            </li>
          ))}
          {status.status === "parsing" && status.parseWarnings.length === 0 && (
            <li className="flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Reading documents…
            </li>
          )}
        </ul>
      )}

      {ready && (
        <div className="mt-6 card flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <p className="font-semibold text-slate-900">
              {status.hotelName} · {status.auditMonth}
            </p>
            <p className="mt-0.5 text-sm text-slate-500">
              Case parsed — starting the agent run…
            </p>
          </div>
          <Link
            href={`/cases/${caseId}/run`}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-3 font-semibold text-white shadow-sm transition hover:bg-brand-700"
          >
            Run the audit
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}

      {failed && (
        <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
          <p className="font-semibold">These documents could not be parsed.</p>
          <p className="mt-1">
            The warnings above say what went wrong. Nothing was analyzed — fix
            the files and{" "}
            <Link href="/cases/new" className="font-semibold underline">
              upload again
            </Link>
            .
          </p>
        </div>
      )}
    </div>
  );
}
