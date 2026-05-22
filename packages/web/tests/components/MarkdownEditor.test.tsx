import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MarkdownEditor } from "../../src/components/MarkdownEditor";

describe("MarkdownEditor", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("# Hello\n\nWorld", { status: 200 })),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("renders the file path in the header", async () => {
    render(<MarkdownEditor slug="dan" path="style-guide.md" />);
    await waitFor(() => {
      expect(screen.getByText("style-guide.md")).toBeInTheDocument();
    });
  });

  it("renders Rich/Raw mode toggle", async () => {
    render(<MarkdownEditor slug="dan" path="style-guide.md" />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Rich" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Raw" })).toBeInTheDocument();
    });
  });

  it("renders Save button (disabled when not dirty)", async () => {
    render(<MarkdownEditor slug="dan" path="style-guide.md" />);
    await waitFor(() => {
      const save = screen.getByRole("button", { name: /Save/ });
      expect(save).toBeInTheDocument();
      expect(save).toBeDisabled();
    });
  });
});
