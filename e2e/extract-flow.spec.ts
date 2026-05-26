import { test, expect } from "@playwright/test";

const FIXTURE_TEXT = "This is some fixture markdown content for the extract end-to-end test. ".repeat(20);

test("extract flow: upload file → analyze → review → save pack", async ({ page }) => {
  // Set Anthropic key in Settings (same pattern as compose-rewrite.spec.ts)
  await page.goto("/settings");
  await expect(page.locator("h2", { hasText: "API keys" })).toBeVisible({ timeout: 15_000 });

  const anthropicInput = page.locator("#api-key-anthropic");
  await anthropicInput.fill("sk-mock");

  const saveBtn = page.locator("button", { hasText: "Save changes" });
  await expect(saveBtn).toBeEnabled({ timeout: 3000 });
  await saveBtn.click();
  await expect(saveBtn).toBeDisabled({ timeout: 5000 });

  // Go to Extract
  await page.click("text=Extract from URLs");
  await expect(page.getByRole("heading", { name: /Extract from URLs/i })).toBeVisible();

  // Upload a fixture via the hidden file input. Playwright supports setInputFiles on hidden inputs.
  const stamp = Date.now().toString();
  const slug = `e2e-x-${stamp}`;
  await page.setInputFiles('input[aria-label="Choose files"]', {
    name: "fixture.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(FIXTURE_TEXT, "utf-8"),
  });

  // Fill pack details (set name first, then slug/author)
  await page.getByLabel("Name").fill("E2E Extracted");
  await page.getByLabel("Slug").fill(slug);
  await page.getByLabel("Author").fill("E2E");

  // Wait for the model dropdown to populate
  await page.waitForFunction(
    () => {
      const sel = document.getElementById("ex-model") as HTMLSelectElement | null;
      return sel && sel.options.length > 0 && sel.options[0].value !== "";
    },
    { timeout: 15_000 },
  );

  // Click Analyze
  await page.getByRole("button", { name: /Analyze/i }).click();

  // Wait for Step 3 (Save Pack appears)
  await expect(page.getByRole("button", { name: /Save Pack/i })).toBeVisible({ timeout: 20_000 });

  // The proposed sample should be visible — toggle nothing, save as-is.
  await page.getByRole("button", { name: /Save Pack/i }).click();

  // Lands on /packs/<slug>/manifest
  await page.waitForURL(new RegExp(`/packs/${slug}`), { timeout: 10_000 });

  // Pack appears in sidebar
  await expect(page.locator(`text=${slug}`)).toBeVisible({ timeout: 5_000 });
});
