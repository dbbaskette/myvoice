import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NewEntryDialog } from "../../../src/components/manifest/NewEntryDialog";

const mockCreateFormat = vi.hoisted(() => vi.fn());
const mockCreateBio = vi.hoisted(() => vi.fn());
const mockCreateSample = vi.hoisted(() => vi.fn());
vi.mock("../../../src/api/entries", () => ({
  createFormat: mockCreateFormat,
  createBio: mockCreateBio,
  createSample: mockCreateSample,
}));

beforeEach(() => {
  mockCreateFormat.mockReset();
  mockCreateBio.mockReset();
  mockCreateSample.mockReset();
});

describe("NewEntryDialog", () => {
  it("renders name field for formats", () => {
    render(
      <NewEntryDialog
        slug="dan"
        kind="formats"
        open={true}
        onClose={() => {}}
        onCreated={() => {}}
      />,
    );
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.queryByLabelText("Excerpt")).toBeNull();
  });

  it("renders excerpt for samples", () => {
    render(
      <NewEntryDialog
        slug="dan"
        kind="samples"
        open={true}
        onClose={() => {}}
        onCreated={() => {}}
      />,
    );
    expect(screen.getByLabelText("Excerpt")).toBeInTheDocument();
    expect(screen.queryByLabelText("Name")).toBeNull();
  });

  it("renders max_chars + target_words + third_person for bios", () => {
    render(
      <NewEntryDialog slug="dan" kind="bios" open={true} onClose={() => {}} onCreated={() => {}} />,
    );
    expect(screen.getByLabelText("max_chars")).toBeInTheDocument();
    expect(screen.getByLabelText("target_words")).toBeInTheDocument();
    expect(screen.getByLabelText("Third person")).toBeInTheDocument();
  });

  it("disables submit until name valid (formats)", () => {
    render(
      <NewEntryDialog
        slug="dan"
        kind="formats"
        open={true}
        onClose={() => {}}
        onCreated={() => {}}
      />,
    );
    const submit = screen.getByRole("button", { name: /Create$/ });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Foo Bar" } });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "linkedin-post" } });
    expect(submit).toBeEnabled();
  });

  it("calls createFormat on submit and closes", async () => {
    mockCreateFormat.mockResolvedValue({ name: "x", file: "formats/x.md" });
    const onCreated = vi.fn();
    const onClose = vi.fn();
    render(
      <NewEntryDialog
        slug="dan"
        kind="formats"
        open={true}
        onClose={onClose}
        onCreated={onCreated}
      />,
    );
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: /Create$/ }));
    await waitFor(() => expect(mockCreateFormat).toHaveBeenCalled());
    expect(onCreated).toHaveBeenCalledWith("formats/x.md");
    expect(onClose).toHaveBeenCalled();
  });

  it("shows inline error on 409", async () => {
    mockCreateFormat.mockRejectedValue(new Error("HTTP 409 conflict"));
    render(
      <NewEntryDialog
        slug="dan"
        kind="formats"
        open={true}
        onClose={() => {}}
        onCreated={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: /Create$/ }));
    await waitFor(() => expect(screen.getByText(/already exists/i)).toBeInTheDocument());
  });
});
