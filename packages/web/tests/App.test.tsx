import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../src/App";

describe("App", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ status: "ok", version: "0.1.0" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the app title", async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /myvoice/i })).toBeInTheDocument();
    });
  });

  it("loads and displays backend version", async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText(/backend v0\.1\.0/i)).toBeInTheDocument();
    });
  });

  it("displays error when health fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("oops", { status: 500 })),
    );
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText(/HTTP 500/)).toBeInTheDocument();
    });
  });
});
