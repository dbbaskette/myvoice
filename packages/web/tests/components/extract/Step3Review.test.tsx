import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PackProposal } from "../../../src/api/extract";
import { Step3Review } from "../../../src/components/extract/Step3Review";

const mockSave = vi.hoisted(() => vi.fn());
vi.mock("../../../src/api/extract", async () => {
  const actual = await vi.importActual<typeof import("../../../src/api/extract")>(
    "../../../src/api/extract",
  );
  return { ...actual, saveFromAnalysis: mockSave };
});

const mockNavigate = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

beforeEach(() => {
  mockSave.mockReset();
  mockNavigate.mockReset();
});
afterEach(() => {});

const sampleProposal: PackProposal = {
  analysis: {
    persona_identity: "The Builder",
    persona_one_line: "Ships often.",
    banished_words: [{ word: "delve", frequency: 3 }],
    banished_phrases: [],
    permitted_exceptions: [],
    style_guide_markdown: "prose",
    samples: [
      { excerpt: "first sample", source_location: "https://e.com/a", why: "good", rank: 1 },
      { excerpt: "second sample", source_location: "https://e.com/b", why: "ok", rank: 2 },
    ],
    pop_culture_allowed: ["Marvel"],
    pop_culture_banned: [],
  },
  sources: [
    {
      kind: "url",
      location: "https://e.com/a",
      bytes: 1000,
      word_count: 200,
      succeeded: true,
      error: null,
    },
  ],
  model: "mock-1",
  provider: "anthropic",
  cost_usd: 0.001,
  input_tokens: 100,
  output_tokens: 50,
  elapsed_seconds: 1.5,
};

describe("Step3Review", () => {
  it("renders all sections from the proposal", () => {
    render(
      <MemoryRouter>
        <Step3Review
          proposal={sampleProposal}
          packMeta={{ slug: "alice", name: "Alice", author: "A" }}
          onBack={() => {}}
        />
      </MemoryRouter>,
    );
    expect(screen.getByDisplayValue("The Builder")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Ships often.")).toBeInTheDocument();
    expect(screen.getByText(/first sample/)).toBeInTheDocument();
    expect(screen.getByText(/second sample/)).toBeInTheDocument();
  });

  it("toggles a sample off and saves with the right selection", async () => {
    mockSave.mockResolvedValue({ slug: "alice" });
    render(
      <MemoryRouter>
        <Step3Review
          proposal={sampleProposal}
          packMeta={{ slug: "alice", name: "Alice", author: "A" }}
          onBack={() => {}}
        />
      </MemoryRouter>,
    );
    // Toggle the second sample's checkbox off (rank: 2)
    fireEvent.click(screen.getByLabelText("Include sample 2"));
    fireEvent.click(screen.getByText("Save Pack"));
    await waitFor(() => {
      expect(mockSave).toHaveBeenCalled();
    });
    const arg = mockSave.mock.calls[0][0];
    expect(arg.selected_sample_indexes).toEqual([0]);
    expect(mockNavigate).toHaveBeenCalledWith("/packs/alice/manifest");
  });
});
