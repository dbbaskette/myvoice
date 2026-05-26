import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Step1Inputs, type Step1State } from "../../../src/components/extract/Step1Inputs";

vi.mock("../../../src/api/config", () => ({
  listModels: vi
    .fn()
    .mockResolvedValue([
      { id: "m1", label: "Mock Model", context_window: 8000, supports_streaming: true },
    ]),
}));

const baseConfig = {
  version: 1,
  server: { port: 7878, open_browser: true },
  ui: { default_pack: null, theme: "system" as const },
  pack_paths: [],
  providers: {
    anthropic: { api_key: "sk-mock", default_model: null },
    openai: { api_key: "", default_model: null },
    google: { api_key: "", default_model: null },
  },
  features: { default_compose_provider: "anthropic", default_extraction_provider: "anthropic" },
};

const baseState: Step1State = {
  urls: [""],
  files: [],
  slug: "",
  name: "",
  author: "",
  provider: "anthropic",
  model: "",
};

describe("Step1Inputs", () => {
  it("disables Analyze until requirements met", async () => {
    const onAnalyze = vi.fn();
    const onChange = vi.fn();
    render(
      <Step1Inputs
        state={baseState}
        config={baseConfig}
        onChange={onChange}
        onAnalyze={onAnalyze}
      />,
    );
    expect(screen.getByText("Analyze →")).toBeDisabled();
  });

  it("derives slug from name", () => {
    const onChange = vi.fn();
    render(
      <Step1Inputs
        state={baseState}
        config={baseConfig}
        onChange={onChange}
        onAnalyze={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Hello World" } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Hello World", slug: "hello-world" }),
    );
  });

  it("shows cost estimate when input is non-empty and model selected", async () => {
    const stateWithInput = {
      ...baseState,
      urls: ["https://e.com/a"],
      name: "X",
      author: "Y",
      slug: "x",
      model: "m1",
    };
    render(
      <Step1Inputs
        state={stateWithInput}
        config={baseConfig}
        onChange={() => {}}
        onAnalyze={() => {}}
      />,
    );
    await waitFor(() => expect(screen.getByText(/Estimated:/)).toBeInTheDocument());
  });
});
