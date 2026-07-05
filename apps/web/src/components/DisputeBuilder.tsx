"use client";

import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import type { Finding } from "@feeforensics/shared";
import {
  actionLabel,
  buildEmail,
  buildPacket,
  disputeKind,
  summarize,
  type DisputeContext,
} from "@/lib/disputePacket";
import { CopyButton } from "./CopyButton";
import { DownloadButton } from "./DownloadButton";
import { cn, formatCurrency } from "@/lib/utils";

const KIND_STYLE: Record<string, string> = {
  overcharge: "text-rose-600",
  unsupported: "text-amber-600",
  review: "text-slate-500",
};

/**
 * Lets the owner choose which findings to pursue and assembles a tailored
 * dispute email + downloadable packet. Totals and text recompute instantly from
 * the selection — the numbers are the calculator's, only summed here.
 */
export function DisputeBuilder({
  findings,
  context,
  packetFilename = "dispute-packet.md",
}: {
  findings: Finding[];
  /** Party/period the packet is addressed with, from the uploaded case. */
  context?: DisputeContext;
  packetFilename?: string;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(findings.map((f) => f.id)),
  );

  const chosen = useMemo(
    () => findings.filter((f) => selectedIds.has(f.id)),
    [findings, selectedIds],
  );
  const summary = useMemo(() => summarize(chosen), [chosen]);
  const email = useMemo(() => buildEmail(chosen, context), [chosen, context]);
  const packet = useMemo(() => buildPacket(chosen, context), [chosen, context]);

  const toggle = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const none = chosen.length === 0;

  return (
    <section>
      <h2 className="text-lg font-bold tracking-tight">Build dispute packet</h2>
      <p className="mt-1 text-sm text-slate-500">
        Choose which findings to pursue. The total, email, and downloadable
        packet update instantly — every figure comes from the calculator.
      </p>

      {/* Finding selector */}
      <div className="mt-3 space-y-2">
        {findings.map((f) => {
          const on = selectedIds.has(f.id);
          const kind = disputeKind(f);
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => toggle(f.id)}
              aria-pressed={on}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg border p-3 text-left transition",
                on
                  ? "border-brand-300 bg-brand-50/60"
                  : "border-slate-200 bg-white hover:border-slate-300",
              )}
            >
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                  on
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-slate-300 bg-white",
                )}
              >
                {on && <Check className="h-3.5 w-3.5" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-slate-900">
                  {f.title}
                </span>
                <span className="text-xs text-slate-500">
                  <span className={cn("font-medium", KIND_STYLE[kind])}>
                    {kind}
                  </span>{" "}
                  · {actionLabel(f)}
                </span>
              </span>
              <span className="shrink-0 font-mono font-semibold text-rose-600">
                {formatCurrency(f.suspectedImpact)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Live summary + actions */}
      <div className="mt-4 card flex flex-wrap items-center justify-between gap-4 p-4">
        <div>
          <p className="text-sm text-slate-600">
            Dispute total · {summary.count} of {findings.length} findings
          </p>
          <p className="text-2xl font-bold text-rose-600">
            {formatCurrency(summary.total)}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {formatCurrency(summary.overcharge)} overcharge ·{" "}
            {formatCurrency(summary.unsupported)} unsupported
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <CopyButton
            text={`Subject: ${email.subject}\n\n${email.body}`}
            label="Copy email"
          />
          <DownloadButton
            content={packet}
            filename={packetFilename}
            label="Download packet"
          />
        </div>
      </div>

      {/* Generated email preview */}
      {none ? (
        <div className="mt-4 card p-6 text-sm text-slate-500">
          Select at least one finding to generate the dispute email.
        </div>
      ) : (
        <div className="mt-4 card p-6">
          <p className="text-sm font-semibold text-slate-500">
            Draft dispute email · Subject
          </p>
          <p className="mt-0.5 font-medium text-slate-900">{email.subject}</p>
          <hr className="my-4 border-slate-100" />
          <pre className="whitespace-pre-wrap font-sans text-sm text-slate-700">
            {email.body}
          </pre>
        </div>
      )}
    </section>
  );
}
