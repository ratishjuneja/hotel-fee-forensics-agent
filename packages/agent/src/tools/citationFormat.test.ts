import { describe, expect, it } from "vitest";
import type { Citation } from "@feeforensics/shared";

import { formatCitation } from "./citationFormat.js";

describe("formatCitation — verifiable provenance", () => {
  it("renders a clause citation with its document and page", () => {
    const c: Citation = {
      documentId: "doc_hma",
      documentName: "HMA",
      sectionLabel: "§4.2 Incentive Management Fee",
      page: 12,
    };
    expect(formatCitation(c)).toBe("§4.2 Incentive Management Fee (doc_hma, p.12)");
  });

  it("omits the page locator when the source has no page (e.g. a .txt HMA)", () => {
    const c: Citation = {
      documentId: "doc_hma",
      documentName: "HMA",
      sectionLabel: "§4.2 Incentive Management Fee",
    };
    expect(formatCitation(c)).toBe("§4.2 Incentive Management Fee (doc_hma)");
  });

  it("renders a financial-line citation with its source row and line label", () => {
    const c: Citation = {
      documentId: "doc_operating_statement",
      documentName: "June Operating Statement",
      sectionLabel: "MANAGEMENT FEES",
      row: 21,
      lineLabel: "Centralized Services",
    };
    expect(formatCitation(c)).toBe(
      "MANAGEMENT FEES (doc_operating_statement, row 21: Centralized Services)",
    );
  });

  it("does not repeat the line label when the section label already contains it", () => {
    const c: Citation = {
      documentId: "doc_operating_statement",
      documentName: "June Operating Statement",
      sectionLabel: "MANAGEMENT FEES — Centralized Services Charge",
      row: 21,
      lineLabel: "Centralized Services Charge",
    };
    expect(formatCitation(c)).toBe(
      "MANAGEMENT FEES — Centralized Services Charge (doc_operating_statement, row 21)",
    );
  });

  it("falls back to the document name when there is no section or line label", () => {
    const c: Citation = { documentId: "doc_x", documentName: "Doc X" };
    expect(formatCitation(c)).toBe("Doc X (doc_x)");
  });
});
