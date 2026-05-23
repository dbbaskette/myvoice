import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DeletePackDialog } from "../../../src/components/packs/DeletePackDialog";

const mockDelete = vi.hoisted(() => vi.fn());
vi.mock("../../../src/api/packs", () => ({ deletePack: mockDelete }));

const mockNavigate = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

beforeEach(() => {
  mockDelete.mockReset();
  mockNavigate.mockReset();
});

describe("DeletePackDialog", () => {
  it("disables Delete until slug is typed exactly", () => {
    render(
      <MemoryRouter>
        <DeletePackDialog slug="alice" open={true} onClose={() => {}} />
      </MemoryRouter>,
    );
    const btn = screen.getByRole("button", { name: /Delete pack/i });
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Type/), { target: { value: "alic" } });
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Type/), { target: { value: "alice" } });
    expect(btn).toBeEnabled();
  });

  it("calls deletePack and navigates on success", async () => {
    mockDelete.mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <DeletePackDialog slug="alice" open={true} onClose={onClose} />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText(/Type/), { target: { value: "alice" } });
    fireEvent.click(screen.getByRole("button", { name: /Delete pack/i }));
    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith("alice");
      expect(onClose).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith("/packs");
    });
  });
});
