import { expect, test } from "@playwright/test";
import { CLEAN, MALFORMED, fillUpload } from "./helpers";

/**
 * Deliverable A.3 — malformed input is honestly rejected; nothing is analysed.
 * A corrupt/binary "CSV" fails at parse time and the parsing screen says so.
 */
test("malformed: corrupt statement is rejected at parse time (nothing analysed)", async ({
  page,
}) => {
  await page.goto("/cases/new");
  // Valid HMA + a corrupt statement export.
  await fillUpload(page, { hma: CLEAN.hma, statement: MALFORMED.corrupt });
  await page.getByRole("button", { name: /upload .* run audit/i }).click();

  // Parsing screen reports the failure honestly and does NOT advance to a run.
  await expect(page.getByText(/failed/i).first()).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText(/not a readable csv/i)).toBeVisible();
  await expect(page.getByText(/nothing was analyzed/i)).toBeVisible();
  await expect(page).not.toHaveURL(/\/run$/);
});

/**
 * The Upload button stays disabled until both required documents are attached —
 * a tester cannot submit an incomplete case (the missing-doc → 400 guard).
 */
test("malformed: upload button disabled until both required docs are attached", async ({
  page,
}) => {
  await page.goto("/cases/new");
  const submit = page.getByRole("button", { name: /upload .* run audit/i });
  await expect(submit).toBeDisabled();

  // Attach only the HMA — still disabled.
  await page.locator('input[type="file"]').nth(0).setInputFiles(CLEAN.hma);
  await expect(submit).toBeDisabled();

  // Attach the statement — now enabled.
  await page.locator('input[type="file"]').nth(1).setInputFiles(CLEAN.statement);
  await expect(submit).toBeEnabled();
});
