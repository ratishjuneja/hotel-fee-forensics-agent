import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  checkSupport,
  parseSupportPack,
  type SupportRecord,
} from "./caseHistoryRetriever.js";

const packCsv = readFileSync(
  fileURLToPath(
    new URL("../../../../data/demo/04_support_invoice_pack.csv", import.meta.url),
  ),
  "utf8",
);

const packOpts = {
  sourceDocumentId: "doc_support_pack",
  documentName: "Support / Invoice Pack — June",
};

const pack = parseSupportPack(packCsv, packOpts);

const byDocId = (docId: string) =>
  pack.records.find((r) => r.docId === docId);

// --- Parsing the real data/demo support pack ---------------------------------

describe("parseSupportPack — Harborline June pack (real data/demo CSV)", () => {
  it("parses every row, including the doc-less annotation rows", () => {
    expect(pack.records).toHaveLength(6);
    expect(pack.warnings).toHaveLength(0);
  });

  it("reads the centralized-services invoice as present", () => {
    expect(byDocId("INV-0612-03")).toMatchObject({
      type: "invoice",
      relatesTo: "Centralized Services charge",
      amount: 28000,
      status: "present",
    });
  });

  it("reads the required owner approval as missing (case-insensitive)", () => {
    expect(byDocId("APPROVAL-0612-03")).toMatchObject({
      type: "owner_approval",
      relatesTo: "Centralized Services charge",
      amount: 28000,
      status: "missing",
    });
  });

  it("keeps excluded-revenue annotations as not_applicable with no doc id", () => {
    const annotations = pack.records.filter((r) => r.status === "not_applicable");
    expect(annotations).toHaveLength(2);
    for (const record of annotations) {
      expect(record.docId).toBeNull();
    }
    expect(annotations.map((r) => r.relatesTo)).toEqual([
      "Banquet Cancellation Revenue",
      "Insurance Proceeds",
    ]);
  });

  it("cites each record back to its source row", () => {
    const approval = byDocId("APPROVAL-0612-03")!;
    expect(approval.citation.documentId).toBe("doc_support_pack");
    expect(approval.citation.sectionLabel).toContain("APPROVAL-0612-03");
    expect(approval.citation.quote).toContain("MISSING");
  });
});

// --- Check 5: does the evidence support the charge? ---------------------------

describe("checkSupport — Harborline findings (real pack)", () => {
  it("flags the centralized-services charge as unsupported: approval missing (F3)", () => {
    const result = checkSupport(
      { subject: "Centralized Services", amount: 28000, approvalThreshold: 10000 },
      pack.records,
    );

    expect(result.verdict).toBe("unsupported");
    expect(result.approvalRequired).toBe(true); // $28,000 > $10,000 (HMA §5.1)
    expect(result.missing).toEqual(["owner_approval"]);
    expect(result.invoice?.docId).toBe("INV-0612-03"); // invoice IS on file
    expect(result.approval?.docId).toBe("APPROVAL-0612-03");
    expect(result.approval?.status).toBe("missing");
    expect(result.explanation).toContain("APPROVAL-0612-03");
    expect(result.citations.length).toBeGreaterThan(0);
  });

  it("passes a charge whose invoice matches and needs no approval", () => {
    const result = checkSupport(
      { subject: "Space Rental", amount: 40000 },
      pack.records,
    );

    expect(result.verdict).toBe("supported");
    expect(result.approvalRequired).toBe(false);
    expect(result.missing).toEqual([]);
    expect(result.invoice?.docId).toBe("INV-0612-01");
  });

  it("reports excluded-revenue items as not requiring support", () => {
    // These belong to Check 2 (exclusion from the fee base), not Check 5.
    const result = checkSupport(
      { subject: "Banquet Cancellation Revenue", amount: 41000 },
      pack.records,
    );

    expect(result.verdict).toBe("not_required");
  });

  it("never invents support: an unknown subject needs human review", () => {
    const result = checkSupport(
      { subject: "Brand fee", amount: 5000 },
      pack.records,
    );

    expect(result.verdict).toBe("needs_review");
    expect(result.invoice).toBeUndefined();
    expect(result.citations).toEqual([]);
    expect(result.explanation.toLowerCase()).toContain("human review");
  });
});

// --- Synthetic edge cases -----------------------------------------------------

const record = (over: Partial<SupportRecord>): SupportRecord => ({
  docId: "INV-1",
  type: "invoice",
  relatesTo: "Centralized Services charge",
  amount: 28000,
  status: "present",
  note: "",
  citation: { documentId: "doc_support_pack", documentName: "Support Pack" },
  ...over,
});

describe("checkSupport — edge cases", () => {
  it("does not demand approval below the threshold", () => {
    // May's $7,500 charge: invoice on file, under the $10k gate, no approval row.
    const result = checkSupport(
      { subject: "Centralized Services", amount: 7500, approvalThreshold: 10000 },
      [record({ amount: 7500 })],
    );

    expect(result.verdict).toBe("supported");
    expect(result.approvalRequired).toBe(false);
    expect(result.missing).toEqual([]);
  });

  it("sends an amount mismatch to review instead of calling it supported", () => {
    const result = checkSupport(
      { subject: "Centralized Services", amount: 30000 },
      [record({})], // invoice on file for 28,000, charge is 30,000
    );

    expect(result.verdict).toBe("needs_review");
    expect(result.explanation).toContain("28,000");
    expect(result.explanation).toContain("30,000");
  });

  it("treats a missing invoice as unsupported even when no approval is needed", () => {
    const result = checkSupport(
      { subject: "Centralized Services", amount: 28000 },
      [record({ status: "missing" })],
    );

    expect(result.verdict).toBe("unsupported");
    expect(result.missing).toEqual(["invoice"]);
  });
});

describe("parseSupportPack — tolerance and warnings", () => {
  it("resolves reordered and aliased headers", () => {
    const csv = [
      "State,Subject,Reference,Doc Type,Value",
      "present,Centralized Services charge,INV-9,invoice,$28,000".replace(
        "$28,000",
        '"$28,000"',
      ),
    ].join("\n");

    const parsed = parseSupportPack(csv, packOpts);
    expect(parsed.records).toHaveLength(1);
    expect(parsed.records[0]).toMatchObject({
      docId: "INV-9",
      type: "invoice",
      amount: 28000,
      status: "present",
    });
  });

  it("keeps unknown statuses and types with a warning, never guessing", () => {
    const csv = [
      "doc_id,type,relates_to,amount,status,note",
      "DOC-1,receipt,Centralized Services charge,28000,pending,",
    ].join("\n");

    const parsed = parseSupportPack(csv, packOpts);
    expect(parsed.records[0]).toMatchObject({ type: "other", status: "unknown" });
    expect(parsed.warnings.length).toBeGreaterThanOrEqual(2); // one per oddity
  });

  it("throws when required columns are missing", () => {
    expect(() => parseSupportPack("doc_id,amount\nX,1", packOpts)).toThrow();
  });
});
