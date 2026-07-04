/**
 * Audit orchestrator — the agent loop that composes every tool in this package.
 *
 * `runAudit` runs the 10-step workflow from CLAUDE.md / docs/TechSpec.md and
 * emits the trace shape the frontend renders:
 *
 *   1  plan the investigation                    (planner, TOOL)
 *   2  retrieve base + incentive fee clauses     (retriever, LLM — VultronRetriever)
 *   3  retrieve exclusions / GOP / governing terms (retriever, LLM — VultronRetriever)
 *   4  extract structured fee rules              (rule extractor, TOOL)
 *   5  recompute expected fees                   (fee calculator, TOOL)
 *   6  month-over-month + inclusion checks       (anomaly checker, TOOL)
 *   7  LOOP: retrieve prior-month + support pack (retriever, LLM)   ← conditional
 *   8  re-check flagged charges with evidence    (support check, TOOL) ← conditional
 *   9  classify findings + score confidence      (decision engine, TOOL)
 *  10  generate memo + dispute email             (report generator, TOOL*)
 *
 * Steps 7–8 run ONLY when the anomaly checker flags a review-triggering jump —
 * the audit branches on tool output instead of following a fixed script, which
 * is what makes this an agent. Stable months skip the loop and the trace
 * renumbers sequentially.
 *
 * Model policy (hackathon requirement): the PRIMARY workflow's only model is a
 * VultronRetriever reranker (`deps.ranker`) scoring every retrieval step — it
 * scores, it never generates. Everything else is deterministic code: the plan
 * is fixed, rule extraction parses clause text (rates, thresholds, windows,
 * exclusion synonyms), and the memo/email render from templates. An optional
 * secondary chat model (`deps.llm`) may polish prose (*step 10 badges LLM
 * then) and back up retrieval, but the pipeline is complete without it.
 *
 * Failure policy ("don't hallucinate on missing data"): a failed rerank call
 * degrades to the all-clauses superset with a warning; an unparseable clause
 * is omitted (variance routes to NEEDS_REVIEW), never guessed. All arithmetic
 * stays in the deterministic calculator. Transports are injected boundaries,
 * so tests script them and apps/api wires the real Vultr clients (dependency
 * points app → package, never the reverse).
 */

import type {
  AgentTraceStep,
  AuditReport,
  ChargedFee,
  DocumentChunk,
  FeeRules,
  FinancialLineItem,
  RunAuditResponse,
} from "@feeforensics/shared";

import { checkAnomalies, type Anomaly } from "./tools/anomalyChecker.js";
import { checkSupport, parseSupportPack } from "./tools/caseHistoryRetriever.js";
import {
  decideFindings,
  scoreConfidence,
  type SubjectSupportCheck,
} from "./tools/decisionEngine.js";
import { chunkText } from "./tools/documentParser.js";
import { calculateFees } from "./tools/feeCalculator.js";
import { generateReport } from "./tools/reportGenerator.js";
import {
  rankRelevantChunks,
  retrieveRelevantChunks,
  type ChunkRanker,
  type RetrievedChunk,
} from "./tools/retriever.js";
import { extractFeeRulesDeterministic, type LlmMessage } from "./tools/ruleExtractor.js";
import {
  parseMiscIncomeBreakout,
  parseOperatingStatement,
  type ParsedStatement,
} from "./tools/statementParser.js";

/** Injected chat transport (a VultronRetriever model via Vultr Serverless Inference). */
export type OrchestratorLlm = (messages: LlmMessage[]) => Promise<string>;

export interface TextDocumentSource {
  docId: string;
  name: string;
  text: string;
}

export interface CsvDocumentSource {
  docId: string;
  name: string;
  csv: string;
}

export interface RunAuditDocuments {
  /** The hotel management agreement (fee clauses). */
  hma: TextDocumentSource;
  /** The audit month's USALI operating statement. */
  statement: CsvDocumentSource;
  /** Misc-income breakout detailing the statement's roll-up line (optional). */
  miscBreakout?: CsvDocumentSource;
  /** Prior-month statement — the anomaly checker's baseline (optional). */
  priorStatement?: CsvDocumentSource;
  /** Support / invoice pack — evidence for the re-retrieval loop (optional). */
  supportPack?: CsvDocumentSource;
}

export interface RunAuditInput {
  caseId: string;
  hotelName: string;
  /** Display label, e.g. "June 2026". */
  auditMonth: string;
  /** Reporting period for parsed rows, e.g. "2026-06". */
  period: string;
  /** Prior-month reporting period, e.g. "2026-05". */
  priorPeriod?: string;
  operatorName?: string;
  ownerName?: string;
  documents: RunAuditDocuments;
}

export interface RunAuditDeps {
  /**
   * PRIMARY workflow model (hackathon requirement): a VultronRetriever flavor
   * on Vultr's /v1/rerank. ALL retrieval steps (2, 3, and the step-7 loop)
   * score chunks on it. Every other step is deterministic code — planning,
   * rule extraction, calculation, decisions, and report templates.
   */
  ranker?: ChunkRanker;
  /**
   * Optional secondary chat model. Used ONLY as (a) a retrieval fallback when
   * the reranker errors and (b) prose polish for the executive summary and
   * email body (number-guarded). Omit for the VultronRetriever-only pipeline.
   */
  llm?: OrchestratorLlm;
  /** Injectable clock for deterministic tests. */
  now?: () => string;
}

/** The API contract shape plus the full report and the run's warnings. */
export interface RunAuditResult extends RunAuditResponse {
  report: AuditReport;
  warnings: string[];
}

// --- Small deterministic helpers ---------------------------------------------

const formatMoney = (n: number): string => {
  const sign = n < 0 ? "-" : "";
  const [int = "0", frac = "00"] = Math.abs(n).toFixed(2).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return frac === "00" ? `${sign}$${grouped}` : `${sign}$${grouped}.${frac}`;
};

const formatPercentRate = (fraction: number): string =>
  `${Math.round(fraction * 1e4) / 100}%`;

const errorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

/** Bound untrusted / model-derived text before it enters a prompt or the trace. */
const sanitize = (text: string, max = 240): string =>
  text
    .replace(/\s+/g, " ")
    .replace(/```/g, "'''")
    .replace(/\b(system|assistant|user)\s*:/gi, "$1-")
    .trim()
    .slice(0, max);

const normalizeLabel = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, " ");

function dedupeChunks(chunks: DocumentChunk[]): DocumentChunk[] {
  const seen = new Set<string>();
  return chunks.filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
}

/**
 * The charge a pass-through fee bills, as written on the statement — the
 * subject the support pack is searched for (e.g. "Centralized Services").
 */
function passThroughSubject(fee: ChargedFee): string {
  const fromQuote = fee.citation.quote?.split(":")[0]?.trim();
  if (fromQuote) return fromQuote;
  const fromLabel = fee.citation.sectionLabel?.split("—").pop()?.trim();
  return fromLabel || "Pass-through expense";
}

function describeRules(rules: FeeRules): string {
  const parts: string[] = [];
  if (rules.baseManagementFee) {
    parts.push(
      `base ${formatPercentRate(rules.baseManagementFee.percentage)} of ` +
        `${rules.baseManagementFee.revenueBase} (${rules.baseManagementFee.excludedRevenue.length} exclusion(s))`,
    );
  }
  if (rules.incentiveFee) {
    parts.push(
      `incentive ${formatPercentRate(rules.incentiveFee.percentage)} of ${rules.incentiveFee.profitMetric}`,
    );
  }
  if (rules.passThroughRules?.approvalThreshold != null) {
    parts.push(
      `pass-through > ${formatMoney(rules.passThroughRules.approvalThreshold)} needs owner approval`,
    );
  }
  if (rules.auditRights?.exists) {
    parts.push(
      `audit window ${rules.auditRights.correctionWindowDays ?? "per contract"} days`,
    );
  }
  return parts.length > 0 ? `Rules: ${parts.join("; ")}.` : "No fee rules extracted.";
}

const AUDIT_PLAN =
  "Investigate the base, incentive, and pass-through/centralized fee families: " +
  "retrieve the fee clauses and revenue exclusions, extract structured rules, " +
  "recompute expected fees deterministically, cross-check the prior month, and " +
  "verify flagged charges against the support pack.";

/**
 * Replace the statement's roll-up line with the breakout's detail rows. The
 * breakout DETAILS the roll-up (e.g. "Miscellaneous Income" $140k = space
 * rental + commissions + the two §4.3 excluded items), so keeping both would
 * double-count the roll-up in the fee base.
 */
function mergeBreakout(
  statementLines: FinancialLineItem[],
  breakoutLines: FinancialLineItem[],
  warnings: string[],
): FinancialLineItem[] {
  if (breakoutLines.length === 0) return statementLines;
  const sections = new Set(breakoutLines.map((b) => normalizeLabel(b.category)));
  const isRollUp = (li: FinancialLineItem) => sections.has(normalizeLabel(li.description));
  const rollUps = statementLines.filter(isRollUp);

  if (rollUps.length === 0) {
    warnings.push(
      "Misc-income breakout has no matching roll-up line on the statement — " +
        "detail appended as-is; verify the fee base does not double-count.",
    );
    return [...statementLines, ...breakoutLines];
  }

  const rollUpTotal = rollUps.reduce((acc, li) => acc + li.amount, 0);
  const detailTotal = breakoutLines.reduce((acc, li) => acc + li.amount, 0);
  if (rollUpTotal !== detailTotal) {
    warnings.push(
      `Misc-income breakout (${formatMoney(detailTotal)}) does not foot to the ` +
        `statement roll-up (${formatMoney(rollUpTotal)}) — using the detail; verify the schedule.`,
    );
  }
  return [...statementLines.filter((li) => !isRollUp(li)), ...breakoutLines];
}

// --- The audit loop -----------------------------------------------------------

/**
 * Run the full audit. Throws only when the operating statement itself cannot
 * be parsed (no audit is possible without it); every other failure — LLM
 * transport, missing optional documents, unextractable rules — degrades to a
 * deterministic fallback plus a warning, and unexplained variance is routed to
 * a NEEDS_REVIEW finding instead of being invented or dropped.
 */
export async function runAudit(
  input: RunAuditInput,
  deps: RunAuditDeps,
): Promise<RunAuditResult> {
  const now = deps.now ?? (() => new Date().toISOString());
  const docs = input.documents;
  const warnings: string[] = [];
  const trace: AgentTraceStep[] = [];

  const addStep = (step: {
    title: string;
    tool: AgentTraceStep["tool"];
    kind: AgentTraceStep["kind"];
    inputSummary: string;
    outputSummary: string;
    status?: AgentTraceStep["status"];
    evidenceCount?: number;
  }): void => {
    const stepNumber = trace.length + 1;
    trace.push({
      id: `trace_${stepNumber}`,
      caseId: input.caseId,
      stepNumber,
      title: step.title,
      tool: step.tool,
      kind: step.kind,
      inputSummary: step.inputSummary,
      outputSummary: step.outputSummary,
      status: step.status ?? "completed",
      timestamp: now(),
      ...(step.evidenceCount !== undefined ? { evidenceCount: step.evidenceCount } : {}),
    });
  };

  // ---- Step 1 — plan the investigation (deterministic) -----------------------
  // The audit plan is a fixed contract (CLAUDE.md's ten steps), not a model
  // choice — the VultronRetriever-only pipeline plans in code and spends its
  // model budget where the models add evidence: retrieval.
  const inventory = [
    docs.hma,
    docs.statement,
    docs.miscBreakout,
    docs.priorStatement,
    docs.supportPack,
  ]
    .filter((d): d is TextDocumentSource | CsvDocumentSource => Boolean(d))
    .map((d) => d.name);
  const planInput = `${input.hotelName}, ${input.auditMonth} operating package (${inventory.length} document(s))`;
  addStep({
    title: "Plan audit scope",
    tool: "planner",
    kind: "TOOL",
    inputSummary: planInput,
    outputSummary: AUDIT_PLAN,
  });

  // ---- Steps 2–3 — retrieve the governing clauses (LLM) ----------------------
  const hmaChunks = chunkText(docs.hma.text, {
    caseId: input.caseId,
    documentId: docs.hma.docId,
    citationPrefix: "HMA",
  });

  // Retrieval boundary: the VultronRetriever reranker when wired (scores, never
  // generates — nothing to parse), falling back to chat selection with a
  // warning. Callers keep their own last-resort supersets below.
  const selectChunks = async (
    query: string,
    candidates: DocumentChunk[],
  ): Promise<RetrievedChunk[]> => {
    if (deps.ranker) {
      try {
        return await rankRelevantChunks(query, candidates, { ranker: deps.ranker });
      } catch (err) {
        // No chat model → let the caller apply its deterministic superset.
        if (!deps.llm) throw err;
        warnings.push(
          `Retriever ("${query}"): rerank call failed (${errorMessage(err)}) — ` +
            "falling back to chat-model selection.",
        );
      }
    }
    if (!deps.llm) throw new Error("no retrieval model configured");
    return retrieveRelevantChunks(query, candidates, { llm: deps.llm, topK: 6 });
  };

  const retrieveClauses = async (title: string, query: string): Promise<DocumentChunk[]> => {
    try {
      const retrieved = await selectChunks(query, hmaChunks);
      const labels = retrieved.map((r) => r.chunk.citationLabel).join(", ");
      addStep({
        title,
        tool: "retriever",
        kind: "LLM",
        inputSummary: `Query: ${query}`,
        outputSummary:
          retrieved.length > 0
            ? sanitize(`Found ${labels}.`)
            : "No relevant clauses selected — extraction will see nothing for this query.",
        status: retrieved.length > 0 ? "completed" : "warning",
        evidenceCount: retrieved.length,
      });
      return retrieved.map((r) => r.chunk);
    } catch (err) {
      warnings.push(
        `Retriever ("${query}"): model call failed (${errorMessage(err)}) — ` +
          `falling back to all ${hmaChunks.length} agreement clauses (deterministic superset).`,
      );
      addStep({
        title,
        tool: "retriever",
        kind: "LLM",
        inputSummary: `Query: ${query}`,
        outputSummary: `Model unavailable — using all ${hmaChunks.length} agreement clauses as candidates.`,
        status: "warning",
        evidenceCount: hmaChunks.length,
      });
      return hmaChunks;
    }
  };

  const feeClauseChunks = await retrieveClauses(
    "Retrieve base + incentive fee clauses",
    "base management fee; incentive management fee",
  );
  const exclusionChunks = await retrieveClauses(
    "Retrieve revenue exclusions + GOP definition",
    "excluded revenue; GOP definition; pass-through / centralized-services approval threshold; audit rights",
  );

  // ---- Step 4 — extract structured fee rules (deterministic) -----------------
  // Revenue-exclusion clauses are load-bearing for fee attribution: if the
  // model-driven retrieval scores one out (observed run-to-run live), the
  // extractor could never ground the exclusions. Union them in deterministically.
  const exclusionClauseBackstop = hmaChunks.filter((c) =>
    /exclusion/i.test(c.citationLabel),
  );
  const ruleChunks = dedupeChunks([
    ...feeClauseChunks,
    ...exclusionChunks,
    ...exclusionClauseBackstop,
  ]);
  // Transcription is deterministic clause parsing — the VultronRetriever models
  // score documents, they don't generate JSON, so no model is asked to. A clause
  // that can't be parsed is omitted with a warning (variance then routes to
  // human review), never guessed.
  const extraction = extractFeeRulesDeterministic(ruleChunks, {
    documentName: docs.hma.name,
  });
  const rules: FeeRules = extraction.rules;
  warnings.push(...extraction.warnings.map((w) => `Rule extraction: ${w}`));
  addStep({
    title: "Extract fee rules to structured JSON",
    tool: "rule_extractor",
    kind: "TOOL",
    inputSummary: `${ruleChunks.length} retrieved clause(s)`,
    outputSummary: describeRules(rules),
    status: extraction.warnings.length > 0 ? "warning" : "completed",
  });

  // ---- Step 5 — deterministic recompute (TOOL) --------------------------------
  const statement = parseOperatingStatement(docs.statement.csv, {
    caseId: input.caseId,
    sourceDocumentId: docs.statement.docId,
    documentName: docs.statement.name,
    period: input.period,
  });
  warnings.push(...statement.warnings.map((w) => `Statement: ${w}`));

  let lineItems = statement.lineItems;
  let breakoutParsed = false;
  if (docs.miscBreakout) {
    try {
      const breakout = parseMiscIncomeBreakout(docs.miscBreakout.csv, {
        caseId: input.caseId,
        sourceDocumentId: docs.miscBreakout.docId,
        documentName: docs.miscBreakout.name,
        period: input.period,
      });
      warnings.push(...breakout.warnings.map((w) => `Breakout: ${w}`));
      lineItems = mergeBreakout(lineItems, breakout.lineItems, warnings);
      breakoutParsed = true;
    } catch (err) {
      warnings.push(
        `Misc-income breakout could not be parsed (${errorMessage(err)}) — ` +
          "excluded items inside the roll-up cannot be seen; findings may be incomplete.",
      );
    }
  }

  // The statement reports pass-through charges (e.g. centralized services) as
  // charged fees, but the calculator attributes variance from line items. Every
  // charge above the contract's approval threshold is represented as a
  // CORPORATE_OVERHEAD line (cited to the statement row) so `computePassThrough`
  // can attribute it against the §5.1-style rule; below-threshold charges are
  // legitimate and are never flagged. Without an extracted threshold nothing is
  // synthesized and the variance surfaces as NEEDS_REVIEW instead.
  const approvalThreshold = rules.passThroughRules?.approvalThreshold;
  const passThroughFees = statement.chargedFees.filter(
    (f) => f.feeType === "PASS_THROUGH_EXPENSE",
  );
  const flaggedPassThroughFees =
    approvalThreshold == null
      ? []
      : passThroughFees.filter((f) => f.chargedAmount > approvalThreshold);
  const flaggedPassThroughLines = flaggedPassThroughFees.map(
    (fee): FinancialLineItem => ({
      id: `${fee.id}_pass_through_line`,
      caseId: input.caseId,
      sourceDocumentId: fee.citation.documentId,
      period: fee.period,
      category: "PASS_THROUGH_EXPENSE",
      description: passThroughSubject(fee),
      amount: fee.chargedAmount,
      normalizedCategory: "CORPORATE_OVERHEAD",
      citation: fee.citation,
    }),
  );

  const calculation = calculateFees({
    caseId: input.caseId,
    rules,
    lineItems: [...lineItems, ...flaggedPassThroughLines],
    chargedFees: statement.chargedFees,
  });

  const chargedAmountOf = (feeType: ChargedFee["feeType"]): number | undefined =>
    statement.chargedFees.find((f) => f.feeType === feeType)?.chargedAmount;
  const chargedBase = chargedAmountOf("BASE_MANAGEMENT_FEE");
  const chargedIncentive = chargedAmountOf("INCENTIVE_MANAGEMENT_FEE");
  addStep({
    title: "Recompute base + incentive fees",
    tool: "fee_calculator",
    kind: "TOOL",
    inputSummary:
      `${docs.statement.name}` +
      (breakoutParsed && docs.miscBreakout ? ` + ${docs.miscBreakout.name}` : "") +
      " + extracted rules",
    outputSummary:
      `Recomputed base ${formatMoney(calculation.expectedBaseFee)}` +
      (chargedBase !== undefined ? ` (charged ${formatMoney(chargedBase)})` : "") +
      ` and incentive ${formatMoney(calculation.expectedIncentiveFee)}` +
      (chargedIncentive !== undefined ? ` (charged ${formatMoney(chargedIncentive)})` : "") +
      `; variance ${formatMoney(calculation.variance)}.`,
  });

  // ---- Step 6 — month-over-month + inclusion checks (TOOL) --------------------
  let anomalies: Anomaly[] = [];
  let anomalyCheckRan = false;
  let priorStatement: ParsedStatement | null = null;
  const checksTitle = "Run inclusion + GOP checks";
  const checksInput = "Fee base, GOP, and prior-month baseline";
  if (docs.priorStatement) {
    try {
      priorStatement = parseOperatingStatement(docs.priorStatement.csv, {
        caseId: input.caseId,
        sourceDocumentId: docs.priorStatement.docId,
        documentName: docs.priorStatement.name,
        period: input.priorPeriod ?? "prior",
      });
      warnings.push(...priorStatement.warnings.map((w) => `Prior statement: ${w}`));
      anomalies = checkAnomalies({
        currentLineItems: lineItems,
        priorLineItems: priorStatement.lineItems,
        currentChargedFees: statement.chargedFees,
        priorChargedFees: priorStatement.chargedFees,
      });
      anomalyCheckRan = true;
      addStep({
        title: checksTitle,
        tool: "anomaly_checker",
        kind: "TOOL",
        inputSummary: checksInput,
        outputSummary:
          anomalies.length > 0
            ? sanitize(`${anomalies.length} material change(s). ${anomalies[0]!.reason}`)
            : "No material month-over-month changes — charged fees track the baseline.",
        status: anomalies.length > 0 ? "warning" : "completed",
        evidenceCount: anomalies.length,
      });
    } catch (err) {
      warnings.push(
        `Prior-month statement could not be parsed (${errorMessage(err)}) — ` +
          "month-over-month anomaly check skipped.",
      );
      addStep({
        title: checksTitle,
        tool: "anomaly_checker",
        kind: "TOOL",
        inputSummary: checksInput,
        outputSummary: "Prior-month statement unavailable — cross-check skipped.",
        status: "warning",
      });
    }
  } else {
    warnings.push("No prior-month statement provided — month-over-month anomaly check skipped.");
    addStep({
      title: checksTitle,
      tool: "anomaly_checker",
      kind: "TOOL",
      inputSummary: checksInput,
      outputSummary: "No prior month provided — month-over-month cross-check skipped.",
      status: "warning",
    });
  }

  // ---- Steps 7–8 — the conditional re-retrieval loop --------------------------
  // Only a review-triggering anomaly (a material increase in an owner-charged
  // expense) sends the agent back for evidence. This branch is the "agent, not
  // script" moment: stable months never reach it.
  const supportChecks: SubjectSupportCheck[] = [];
  const reviewAnomalies = anomalies.filter((a) => a.triggersReview);
  const reviewFeeKeys = new Set(
    reviewAnomalies.filter((a) => a.kind === "charged_fee").map((a) => a.key),
  );
  const feesUnderReview = statement.chargedFees.filter((f) => reviewFeeKeys.has(f.feeType));

  if (feesUnderReview.length > 0 && !docs.supportPack) {
    warnings.push(
      "Anomaly triggered an evidence review but no support pack was provided — " +
        "flagged charges go to human review unverified.",
    );
  } else if (feesUnderReview.length > 0 && docs.supportPack) {
    const supportPack = docs.supportPack;
    const lead = reviewAnomalies[0]!;
    const subjects = feesUnderReview.map(passThroughSubject);

    // Step 7 — model-driven evidence retrieval over the parsed support pack.
    const pack = parseSupportPack(supportPack.csv, {
      sourceDocumentId: supportPack.docId,
      documentName: supportPack.name,
    });
    warnings.push(...pack.warnings.map((w) => `Support pack: ${w}`));
    const recordChunks: DocumentChunk[] = pack.records.map((r, i) => ({
      id: `${supportPack.docId}_record_${i}`,
      documentId: supportPack.docId,
      caseId: input.caseId,
      text: r.citation.quote ?? `${r.relatesTo} — ${r.status}`,
      citationLabel: r.citation.sectionLabel ?? `Support Pack — ${r.relatesTo}`,
    }));
    const recordByChunkId = new Map(pack.records.map((r, i) => [recordChunks[i]!.id, r]));

    // checkSupport re-filters by subject, so a superset fallback stays safe and
    // a wrong model pick degrades to needs_review — never to invented support.
    let selectedRecords = pack.records;
    let step7Status: AgentTraceStep["status"] = "completed";
    try {
      const picked = await selectChunks(
        `supporting invoice and prior written owner approval for: ${subjects.join(", ")}; prior-month baseline`,
        recordChunks,
      );
      if (picked.length > 0) {
        selectedRecords = picked
          .map((p) => recordByChunkId.get(p.chunk.id))
          .filter((r): r is NonNullable<typeof r> => Boolean(r));
      } else {
        warnings.push(
          "Support-pack retrieval selected no records — using the full pack (deterministic fallback).",
        );
        step7Status = "warning";
      }
    } catch (err) {
      warnings.push(
        `Support-pack retrieval failed (${errorMessage(err)}) — using the full pack (deterministic fallback).`,
      );
      step7Status = "warning";
    }
    addStep({
      title: `${lead.label} anomaly — retrieve prior month + support pack`,
      tool: "retriever",
      kind: "LLM",
      inputSummary: `Query: prior-month baseline; ${sanitize(subjects.join(", "), 120)} invoice + approval`,
      outputSummary: sanitize(
        `Prior-month baseline ${formatMoney(lead.priorAmount)} → ${formatMoney(lead.currentAmount)}; ` +
          `retrieved ${selectedRecords.length} support-pack record(s) (re-retrieval loop).`,
      ),
      status: step7Status,
      evidenceCount: selectedRecords.length + (lead.priorCitation ? 1 : 0),
    });

    // Step 8 — deterministic support verification (Check 5).
    for (const fee of feesUnderReview) {
      const result = checkSupport(
        {
          subject: passThroughSubject(fee),
          amount: fee.chargedAmount,
          ...(approvalThreshold != null ? { approvalThreshold } : {}),
        },
        selectedRecords,
      );
      supportChecks.push({ subject: passThroughSubject(fee), result });
    }
    addStep({
      title: "Re-run checks with new evidence",
      tool: "anomaly_checker",
      kind: "TOOL",
      inputSummary: "Flagged charges + retrieved support records",
      outputSummary: sanitize(supportChecks.map((c) => c.result.explanation).join(" ")),
      evidenceCount: supportChecks.reduce((n, c) => n + c.result.citations.length, 0),
    });
  }

  // ---- Step 9 — classify findings + score confidence (TOOL) -------------------
  const findings = decideFindings({
    caseId: input.caseId,
    rules,
    calculation,
    anomalies,
    supportChecks,
  });
  const confidence = scoreConfidence({
    rules,
    calculation,
    findings,
    inputsPresent: {
      statement: true,
      revenueBreakout: breakoutParsed,
      priorMonth: priorStatement !== null,
    },
    anomalyCheckRan,
  });
  const countBy = (action: string): number =>
    findings.filter((f) => f.recommendedAction === action).length;
  addStep({
    title: "Classify findings + compute confidence",
    tool: "decision_engine",
    kind: "TOOL",
    inputSummary: `${calculation.lineItemImpacts.length} variance attribution(s)`,
    outputSummary:
      findings.length > 0
        ? `${findings.length} finding(s) (${countBy("dispute")} dispute, ` +
          `${countBy("request_explanation")} unsupported, ${countBy("human_review")} review); ` +
          `confidence ${confidence.points}%.`
        : `No findings — charged fees reconcile; confidence ${confidence.points}%.`,
  });

  // ---- Step 10 — memo + dispute email (LLM prose, deterministic skeleton) -----
  const { report, warnings: reportWarnings } = await generateReport(
    {
      caseId: input.caseId,
      hotelName: input.hotelName,
      auditMonth: input.auditMonth,
      ...(input.operatorName !== undefined ? { operatorName: input.operatorName } : {}),
      ...(input.ownerName !== undefined ? { ownerName: input.ownerName } : {}),
      rules,
      findings,
      calculation,
      confidence,
    },
    { ...(deps.llm ? { llm: deps.llm } : {}), now },
  );
  warnings.push(...reportWarnings.map((w) => `Report: ${w}`));
  addStep({
    title: "Generate audit memo + dispute notice",
    tool: "report_generator",
    kind: deps.llm ? "LLM" : "TOOL",
    inputSummary: "Findings + calculation breakdown + confidence",
    outputSummary:
      reportWarnings.length > 0
        ? "Produced cited memo and dispute notice (deterministic template fallback for model prose)."
        : "Produced cited memo and draft dispute notice.",
    status: reportWarnings.length > 0 ? "warning" : "completed",
  });

  return {
    caseId: input.caseId,
    status: "completed",
    trace,
    findings,
    memo: report.memoMarkdown,
    emailDraft: report.disputeEmail,
    confidence: confidence.confidence,
    confidenceBreakdown: confidence.breakdown,
    report,
    warnings,
  };
}
