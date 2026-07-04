import type { Citation } from "@feeforensics/shared";

/**
 * SYNTHETIC SOURCE DOCUMENTS — The Harborline Hotel demo case.
 *
 * These back the evidence viewer: clicking a citation opens the referenced
 * document with the exact clause / line highlighted, making "everything is
 * cited" tangible. Every figure is HAND-AUTHORED and SYNTHETIC — the amounts
 * are reconciled with the authored ground truth in `data/demo/` ($36,580 across
 * three findings) so the documents visibly support the numbers on screen.
 *
 * This registry is a SUPERSET of the documents cited by the API mock
 * (apps/api/src/data/mockAudit.ts) and the bundled fallback (cachedRun.ts) — it
 * defines doc_hma, doc_operating_statement, doc_misc_breakout, doc_prior_month,
 * and doc_support_pack so any citation resolves even if the two lanes disagree on
 * whether F1 cites the misc breakout and whether F3 cites the prior month. They
 * mirror `data/demo/` (01_HMA_excerpt.txt, 02/02b/03 statements,
 * 04_support_invoice_pack.csv). Once the API serves parsed document text, this
 * should be sourced from there.
 */

export type DocKind = "contract" | "statement" | "invoice";

/** A clause in a contract-style document. */
export interface DocSection {
  /** Stable anchor for scroll-to + highlight. */
  anchor: string;
  /** Section reference token, e.g. "§4.3" — matched against citation labels. */
  ref: string;
  heading: string;
  /** Body text; a cited `quote` is expected to appear verbatim here. */
  body: string;
}

/** A line in a statement- or invoice-style document. */
export interface DocLine {
  anchor: string;
  label: string;
  amount?: number;
  note?: string;
  emphasis?: "subtotal" | "total";
  /** Highlighted because a finding depends on it. */
  flagged?: boolean;
  /** Lowercased tokens used to match a citation to this line. */
  keywords?: string[];
}

export interface DocGroup {
  title: string;
  lines: DocLine[];
}

export interface SourceDocument {
  id: string;
  name: string;
  kind: DocKind;
  synopsis: string;
  /** Contract documents use sections; statements/invoices use groups. */
  sections?: DocSection[];
  groups?: DocGroup[];
}

// ---------------------------------------------------------------------------
// Hotel Management Agreement
// ---------------------------------------------------------------------------

const hma: SourceDocument = {
  id: "doc_hma",
  name: "Hotel Management Agreement",
  kind: "contract",
  synopsis:
    "Operating agreement between Cascadia Hotel Owner LP and Meridian Hotel " +
    "Management LLC for The Harborline Hotel. Governs management fees, the revenue " +
    "base and exclusions, centralized services, and audit rights.",
  sections: [
    {
      anchor: "hma-4-1",
      ref: "§4.1",
      heading: "§4.1 — Base Management Fee",
      body:
        "Owner shall pay Operator a Base Management Fee equal to three percent (3.0%) " +
        "of Total Operating Revenue for each fiscal month, as Total Operating Revenue " +
        "is determined under the Uniform System of Accounts for the Lodging Industry " +
        "(USALI), subject to the exclusions set forth in Section 4.3.",
    },
    {
      anchor: "hma-4-2",
      ref: "§4.2",
      heading: "§4.2 — Incentive Management Fee",
      body:
        "Owner shall pay Operator an Incentive Management Fee equal to ten percent " +
        "(10.0%) of Gross Operating Profit (\"GOP\") for each fiscal month. GOP shall " +
        "mean Total Operating Revenue less Total Departmental Expenses and Total " +
        "Undistributed Operating Expenses, is calculated BEFORE deduction of management " +
        "fees and does NOT include any Non-Operating Income or any revenue excluded " +
        "under Section 4.3. The Incentive Management Fee shall be calculated on GOP as " +
        "so defined, and not on Total Operating Revenue.",
    },
    {
      anchor: "hma-4-3",
      ref: "§4.3",
      heading: "§4.3 — Revenue Exclusions",
      body:
        "The following items shall be EXCLUDED from Total Operating Revenue and from " +
        "Gross Operating Profit for all purposes of calculating fees under this Article 4: " +
        "(a) proceeds of insurance of any kind, including business interruption and " +
        "property insurance proceeds; (c) cancellation, attrition, and no-show revenue, " +
        "including banquet and group cancellation charges; and other non-operating or " +
        "capital receipts.",
    },
    {
      anchor: "hma-5-1",
      ref: "§5.1",
      heading: "§5.1 — Centralized Services",
      body:
        "Operator may charge the Hotel, at actual cost and without mark-up, for " +
        "centralized services reasonably allocated to the Hotel. Notwithstanding the " +
        "foregoing, any centralized-services charge exceeding Ten Thousand Dollars " +
        "($10,000) in any single fiscal month shall require Owner's PRIOR WRITTEN " +
        "APPROVAL. Any charge exceeding that threshold without such approval shall be " +
        "deemed unsupported and subject to reversal.",
    },
    {
      anchor: "hma-9-2",
      ref: "§9.2",
      heading: "§9.2 — Audit Rights and True-Up",
      body:
        "Owner may audit Operator's fee calculations for any fiscal month within twelve " +
        "(12) months after delivery of the applicable statement. Any overcharge or " +
        "undercharge identified through such audit shall be corrected by true-up within " +
        "thirty (30) days of Owner's written notice.",
    },
  ],
};

// ---------------------------------------------------------------------------
// Monthly Operating Statement (USALI) — June
// ---------------------------------------------------------------------------

const operatingStatement: SourceDocument = {
  id: "doc_operating_statement",
  name: "Monthly Operating Statement (USALI)",
  kind: "statement",
  synopsis:
    "June operating results as reported by the Operator, with the Total Operating " +
    "Revenue and GOP used to bill management fees. Flagged rows drive the audit findings.",
  groups: [
    {
      title: "Operating revenue (as reported)",
      lines: [
        { anchor: "os-rooms", label: "Rooms", amount: 2400000 },
        { anchor: "os-fnb", label: "Food & Beverage", amount: 820000 },
        { anchor: "os-other", label: "Other Operated Departments", amount: 180000 },
        {
          anchor: "os-misc",
          label: "Miscellaneous Income",
          amount: 140000,
          note: "Includes $66,000 excluded per §4.3 — see the Misc Income Breakout.",
          keywords: ["miscellaneous income"],
        },
        {
          anchor: "os-tor",
          label: "Total Operating Revenue (base for 3.0% fee)",
          amount: 3540000,
          emphasis: "subtotal",
          note: "Overstated by the $66,000 of excluded revenue in Misc Income.",
        },
      ],
    },
    {
      title: "Profit (USALI)",
      lines: [
        {
          anchor: "os-dept-exp",
          label: "Total Departmental Expenses",
          amount: 1305000,
        },
        {
          anchor: "os-undist-exp",
          label: "Total Undistributed Operating Expenses",
          amount: 815000,
        },
        {
          anchor: "os-gop",
          label: "Gross Operating Profit (GOP)",
          amount: 1420000,
          emphasis: "subtotal",
          note: "Incentive-fee base per §4.2 — overstated by the $66,000 excluded revenue.",
          flagged: true,
          keywords: ["gross operating profit", "gop"],
        },
      ],
    },
    {
      title: "Management fees billed",
      lines: [
        {
          anchor: "os-base-fee",
          label: "Base Management Fee (3.0% × $3,540,000)",
          amount: 106200,
          note: "Should be 3.0% × $3,474,000 = $104,220.",
          flagged: true,
          keywords: ["base management fee"],
        },
        {
          anchor: "os-incentive-fee",
          label: "Incentive Management Fee (10% × reported GOP)",
          amount: 142000,
          note: "Should be 10% × true GOP $1,354,000 = $135,400.",
          flagged: true,
          keywords: ["incentive management fee", "incentive fee"],
        },
        {
          anchor: "os-centralized",
          label: "Centralized Services",
          amount: 28000,
          note: "Exceeds the $10,000 approval threshold in §5.1.",
          flagged: true,
          keywords: ["centralized services", "centralized"],
        },
        {
          anchor: "os-total-fees",
          label: "Total Fees Charged",
          amount: 276200,
          emphasis: "total",
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Miscellaneous Income breakout — June (schedule behind the Misc Income line)
// ---------------------------------------------------------------------------

const miscBreakout: SourceDocument = {
  id: "doc_misc_breakout",
  name: "Miscellaneous Income Breakout",
  kind: "statement",
  synopsis:
    "June Miscellaneous Income schedule. Foots to the Misc Income line on the operating " +
    "statement; two items ($66,000) are excluded from the fee base per §4.3.",
  groups: [
    {
      title: "Miscellaneous Income — June",
      lines: [
        {
          anchor: "mb-space",
          label: "Space Rental",
          amount: 40000,
          note: "Legitimately in the fee base.",
        },
        {
          anchor: "mb-commissions",
          label: "Commissions",
          amount: 34000,
          note: "Legitimately in the fee base.",
        },
        {
          anchor: "mb-banquet",
          label: "Banquet Cancellation Revenue",
          amount: 41000,
          note: "EXCLUDED per §4.3(c) — cancellation revenue.",
          flagged: true,
          keywords: ["banquet", "cancellation"],
        },
        {
          anchor: "mb-insurance",
          label: "Insurance Proceeds",
          amount: 25000,
          note: "EXCLUDED per §4.3(a) — insurance proceeds.",
          flagged: true,
          keywords: ["insurance", "proceeds"],
        },
        {
          anchor: "mb-total",
          label: "Total Miscellaneous Income",
          amount: 140000,
          emphasis: "total",
          note: "$66,000 (banquet + insurance) should be removed from the fee base.",
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Prior-Month Operating Statement — May (clean baseline for the anomaly)
// ---------------------------------------------------------------------------

const priorMonth: SourceDocument = {
  id: "doc_prior_month",
  name: "Prior-Month Operating Statement",
  kind: "statement",
  synopsis:
    "May operating results — a clean month with no excluded items. Used as the baseline " +
    "that flags June's centralized-services spike (+273%).",
  groups: [
    {
      title: "May summary",
      lines: [
        {
          anchor: "pm-tor",
          label: "Total Operating Revenue",
          amount: 3402000,
          emphasis: "subtotal",
          note: "No excluded items this month — clean.",
        },
        {
          anchor: "pm-gop",
          label: "Gross Operating Profit (GOP)",
          amount: 1320000,
          emphasis: "subtotal",
        },
      ],
    },
    {
      title: "Management fees billed — May",
      lines: [
        {
          anchor: "pm-base-fee",
          label: "Base Management Fee (3.0% × $3,402,000)",
          amount: 102060,
          note: "Correctly calculated this month.",
        },
        {
          anchor: "pm-incentive-fee",
          label: "Incentive Management Fee (10% × GOP)",
          amount: 132000,
          note: "Correctly calculated this month.",
        },
        {
          anchor: "pm-centralized",
          label: "Centralized Services",
          amount: 7500,
          note: "Below the $10,000 threshold — no approval required. June is $28,000 (+273%).",
          flagged: true,
          keywords: ["centralized services", "centralized"],
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Support / Invoice Pack
// ---------------------------------------------------------------------------

const supportPack: SourceDocument = {
  id: "doc_support_pack",
  name: "Support / Invoice Pack",
  kind: "invoice",
  synopsis:
    "Backup provided by the Operator for June charges. The invoice for centralized " +
    "services is present, but the owner approval required by §5.1 is not attached.",
  groups: [
    {
      title: "Support pack — June",
      lines: [
        {
          anchor: "sp-invoice",
          label: "INV-0612-03 — Centralized Services",
          amount: 28000,
          note: "Invoice present for the charge amount.",
          keywords: ["invoice", "inv-0612-03"],
        },
        {
          anchor: "sp-approval",
          label: "APPROVAL-0612-03 — Owner approval (centralized services)",
          amount: 28000,
          note:
            "MISSING — required by §5.1 for a charge over $10,000. This absence is what " +
            "the approval check catches.",
          flagged: true,
          keywords: ["approval", "approval-0612-03"],
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Registry + citation resolver
// ---------------------------------------------------------------------------

export const DOCUMENTS: Record<string, SourceDocument> = {
  [hma.id]: hma,
  [operatingStatement.id]: operatingStatement,
  [miscBreakout.id]: miscBreakout,
  [priorMonth.id]: priorMonth,
  [supportPack.id]: supportPack,
};

export interface EvidenceTarget {
  doc: SourceDocument;
  /** Anchor of the section/line to scroll to and highlight, if resolved. */
  anchor?: string;
}

/**
 * Resolve a citation to its source document and the specific clause/line to
 * highlight. Matches sections by the longest section ref present in the
 * citation label (so "§4.1(b)" would win over "§4.1"), and statement/invoice
 * lines by keyword overlap with the citation label or quote.
 */
export function resolveCitation(citation: Citation): EvidenceTarget | null {
  const doc = DOCUMENTS[citation.documentId];
  if (!doc) return null;

  const label = citation.sectionLabel ?? "";
  const hay = `${label} ${citation.quote ?? ""}`.toLowerCase();

  if (doc.sections) {
    const matches = doc.sections
      .filter((s) => label.includes(s.ref))
      .sort((a, b) => b.ref.length - a.ref.length);
    if (matches[0]) return { doc, anchor: matches[0].anchor };
    // Fallback: the section whose body contains the quoted text.
    const byQuote = doc.sections.find(
      (s) => citation.quote && s.body.includes(citation.quote),
    );
    return { doc, anchor: byQuote?.anchor };
  }

  if (doc.groups) {
    const line = doc.groups
      .flatMap((g) => g.lines)
      .find((l) => l.keywords?.some((k) => hay.includes(k)));
    return { doc, anchor: line?.anchor };
  }

  return { doc };
}
