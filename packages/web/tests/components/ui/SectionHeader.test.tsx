import { render, screen } from "@testing-library/react";
import { Ban } from "lucide-react";
import { describe, expect, it } from "vitest";

import { SectionHeader } from "../../../src/components/ui/SectionHeader";

describe("SectionHeader", () => {
  it("renders the title and description", () => {
    render(<SectionHeader icon={Ban} color="rose" title="Banished" description="never used" />);
    expect(screen.getByText("Banished")).toBeInTheDocument();
    expect(screen.getByText("never used")).toBeInTheDocument();
  });
});
