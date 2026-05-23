import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ViewPromptModal } from "../../src/components/compose/ViewPromptModal";

vi.mock("../../src/api/compose", () => ({
  composePrompt: vi.fn().mockResolvedValue({
    prompt: "You are Dan Baskette. Rewrite the following.",
    char_count: 42,
    samples_used: [],
  }),
  lintText: vi.fn().mockResolvedValue({ violations: [], hits: [] }),
}));

describe("ViewPromptModal", () => {
  const onClose = vi.fn();
  const defaultProps = {
    pack: "dan",
    format: undefined,
    samples: [],
    draft: "My draft text",
    onClose,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading state before prompt arrives", () => {
    render(<ViewPromptModal {...defaultProps} />);
    expect(screen.getByText("Loading prompt…")).toBeInTheDocument();
  });

  it("renders prompt fetched from API", async () => {
    render(<ViewPromptModal {...defaultProps} />);
    await waitFor(() =>
      expect(screen.getByText("You are Dan Baskette. Rewrite the following.")).toBeInTheDocument(),
    );
  });

  it("shows a Copy button once prompt is loaded", async () => {
    render(<ViewPromptModal {...defaultProps} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument());
  });

  it("calls onClose when X button is clicked", async () => {
    render(<ViewPromptModal {...defaultProps} />);
    await waitFor(() => screen.getByText("You are Dan Baskette. Rewrite the following."));
    const closeBtn = screen.getByRole("button", { name: "Close" });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
