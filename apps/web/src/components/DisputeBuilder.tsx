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
import { Card } from "@/components/ui/Card";
import { CopyButton } from "./CopyButton";
import { DownloadButton } from "./DownloadButton";
import { cn, formatCurrency } from "@/lib/utils";

const KIND_STYLE: Record<string, string> = {
  overcharge: "text-danger",
  unsupported: "text-warning-soft-foreground",
  review: "text-muted",
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
      <h2 className="text-lg font-semibold tracking-tight text-foreground">
        Build the dispute
      </h2>
      <p className="mt-1 text-sm text-muted">
        Choose which findings to pursue. The total, email, and downloadable
        packet update instantly — every figure comes from the calculator.
      </p>

      {/* Finding selector */}
      <div className="mt-4 space-y-2">
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
                "flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                on
                  ? "border-primary/40 bg-primary-soft/50"
                  : "border-border bg-surface hover:border-border-strong",
              )}
            >
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                  on
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border-strong bg-surface",
                )}
              >
                {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-foreground">
                  {f.title}
                </span>
                <span className="text-xs text-muted">
                  <span className={cn("font-medium", KIND_STYLE[kind])}>
                    {kind}
                  </span>{" "}
                  · {actionLabel(f)}
                </span>
              </span>
              <span className="shrink-0 font-mono tabular-nums font-semibold text-danger">
                {formatCurrency(f.suspectedImpact)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Live summary + actions */}
      <Card className="mt-4 flex flex-wrap items-center justify-between gap-4 p-4">
        <div>
          <p className="text-sm text-muted">
            Dispute total · {summary.count} of {findings.length} findings
          </p>
          <p className="mt-0.5 font-mono text-2xl font-semibold tabular-nums text-danger">
            {formatCurrency(summary.total)}
          </p>
          <p className="mt-0.5 text-xs text-subtle">
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
      </Card>

      {/* Generated email preview */}
      {none ? (
        <Card className="mt-4 p-6 text-sm text-muted">
          Select at least one finding to generate the dispute email.
        </Card>
      ) : (
        <Card className="mt-4 p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-subtle">
            Draft dispute email · Subject
          </p>
          <p className="mt-1 font-medium text-foreground">{email.subject}</p>
          <hr className="my-4 border-border" />
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-muted">
            {email.body}
          </pre>
        </Card>
      )}
    </section>
  );
}
