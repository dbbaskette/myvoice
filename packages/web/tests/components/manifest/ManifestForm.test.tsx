import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ManifestForm } from "../../../src/components/manifest/ManifestForm";

const sampleManifest = {
  spec_version: "1.0",
  pack: {
    slug: "dan",
    name: "Dan Voice",
    version: "3.0",
    author: "Dan",
    description: null,
    homepage: null,
  },
  persona: { identity: "The Builder", one_line: "Ships." },
  banished: { words: ["delve"], phrases: [], permitted_exceptions: [] },
  rules: {
    no_em_dashes: true,
    no_ascii_double_hyphen_between_letters: true,
    no_sentence_starters: [],
  },
  pop_culture: { allowed: ["Marvel"], banned: [] },
  formats: [],
  samples: [],
  bios: [],
};

const mockGet = vi.hoisted(() => vi.fn());
const mockPut = vi.hoisted(() => vi.fn());

vi.mock("../../../src/api/packs", () => ({
  getManifest: mockGet,
}));
vi.mock("../../../src/api/manifest", async () => {
  const actual = await vi.importActual<typeof import("../../../src/api/manifest")>(
    "../../../src/api/manifest",
  );
  return { ...actual, putManifest: mockPut };
});

beforeEach(() => {
  mockGet.mockReset();
  mockPut.mockReset();
});

describe("ManifestForm", () => {
  it("loads manifest and renders sections", async () => {
    mockGet.mockResolvedValue(sampleManifest);
    render(
      <MemoryRouter>
        <ManifestForm slug="dan" />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByDisplayValue("Dan Voice")).toBeInTheDocument());
    expect(screen.getByText("Pack")).toBeInTheDocument();
    expect(screen.getByText("Persona")).toBeInTheDocument();
    expect(screen.getByText("Banished")).toBeInTheDocument();
  });

  it("enables save when a field is edited", async () => {
    mockGet.mockResolvedValue(sampleManifest);
    render(
      <MemoryRouter>
        <ManifestForm slug="dan" />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByDisplayValue("Dan Voice")).toBeInTheDocument());
    const save = screen.getByRole("button", { name: /Save changes/i });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Author"), { target: { value: "Dan Baskette" } });
    expect(save).toBeEnabled();
  });

  it("calls putManifest on save", async () => {
    mockGet.mockResolvedValueOnce(sampleManifest).mockResolvedValueOnce(sampleManifest);
    mockPut.mockResolvedValue({
      slug: "dan",
      name: "Dan Voice",
      version: "3.0",
      valid: true,
      error_count: 0,
    });
    render(
      <MemoryRouter>
        <ManifestForm slug="dan" />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByDisplayValue("Dan Voice")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Author"), { target: { value: "Dan B" } });
    fireEvent.click(screen.getByRole("button", { name: /Save changes/i }));
    await waitFor(() => expect(mockPut).toHaveBeenCalled());
    expect(mockPut.mock.calls[0][1].pack.author).toBe("Dan B");
  });
});
