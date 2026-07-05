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

/**
 * Party/period labels the packet is addressed with, sourced from the uploaded
 * case. Unknown fields fall back to neutral placeholders — never a seeded case.
 */
export interface DisputeContext {
  hotel: string;
  period: string;
  operator?: string;
  owner?: string;
}

const withDefaults = (ctx?: DisputeContext): Required<DisputeContext> => ({
  hotel: ctx?.hotel ?? "the Hotel",
  period: ctx?.period ?? "the audit period",
  // Greeting/signature placeholders the owner fills before sending (or the real
  // party name when the case carries one). Bracketed so they read as a single
  // fill-in token, never a doubled "[Operator — the Operator]".
  operator: ctx?.operator ?? "[Operator]",
  owner: ctx?.owner ?? "[Owner]",
});

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

/**
 * Every disputed dollar must trace to a clause. A finding with no §-reference in
 * any citation (e.g. an unexplained-variance residual) cannot be a cited
 * overcharge, so it is never counted in the dispute total or the email.
 */
const CLAUSE_REF = /§\s?\d/;
export function hasClauseCitation(f: Finding): boolean {
  return f.citations.some((c) => CLAUSE_REF.test(c.sectionLabel ?? ""));
}

/** Hard overcharges are disputed; everything else is unsupported/pending. */
export function disputeKind(f: Finding): DisputeKind {
  // No clause citation → never a cited overcharge/unsupported, whatever the action.
  if (!hasClauseCitation(f)) return "review";
  if (f.recommendedAction === "dispute") return "overcharge";
  if (f.recommendedAction === "request_explanation") return "unsupported";
  return "review";
}

/**
 * A finding belongs in a dispute only when it is a hard overcharge or an
 * unsupported charge AND it traces to a clause. A charge the owner ACCEPTED as
 * correct (`approve`) — or one still parked for a human — is never disputed: it
 * stays out of the total, the email, and the selectable list. Nor is an un-cited
 * amount ever disputable: even a "dispute"-marked finding with no clause citation
 * is excluded here, so no un-cited dollar can enter the cited dispute total.
 */
export function isDisputable(f: Finding): boolean {
  return (
    (f.recommendedAction === "dispute" ||
      f.recommendedAction === "request_explanation") &&
    hasClauseCitation(f)
  );
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
  let count = 0;
  for (const f of selected) {
    // Only CITED overcharges and unsupported charges sum into a dispute. An
    // accepted ("approve") or parked ("human_review") finding — or any amount
    // that does not trace to a clause — contributes nothing to the total.
    if (!isDisputable(f)) continue;
    if (f.recommendedAction === "dispute") {
      overcharge += f.suspectedImpact;
      count += 1;
    } else if (f.recommendedAction === "request_explanation") {
      unsupported += f.suspectedImpact;
      count += 1;
    }
  }
  return {
    count,
    total: overcharge + unsupported,
    overcharge,
    unsupported,
  };
}

/** Markdown dispute memo for the selected findings. */
export function buildMemo(selected: Finding[], context?: DisputeContext): string {
  // Only disputable findings make a packet; accepted charges are excluded.
  const disputed = selected.filter(isDisputable);
  if (disputed.length === 0) {
    return "_No findings selected — choose at least one item to build a dispute packet._";
  }
  const { hotel, period } = withDefaults(context);
  const s = summarize(disputed);
  const rows = disputed
    .map(
      (f, i) =>
        `| ${i + 1} | ${cellText(f.title)} | ${formatCurrency(f.suspectedImpact)} | ${disputeKind(f)} | ${cellText(shortClause(f))} | ${actionLabel(f)} |`,
    )
    .join("\n");
  const basis = disputed
    .map((f, i) => `${i + 1}. **${plain(f.title)}** — ${plain(f.explanation)}`)
    .join("\n");

  return `## Dispute Packet — ${hotel} (${period})

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
export function buildEmail(selected: Finding[], context?: DisputeContext): DisputeEmail {
  const { hotel, period, operator, owner } = withDefaults(context);
  // Only disputable findings go in the email — an accepted charge is never
  // asked back.
  const disputed = selected.filter(isDisputable);
  const s = summarize(disputed);
  const items = disputed
    .map(
      (f, i) =>
        `${i + 1}. ${plain(f.title)} — ${formatCurrency(f.suspectedImpact)} (${plain(shortClause(f))}).`,
    )
    .join("\n");

  return {
    subject: `${hotel} — ${period} operator fee dispute (${formatCurrency(s.total)})`,
    body: `Hi ${operator},

Following our review of the ${period} operating package, we are raising ${s.count} item${s.count === 1 ? "" : "s"} totaling ${formatCurrency(s.total)} (${formatCurrency(s.overcharge)} overcharge + ${formatCurrency(s.unsupported)} unsupported):

${items}

We request a corrected fee calculation (true-up) on the overcharge items and either the written approval or a reversal of any unsupported items. Per the audit-rights clause (HMA §9.2) we'd like to resolve this within the true-up window.

Thank you,
${owner}`,
  };
}

/** Combined downloadable packet (memo + email) as markdown. */
export function buildPacket(selected: Finding[], context?: DisputeContext): string {
  const email = buildEmail(selected, context);
  return `${buildMemo(selected, context)}

---

### Draft dispute email

**Subject:** ${email.subject}

${email.body}
`;
}
