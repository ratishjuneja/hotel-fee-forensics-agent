/**
 * @feeforensics/agent — audit orchestrator and deterministic tools.
 *
 * `runAudit` (orchestrator.ts) composes the tools below into the traced
 * 10-step agent loop with the conditional re-retrieval branch. The tools: the
 * deterministic fee calculator (all fee arithmetic happens here, never in the
 * LLM), the CSV statement parser that feeds it structured line items, the
 * document parser + clause-aware chunker that turns source docs into citable
 * chunks, and the model-driven retriever that selects the chunks the agent
 * reasons over.
 */
export * from "./orchestrator.js";
export * from "./tools/feeCalculator.js";
export * from "./tools/statementParser.js";
export * from "./tools/documentParser.js";
export * from "./tools/retriever.js";
export * from "./tools/ruleExtractor.js";
export * from "./tools/anomalyChecker.js";
export * from "./tools/caseHistoryRetriever.js";
export * from "./tools/decisionEngine.js";
export * from "./tools/humanReview.js";
export * from "./tools/reportGenerator.js";
export * from "./tools/citationFormat.js";
