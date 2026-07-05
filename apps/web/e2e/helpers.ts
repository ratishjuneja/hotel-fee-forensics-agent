import { fileURLToPath } from "node:url";
import path from "node:path";
import { expect, type Page } from "@playwright/test";

/** Repo root, resolved from this file (apps/web/e2e/helpers.ts → ../../..). */
export const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const p = (...segs: string[]) => path.join(REPO_ROOT, ...segs);

/** The golden demo (leakage) upload set — read-only synthetics in data/demo/. */
export const GOLDEN = {
  hma: p("data/demo/01_HMA_excerpt.txt"),
  statement: p("data/demo/02_operating_statement_june.csv"),
  statementPrior: p("data/demo/03_operating_statement_may.csv"),
  supportPack: p("data/demo/04_support_invoice_pack.csv"),
  supplementary: p("data/demo/02b_misc_income_breakout_june.csv"),
};

const KIT = "qa/uat/cases";
export const CLEAN = {
  hma: p(KIT, "clean-no-leakage/Cedarcliff_HMA_SYNTHETIC.txt"),
  statement: p(KIT, "clean-no-leakage/Cedarcliff_June_statement_CLEAN_SYNTHETIC.csv"),
};
export const HITL = {
  hma: p(KIT, "hitl-pause/Cedarcliff_HMA_SYNTHETIC.txt"),
  statement: p(KIT, "hitl-pause/Cedarcliff_June_statement_HITL_SYNTHETIC.csv"),
};
export const MALFORMED = {
  corrupt: p(KIT, "malformed/corrupt_export_SYNTHETIC.csv"),
};

/** Upload-form slot order (mirrors apps/web UploadForm SLOTS). */
export interface UploadSet {
  hma: string;
  statement: string;
  statementPrior?: string;
  supportPack?: string;
  supplementary?: string;
}

/**
 * Fill the upload slots on /cases/new. The form renders one hidden
 * <input type=file> per slot in a fixed order; set files by index.
 */
export async function fillUpload(page: Page, files: UploadSet): Promise<void> {
  const inputs = page.locator('input[type="file"]');
  await expect(inputs).toHaveCount(5);
  await inputs.nth(0).setInputFiles(files.hma);
  await inputs.nth(1).setInputFiles(files.statement);
  if (files.statementPrior) await inputs.nth(2).setInputFiles(files.statementPrior);
  if (files.supportPack) await inputs.nth(3).setInputFiles(files.supportPack);
  if (files.supplementary) await inputs.nth(4).setInputFiles(files.supplementary);
}

/** Upload a set and land on the case's own pages. Returns the caseId. */
export async function uploadAndSubmit(page: Page, files: UploadSet): Promise<string> {
  await page.goto("/cases/new");
  await fillUpload(page, files);
  await page.getByRole("button", { name: /upload .* run audit/i }).click();
  // router.push(`/cases/${caseId}`) — capture the id from the parsing URL.
  await page.waitForURL(/\/cases\/case_[0-9a-f-]+(\/.*)?$/, { timeout: 45_000 });
  const m = page.url().match(/\/cases\/(case_[0-9a-f-]+)/);
  if (!m) throw new Error(`no caseId in URL: ${page.url()}`);
  return m[1];
}
