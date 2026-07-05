/**
 * Citation rendering — one place to turn a structured `Citation` into an
 * audit-defensible provenance string.
 *
 * Every finding, memo claim, and calculation points back to an exact location:
 * a clause citation resolves to its document and page ("§4.2 Incentive
 * Management Fee (doc_hma, p.12)"); a financial-line citation resolves to its
 * source CSV row and line ("MANAGEMENT FEES (doc_operating_statement, row 21:
 * Centralized Services)"). The page/row locators only appear when the parser
 * actually captured them, so a .txt HMA (no pages) simply omits "p.N" — the
 * tool never invents a location it does not have.
 */

import type { Citation } from "@feeforensics/shared";

export function formatCitation(c: Citation): string {
  const locator: string[] = [c.documentId];
  if (c.page != null) locator.push(`p.${c.page}`);
  if (c.row != null) {
    // Show the line label alongside the row unless the section label already
    // carries it (avoids "... Centralized Services (…, row 21: Centralized Services)").
    const showLine = c.lineLabel && !(c.sectionLabel ?? "").includes(c.lineLabel);
    locator.push(showLine ? `row ${c.row}: ${c.lineLabel}` : `row ${c.row}`);
  }
  const head = c.sectionLabel ?? c.lineLabel ?? c.documentName;
  return `${head} (${locator.join(", ")})`;
}
