import { describe, expect, it } from "vitest";
import { hasExecutableImplementationBetween } from "../src/tests/copied-implementation-ast";

describe("copied implementation block classification", () => {
  it("rejects TypeScript interfaces, type aliases, and type-only imports", () => {
    const content = [
      "import type { Finding } from '@submuxhq/codedecay-core';",
      "interface OutputShape {",
      "  findings: Finding[];",
      "  risk: 'low' | 'high';",
      "}",
      "type ReportSummary = Pick<OutputShape, 'risk'>;",
      ""
    ].join("\n");

    expect(hasExecutableImplementationBetween(content, 1, 3)).toBe(false);
    expect(hasExecutableImplementationBetween(content, 3, 6)).toBe(false);
  });

  it("rejects declarative object fixtures", () => {
    const content = [
      "const report = {",
      "  summary: { riskLevel: 'low' },",
      "  changedFiles: [],",
      "  findings: [],",
      "};",
      ""
    ].join("\n");

    expect(hasExecutableImplementationBetween(content, 1, 5)).toBe(false);
  });

  it("keeps executable copied normalizer logic", () => {
    const content = [
      "function copiedNormalize(value: string) {",
      "  const normalized = value.trim().toLowerCase();",
      "  const bounded = normalized.slice(0, 8);",
      "  return bounded.replace(/[^a-z]/g, '');",
      "}",
      ""
    ].join("\n");

    expect(hasExecutableImplementationBetween(content, 2, 4)).toBe(true);
  });
});
