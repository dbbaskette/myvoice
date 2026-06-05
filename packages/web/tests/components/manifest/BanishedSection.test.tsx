import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BanishedSection } from "../../../src/components/manifest/BanishedSection";

vi.mock("../../../src/api/aiTells", () => ({
  getAiTells: vi.fn().mockResolvedValue({
    words: ["delve", "leverage"],
    phrases: ["a testament to"],
    sentence_starters: ["Moreover"],
    patterns: "- pattern",
  }),
}));

describe("BanishedSection inherited panel", () => {
  it("shows the shared defaults inherited from /api/ai-tells", async () => {
    render(
      <BanishedSection
        banished={{ words: [], phrases: [], permitted_exceptions: [] }}
        onChange={() => {}}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText(/Inherited from shared defaults/i)).toBeInTheDocument(),
    );
    expect(screen.getByText("delve")).toBeInTheDocument();
    expect(screen.getByText("a testament to")).toBeInTheDocument();
  });
});
