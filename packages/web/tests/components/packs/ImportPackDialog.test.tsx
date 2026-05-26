import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ImportPackDialog } from "../../../src/components/packs/ImportPackDialog";

const mockImport = vi.hoisted(() => vi.fn());
vi.mock("../../../src/api/pack_zip", () => ({ importPack: mockImport }));

beforeEach(() => {
  mockImport.mockReset();
});

describe("ImportPackDialog", () => {
  it("disables Import when no file selected", () => {
    render(<ImportPackDialog open={true} onClose={() => {}} />);
    expect(screen.getByRole("button", { name: /Import$/ })).toBeDisabled();
  });

  it("enables Import when file picked", () => {
    render(<ImportPackDialog open={true} onClose={() => {}} />);
    const input = screen.getByLabelText(/Pack zip file/i) as HTMLInputElement;
    const file = new File(["x"], "pack.zip", { type: "application/zip" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(screen.getByRole("button", { name: /Import$/ })).toBeEnabled();
  });

  it("calls importPack and shows success on 201", async () => {
    mockImport.mockResolvedValue({
      slug: "alice",
      name: "Alice",
      version: "0.1.0",
      valid: true,
      error_count: 0,
    });
    render(<ImportPackDialog open={true} onClose={() => {}} />);
    const input = screen.getByLabelText(/Pack zip file/i) as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(["x"], "alice.zip", { type: "application/zip" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: /Import$/ }));
    await waitFor(() => expect(screen.getByText(/Imported pack "alice"/)).toBeInTheDocument());
  });

  it("maps 409 to slug-conflict message", async () => {
    mockImport.mockRejectedValue(new Error("HTTP 409"));
    render(<ImportPackDialog open={true} onClose={() => {}} />);
    const input = screen.getByLabelText(/Pack zip file/i) as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(["x"], "alice.zip", { type: "application/zip" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: /Import$/ }));
    await waitFor(() => expect(screen.getByText(/already exists/i)).toBeInTheDocument());
  });
});
