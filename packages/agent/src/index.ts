/**
 * @feeforensics/agent — audit orchestrator and deterministic tools.
 *
 * Public surface grows as tools land. First tool: the deterministic fee
 * calculator (all fee arithmetic happens here, never in the LLM).
 */
export * from "./tools/feeCalculator.js";
