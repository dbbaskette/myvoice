import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SaveSampleDialog } from "../../src/components/compose/SaveSampleDialog";

const mockSaveSample = vi.fn().mockResolvedValue({ id: "06", file: "samples/06.txt" });

vi.mock("../../src/api/samples", () => ({
  saveSample: (...args: unknown[]) => mockSaveSample(...args),
}));

describe("SaveSampleDialog", () => {
  const onSaved = vi.fn();
  const onClose = vi.fn();
  const defaultProps = {
    packSlug: "dan",
    initialExcerpt: "This is the rewritten output.",
    onSaved,
    onClose,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("prefills the excerpt textarea with output", () => {
    render(<SaveSampleDialog {...defaultProps} />);
    const textarea = screen.getByRole("textbox", { name: /excerpt/i });
    expect(textarea).toHaveValue("This is the rewritten output.");
  });

  it("calls saveSample with correct args on submit", async () => {
    render(<SaveSampleDialog {...defaultProps} />);
    const saveBtn = screen.getByRole("button", { name: "Save" });
    fireEvent.click(saveBtn);
    await waitFor(() => expect(mockSaveSample).toHaveBeenCalledOnce());
    expect(mockSaveSample).toHaveBeenCalledWith("dan", {
      excerpt: "This is the rewritten output.",
      source_url: undefined,
      note: undefined,
    });
  });

  it("calls onSaved with the returned id on success", async () => {
    render(<SaveSampleDialog {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("06"));
  });

  it("calls onClose when Cancel is clicked", () => {
    render(<SaveSampleDialog {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
