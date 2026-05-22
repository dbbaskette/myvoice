import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { App } from "../src/App";

describe("App", () => {
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

  it("shows the pack detail page for a slug", () => {
    render(
      <MemoryRouter initialEntries={["/packs/dan"]}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "dan" })).toBeInTheDocument();
  });
});
