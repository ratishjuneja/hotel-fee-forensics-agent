import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { RunAuditInput } from "@feeforensics/agent";
import { DEMO_CASE_ID } from "./demoCase.js";

/**
 * Loads the synthetic Harborline demo documents (data/demo/) into the
 * orchestrator's `RunAuditInput`.
 *
 * Document ids and names MUST stay in sync with the DocumentRefs in
 * `demoCase.ts` and the frontend evidence viewer
 * (apps/web/src/lib/documents.ts) — citations key on `documentId`, so an id
 * invented here would render as an unresolvable citation in the UI.
 */

const demoFile = (name: string): string =>
  readFileSync(
    fileURLToPath(new URL(`../../../../data/demo/${name}`, import.meta.url)),
    "utf8",
  );

let cached: RunAuditInput | null = null;

export function loadDemoAuditInput(): RunAuditInput {
  cached ??= {
    caseId: DEMO_CASE_ID,
    hotelName: "The Harborline Hotel",
    auditMonth: "June 2026",
    period: "2026-06",
    priorPeriod: "2026-05",
    operatorName: "Meridian Hotel Management",
    ownerName: "Cascadia Hotel Owner LP",
    documents: {
      hma: {
        docId: "doc_hma",
        name: "Hotel Management Agreement",
        text: demoFile("01_HMA_excerpt.txt"),
      },
      statement: {
        docId: "doc_operating_statement",
        name: "Monthly Operating Statement (USALI)",
        csv: demoFile("02_operating_statement_june.csv"),
      },
      miscBreakout: {
        docId: "doc_misc_breakout",
        name: "Miscellaneous Income Breakout",
        csv: demoFile("02b_misc_income_breakout_june.csv"),
      },
      priorStatement: {
        docId: "doc_prior_month",
        name: "Prior-Month Operating Statement",
        csv: demoFile("03_operating_statement_may.csv"),
      },
      supportPack: {
        docId: "doc_support_pack",
        name: "Support / Invoice Pack",
        csv: demoFile("04_support_invoice_pack.csv"),
      },
    },
  };
  return cached;
}
