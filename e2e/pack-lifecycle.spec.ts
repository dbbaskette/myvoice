import { test, expect } from "@playwright/test";

/**
 * End-to-end pack lifecycle: create → edit manifest → delete.
 *
 * Uses the same MockProvider-backed backend as the other specs; this
 * spec touches only pack-management endpoints, no LLM calls.
 */
test("pack lifecycle: create, edit manifest, delete", async ({ page }) => {
  await page.goto("/");

  // Open the New pack dialog from the sidebar
  await page.click("text=+ New pack");
  await expect(page.getByRole("dialog", { name: /New pack/i })).toBeVisible({
    timeout: 5000,
  });

  // Fill the form
  const stamp = Date.now().toString();
  const slug = `e2e-${stamp}`;
  await page.getByLabel("Slug").fill(slug);
  await page.getByLabel("Name").fill("E2E Voice");
  await page.getByLabel("Author").fill("E2E");
  await page.getByLabel("Persona identity").fill("The Tester");
  await page
    .getByLabel("Persona one-line")
    .fill("Verifies the flow end to end.");
  await page.getByRole("button", { name: /Create pack/i }).click();

  // We should land on the new pack's detail page
  await page.waitForURL(new RegExp(`/packs/${slug}`), { timeout: 10_000 });

  // Navigate to Manifest tab
  await page.click("text=⚙ Manifest");
  await expect(page.getByText("Pack", { exact: true })).toBeVisible({
    timeout: 10_000,
  });

  // Edit Author and save
  const author = page.getByLabel("Author");
  await expect(author).toHaveValue("E2E");
  await author.fill("E2E Updated");
  const save = page.getByRole("button", { name: /Save changes/i });
  await expect(save).toBeEnabled();
  await save.click();
  await expect(save).toBeDisabled({ timeout: 5000 });

  // Open Danger zone → delete dialog
  // Click the Danger zone button (scoped to the section to avoid ambiguity with the dialog button)
  await page.locator("section", { hasText: "Danger zone" }).getByRole("button", { name: /Delete pack/i }).click();
  const deleteDialog = page.getByRole("dialog", { name: /Delete pack/i });
  await expect(deleteDialog).toBeVisible();
  await page.getByLabel(/Type/).fill(slug);
  await deleteDialog.getByRole("button", { name: /Delete pack/i }).click();

  // Lands back on /packs
  await page.waitForURL(/\/packs$/, { timeout: 10_000 });

  // Pack should be gone from the sidebar
  await expect(page.locator(`text=${slug}`)).toHaveCount(0, {
    timeout: 10_000,
  });
});
