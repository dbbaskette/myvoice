import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { PackDetailPage } from "../../src/routes/PackDetailPage";

const pack = vi.hoisted(() => ({
  slug: "dan",
  name: "Dan",
  version: "3.0",
  valid: true,
  error_count: 0,
  root_path: "/x",
  errors: [],
  author: "Dan",
  counts: {
    banished_words: 0,
    banished_phrases: 0,
    permitted_exceptions: 0,
    formats: 1,
    samples: 2,
    bios: 3,
  },
}));

vi.mock("../../src/api/packs", () => ({
  getPack: vi.fn().mockResolvedValue(pack),
  getManifest: vi.fn().mockResolvedValue({}),
  getPackFile: vi.fn().mockResolvedValue("# hi"),
}));

vi.mock("../../src/hooks/useGlobalEvents", () => ({ useGlobalEvents: () => {} }));

function renderAt(path: string): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/packs/:slug/*" element={<PackDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("PackDetailPage sub-nav", () => {
  it("uses absolute tab links so they don't stack onto a deep URL", async () => {
    // Start on a deep tab; relative links would resolve against this path.
    renderAt("/packs/dan/formats");

    const manifest = await screen.findByRole("link", { name: /Manifest/ });
    expect(manifest.getAttribute("href")).toBe("/packs/dan/manifest");

    expect(screen.getByRole("link", { name: /Style guide/ }).getAttribute("href")).toBe(
      "/packs/dan/style-guide",
    );
    expect(screen.getByRole("link", { name: /Overview/ }).getAttribute("href")).toBe("/packs/dan");
    expect(screen.getByRole("link", { name: /Samples/ }).getAttribute("href")).toBe(
      "/packs/dan/samples",
    );
  });
});
