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

  it("rejects typed contract builders that return declarative object fixtures", () => {
    const content = [
      "function fragment(input: FragmentInput): ImpactGraphFragment {",
      "  return {",
      "    schemaVersion: 1,",
      "    adapter: {",
      "      id: input.adapterId,",
      "      sourceTool: input.sourceTool,",
      "    },",
      "  };",
      "}",
      ""
    ].join("\n");

    expect(hasExecutableImplementationBetween(content, 2, 4)).toBe(false);
  });

  it("keeps calculations and calls nested inside returned objects", () => {
    const content = [
      "function summarize(values: number[]) {",
      "  return {",
      "    total: values.reduce((sum, value) => sum + value, 0),",
      "    count: values.length,",
      "  };",
      "}",
      ""
    ].join("\n");

    expect(hasExecutableImplementationBetween(content, 2, 4)).toBe(true);
  });

  it("keeps copied branch behavior even when the branch returns fixture data", () => {
    const content = [
      "function classify(value?: string) {",
      "  if (!value) {",
      "    return { status: 'missing' };",
      "  }",
      "  return { status: 'present' };",
      "}",
      ""
    ].join("\n");

    expect(hasExecutableImplementationBetween(content, 2, 4)).toBe(true);
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
