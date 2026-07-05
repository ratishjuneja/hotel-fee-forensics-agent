import { describe, expect, it } from "vitest";

import type { PdfExtractor } from "@feeforensics/agent";

import { assembleCase, CaseAssemblyError, type CaseUpload } from "./caseAssembler.js";

/** A one-file role value (every role now carries an array of files). */
const file = (filename: string, content: string) => [
  { filename, buffer: Buffer.from(content, "utf8") },
];

const raw = (filename: string, buffer: Buffer) => ({ filename, buffer });

const baseUpload = (): CaseUpload => ({
  files: {
    hma: file("hma.txt", "4.2 INCENTIVE MANAGEMENT FEE. The operator earns..."),
    statement: file("os.csv", "Line Item,Amount\nRooms,100000\n"),
  },
  draftEmail: true,
});

/** Fake PDF extractor: returns fixed text without loading pdfjs. */
const fakeExtractor: PdfExtractor = async () => ({
  text: "4.2 INCENTIVE MANAGEMENT FEE. The operator earns three percent of AGOP.",
  pageCount: 1,
});

describe("assembleCase", () => {
  it("maps roles onto the orchestrator's documents", async () => {
    const { input } = await assembleCase("case_x", {
      files: {
        hma: file("hma.txt", "clause text"),
        statement: file("os.csv", "a,b\n1,2\n"),
        statement_prior: file("prior.csv", "a,b\n1,2\n"),
        support_pack: file("support.csv", "a,b\n1,2\n"),
        supplementary: file("breakout.csv", "a,b\n1,2\n"),
      },
      draftEmail: true,
    });
    expect(input.documents.hma.text).toBe("clause text");
    expect(input.documents.statement.docId).toBe("doc_operating_statement");
    expect(input.documents.priorStatement?.docId).toBe("doc_prior_month");
    expect(input.documents.supportPack?.docId).toBe("doc_support_pack");
    expect(input.documents.miscBreakout?.docId).toBe("doc_misc_breakout");
  });

  it("carries ownerNotes, draftEmail, and metadata (with defaults)", async () => {
    const { input } = await assembleCase("case_x", {
      ...baseUpload(),
      ownerNotes: "  please check centralized services  ",
      draftEmail: false,
      hotelName: "  The Test Inn  ",
    });
    expect(input.ownerNotes).toBe("please check centralized services");
    expect(input.draftEmail).toBe(false);
    expect(input.hotelName).toBe("The Test Inn");
    expect(input.auditMonth).toBeTruthy();
  });

  it("throws CaseAssemblyError when a required role is missing", async () => {
    await expect(
      assembleCase("case_x", { files: { hma: file("hma.txt", "x") }, draftEmail: true }),
    ).rejects.toThrow(CaseAssemblyError);
  });

  it("extracts a digital-PDF HMA via the injected extractor", async () => {
    const pdf = raw("hma.pdf", Buffer.from("%PDF-1.7\n...binary...", "latin1"));
    const { input } = await assembleCase(
      "case_x",
      { files: { hma: [pdf], statement: baseUpload().files.statement! }, draftEmail: true },
      { pdfExtractor: fakeExtractor },
    );
    expect(input.documents.hma.text).toContain("INCENTIVE MANAGEMENT FEE");
  });

  it("rejects a PDF HMA when no extractor is injected", async () => {
    const pdf = raw("hma.pdf", Buffer.from("%PDF-1.7\n...binary...", "latin1"));
    await expect(
      assembleCase("case_x", {
        files: { hma: [pdf], statement: baseUpload().files.statement! },
        draftEmail: true,
      }),
    ).rejects.toThrow(CaseAssemblyError);
  });

  it("rejects a scanned PDF (extractor yields no text) with an OCR hint", async () => {
    const emptyExtractor: PdfExtractor = async () => ({ text: "   ", pageCount: 3 });
    const pdf = raw("scan.pdf", Buffer.from("%PDF-1.7\n", "latin1"));
    try {
      await assembleCase(
        "case_x",
        { files: { hma: [pdf], statement: baseUpload().files.statement! }, draftEmail: true },
        { pdfExtractor: emptyExtractor },
      );
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(CaseAssemblyError);
      const w = (err as CaseAssemblyError).warnings.flatMap((x) => x.warnings).join(" ");
      expect(w).toMatch(/scanned|OCR/i);
    }
  });

  it("drops an unreadable optional doc with a warning instead of failing", async () => {
    const { input, warnings } = await assembleCase("case_x", {
      files: {
        hma: baseUpload().files.hma!,
        statement: baseUpload().files.statement!,
        support_pack: [raw("bad.csv", Buffer.from([0, 1, 2, 3]))],
      },
      draftEmail: true,
    });
    expect(input.documents.supportPack).toBeUndefined();
    expect(warnings.find((w) => w.role === "support_pack")?.warnings.join(" ")).toMatch(/CSV/i);
  });

  it("concatenates multiple support-pack CSVs, deduping the repeated header", async () => {
    const { input, warnings } = await assembleCase("case_x", {
      files: {
        hma: file("hma.txt", "clause"),
        statement: file("os.csv", "a,b\n1,2\n"),
        support_pack: [
          raw("inv1.csv", Buffer.from("Vendor,Amount\nAcme,100\n")),
          raw("inv2.csv", Buffer.from("Vendor,Amount\nBeta,200\n")),
        ],
      },
      draftEmail: true,
    });
    const csv = input.documents.supportPack!.csv;
    expect(csv).toContain("Acme,100");
    expect(csv).toContain("Beta,200");
    // The header should appear exactly once after the merge.
    expect(csv.match(/Vendor,Amount/g)?.length).toBe(1);
    expect(input.documents.supportPack!.name).toContain("2 files");
    expect(warnings.find((w) => w.role === "support_pack")?.warnings.join(" ")).toMatch(
      /Merged 2 files/,
    );
  });

  it("uses the first comparison statement as the baseline and archives the rest", async () => {
    const { input, warnings } = await assembleCase("case_x", {
      files: {
        hma: file("hma.txt", "clause"),
        statement: file("os.csv", "a,b\n1,2\n"),
        statement_prior: [
          raw("may.csv", Buffer.from("a,b\n1,2\n")),
          raw("apr.csv", Buffer.from("a,b\n3,4\n")),
        ],
      },
      draftEmail: true,
    });
    expect(input.documents.priorStatement?.csv).toContain("1,2");
    expect(input.documents.priorStatement?.csv).not.toContain("3,4");
    const w = warnings.find((x) => x.role === "statement_prior")?.warnings.join(" ") ?? "";
    expect(w).toMatch(/baseline/i);
    expect(w).toContain("apr.csv");
  });

  it("uses the first supplementary schedule and archives the rest", async () => {
    const { input, warnings } = await assembleCase("case_x", {
      files: {
        hma: file("hma.txt", "clause"),
        statement: file("os.csv", "a,b\n1,2\n"),
        supplementary: [
          raw("misc.csv", Buffer.from("k,v\nfirst,1\n")),
          raw("other.csv", Buffer.from("k,v\nsecond,2\n")),
        ],
      },
      draftEmail: true,
    });
    expect(input.documents.miscBreakout?.csv).toContain("first,1");
    expect(input.documents.miscBreakout?.csv).not.toContain("second,2");
    const w = warnings.find((x) => x.role === "supplementary")?.warnings.join(" ") ?? "";
    expect(w).toContain("other.csv");
  });

  it("decodes extra documents for display but keeps them out of the audit input", async () => {
    const { input, extraDocuments } = await assembleCase("case_x", {
      files: {
        hma: file("hma.txt", "clause"),
        statement: file("os.csv", "a,b\n1,2\n"),
        extra_docs: [
          raw("sideletter.txt", Buffer.from("we agreed to X")),
          raw("extra.csv", Buffer.from("k,v\n1,2\n")),
        ],
      },
      draftEmail: true,
    });
    expect(extraDocuments).toHaveLength(2);
    expect(extraDocuments?.[0]?.name).toBe("sideletter.txt");
    expect(extraDocuments?.[0]?.format).toBe("text");
    expect(extraDocuments?.[0]?.content).toContain("we agreed to X");
    expect(extraDocuments?.[1]?.format).toBe("csv");
    // The calculator input must never see the extra content.
    expect(JSON.stringify(input.documents)).not.toContain("we agreed to X");
  });

  it("stores a binary extra document with a note but does not show it", async () => {
    const { extraDocuments, warnings } = await assembleCase("case_x", {
      files: {
        hma: file("hma.txt", "clause"),
        statement: file("os.csv", "a,b\n1,2\n"),
        extra_docs: [raw("scan.pdf", Buffer.from("%PDF-1.7\n", "latin1"))],
      },
      draftEmail: true,
    });
    expect(extraDocuments).toBeUndefined();
    expect(warnings.find((w) => w.role === "extra_docs")?.warnings.join(" ")).toMatch(/not shown/i);
  });
});
