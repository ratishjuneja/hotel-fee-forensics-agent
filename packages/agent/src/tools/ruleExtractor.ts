/**
 * Fee-rule extractor.
 *
 * Reads the HMA chunks and asks a VultronRetriever model (via Vultr Serverless
 * Inference) to extract the structured `FeeRules` the deterministic calculator
 * needs — base-fee %, incentive %, profit metric, excluded revenue/categories,
 * pass-through approval threshold, and audit rights. The model EXTRACTS rules;
 * it never computes fees (that stays in the calculator). Even the "3.0%" -> 0.03
 * normalization is done in code here, not by the model.
 *
 * Everything is cited: each rule carries a `Citation` back to the specific chunk
 * the model drew it from. "Don't hallucinate on missing data": a clause the
 * model marks not-found is omitted (the field stays undefined) rather than
 * invented, and a rule whose cited chunk doesn't exist is kept but flagged.
 *
 * The model is an INJECTED boundary (`RuleExtractorLlm`) so tests are
 * deterministic; the orchestrator wires the real transport (apps/api's
 * chatComplete). The model's JSON envelope is validated with zod.
 */

import type {
  Citation,
  DocumentChunk,
  FeeRules,
  NormalizedCategory,
} from "@feeforensics/shared";
import { z } from "zod";

export interface LlmMessage {
  role: "system" | "user";
  content: string;
}

/** Injected chat transport (a VultronRetriever model via Vultr). */
export type RuleExtractorLlm = (messages: LlmMessage[]) => Promise<string>;

export interface ExtractFeeRulesOptions {
  llm: RuleExtractorLlm;
  /** Document name for citations, e.g. "Hotel Management Agreement". */
  documentName: string;
  /** Truncate each chunk's text in the prompt to bound token use (default 800). */
  maxSnippetChars?: number;
}

export interface ExtractFeeRulesResult {
  rules: FeeRules;
  warnings: string[];
}

/** Thrown when the model output can't be parsed/validated into an extraction. */
export class RuleExtractionError extends Error {
  readonly raw: string;
  constructor(message: string, raw: string) {
    super(`Fee-rule extraction failed: ${message}`);
    this.name = "RuleExtractionError";
    this.raw = raw;
  }
}

// --- Model output schema (zod-validated) ------------------------------------

const NORMALIZED_CATEGORY = z.enum([
  "ROOM_REVENUE",
  "FNB_REVENUE",
  "BANQUET_REVENUE",
  "CANCELLATION_REVENUE",
  "INSURANCE_PROCEEDS",
  "OPERATING_EXPENSE",
  "CORPORATE_OVERHEAD",
  "BRAND_FEE",
  "MANAGEMENT_FEE",
  "OTHER",
]);

const PROFIT_METRIC = z.enum(["GOP", "AGOP", "NOI"]);

const nullableNumber = z.number().nullable().optional();
const nullableString = z.string().nullable().optional();
const found = z.boolean().optional().default(true);

const baseSchema = z.object({
  found,
  ratePercent: nullableNumber,
  revenueBase: nullableString,
  excludedRevenue: z.array(z.string()).optional().default([]),
  excludedCategories: z.array(NORMALIZED_CATEGORY).optional().default([]),
  sourceIndex: nullableNumber,
  quote: nullableString,
});

const incentiveSchema = z.object({
  found,
  ratePercent: nullableNumber,
  profitMetric: PROFIT_METRIC.nullable().optional(),
  threshold: nullableNumber,
  ownerPriorityReturn: nullableNumber,
  excludedItems: z.array(z.string()).optional().default([]),
  excludedCategories: z.array(NORMALIZED_CATEGORY).optional().default([]),
  sourceIndex: nullableNumber,
  quote: nullableString,
});

const passThroughSchema = z.object({
  found,
  allowedCategories: z.array(z.string()).optional().default([]),
  excludedCategories: z.array(z.string()).optional().default([]),
  approvalThreshold: nullableNumber,
  sourceIndex: nullableNumber,
  quote: nullableString,
});

const auditSchema = z.object({
  found,
  correctionWindowDays: nullableNumber,
  sourceIndex: nullableNumber,
  quote: nullableString,
});

const envelopeSchema = z.object({
  baseManagementFee: baseSchema.optional(),
  incentiveFee: incentiveSchema.optional(),
  passThroughRules: passThroughSchema.optional(),
  auditRights: auditSchema.optional(),
});

type Envelope = z.infer<typeof envelopeSchema>;

// --- Prompt -----------------------------------------------------------------

function buildMessages(
  chunks: DocumentChunk[],
  maxSnippetChars: number,
): LlmMessage[] {
  const clauses = chunks
    .map((c, i) => {
      const snippet = c.text.replace(/\s+/g, " ").trim().slice(0, maxSnippetChars);
      return `[${i}] (${c.citationLabel}) ${snippet}`;
    })
    .join("\n");

  return [
    {
      role: "system",
      content:
        "You extract the fee terms of a hotel management agreement (HMA) into " +
        "structured JSON. You do NOT compute anything. For each rule, set " +
        '"sourceIndex" to the [index] of the clause you drew it from (use only the ' +
        "indices provided) and quote the exact clause text. Express a percentage as " +
        'the number as written (e.g. "3.0%" -> 3.0), NOT as a fraction. If a clause ' +
        'is not present, set {"found": false} for it — never invent a value. ' +
        "Categorize excluded revenue using ONLY these labels where applicable: " +
        "CANCELLATION_REVENUE, INSURANCE_PROCEEDS, CORPORATE_OVERHEAD, OTHER. " +
        "Return ONLY a JSON object with keys baseManagementFee, incentiveFee, " +
        "passThroughRules, auditRights. No prose.",
    },
    {
      role: "user",
      content: `HMA CLAUSES:\n${clauses}`,
    },
  ];
}

// --- Parsing + mapping ------------------------------------------------------

function parseEnvelope(raw: string): Envelope {
  const stripped = raw.replace(/```(?:json)?/gi, "");
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new RuleExtractionError("no JSON object in model output", raw);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped.slice(start, end + 1));
  } catch {
    throw new RuleExtractionError("model output is not valid JSON", raw);
  }
  const result = envelopeSchema.safeParse(parsed);
  if (!result.success) {
    throw new RuleExtractionError(result.error.issues.map((i) => i.message).join("; "), raw);
  }
  return result.data;
}

const toFraction = (ratePercent: number): number =>
  Math.round(ratePercent * 1e6) / 1e8; // ratePercent/100, without binary drift

/** Build the citation for a rule, falling back to doc-level when the chunk index is bad. */
function buildCitation(
  chunks: DocumentChunk[],
  sourceIndex: number | null | undefined,
  documentName: string,
  quote: string | null | undefined,
  ruleName: string,
  warnings: string[],
): Citation {
  const docId = chunks[0]?.documentId ?? "";
  if (sourceIndex != null && chunks[sourceIndex]) {
    const chunk = chunks[sourceIndex]!;
    return {
      documentId: chunk.documentId,
      documentName,
      chunkId: chunk.id,
      sectionLabel: chunk.sectionLabel ?? chunk.citationLabel,
      quote: quote ?? undefined,
    };
  }
  warnings.push(
    `${ruleName}: model cited a source chunk (${sourceIndex ?? "none"}) that does not ` +
      `exist — citation is document-level only, verify manually.`,
  );
  return { documentId: docId, documentName, quote: quote ?? undefined };
}

export async function extractFeeRules(
  chunks: DocumentChunk[],
  options: ExtractFeeRulesOptions,
): Promise<ExtractFeeRulesResult> {
  const warnings: string[] = [];
  const rules: FeeRules = {};

  if (chunks.length === 0) {
    warnings.push("No document chunks provided — no fee rules extracted.");
    return { rules, warnings };
  }

  const maxSnippetChars = options.maxSnippetChars ?? 800;
  const raw = await options.llm(buildMessages(chunks, maxSnippetChars));
  const env = parseEnvelope(raw);

  // Base management fee
  const base = env.baseManagementFee;
  if (base && base.found !== false) {
    if (typeof base.ratePercent === "number" && base.revenueBase) {
      rules.baseManagementFee = {
        percentage: toFraction(base.ratePercent),
        revenueBase: base.revenueBase,
        excludedRevenue: base.excludedRevenue,
        ...(base.excludedCategories.length > 0
          ? { excludedCategories: base.excludedCategories as NormalizedCategory[] }
          : {}),
        citation: buildCitation(
          chunks, base.sourceIndex, options.documentName, base.quote,
          "base management fee", warnings,
        ),
      };
    } else {
      warnings.push("base management fee: clause found but rate/revenue base missing — omitted.");
    }
  } else if (base) {
    warnings.push("base management fee: clause not found in the agreement.");
  }

  // Incentive fee
  const incentive = env.incentiveFee;
  if (incentive && incentive.found !== false) {
    if (typeof incentive.ratePercent === "number" && incentive.profitMetric) {
      rules.incentiveFee = {
        percentage: toFraction(incentive.ratePercent),
        profitMetric: incentive.profitMetric,
        ...(incentive.threshold != null ? { threshold: incentive.threshold } : {}),
        ...(incentive.ownerPriorityReturn != null
          ? { ownerPriorityReturn: incentive.ownerPriorityReturn }
          : {}),
        excludedItems: incentive.excludedItems,
        ...(incentive.excludedCategories.length > 0
          ? { excludedCategories: incentive.excludedCategories as NormalizedCategory[] }
          : {}),
        citation: buildCitation(
          chunks, incentive.sourceIndex, options.documentName, incentive.quote,
          "incentive fee", warnings,
        ),
      };
    } else {
      warnings.push("incentive fee: clause found but rate/profit metric missing — omitted.");
    }
  } else if (incentive) {
    warnings.push("incentive fee: clause not found in the agreement.");
  }

  // Pass-through / centralized-services approval
  const pass = env.passThroughRules;
  if (pass && pass.found !== false && (pass.excludedCategories.length > 0 || pass.approvalThreshold != null)) {
    rules.passThroughRules = {
      allowedCategories: pass.allowedCategories,
      excludedCategories: pass.excludedCategories,
      ...(pass.approvalThreshold != null ? { approvalThreshold: pass.approvalThreshold } : {}),
      citation: buildCitation(
        chunks, pass.sourceIndex, options.documentName, pass.quote,
        "pass-through rules", warnings,
      ),
    };
  } else if (pass && pass.found === false) {
    warnings.push("pass-through rules: clause not found in the agreement.");
  }

  // Audit rights
  const audit = env.auditRights;
  if (audit && audit.found !== false) {
    rules.auditRights = {
      exists: true,
      ...(audit.correctionWindowDays != null
        ? { correctionWindowDays: audit.correctionWindowDays }
        : {}),
      citation: buildCitation(
        chunks, audit.sourceIndex, options.documentName, audit.quote,
        "audit rights", warnings,
      ),
    };
  } else if (audit) {
    warnings.push("audit rights: clause not found in the agreement.");
  }

  return { rules, warnings };
}
