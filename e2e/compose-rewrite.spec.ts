import { test, expect } from "@playwright/test";

/**
 * End-to-end: compose & rewrite flow with MockProvider.
 *
 * The backend webServer starts with MYVOICE_TEST_PROVIDER=mock and
 * MYVOICE_MOCK_OUTPUT='Plan. Build. Ship.' so every rewrite returns that text.
 *
 * Flow:
 *   1. Navigate to /settings and save a mock Anthropic key so the provider
 *      is available in the Compose page dropdowns.
 *   2. Navigate to /compose, fill a draft, click Rewrite.
 *   3. Wait for the streamed output to contain "Plan".
 *   4. Click "Save as sample", confirm dialog, verify toast.
 */
test("compose: paste draft, rewrite, save as sample", async ({ page }) => {
  // ── Step 1: set a mock Anthropic key in Settings ─────────────────────────
  await page.goto("/settings");
  // Wait for the settings page to fully load
  await expect(page.locator("h2", { hasText: "API keys" })).toBeVisible({
    timeout: 15_000,
  });

  // The input is type=password with id=api-key-anthropic
  const anthropicInput = page.locator("#api-key-anthropic");
  await anthropicInput.fill("sk-mock");

  // Save changes button becomes enabled once the form is dirty
  const saveBtn = page.locator("button", { hasText: "Save changes" });
  await expect(saveBtn).toBeEnabled({ timeout: 3000 });
  await saveBtn.click();

  // Wait for save to complete (button re-disables after save)
  await expect(saveBtn).toBeDisabled({ timeout: 5000 });

  // ── Step 2: navigate to Compose page ─────────────────────────────────────
  await page.goto("/compose");
  await page.waitForURL(/\/compose/);

  // Wait for packs to load — the ComposePage shows "Loading…" until packs
  // arrive and controls initialise. We wait for the ControlsBar to appear
  // by looking for the "Pack" label which is unique to the controls bar.
  await expect(page.locator("text=Pack").first()).toBeVisible({ timeout: 20_000 });

  // Wait for the Rewrite button to appear in the controls bar
  await expect(page.locator("button", { hasText: "Rewrite" })).toBeVisible({
    timeout: 15_000,
  });

  // Fill the draft textarea (InputPane renders a plain textarea)
  const textarea = page.locator("textarea").first();
  await textarea.fill("Rewrite this in Dan's voice.");

  // Wait for the model dropdown to populate with actual models from the mock
  // provider (not "No models" or "Loading…"). The mock provider returns
  // "Mock Model" when MYVOICE_TEST_PROVIDER=mock.
  await page.waitForFunction(
    () => {
      const selects = document.querySelectorAll("select");
      for (const sel of selects) {
        const selectedText = sel.options[sel.selectedIndex]?.text ?? "";
        if (
          selectedText.includes("No models") ||
          selectedText.includes("Loading")
        ) {
          return false;
        }
      }
      // At least one select must exist (the pack selector)
      return selects.length > 0;
    },
    { timeout: 15_000 },
  );

  // Click Rewrite
  await page.locator("button", { hasText: "Rewrite" }).click();

  // ── Step 3: wait for streamed output ─────────────────────────────────────
  await expect(page.locator(".output-pane")).toContainText("Plan", {
    timeout: 20_000,
  });

  // ── Step 4: save as sample ───────────────────────────────────────────────
  // Wait for streaming to finish (Save as sample button becomes visible after complete)
  await expect(page.locator("button", { hasText: "Save as sample" })).toBeVisible({
    timeout: 10_000,
  });
  await page.locator("button", { hasText: "Save as sample" }).click();

  // The SaveSampleDialog appears — click the "Save" submit button
  await expect(page.locator('dialog[aria-label="Save as sample"]')).toBeVisible();
  await page.locator('button[type="submit"]', { hasText: "Save" }).click();

  // ── Verify toast ──────────────────────────────────────────────────────────
  // Toast appears with text like "Saved as sample 01."
  await expect(
    page.locator("div.fixed", { hasText: "Saved as sample" }),
  ).toBeVisible({ timeout: 8000 });
});
