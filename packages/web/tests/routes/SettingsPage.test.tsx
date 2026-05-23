import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SettingsPage } from "../../src/routes/SettingsPage";

vi.mock("../../src/api/config", () => ({
  getConfig: vi.fn().mockResolvedValue({
    version: 1,
    server: { port: 7878, open_browser: true },
    ui: { default_pack: null, theme: "system" },
    pack_paths: [],
    providers: {
      anthropic: { api_key: "", default_model: null },
      openai: { api_key: "", default_model: null },
      google: { api_key: "", default_model: null },
    },
    features: {
      default_compose_provider: "anthropic",
      default_extraction_provider: "anthropic",
    },
  }),
  putConfig: vi.fn(async (patch: unknown) => patch),
  listModels: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../src/api/packs", () => ({
  listPacks: vi.fn().mockResolvedValue([]),
}));

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders loading state then sections after config loads", async () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    // Initially shows loading
    expect(screen.getByText(/Loading settings/i)).toBeInTheDocument();

    // After load, sections appear
    await waitFor(() => expect(screen.getByText("Settings")).toBeInTheDocument());

    expect(screen.getByRole("heading", { name: /API keys/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Pack paths/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Theme/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Defaults/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Server/i })).toBeInTheDocument();
  });

  it("shows all three provider rows", async () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText("Settings")).toBeInTheDocument());

    // Each provider appears at least once (in KeysSection label)
    expect(screen.getAllByText("Anthropic").length).toBeGreaterThan(0);
    expect(screen.getAllByText("OpenAI").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Google AI").length).toBeGreaterThan(0);
  });

  it("shows save and discard buttons (disabled when not dirty)", async () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText("Settings")).toBeInTheDocument());

    const saveBtn = screen.getByRole("button", { name: /Save changes/i });
    const discardBtn = screen.getByRole("button", { name: /Discard/i });

    expect(saveBtn).toBeDisabled();
    expect(discardBtn).toBeDisabled();
  });

  it("shows port and open_browser from server section", async () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText("Settings")).toBeInTheDocument());

    expect(screen.getByText("7878")).toBeInTheDocument();
    expect(screen.getByText("Yes")).toBeInTheDocument();
  });
});
