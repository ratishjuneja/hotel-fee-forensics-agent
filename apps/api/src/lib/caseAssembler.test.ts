import { describe, expect, it } from "vitest";

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

describe("assembleCase", () => {
  it("maps roles onto the orchestrator's documents", () => {
    const { input } = assembleCase("case_x", {
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
    // Supplementary becomes the misc-income breakout.
    expect(input.documents.miscBreakout?.docId).toBe("doc_misc_breakout");
  });

  it("carries ownerNotes, draftEmail, and metadata (with defaults)", () => {
    const { input } = assembleCase("case_x", {
      ...baseUpload(),
      ownerNotes: "  please check centralized services  ",
      draftEmail: false,
      hotelName: "  The Test Inn  ",
    });
    expect(input.ownerNotes).toBe("please check centralized services");
    expect(input.draftEmail).toBe(false);
    expect(input.hotelName).toBe("The Test Inn");
    expect(input.auditMonth).toBeTruthy(); // defaulted
  });

  it("throws CaseAssemblyError when a required role is missing", () => {
    expect(() =>
      assembleCase("case_x", { files: { hma: file("hma.txt", "x") }, draftEmail: true }),
    ).toThrow(CaseAssemblyError);
  });

  it("rejects a PDF HMA for now (PR-14c), with a clear warning", () => {
    const pdf = { filename: "hma.pdf", buffer: Buffer.from("%PDF-1.7\n...binary...", "latin1") };
    try {
      assembleCase("case_x", { files: { hma: pdf, statement: baseUpload().files.statement! }, draftEmail: true });
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(CaseAssemblyError);
      const warnings = (err as CaseAssemblyError).warnings.flatMap((w) => w.warnings).join(" ");
      expect(warnings).toMatch(/PDF/i);
    }
  });

  it("drops an unreadable optional doc with a warning instead of failing", () => {
    const { input, warnings } = assembleCase("case_x", {
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
