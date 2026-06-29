import { describe, expect, it } from "vitest";
import type { FileChange } from "@submuxhq/codedecay-core";
import { detectFragilePatterns } from "../src/decay/fragile-patterns";
import { detectBroadUnrelatedChanges } from "../src/scope/broad-change";
import { detectTestBloat } from "../src/tests/bloat";

describe("scope and decay analyzer rules", () => {
  it("flags broad unrelated change sets while ignoring low-signal files", () => {
    const broadFinding = detectBroadUnrelatedChanges([
      ...Array.from({ length: 12 }, (_, index) => change(`src/feature-${index}/index.ts`, "export const value = true;")),
      change("README.md", "# docs"),
      change("public/logo.svg", "<svg />")
    ]);

    expect(broadFinding).toEqual(
      expect.objectContaining({
        ruleId: "broad-unrelated-change",
        severity: "medium",
        category: "scope"
      })
    );
    expect(broadFinding?.description).toContain("12 files");
  });

  it("raises broad change severity for very large or widely spread changes", () => {
    const finding = detectBroadUnrelatedChanges(
      Array.from({ length: 20 }, (_, index) => change(`area-${index}/module.ts`, "export const value = true;"))
    );

    expect(finding).toEqual(
      expect.objectContaining({
        ruleId: "broad-unrelated-change",
        severity: "high"
      })
    );
  });

  it("flags fragile source patterns and ignores test files", () => {
    const findings = detectFragilePatterns([
      change("src/auth/session.ts", "const payload = input as any;"),
      change("src/api/users.ts", "// @ts-ignore"),
      change("src/jobs/sync.ts", "try { sync(); } catch {}"),
      change("src/auth/session.test.ts", "const payload = input as any;")
    ]);

    expect(findings.map((finding) => finding.ruleId)).toEqual(
      expect.arrayContaining(["typescript-any", "compiler-suppression", "silent-failure"])
    );
    expect(findings).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ file: "src/auth/session.test.ts" })])
    );
    expect(findings.find((finding) => finding.ruleId === "silent-failure")?.severity).toBe("high");
  });

  it("flags large test changes relative to source additions", () => {
    const findings = detectTestBloat([testChange("src/api/users.test.ts", 61, ["expect(users()).toEqual([]);"])], [
      change("src/api/users.ts", "export function users() { return []; }", 10)
    ]);

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "test-bloat",
          severity: "medium",
          file: "src/api/users.test.ts"
        })
      ])
    );
  });

  it("flags heavy mocking in changed tests", () => {
    const mockLines = Array.from({ length: 12 }, (_, index) => `vi.mock('./dep-${index}', () => ({}));`);
    const findings = detectTestBloat([testChange("src/api/users.test.ts", mockLines.length, mockLines)], []);

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "heavy-mocking",
          severity: "medium",
          line: 1
        })
      ])
    );
  });
});

function change(path: string, content: string, additions = 1): FileChange {
  return {
    path,
    status: "modified",
    additions,
    deletions: 0,
    addedLines: [{ line: 1, content }]
  };
}

function testChange(path: string, additions: number, contents: string[]): FileChange {
  return {
    path,
    status: "modified",
    additions,
    deletions: 0,
    addedLines: contents.map((content, index) => ({ line: index + 1, content }))
  };
}
