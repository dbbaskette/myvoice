import { describe, expect, it } from "vitest";
import { estimateCost, estimateInputTokens } from "../../src/api/rates";

describe("rates", () => {
  it("estimateInputTokens returns chars/4", () => {
    expect(estimateInputTokens("a".repeat(400))).toBe(100);
  });

  it("estimateCost computes USD for known model", () => {
    const cost = estimateCost("anthropic", "claude-sonnet-4-6", 1000, 500);
    // 1k @ $3/M = 0.003; 500 @ $15/M = 0.0075; total = 0.0105
    expect(cost).toBeCloseTo(0.0105, 6);
  });

  it("estimateCost returns 0 for unknown", () => {
    expect(estimateCost("nope", "model", 1000, 1000)).toBe(0);
  });
});
