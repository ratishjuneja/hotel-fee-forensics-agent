/**
 * @feeforensics/agent — audit orchestrator and deterministic tools.
 *
 * Public surface grows as tools land. Deterministic fee calculator (all fee
 * arithmetic happens here, never in the LLM), the CSV statement parser that
 * feeds it structured line items, and the document parser + clause-aware
 * chunker that turns source docs into citable chunks for the retriever.
 */
export * from "./tools/feeCalculator.js";
export * from "./tools/statementParser.js";
export * from "./tools/documentParser.js";
