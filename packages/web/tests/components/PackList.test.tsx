import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PackList } from "../../src/components/PackList";

describe("PackList", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows loading state initially, then packs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify([
              { slug: "dan", name: "Dan", version: "3.0", valid: true, error_count: 0 },
              { slug: "alice", name: "Alice", version: "1.0", valid: true, error_count: 0 },
            ]),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
      ),
    );
    render(
      <MemoryRouter>
        <PackList />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("dan")).toBeInTheDocument();
      expect(screen.getByText("alice")).toBeInTheDocument();
    });
  });

  it("shows error state on fetch failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("oops", { status: 500 })),
    );
    render(
      <MemoryRouter>
        <PackList />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText(/error/i)).toBeInTheDocument();
    });
  });

  it("shows empty state when zero packs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("[]", {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );
    render(
      <MemoryRouter>
        <PackList />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText(/No packs/i)).toBeInTheDocument();
    });
  });

  it("flags invalid packs with the ✕ marker", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify([
              { slug: "broken", name: "broken", version: "?", valid: false, error_count: 3 },
            ]),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
      ),
    );
    render(
      <MemoryRouter>
        <PackList />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText("✕")).toBeInTheDocument();
    });
  });
});
