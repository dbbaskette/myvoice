import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ExceptionsTable } from "../../../src/components/manifest/ExceptionsTable";

describe("ExceptionsTable", () => {
  it("renders existing rows", () => {
    render(
      <ExceptionsTable
        values={[
          { term: "Pivotal", reason: "Proper noun" },
          { term: "unlock", reason: "Speed-to-value vocabulary" },
        ]}
        onChange={() => {}}
      />,
    );
    expect(screen.getByDisplayValue("Pivotal")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Proper noun")).toBeInTheDocument();
  });

  it("adds a new row", () => {
    const onChange = vi.fn();
    render(<ExceptionsTable values={[]} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("New exception term"), { target: { value: "foo" } });
    fireEvent.change(screen.getByLabelText("New exception reason"), { target: { value: "bar" } });
    fireEvent.click(screen.getByText("Add"));
    expect(onChange).toHaveBeenCalledWith([{ term: "foo", reason: "bar" }]);
  });

  it("updates a row in place", () => {
    const onChange = vi.fn();
    render(<ExceptionsTable values={[{ term: "foo", reason: "bar" }]} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Exception 1 reason"), {
      target: { value: "new reason" },
    });
    expect(onChange).toHaveBeenCalledWith([{ term: "foo", reason: "new reason" }]);
  });

  it("removes a row", () => {
    const onChange = vi.fn();
    render(
      <ExceptionsTable
        values={[
          { term: "a", reason: "1" },
          { term: "b", reason: "2" },
        ]}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByLabelText("Remove exception a"));
    expect(onChange).toHaveBeenCalledWith([{ term: "b", reason: "2" }]);
  });
});
