import { describe, expect, it } from "vitest";
import { riskLevelFromScore, shouldFailForRisk } from "../src/index";

describe("riskLevelFromScore", () => {
  it("maps low, medium, and high thresholds", () => {
    expect(riskLevelFromScore(0)).toBe("low");
    expect(riskLevelFromScore(39)).toBe("low");
    expect(riskLevelFromScore(40)).toBe("medium");
    expect(riskLevelFromScore(69)).toBe("medium");
    expect(riskLevelFromScore(70)).toBe("high");
    expect(riskLevelFromScore(100)).toBe("high");
  });
});

describe("shouldFailForRisk", () => {
  it("fails only when actual risk reaches the configured threshold", () => {
    expect(shouldFailForRisk("high", "medium")).toBe(true);
    expect(shouldFailForRisk("medium", "high")).toBe(false);
    expect(shouldFailForRisk("low", "low")).toBe(true);
  });
});
