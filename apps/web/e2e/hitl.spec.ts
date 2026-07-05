import { expect, test } from "@playwright/test";
import { HITL, uploadAndSubmit } from "./helpers";

/**
 * Deliverable C.2 — the human-in-the-loop answer form. The HITL case pauses on a
 * $25,000 centralized-services charge it cannot verify (no support pack); the
 * tester answers via the form and the run replays to completion.
 */
test("HITL: run pauses, owner answers, run replays and completes", async ({ page }) => {
  await uploadAndSubmit(page, HITL);
  await page.waitForURL(/\/cases\/case_[0-9a-f-]+\/run$/, { timeout: 60_000 });

  // The run stops and asks the owner.
  await expect(page.getByText(/needs your input/i).first()).toBeVisible({ timeout: 90_000 });
  await expect(
    page.getByText(/did the owner authorize the centralized services charge of \$25,000/i),
  ).toBeVisible();

  // Choose "No — there is no approval on file", then resume.
  await page.getByText(/no — there is no approval on file/i).click();
  await page.getByRole("button", { name: /submit answer & resume audit/i }).click();

  // Replay merges the answer (HUMAN trace step) and finishes.
  await expect(page.getByText(/apply owner instructions/i)).toBeVisible({ timeout: 90_000 });
  await expect(page.getByRole("link", { name: /view findings/i })).toBeVisible();

  // The resolved finding is on the report.
  await page.getByRole("link", { name: /view findings/i }).click();
  await page.waitForURL(/\/report$/);
  await expect(page.getByText("$25,000").first()).toBeVisible();
  await expect(page.getByText(/request explanation/i).first()).toBeVisible();
});
