import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: { baseURL: "http://127.0.0.1:7879", trace: "on-first-retry" },
  webServer: [
    {
      command:
        "MYVOICE_TEST_PROVIDER=mock MYVOICE_MOCK_OUTPUT='Plan. Build. Ship.' MYVOICE_CONFIG_PATH=/tmp/myvoice-e2e-config.yaml MYVOICE_PACKS_ROOT=/Users/dbbaskette/Projects/myvoice/packs /Users/dbbaskette/Projects/myvoice/.venv/bin/myvoice serve --no-browser --dev --port 7878",
      url: "http://127.0.0.1:7878/api/packs",
      reuseExistingServer: !process.env.CI,
      timeout: 20_000,
    },
    {
      command: "cd packages/web && pnpm dev --port 7879 --host 127.0.0.1",
      port: 7879,
      reuseExistingServer: !process.env.CI,
      timeout: 20_000,
    },
  ],
});
