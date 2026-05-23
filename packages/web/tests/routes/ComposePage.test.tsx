import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ComposePage } from "../../src/routes/ComposePage";

vi.mock("../../src/api/packs", () => ({
  listPacks: vi
    .fn()
    .mockResolvedValue([{ slug: "dan", name: "Dan", version: "3.0", valid: true, error_count: 0 }]),
}));

vi.mock("../../src/api/compose", () => ({
  lintText: vi.fn().mockResolvedValue({ violations: [], hits: [] }),
}));

vi.mock("../../src/api/rewrite", () => ({
  startRewrite: vi.fn().mockResolvedValue({ job_id: "test-job-123" }),
}));

vi.mock("../../src/api/config", () => ({
  getConfig: vi.fn().mockResolvedValue({
    version: 1,
    server: { port: 7878, open_browser: true },
    ui: { default_pack: null, theme: "system" },
    pack_paths: [],
    providers: {
      anthropic: { api_key: "sk-ant-test", default_model: null },
      openai: { api_key: "", default_model: null },
      google: { api_key: "", default_model: null },
    },
    features: {
      default_compose_provider: "anthropic",
      default_extraction_provider: "anthropic",
    },
  }),
  listModels: vi.fn().mockResolvedValue([
    {
      id: "claude-sonnet-4-6",
      label: "Claude Sonnet 4.6",
      context_window: 200000,
      supports_streaming: true,
    },
  ]),
}));

// jsdom does not implement EventSource — stub it
globalThis.EventSource = vi.fn().mockImplementation(() => ({
  onmessage: null,
  onerror: null,
  close: vi.fn(),
})) as unknown as typeof EventSource;

describe("ComposePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders loading state initially", () => {
    render(
      <MemoryRouter>
        <ComposePage />
      </MemoryRouter>,
    );
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("renders selectors and Rewrite button after packs load", async () => {
    render(
      <MemoryRouter>
        <ComposePage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText(/Rewrite/i)).toBeInTheDocument());
    expect(screen.getByText("Dan")).toBeInTheDocument();
  });

  it("renders pack selector after packs load", async () => {
    render(
      <MemoryRouter>
        <ComposePage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText("Dan")).toBeInTheDocument());
  });

  it("renders Input and Output pane labels", async () => {
    render(
      <MemoryRouter>
        <ComposePage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText("Input")).toBeInTheDocument());
    expect(screen.getByText("Output")).toBeInTheDocument();
  });
});
