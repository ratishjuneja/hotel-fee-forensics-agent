import { describe, expect, it } from "vitest";

import type { PdfExtractor } from "@feeforensics/agent";

import { assembleCase, CaseAssemblyError, type CaseUpload } from "./caseAssembler.js";

const file = (filename: string, content: string) => ({
  filename,
  buffer: Buffer.from(content, "utf8"),
});

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
    const pdf = { filename: "hma.pdf", buffer: Buffer.from("%PDF-1.7\n...binary...", "latin1") };
    const { input } = await assembleCase(
      "case_x",
      { files: { hma: pdf, statement: baseUpload().files.statement! }, draftEmail: true },
      { pdfExtractor: fakeExtractor },
    );
    expect(input.documents.hma.text).toContain("INCENTIVE MANAGEMENT FEE");
  });

  it("rejects a PDF HMA when no extractor is injected", async () => {
    const pdf = { filename: "hma.pdf", buffer: Buffer.from("%PDF-1.7\n...binary...", "latin1") };
    await expect(
      assembleCase("case_x", {
        files: { hma: pdf, statement: baseUpload().files.statement! },
        draftEmail: true,
      }),
    ).rejects.toThrow(CaseAssemblyError);
  });

  it("rejects a scanned PDF (extractor yields no text) with an OCR hint", async () => {
    const emptyExtractor: PdfExtractor = async () => ({ text: "   ", pageCount: 3 });
    const pdf = { filename: "scan.pdf", buffer: Buffer.from("%PDF-1.7\n", "latin1") };
    try {
      await assembleCase(
        "case_x",
        { files: { hma: pdf, statement: baseUpload().files.statement! }, draftEmail: true },
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
        support_pack: { filename: "bad.csv", buffer: Buffer.from([0, 1, 2, 3]) },
      },
      draftEmail: true,
    });
    expect(input.documents.supportPack).toBeUndefined();
    expect(warnings.find((w) => w.role === "support_pack")?.warnings.join(" ")).toMatch(/CSV/i);
  });
});
