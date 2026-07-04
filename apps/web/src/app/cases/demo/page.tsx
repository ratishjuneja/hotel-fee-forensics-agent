import Link from "next/link";
import { ArrowRight, CheckCircle2, FileText } from "lucide-react";
import type { DemoCaseResponse } from "@feeforensics/shared";
import { getDemoCase } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { ApiErrorPanel } from "@/components/ApiErrorPanel";

// Always fetch the case live per request (never prerender at build time).
export const dynamic = "force-dynamic";

export default async function CaseOverviewPage() {
  let data: DemoCaseResponse;
  try {
    data = await getDemoCase();
  } catch {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <ApiErrorPanel message="Could not load the demo case from the API." />
      </div>
    );
  }

  const { case: kase, expectedOutputs } = data;
  const auditedCount = kase.documents.filter((d) => d.role === "audited").length;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-brand-600">Fee audit case</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">
            {kase.hotelName}
          </h1>
          <p className="mt-1 text-slate-600">
            {kase.auditMonth} operating package · {auditedCount} audited
            documents
          </p>
        </div>
        <Link
          href="/cases/demo/run"
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-3 font-semibold text-white shadow-sm transition hover:bg-brand-700"
        >
          Start Agent Investigation
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-5">
        <section className="lg:col-span-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Documents the agent will audit
          </h2>
          <ul className="mt-3 space-y-3">
            {kase.documents.map((doc) => (
              <li key={doc.id} className="card flex gap-3 p-4">
                <FileText className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-900">
                      {doc.name}
                    </span>
                    <Badge
                      className={
                        doc.role === "audited"
                          ? "bg-brand-50 text-brand-700 ring-1 ring-brand-100"
                          : "bg-slate-100 text-slate-500"
                      }
                    >
                      {doc.role}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-sm text-slate-600">{doc.purpose}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="lg:col-span-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Expected outputs
          </h2>
          <ul className="card mt-3 divide-y divide-slate-100 p-2">
            {expectedOutputs.map((out) => (
              <li
                key={out}
                className="flex items-start gap-2 px-2 py-2.5 text-sm text-slate-700"
              >
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                {out}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
