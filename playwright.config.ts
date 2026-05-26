import { defineConfig } from "@playwright/test";

// Use an isolated copy of packs/ so e2e never mutates checked-in fixtures.
// The rsync copy runs every test run, so each run starts from a clean state.
const REPO = "/Users/dbbaskette/Projects/myvoice";
const E2E_PACKS = "/tmp/myvoice-e2e-packs";
const E2E_CONFIG = "/tmp/myvoice-e2e-config.yaml";

const MOCK_JSON = JSON.stringify({
  persona_identity: "The E2E Tester",
  persona_one_line: "Verifies extract end to end.",
  banished_words: [{ word: "delve", frequency: 2 }],
  banished_phrases: [],
  permitted_exceptions: [],
  style_guide_markdown: "E2E style guide prose.",
  samples: [
    { excerpt: "An e2e sample excerpt for verification.", source_location: "https://e.com/", why: "matches voice", rank: 1 },
  ],
  pop_culture_allowed: ["Marvel"],
  pop_culture_banned: [],
});

const backendEnv = [
  "MYVOICE_TEST_PROVIDER=mock",
  "MYVOICE_MOCK_OUTPUT='Plan. Build. Ship.'",
  `MYVOICE_MOCK_OUTPUT_JSON='${MOCK_JSON.replace(/'/g, "\\'")}'`,
  `MYVOICE_CONFIG_PATH=${E2E_CONFIG}`,
  `MYVOICE_PACKS_ROOT=${E2E_PACKS}`,
].join(" ");

const setupCopy = `rm -rf ${E2E_PACKS} && cp -R ${REPO}/packs ${E2E_PACKS} && rm -f ${E2E_CONFIG}`;
const serveBin = `${REPO}/.venv/bin/myvoice`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: { baseURL: "http://127.0.0.1:7879", trace: "on-first-retry" },
  webServer: [
    {
      command: `${setupCopy} && ${backendEnv} ${serveBin} serve --no-browser --dev --port 7878`,
      url: "http://127.0.0.1:7878/api/packs",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: "cd packages/web && pnpm dev --port 7879 --host 127.0.0.1",
      port: 7879,
      reuseExistingServer: !process.env.CI,
      timeout: 20_000,
    },
  ],
});
