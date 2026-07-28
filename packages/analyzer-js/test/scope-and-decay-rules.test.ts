import { describe, expect, it } from "vitest";
import type { FileChange } from "@submuxhq/codedecay-core";
import { detectFragilePatterns } from "../src/decay/fragile-patterns";
import { detectBroadUnrelatedChanges } from "../src/scope/broad-change";
import { detectTestBloat } from "../src/tests/bloat";
import { issue724TestBloatChanges } from "./helpers/test-bloat";

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

  it("does not penalize PR #724 test growth that is smaller than its production surface", () => {
    const { changedFiles, changedSourceFiles, fixture } = issue724TestBloatChanges();
    const findings = detectTestBloat(changedFiles, changedSourceFiles);

    expect(fixture).toMatchObject({
      issue: 724,
      baseCommit: "aec0a651d0de3a2ddf3cf5991d7483ed77796d65",
      headCommit: "b465dfda6ac890496c5e23e711763f8fbd49730d",
      testAdditions: 319,
      sourceAdditions: 1018,
      mockOrSnapshotLines: 0
    });
    expect(findings.map((finding) => finding.ruleId)).not.toContain("test-bloat");
  });

  it("does not treat large table-driven boundary coverage as bloat without a quality defect", () => {
    const tableRows = Array.from(
      { length: 180 },
      (_, index) => `  { input: ${index}, expected: ${index % 2 === 0} },`
    );
    const findings = detectTestBloat(
      [
        testChange("src/api/users.test.ts", 190, [
          "it.each([",
          ...tableRows,
          "])('checks boundary $input', ({ input, expected }) => {",
          "  expect(users(input)).toBe(expected);",
          "});"
        ])
      ],
      [change("src/api/users.ts", "export function users() { return []; }", 20)]
    );

    expect(findings.map((finding) => finding.ruleId)).not.toContain("test-bloat");
  });

  it("flags disproportionate mock-heavy test growth with measurable evidence", () => {
    const mockLines = Array.from({ length: 12 }, (_, index) => `vi.mock('./dep-${index}', () => ({}));`);
    const findings = detectTestBloat([testChange("src/api/users.test.ts", 70, mockLines)], [
      change("src/api/users.ts", "export function users() { return []; }", 10)
    ]);

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "test-bloat",
          severity: "medium",
          file: "src/api/users.test.ts",
          description: expect.stringContaining("7.0x")
        })
      ])
    );
    expect(findings.find((finding) => finding.ruleId === "test-bloat")?.description).toContain(
      "12 mock or snapshot lines"
    );
    expect(findings.map((finding) => finding.ruleId)).not.toContain("heavy-mocking");
  });

  it.each([
    { name: "growth exactly at the 2.0x threshold", testAdditions: 70, sourceAdditions: 35 },
    { name: "test growth below a large production surface", testAdditions: 200, sourceAdditions: 1000 },
    { name: "test-only growth without a source denominator", testAdditions: 200, sourceAdditions: 0 }
  ])("does not report bloat for $name", ({ testAdditions, sourceAdditions }) => {
    const mockLines = Array.from({ length: 20 }, (_, index) => `vi.mock('./dep-${index}', () => ({}));`);
    const sourceChanges =
      sourceAdditions === 0
        ? []
        : [change("src/api/users.ts", "export function users() { return []; }", sourceAdditions)];
    const findings = detectTestBloat(
      [testChange("src/api/users.test.ts", testAdditions, mockLines)],
      sourceChanges
    );

    expect(findings.map((finding) => finding.ruleId)).not.toContain("test-bloat");
    expect(findings.map((finding) => finding.ruleId)).toContain("heavy-mocking");
  });

  it("requires at least 12 mock or snapshot lines before reporting bloat", () => {
    const mockLines = Array.from({ length: 11 }, (_, index) => `vi.mock('./dep-${index}', () => ({}));`);
    const findings = detectTestBloat([testChange("src/api/users.test.ts", 200, mockLines)], [
      change("src/api/users.ts", "export function users() { return []; }", 20)
    ]);

    expect(findings.map((finding) => finding.ruleId)).not.toContain("test-bloat");
    expect(findings.map((finding) => finding.ruleId)).not.toContain("heavy-mocking");
  });

  it("does not count harmless snapshot fixture names as snapshot assertions", () => {
    const fixtureLines = Array.from(
      { length: 20 },
      (_, index) => `const snapshotFixture${index} = loadFixture(${index});`
    );
    const findings = detectTestBloat([testChange("src/api/users.test.ts", 200, fixtureLines)], [
      change("src/api/users.ts", "export function users() { return []; }", 20)
    ]);

    expect(findings.map((finding) => finding.ruleId)).not.toContain("test-bloat");
    expect(findings.map((finding) => finding.ruleId)).not.toContain("heavy-mocking");
  });

  it("counts rejected-promise mocks as low-value scaffolding evidence", () => {
    const mockLines = Array.from(
      { length: 12 },
      (_, index) => `dependency${index}.mockRejectedValue(new Error('offline'));`
    );
    const findings = detectTestBloat([testChange("src/api/users.test.ts", 70, mockLines)], [
      change("src/api/users.ts", "export function users() { return []; }", 10)
    ]);

    expect(findings.find((finding) => finding.ruleId === "test-bloat")?.description).toContain(
      "12 mock or snapshot lines"
    );
  });

  it("reserves high severity for extreme growth with strong low-value evidence", () => {
    const mockLines = Array.from({ length: 20 }, (_, index) => `vi.mock('./dep-${index}', () => ({}));`);
    const findings = detectTestBloat([testChange("src/api/users.test.ts", 200, mockLines)], [
      change("src/api/users.ts", "export function users() { return []; }", 20)
    ]);

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "test-bloat",
          severity: "high",
          line: 1
        })
      ])
    );
    expect(findings.map((finding) => finding.ruleId)).not.toContain("heavy-mocking");
  });

  it("keeps exactly 4.0x growth at medium severity", () => {
    const mockLines = Array.from({ length: 20 }, (_, index) => `vi.mock('./dep-${index}', () => ({}));`);
    const findings = detectTestBloat([testChange("src/api/users.test.ts", 200, mockLines)], [
      change("src/api/users.ts", "export function users() { return []; }", 50)
    ]);

    expect(findings.find((finding) => finding.ruleId === "test-bloat")?.severity).toBe("medium");
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
