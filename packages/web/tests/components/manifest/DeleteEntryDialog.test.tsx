import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DeleteEntryDialog } from "../../../src/components/manifest/DeleteEntryDialog";

const mockDelete = vi.hoisted(() => vi.fn());
vi.mock("../../../src/api/entries", async () => {
  const actual = await vi.importActual<typeof import("../../../src/api/entries")>(
    "../../../src/api/entries",
  );
  return { ...actual, deleteEntry: mockDelete };
});

beforeEach(() => {
  mockDelete.mockReset();
});

describe("DeleteEntryDialog", () => {
  it("disables Delete until exact ident typed", () => {
    render(
      <DeleteEntryDialog
        slug="dan"
        kind="formats"
        ident="blog-post"
        label="formats/blog-post.md"
        open={true}
        onClose={() => {}}
        onDeleted={() => {}}
      />,
    );
    const btn = screen.getByRole("button", { name: /Delete$/ });
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Type/), { target: { value: "blog-pos" } });
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Type/), { target: { value: "blog-post" } });
    expect(btn).toBeEnabled();
  });

  it("calls deleteEntry on confirm", async () => {
    mockDelete.mockResolvedValue(undefined);
    const onDeleted = vi.fn();
    render(
      <DeleteEntryDialog
        slug="dan"
        kind="formats"
        ident="blog-post"
        label="formats/blog-post.md"
        open={true}
        onClose={() => {}}
        onDeleted={onDeleted}
      />,
    );
    fireEvent.change(screen.getByLabelText(/Type/), { target: { value: "blog-post" } });
    fireEvent.click(screen.getByRole("button", { name: /Delete$/ }));
    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith("dan", "formats", "blog-post");
      expect(onDeleted).toHaveBeenCalled();
    });
  });
});
