import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button } from "../../../src/components/ui/Button";
import { cn } from "../../../src/components/ui/cn";

describe("ui primitives", () => {
  it("cn joins truthy classes only", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
  });

  it("Button defaults to a non-submit primary button", () => {
    render(<Button>Go</Button>);
    const btn = screen.getByRole("button", { name: "Go" });
    expect(btn.className).toContain("bg-indigo-600");
    expect(btn.getAttribute("type")).toBe("button");
  });

  it("Button applies the danger variant", () => {
    render(<Button variant="danger">Delete</Button>);
    expect(screen.getByRole("button", { name: "Delete" }).className).toContain("bg-rose-600");
  });
});
