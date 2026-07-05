import { expect, test } from "@playwright/test";
import { CLEAN, uploadAndSubmit } from "./helpers";

/**
 * Deliverable A.2 — the clean case: every fee is charged correctly, so the audit
 * must return $0 leakage and an HONEST no-leakage state (it must not invent
 * findings). Also documents the empty-Findings-section UX gap (see FINDINGS.md).
 */
test("clean case: $0 leakage, 0 findings, honest no-leakage state", async ({ page }) => {
  await uploadAndSubmit(page, CLEAN);
  await page.waitForURL(/\/cases\/case_[0-9a-f-]+\/run$/, { timeout: 60_000 });

  // Completes with a $0 headline.
  await expect(page.getByText(/complete/i).first()).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText(/0 findings/i).first()).toBeVisible();

  await page.getByRole("link", { name: /view findings/i }).click();
  await page.waitForURL(/\/report$/);

  await expect(page.getByText("Total suspected overcharge")).toBeVisible();
  await expect(page.getByText("$0").first()).toBeVisible();
  await expect(page.getByText(/0 findings/i).first()).toBeVisible();
  // The memo is honest about a clean result (matches the memo header + summary).
  await expect(page.getByText(/no fee issues identified/i).first()).toBeVisible();
  // Variance ties out to zero.
  await expect(page.getByText(/variance \(overcharge\)/i)).toBeVisible();
});
