/**
 * CSV statement parser.
 *
 * Turns the synthetic operating statements and the misc-income breakout under
 * `data/demo/` into the calculator's structured inputs — `FinancialLineItem[]`
 * and `ChargedFee[]` — with:
 *   - tolerant headers (case-insensitive, reorderable, alias-matched),
 *   - tolerant amounts ($, thousands separators, accounting parentheses),
 *   - a category synonym map (line-item text -> NormalizedCategory), and
 *   - "don't invent" behavior: an unrecognized category is kept as OTHER and a
 *     warning is emitted, never guessed into a real category.
 *
 * Derived rows (totals, subtotals, GOP) are skipped so the detail never
 * double-counts. Fee arithmetic still happens only in the calculator; this
 * module just reads what the operator reported.
 *
 * NOTE: the simple line tokenizer supports quoted fields with embedded commas
 * but not embedded newlines (the demo CSVs have none). A fuller parser lands if
 * real uploads need it.
 */

import type {
  ChargedFee,
  ChargedFeeType,
  Citation,
  FinancialLineItem,
  NormalizedCategory,
} from "@feeforensics/shared";

export interface ParseOptions {
  caseId: string;
  sourceDocumentId: string;
  documentName: string;
  /** Reporting period, e.g. "2026-06". */
  period: string;
}

export interface ParsedStatement {
  lineItems: FinancialLineItem[];
  chargedFees: ChargedFee[];
  warnings: string[];
}

export interface ParsedBreakout {
  lineItems: FinancialLineItem[];
  warnings: string[];
}

// --- Money tolerance --------------------------------------------------------

/**
 * Parse a currency/number cell. Strips `$`, thousands separators, and
 * whitespace; reads accounting-style `(1,000)` as `-1000`. Throws on anything
 * non-numeric so callers can flag the row instead of inventing a value.
 */
export function parseMoney(raw: string): number {
  const trimmed = raw.trim();
  if (trimmed === "") throw new Error("empty money value");
  const negative = /^\(.*\)$/.test(trimmed);
  const cleaned = trimmed.replace(/[()$,\s]/g, "");
  if (!/^-?\d*\.?\d+$/.test(cleaned)) {
    throw new Error(`not a numeric money value: "${raw}"`);
  }
  const value = Number(cleaned);
  if (Number.isNaN(value)) throw new Error(`not a numeric money value: "${raw}"`);
  return negative ? -value : value;
}

// --- CSV tokenizer ----------------------------------------------------------

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line.charAt(i);
    if (inQuotes) {
      if (ch === '"') {
        if (line.charAt(i + 1) === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      cells.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

function parseCsv(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "")
    .map(splitCsvLine);
}

// --- Header resolution ------------------------------------------------------

type CanonicalColumn = "section" | "line_item" | "amount" | "usali_layer" | "note";

const HEADER_ALIASES: Record<CanonicalColumn, string[]> = {
  section: ["section", "category", "group", "schedule"],
  line_item: ["line item", "item", "description", "name"],
  amount: ["amount", "value", "usd"],
  usali_layer: ["usali layer", "layer"],
  note: ["note", "notes", "comment", "comments"],
};

const normalizeHeader = (h: string) =>
  h.trim().toLowerCase().replace(/[_\s]+/g, " ").trim();

function resolveHeaders(headerRow: string[]): Record<CanonicalColumn, number> {
  const normalized = headerRow.map(normalizeHeader);
  const idx = {} as Record<CanonicalColumn, number>;
  for (const canonical of Object.keys(HEADER_ALIASES) as CanonicalColumn[]) {
    const aliases = HEADER_ALIASES[canonical];
    idx[canonical] = normalized.findIndex((h) => aliases.includes(h));
  }
  return idx;
}

// --- Category / fee synonym maps --------------------------------------------

// Order matters: more specific patterns first (e.g. "banquet cancellation" must
// resolve to CANCELLATION_REVENUE before the generic "banquet" rule).
const REVENUE_CATEGORY_RULES: ReadonlyArray<readonly [RegExp, NormalizedCategory]> = [
  [/cancellation|attrition|no[-\s]?show/i, "CANCELLATION_REVENUE"],
  [/insurance/i, "INSURANCE_PROCEEDS"],
  [/\brooms?\b/i, "ROOM_REVENUE"],
  [/food\s*&?\s*beverage|\bf\s*&?\s*b\b/i, "FNB_REVENUE"],
  [/banquet|catering/i, "BANQUET_REVENUE"],
];

function classifyRevenue(lineItem: string): NormalizedCategory | null {
  for (const [re, category] of REVENUE_CATEGORY_RULES) {
    if (re.test(lineItem)) return category;
  }
  return null;
}

const FEE_TYPE_RULES: ReadonlyArray<readonly [RegExp, ChargedFeeType]> = [
  [/incentive/i, "INCENTIVE_MANAGEMENT_FEE"],
  [/base\s*management|base\s*fee/i, "BASE_MANAGEMENT_FEE"],
  [/brand|system/i, "BRAND_SYSTEM_FEE"],
  [/centralized|corporate|pass[-\s]?through|reimburs/i, "PASS_THROUGH_EXPENSE"],
];

function classifyFee(lineItem: string): ChargedFeeType | null {
  for (const [re, feeType] of FEE_TYPE_RULES) {
    if (re.test(lineItem)) return feeType;
  }
  return null;
}

// --- Row shape --------------------------------------------------------------

const AGGREGATE_LAYERS = new Set(["gop", "departmental_profit"]);

/** Totals, subtotals, and derived profit lines are not statement line items. */
function isAggregateRow(lineItem: string, usaliLayer: string): boolean {
  const layer = usaliLayer.trim().toLowerCase();
  if (layer.endsWith("_total") || AGGREGATE_LAYERS.has(layer)) return true;
  const li = lineItem.trim().toLowerCase();
  return (
    li.startsWith("total ") ||
    li === "total" ||
    li.includes("gross operating profit") ||
    li.includes("departmental profit")
  );
}

type RowRole = "revenue" | "expense" | "fee" | "unknown";

function classifyRow(section: string, usaliLayer: string): RowRole {
  const s = section.toLowerCase();
  const layer = usaliLayer.toLowerCase();
  if (s.includes("management fee") || layer.startsWith("fee")) return "fee";
  if (s.includes("expense") || layer.includes("expense")) return "expense";
  if (s.includes("revenue") || s.includes("income") || layer.includes("revenue")) {
    return "revenue";
  }
  return "unknown";
}

function makeCitation(
  opts: ParseOptions,
  section: string,
  lineItem: string,
  rawAmount: string,
): Citation {
  return {
    documentId: opts.sourceDocumentId,
    documentName: opts.documentName,
    sectionLabel: section ? `${section} — ${lineItem}` : lineItem,
    quote: `${lineItem}: ${rawAmount}`,
  };
}

const cell = (row: string[], index: number): string =>
  index >= 0 ? (row[index] ?? "").trim() : "";

// --- Operating statement (USALI) --------------------------------------------

export function parseOperatingStatement(
  csv: string,
  opts: ParseOptions,
): ParsedStatement {
  const warnings: string[] = [];
  const lineItems: FinancialLineItem[] = [];
  const chargedFees: ChargedFee[] = [];

  const rows = parseCsv(csv);
  if (rows.length === 0) return { lineItems, chargedFees, warnings };

  const cols = resolveHeaders(rows[0]!);
  if (cols.line_item < 0 || cols.amount < 0) {
    throw new Error(
      "operating statement CSV is missing required 'line item' / 'amount' columns",
    );
  }

  let seq = 0;
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]!;
    const lineItem = cell(row, cols.line_item);
    const rawAmount = cell(row, cols.amount);
    const section = cell(row, cols.section);
    const usaliLayer = cell(row, cols.usali_layer);

    if (lineItem === "" && rawAmount === "") continue;
    if (isAggregateRow(lineItem, usaliLayer)) continue;

    let amount: number;
    try {
      amount = parseMoney(rawAmount);
    } catch {
      warnings.push(`Skipped "${lineItem}": unparseable amount "${rawAmount}".`);
      continue;
    }

    const role = classifyRow(section, usaliLayer);
    const citation = makeCitation(opts, section, lineItem, rawAmount);

    if (role === "fee") {
      const feeType = classifyFee(lineItem);
      if (!feeType) {
        warnings.push(
          `Unrecognized charged fee "${lineItem}" — flagged as PASS_THROUGH_EXPENSE for review.`,
        );
      }
      chargedFees.push({
        id: `${opts.sourceDocumentId}_fee_${++seq}`,
        caseId: opts.caseId,
        feeType: feeType ?? "PASS_THROUGH_EXPENSE",
        chargedAmount: amount,
        period: opts.period,
        citation,
      });
      continue;
    }

    let normalizedCategory: NormalizedCategory;
    if (role === "expense") {
      normalizedCategory = "OPERATING_EXPENSE";
    } else if (role === "revenue") {
      const classified = classifyRevenue(lineItem);
      if (classified) {
        normalizedCategory = classified;
      } else {
        normalizedCategory = "OTHER";
        warnings.push(
          `Unrecognized revenue line "${lineItem}" — kept as OTHER (needs review; not counted in the fee base).`,
        );
      }
    } else {
      normalizedCategory = "OTHER";
      warnings.push(
        `Unclassifiable row "${lineItem}" (section "${section}") — kept as OTHER.`,
      );
    }

    lineItems.push({
      id: `${opts.sourceDocumentId}_line_${++seq}`,
      caseId: opts.caseId,
      sourceDocumentId: opts.sourceDocumentId,
      period: opts.period,
      category: section || normalizedCategory,
      description: lineItem,
      amount,
      normalizedCategory,
      citation,
    });
  }

  return { lineItems, chargedFees, warnings };
}

// --- Misc income breakout ---------------------------------------------------

/**
 * Parse the Misc Income breakout schedule. Every detail row is operating
 * revenue; the roll-up total is dropped. The two HMA §4.3 items (cancellation,
 * insurance) resolve to their excluded categories; the rest are kept as OTHER
 * (legitimately in the base, but no dedicated category yet).
 */
export function parseMiscIncomeBreakout(
  csv: string,
  opts: ParseOptions,
): ParsedBreakout {
  const warnings: string[] = [];
  const lineItems: FinancialLineItem[] = [];

  const rows = parseCsv(csv);
  if (rows.length === 0) return { lineItems, warnings };

  const cols = resolveHeaders(rows[0]!);
  if (cols.line_item < 0 || cols.amount < 0) {
    throw new Error(
      "misc income breakout CSV is missing required 'line item' / 'amount' columns",
    );
  }

  let seq = 0;
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]!;
    const lineItem = cell(row, cols.line_item);
    const rawAmount = cell(row, cols.amount);
    const section = cell(row, cols.section) || "Miscellaneous Income";

    if (lineItem === "" && rawAmount === "") continue;
    if (isAggregateRow(lineItem, "")) continue;

    let amount: number;
    try {
      amount = parseMoney(rawAmount);
    } catch {
      warnings.push(`Skipped "${lineItem}": unparseable amount "${rawAmount}".`);
      continue;
    }

    const classified = classifyRevenue(lineItem);
    let normalizedCategory: NormalizedCategory;
    if (classified) {
      normalizedCategory = classified;
    } else {
      normalizedCategory = "OTHER";
      warnings.push(
        `Misc income line "${lineItem}" has no dedicated category — kept as OTHER (needs review).`,
      );
    }

    lineItems.push({
      id: `${opts.sourceDocumentId}_line_${++seq}`,
      caseId: opts.caseId,
      sourceDocumentId: opts.sourceDocumentId,
      period: opts.period,
      category: section,
      description: lineItem,
      amount,
      normalizedCategory,
      citation: makeCitation(opts, section, lineItem, rawAmount),
    });
  }

  return { lineItems, warnings };
}
