import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../src/App";

describe("App", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === "/api/packs") {
          return new Response("[]", {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (url.startsWith("/api/packs/")) {
          return new Response(
            JSON.stringify({
              slug: "dan",
              name: "Dan Baskette",
              version: "3.0",
              valid: true,
              error_count: 0,
              root_path: "/tmp/packs/dan",
              errors: [],
              counts: {
                banished_words: 0,
                banished_phrases: 0,
                permitted_exceptions: 0,
                formats: 0,
                samples: 0,
                bios: 0,
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response("not found", { status: 404 });
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("renders the app shell with myvoice branding", () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByText("myvoice")).toBeInTheDocument();
  });

  it("shows the Packs nav link", () => {
    render(
      <MemoryRouter initialEntries={["/packs"]}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getAllByText(/Packs/i).length).toBeGreaterThan(0);
  });

  it("shows the pack overview for a slug", async () => {
    render(
      <MemoryRouter initialEntries={["/packs/dan"]}>
        <App />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Dan Baskette" })).toBeInTheDocument();
    });
  });
});
