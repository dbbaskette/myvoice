import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PackOverview } from "../../src/components/PackOverview";

describe("PackOverview", () => {
  const samplePack = {
    slug: "dan",
    name: "Dan Baskette",
    version: "3.0",
    valid: true,
    error_count: 0,
    root_path: "/tmp/packs/dan",
    errors: [],
    author: "Dan Baskette",
    description: "The Builder Who Gets It.",
    persona: {
      identity: "The Builder Who Gets It",
      one_line: "Bridges strategy and tech.",
    },
    counts: {
      banished_words: 46,
      banished_phrases: 14,
      permitted_exceptions: 7,
      formats: 8,
      samples: 4,
      bios: 4,
    },
  };

  it("shows the pack name and description", () => {
    render(<PackOverview pack={samplePack} />);
    expect(screen.getByRole("heading", { name: "Dan Baskette" })).toBeInTheDocument();
    expect(screen.getByText("The Builder Who Gets It.")).toBeInTheDocument();
  });

  it("renders persona block", () => {
    render(<PackOverview pack={samplePack} />);
    expect(screen.getByText("The Builder Who Gets It")).toBeInTheDocument();
    expect(screen.getByText("Bridges strategy and tech.")).toBeInTheDocument();
  });

  it("renders count stat cards", () => {
    render(<PackOverview pack={samplePack} />);
    expect(screen.getByText("46")).toBeInTheDocument(); // banished words
    expect(screen.getByText("Banished words")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument(); // formats
  });

  it("renders validation errors when invalid", () => {
    render(
      <PackOverview
        pack={{
          ...samplePack,
          valid: false,
          error_count: 2,
          errors: [
            { path: "pack.slug", message: "missing" },
            { path: "samples[0].file", message: "not found" },
          ],
        }}
      />,
    );
    expect(screen.getByText(/Validation errors/i)).toBeInTheDocument();
    expect(screen.getByText(/missing/)).toBeInTheDocument();
    expect(screen.getByText(/not found/)).toBeInTheDocument();
  });
});
