import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { FileChange } from "@submuxhq/codedecay-core";
import { detectFunctionMetricFindings } from "../src/decay/function-findings";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("function metric findings", () => {
  it("flags large changed functions at medium and high severity thresholds", () => {
    const rootDir = createTempProject({
      "src/large.ts": createFunction("large", 118),
      "src/huge.ts": createFunction("huge", 178)
    });

    const findings = detectFunctionMetricFindings(rootDir, [
      change("src/large.ts", 2),
      change("src/huge.ts", 2)
    ]);

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "large-function",
          file: "src/large.ts",
          severity: "medium"
        }),
        expect.objectContaining({
          ruleId: "large-function",
          file: "src/huge.ts",
          severity: "high"
        })
      ])
    );
  });

  it("flags medium and high complexity changed functions", () => {
    const rootDir = createTempProject({
      "src/complex.ts": createBranchingFunction("complex", 11),
      "src/very-complex.ts": createBranchingFunction("veryComplex", 19)
    });

    const findings = detectFunctionMetricFindings(rootDir, [
      change("src/complex.ts", 2),
      change("src/very-complex.ts", 2)
    ]);

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "high-complexity",
          file: "src/complex.ts",
          severity: "medium"
        }),
        expect.objectContaining({
          ruleId: "high-complexity",
          file: "src/very-complex.ts",
          severity: "high"
        })
      ])
    );
  });
});

function change(path: string, touchedLine: number): FileChange {
  return {
    path,
    status: "modified",
    additions: 1,
    deletions: 0,
    addedLines: [{ line: touchedLine, content: "  const changed = true;" }]
  };
}

function createFunction(name: string, bodyLineCount: number): string {
  const bodyLines = Array.from({ length: bodyLineCount }, (_, index) => `  const value${index} = ${index};`);
  return [`export function ${name}() {`, ...bodyLines, "  return value0;", "}", ""].join("\n");
}

function createBranchingFunction(name: string, ifCount: number): string {
  const bodyLines = Array.from({ length: ifCount }, (_, index) => `  if (input === ${index}) return ${index};`);
  return [`export function ${name}(input: number) {`, ...bodyLines, "  return input;", "}", ""].join("\n");
}

function createTempProject(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "codedecay-function-findings-"));
  tempRoots.push(root);

  for (const [path, contents] of Object.entries(files)) {
    const fullPath = join(root, path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, contents, "utf8");
  }

  return root;
}
