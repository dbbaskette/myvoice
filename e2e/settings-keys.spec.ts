import { test, expect } from "@playwright/test";

/**
 * End-to-end: API key masking roundtrip in the Settings page.
 *
 * Flow:
 *   1. Navigate to /settings.
 *   2. Enter a real-looking key for Anthropic.
 *   3. Save.
 *   4. Reload.
 *   5. Verify the displayed value contains "***" (the redacted sentinel).
 */
test("settings: masked key roundtrip", async ({ page }) => {
  await page.goto("/settings");
  await page.waitForSelector("text=API keys");

  // Fill the Anthropic key input
  const anthropicInput = page.locator("#api-key-anthropic");
  await anthropicInput.fill("sk-ant-realsecret");

  // Save — the button is enabled when the form is dirty
  const saveBtn = page.locator("button", { hasText: "Save changes" });
  await expect(saveBtn).toBeEnabled();
  await saveBtn.click();

  // Wait for save to complete — button becomes disabled again after successful save
  await expect(saveBtn).toBeDisabled({ timeout: 5000 });

  // Reload to verify persistence
  await page.reload();
  await page.waitForSelector("text=API keys");

  // After reload the key should appear as the redacted sentinel
  const maskedValue = await page.locator("#api-key-anthropic").inputValue();
  expect(maskedValue).toContain("***");
});
