import { describe, expect, it } from "vitest";
import { dedupeStrings, findingCounts, sortFindings } from "../src/index";
import type { Finding } from "../src/index";

describe("finding helpers", () => {
  it("counts and sorts findings deterministically", () => {
    const findings: Finding[] = [
      {
        ruleId: "z-low",
        title: "Low",
        description: "Low finding.",
        severity: "low",
        category: "scope"
      },
      {
        ruleId: "b-high",
        title: "High B",
        description: "High finding.",
        severity: "high",
        category: "regression"
      },
      {
        ruleId: "a-high",
        title: "High A",
        description: "High finding.",
        severity: "high",
        category: "regression"
      },
      {
        ruleId: "m-medium",
        title: "Medium",
        description: "Medium finding.",
        severity: "medium",
        category: "coverage"
      }
    ];

    expect(findingCounts(findings)).toEqual({ low: 1, medium: 1, high: 2 });
    expect(sortFindings(findings).map((finding) => finding.ruleId)).toEqual(["a-high", "b-high", "m-medium", "z-low"]);
  });
});

describe("dedupeStrings", () => {
  it("returns sorted unique strings", () => {
    expect(dedupeStrings(["src/b.ts", "src/a.ts", "src/b.ts"])).toEqual(["src/a.ts", "src/b.ts"]);
  });
});
