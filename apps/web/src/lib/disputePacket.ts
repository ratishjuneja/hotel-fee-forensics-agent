import type { Finding } from "@feeforensics/shared";
import { formatCurrency } from "./utils";

/**
 * Client-side dispute-packet generator. The owner chooses which findings to
 * pursue; this assembles a tailored memo + email from the SELECTED findings.
 *
 * All dollar figures come straight from the deterministic calculator's
 * `finding.suspectedImpact` and are only summed here — no arithmetic is invented
 * (CLAUDE.md: deterministic math, never LLM arithmetic). Clause references are
 * lifted from each finding's citations, so the packet stays cited.
 */

const HOTEL = "The Harborline Hotel";
const PERIOD = "June 2026";
const OPERATOR = "Meridian Hotel Management";
const OWNER = "Cascadia Hotel Owner LP";

/**
 * Finding titles/explanations are LLM-influenced (derived from documents an
 * adversary controls). This packet is downloaded / copied into an email the owner
 * sends to the operator, so — unlike in-app React text — nothing escapes it for us.
 * Neutralize markdown link/image syntax and control chars so injected content
 * can't smuggle a clickable link or a hidden payment instruction into the artifact.
 */
function plain(s: string): string {
  return s
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1") // unwrap md links/images, keep visible text
    .replace(/[`*_>#]/g, "") // strip emphasis/heading markers
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, " ") // control chars
    .replace(/\s+/g, " ")
    .trim();
}

/** As {@link plain}, but also escapes the pipe so it can't break a markdown table cell. */
function cellText(s: string): string {
  return plain(s).replace(/\|/g, "\\|");
}

export type DisputeKind = "overcharge" | "unsupported" | "review";

/** Hard overcharges are disputed; everything else is unsupported/pending. */
export function disputeKind(f: Finding): DisputeKind {
  if (f.recommendedAction === "dispute") return "overcharge";
  if (f.recommendedAction === "request_explanation") return "unsupported";
  return "review";
}

export function actionLabel(f: Finding): string {
  switch (f.recommendedAction) {
    case "dispute":
      return "Dispute / true-up";
    case "request_explanation":
      return "Approve or reverse";
    default:
      return "Human review";
  }
}

/** Short clause label from the first citation, e.g. "HMA §4.3(a),(c)". */
export function shortClause(f: Finding): string {
  const label = f.citations[0]?.sectionLabel ?? "";
  return label.split("—")[0]?.trim() || "—";
}

export interface PacketSummary {
  count: number;
  total: number;
  overcharge: number;
  unsupported: number;
}

export function summarize(selected: Finding[]): PacketSummary {
  let overcharge = 0;
  let unsupported = 0;
  for (const f of selected) {
    if (disputeKind(f) === "overcharge") overcharge += f.suspectedImpact;
    else unsupported += f.suspectedImpact;
  }
  return {
    count: selected.length,
    total: overcharge + unsupported,
    overcharge,
    unsupported,
  };
}

/** Markdown dispute memo for the selected findings. */
export function buildMemo(selected: Finding[]): string {
  if (selected.length === 0) {
    return "_No findings selected — choose at least one item to build a dispute packet._";
  }
  const s = summarize(selected);
  const rows = selected
    .map(
      (f, i) =>
        `| ${i + 1} | ${cellText(f.title)} | ${formatCurrency(f.suspectedImpact)} | ${disputeKind(f)} | ${cellText(shortClause(f))} | ${actionLabel(f)} |`,
    )
    .join("\n");
  const basis = selected
    .map((f, i) => `${i + 1}. **${plain(f.title)}** — ${plain(f.explanation)}`)
    .join("\n");

  return `## Dispute Packet — ${HOTEL} (${PERIOD})

**Pursuing ${s.count} finding${s.count === 1 ? "" : "s"} · ${formatCurrency(s.total)} total (${formatCurrency(s.overcharge)} overcharge + ${formatCurrency(s.unsupported)} unsupported)**

### Items in dispute
| # | Finding | Impact | Type | Clause | Action |
|---|---------|-------:|------|--------|--------|
${rows}

### Basis
${basis}

### Requested resolution
We request a true-up on the overcharge items and either written owner approval or a
reversal of any unsupported items, per the audit-rights clause (HMA §9.2), within the
true-up window.
`;
}

export interface DisputeEmail {
  subject: string;
  body: string;
}

/** Draft dispute email for the selected findings. */
export function buildEmail(selected: Finding[]): DisputeEmail {
  const s = summarize(selected);
  const items = selected
    .map(
      (f, i) =>
        `${i + 1}. ${plain(f.title)} — ${formatCurrency(f.suspectedImpact)} (${plain(shortClause(f))}).`,
    )
    .join("\n");

  return {
    subject: `${HOTEL} — ${PERIOD} operator fee dispute (${formatCurrency(s.total)})`,
    body: `Hi [Operator — ${OPERATOR}],

Following our review of the ${PERIOD} operating package, we are raising ${s.count} item${s.count === 1 ? "" : "s"} totaling ${formatCurrency(s.total)} (${formatCurrency(s.overcharge)} overcharge + ${formatCurrency(s.unsupported)} unsupported):

${items}

We request a corrected fee calculation (true-up) on the overcharge items and either the written approval or a reversal of any unsupported items. Per the audit-rights clause (HMA §9.2) we'd like to resolve this within the true-up window.

Thank you,
[Owner — ${OWNER}]`,
  };
}

/** Combined downloadable packet (memo + email) as markdown. */
export function buildPacket(selected: Finding[]): string {
  const email = buildEmail(selected);
  return `${buildMemo(selected)}

---

### Draft dispute email

**Subject:** ${email.subject}

${email.body}
`;
}
