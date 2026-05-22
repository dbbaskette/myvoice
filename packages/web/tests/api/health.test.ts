import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getHealth } from "../../src/api/health";

describe("getHealth", () => {
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

  it("returns the health payload", async () => {
    const health = await getHealth();
    expect(health).toEqual({ status: "ok", version: "0.1.0" });
  });

  it("throws on non-2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("oops", { status: 500 })),
    );
    await expect(getHealth()).rejects.toThrow(/500/);
  });
});
