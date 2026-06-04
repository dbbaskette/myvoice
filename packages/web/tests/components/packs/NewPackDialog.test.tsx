import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NewPackDialog } from "../../../src/components/packs/NewPackDialog";

const mockCreate = vi.hoisted(() => vi.fn());
vi.mock("../../../src/api/packs", () => ({ createPack: mockCreate }));

const mockNavigate = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

/** Fill the required fields (slug is derived from the name automatically). */
function fillRequired(name = "Alice Chen"): void {
  fireEvent.change(screen.getByLabelText("What's this pack called?"), {
    target: { value: name },
  });
  fireEvent.change(screen.getByLabelText("Whose voice is this?"), { target: { value: "A" } });
  fireEvent.change(screen.getByLabelText("Who is the voice?"), { target: { value: "i" } });
  fireEvent.change(screen.getByLabelText("What do they stand for?"), { target: { value: "o" } });
}

beforeEach(() => {
  mockCreate.mockReset();
  mockNavigate.mockReset();
});

afterEach(() => vi.unstubAllGlobals());

describe("NewPackDialog", () => {
  it("does not render when closed", () => {
    const { container } = render(
      <MemoryRouter>
        <NewPackDialog open={false} onClose={() => {}} />
      </MemoryRouter>,
    );
    expect(container.firstChild).toBeNull();
  });

  it("disables submit until all required fields are valid", () => {
    render(
      <MemoryRouter>
        <NewPackDialog open={true} onClose={() => {}} />
      </MemoryRouter>,
    );
    const submit = screen.getByRole("button", { name: /Create pack/i });
    expect(submit).toBeDisabled();
    fillRequired();
    expect(submit).toBeEnabled();
  });

  it("blocks submit when the name has no letters to form a slug", () => {
    render(
      <MemoryRouter>
        <NewPackDialog open={true} onClose={() => {}} />
      </MemoryRouter>,
    );
    fillRequired("123");
    expect(screen.getByText(/Name needs at least one letter/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Create pack/i })).toBeDisabled();
  });

  it("derives the slug from the name and navigates on success", async () => {
    mockCreate.mockResolvedValue({
      slug: "alice-chen",
      name: "Alice Chen",
      version: "0.1.0",
      valid: true,
      error_count: 0,
    });
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <NewPackDialog open={true} onClose={onClose} />
      </MemoryRouter>,
    );
    fillRequired("Alice Chen");
    fireEvent.click(screen.getByRole("button", { name: /Create pack/i }));
    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ slug: "alice-chen", name: "Alice Chen" }),
      );
      expect(onClose).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith("/packs/alice-chen");
    });
  });

  it("shows inline error on slug_conflict (409)", async () => {
    mockCreate.mockRejectedValue(new Error("HTTP 409 on /api/packs: slug_conflict"));
    render(
      <MemoryRouter>
        <NewPackDialog open={true} onClose={() => {}} />
      </MemoryRouter>,
    );
    fillRequired("Alice Chen");
    fireEvent.click(screen.getByRole("button", { name: /Create pack/i }));
    await waitFor(() => {
      expect(screen.getByText(/already exists/i)).toBeInTheDocument();
    });
  });
});
