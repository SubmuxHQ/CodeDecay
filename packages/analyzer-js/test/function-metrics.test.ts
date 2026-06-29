import { describe, expect, it } from "vitest";
import type { FileChange } from "@submuxhq/codedecay-core";
import { analyzeFunctions } from "../src/functions/metrics";

describe("function metric analysis", () => {
  it("returns metrics only for functions touched by changed lines", () => {
    const content = [
      "export function unchanged() {",
      "  return true;",
      "}",
      "",
      "export function changed(input: { ok: boolean }) {",
      "  if (input.ok) {",
      "    return true;",
      "  }",
      "  return false;",
      "}",
      ""
    ].join("\n");

    expect(analyzeFunctions(change("src/risk.ts", [{ line: 6, content: "  if (input.ok) {" }]), content)).toEqual([
      {
        file: "src/risk.ts",
        line: 5,
        name: "changed",
        lines: 6,
        complexity: 2
      }
    ]);
  });

  it("estimates branching complexity from function AST nodes", () => {
    const content = [
      "export const complex = (input: { a: boolean; b: boolean; c: boolean }) => {",
      "  if (input.a && input.b) {",
      "    return 1;",
      "  }",
      "  return input.c ? 2 : 3;",
      "};",
      ""
    ].join("\n");

    expect(analyzeFunctions(change("src/complex.ts", [{ line: 2, content: "  if (input.a && input.b) {" }]), content)).toEqual([
      expect.objectContaining({
        file: "src/complex.ts",
        line: 1,
        name: "changed function",
        lines: 6,
        complexity: 4
      })
    ]);
  });

  it("falls back to an unparsed source metric when parsing fails", () => {
    expect(analyzeFunctions(change("src/broken.ts", [{ line: 12, content: "export function broken(" }]), "export function broken(")).toEqual([
      {
        file: "src/broken.ts",
        line: 12,
        name: "unparsed source",
        lines: 0,
        complexity: 12
      }
    ]);
  });
});

function change(path: string, addedLines: Array<{ line: number; content: string }>): FileChange {
  return {
    path,
    status: "modified",
    additions: addedLines.length,
    deletions: 0,
    addedLines
  };
}
