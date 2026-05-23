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
    fireEvent.change(screen.getByLabelText("Slug"), { target: { value: "alice" } });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Alice" } });
    fireEvent.change(screen.getByLabelText("Author"), { target: { value: "A" } });
    fireEvent.change(screen.getByLabelText("Persona identity"), { target: { value: "i" } });
    fireEvent.change(screen.getByLabelText("Persona one-line"), { target: { value: "o" } });
    expect(submit).toBeEnabled();
  });

  it("rejects bad slugs", () => {
    render(
      <MemoryRouter>
        <NewPackDialog open={true} onClose={() => {}} />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText("Slug"), { target: { value: "Foo Bar" } });
    expect(screen.getByText(/Must match/)).toBeInTheDocument();
  });

  it("submits and navigates on success", async () => {
    mockCreate.mockResolvedValue({
      slug: "alice",
      name: "Alice",
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
    fireEvent.change(screen.getByLabelText("Slug"), { target: { value: "alice" } });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Alice" } });
    fireEvent.change(screen.getByLabelText("Author"), { target: { value: "A" } });
    fireEvent.change(screen.getByLabelText("Persona identity"), { target: { value: "i" } });
    fireEvent.change(screen.getByLabelText("Persona one-line"), { target: { value: "o" } });
    fireEvent.click(screen.getByRole("button", { name: /Create pack/i }));
    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith("/packs/alice");
    });
  });

  it("shows inline error on slug_conflict (409)", async () => {
    mockCreate.mockRejectedValue(new Error("HTTP 409 on /api/packs: slug_conflict"));
    render(
      <MemoryRouter>
        <NewPackDialog open={true} onClose={() => {}} />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText("Slug"), { target: { value: "alice" } });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Alice" } });
    fireEvent.change(screen.getByLabelText("Author"), { target: { value: "A" } });
    fireEvent.change(screen.getByLabelText("Persona identity"), { target: { value: "i" } });
    fireEvent.change(screen.getByLabelText("Persona one-line"), { target: { value: "o" } });
    fireEvent.click(screen.getByRole("button", { name: /Create pack/i }));
    await waitFor(() => {
      expect(screen.getByText(/already exists/i)).toBeInTheDocument();
    });
  });
});
