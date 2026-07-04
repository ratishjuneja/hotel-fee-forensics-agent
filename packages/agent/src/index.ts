/**
 * @feeforensics/agent — audit orchestrator and deterministic tools.
 *
 * Public surface grows as tools land: the deterministic fee calculator (all fee
 * arithmetic happens here, never in the LLM), the CSV statement parser that
 * feeds it structured line items, the document parser + clause-aware chunker
 * that turns source docs into citable chunks, and the model-driven retriever
 * that selects the chunks the agent reasons over.
 */
export * from "./tools/feeCalculator.js";
export * from "./tools/statementParser.js";
export * from "./tools/documentParser.js";
export * from "./tools/retriever.js";
export * from "./tools/ruleExtractor.js";
export * from "./tools/anomalyChecker.js";
export * from "./tools/caseHistoryRetriever.js";
export * from "./tools/decisionEngine.js";
export * from "./tools/reportGenerator.js";
