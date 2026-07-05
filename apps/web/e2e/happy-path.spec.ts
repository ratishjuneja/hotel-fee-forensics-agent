import { expect, test } from "@playwright/test";
import { GOLDEN, uploadAndSubmit } from "./helpers";

/**
 * Deliverable C.1 — the leakage (golden) case, end to end, exercising every
 * interactive report check from the UAT script:
 *   upload → parse → trace → report → citation drawer, confidence breakdown,
 *   copy email, download packet.
 *
 * Golden invariant: uploading data/demo/ reproduces $36,580 / 3 findings.
 */
test("happy path: golden leakage case reproduces $36,580 and the report is interactive", async ({
  page,
}, testInfo) => {
  await uploadAndSubmit(page, GOLDEN);

  // Parsing screen auto-advances to the run screen.
  await page.waitForURL(/\/cases\/case_[0-9a-f-]+\/run$/, { timeout: 60_000 });

  // The agent trace runs to completion and the summary card shows the headline.
  await expect(page.getByText("$36,580").first()).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText(/complete/i).first()).toBeVisible();

  // Into the report.
  await page.getByRole("link", { name: /view findings/i }).click();
  await page.waitForURL(/\/report$/);
  await expect(page.getByText("Total suspected overcharge")).toBeVisible();
  await expect(page.getByText("$36,580").first()).toBeVisible();
  await expect(page.getByText(/3 findings/i).first()).toBeVisible();
  // The three finding amounts.
  for (const amt of ["$1,980", "$6,600", "$28,000"]) {
    await expect(page.getByText(amt, { exact: false }).first()).toBeVisible();
  }

  // (a) Confidence meter expands to the real per-component breakdown. Scope to
  // the impact strip so we test the meter, not the memo's confidence table.
  const strip = page.locator("section").filter({ hasText: "Total suspected overcharge" });
  await expect(strip.getByText("96%")).toBeVisible();
  const confBtn = strip.getByRole("button", { name: /96%/ });
  await confBtn.click();
  await expect(confBtn).toHaveAttribute("aria-expanded", "true");
  await expect(strip.getByText("Contract clarity")).toBeVisible();
  await expect(strip.getByText("Calculation match")).toBeVisible();

  // (b) A citation pill opens the evidence drawer with the cited source shown.
  // Clickable pills carry title="View source document".
  const citation = page.locator('button[title="View source document"]').first();
  await expect(citation).toBeVisible();
  await citation.click();
  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText(/source document/i).first()).toBeVisible();
  // The cited clause/line is highlighted (brand ring on the matched section/row).
  await expect(drawer.locator(".ring-brand-200").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();

  // (c) Download packet actually downloads a markdown file.
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /download packet/i }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/dispute-packet.*\.md$/);

  // (d) Copy email. navigator.clipboard requires a SECURE context; the default
  // target is HTTP, so record whether the copy actually succeeded rather than
  // asserting a behaviour the deployment can't provide.
  const clipboardAvailable = await page.evaluate(
    () => Boolean(window.navigator.clipboard) && window.isSecureContext,
  );
  await page.getByRole("button", { name: /copy email/i }).click();
  if (clipboardAvailable) {
    await expect(page.getByRole("button", { name: /copied/i })).toBeVisible();
  } else {
    testInfo.annotations.push({
      type: "known-limitation",
      description:
        "Copy email is a no-op on the HTTP deployment: navigator.clipboard is " +
        "unavailable in an insecure context, so the button never confirms 'Copied'.",
    });
    await expect(page.getByRole("button", { name: /copy email/i })).toBeVisible();
  }
});
