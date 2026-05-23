import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TagInput } from "../../../src/components/manifest/TagInput";

describe("TagInput", () => {
  it("renders existing values as chips", () => {
    render(<TagInput htmlId="t1" label="Words" values={["foo", "bar"]} onChange={() => {}} />);
    expect(screen.getByText("foo")).toBeInTheDocument();
    expect(screen.getByText("bar")).toBeInTheDocument();
  });

  it("adds a value on Enter", () => {
    const onChange = vi.fn();
    render(<TagInput htmlId="t1" label="Words" values={["foo"]} onChange={onChange} />);
    const input = screen.getByLabelText("Words");
    fireEvent.change(input, { target: { value: "bar" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(["foo", "bar"]);
  });

  it("ignores empty submissions", () => {
    const onChange = vi.fn();
    render(<TagInput htmlId="t1" label="Words" values={["foo"]} onChange={onChange} />);
    const input = screen.getByLabelText("Words");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("rejects duplicates silently", () => {
    const onChange = vi.fn();
    render(<TagInput htmlId="t1" label="Words" values={["foo"]} onChange={onChange} />);
    const input = screen.getByLabelText("Words");
    fireEvent.change(input, { target: { value: "foo" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("removes a value via the X button", () => {
    const onChange = vi.fn();
    render(<TagInput htmlId="t1" label="Words" values={["foo", "bar"]} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Remove foo"));
    expect(onChange).toHaveBeenCalledWith(["bar"]);
  });
});
