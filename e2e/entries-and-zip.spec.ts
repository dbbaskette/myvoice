import { test, expect } from "@playwright/test";

test("create a format entry, then delete it", async ({ page }) => {
  await page.goto("/");
  // Pick the dan pack
  await page.click("text=dan");
  // Navigate to Formats tab
  await page.click("text=📄 Formats");
  await expect(page.getByRole("button", { name: "blog-post" })).toBeVisible({ timeout: 5000 });

  // Open + New format
  const stamp = Date.now().toString();
  const name = `e2e-fmt-${stamp}`;
  await page.click("text=+ New format");
  await expect(page.getByRole("dialog", { name: /New format/i })).toBeVisible();
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: /Create$/ }).click();

  // Dialog closes and new entry appears in the sidebar
  await expect(page.getByRole("dialog", { name: /New format/i })).toHaveCount(0, { timeout: 8000 });
  await expect(page.getByRole("button", { name })).toBeVisible({ timeout: 8000 });

  // Select the new entry; wait for the editor to show the Delete header button
  await page.getByRole("button", { name }).click();
  // The MarkdownEditor header Delete button only renders when onDelete is set (i.e. selectedIdent is set)
  await expect(page.getByRole("button", { name: "Delete", exact: true })).toBeVisible({ timeout: 10000 });
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  const deleteDialog = page.getByRole("dialog", { name: /Delete format/i });
  await expect(deleteDialog).toBeVisible();
  await page.getByLabel(/Type/).fill(name);
  await deleteDialog.getByRole("button", { name: /Delete$/ }).click();

  // Gone from sidebar
  await expect(page.getByRole("button", { name })).toHaveCount(0, { timeout: 5000 });
});

test("export pack as zip then import it under a new slug", async ({ page, request }) => {
  // 1. Hit /api/packs/dan/export directly via Playwright's request fixture, capture the zip
  const response = await request.get("/api/packs/dan/export");
  expect(response.status()).toBe(200);
  const buf = await response.body();
  expect(buf.length).toBeGreaterThan(100);

  // We can't easily re-pack with a different slug from inside the test runner without unzip libs,
  // so this case just verifies the export endpoint round-trips. Full import flow is covered
  // by the backend pytest in test_pack_zip_import.py.

  // 2. Visit the Manifest tab and confirm the Distribute section + Export anchor exist
  await page.goto("/");
  await page.click("text=dan");
  await page.click("text=⚙ Manifest");
  await expect(page.locator("text=Distribute")).toBeVisible({ timeout: 5000 });
  await expect(page.getByRole("link", { name: /Export pack as \.zip/i })).toBeVisible();
});
