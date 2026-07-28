import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { FileChange } from "@submuxhq/codedecay-core";
import { analyzeJsProject } from "../src/index";
import { change, createTempProject, fixtureRoot } from "./helpers/integration";
import { issue724TestBloatChanges } from "./helpers/test-bloat";

describe("analyzeJsProject test signal integration", () => {
  it("recommends nearby matching tests for changed source files", () => {
    const rootDir = createTempProject({
      "src/api/users.ts": "export function users() { return []; }\n",
      "src/api/users.test.ts": "import { users } from \"./users\";\n"
    });

    const result = analyzeJsProject({
      rootDir,
      changedFiles: [change("src/api/users.ts", "export function users() { return [1]; }")]
    });

    expect(result.recommendedTests).toContain("src/api/users.test.ts");
  });

  it("recommends adding or running tests when no nearby test exists", () => {
    const rootDir = createTempProject({
      "src/lib/formatter.ts": "export function format() { return \"\"; }\n"
    });

    const result = analyzeJsProject({
      rootDir,
      changedFiles: [change("src/lib/formatter.ts", "export function format() { return \"ok\"; }")]
    });

    expect(result.recommendedTests).toContain("Add or run tests covering src/lib/formatter.ts");
  });

  it("reports one combined finding for disproportionate mock-heavy test growth", () => {
    const changedFiles: FileChange[] = [
      {
        path: "src/api/users.ts",
        status: "modified",
        additions: 10,
        deletions: 0,
        addedLines: [{ line: 1, content: "export function users() { return []; }" }]
      },
      {
        path: "src/api/users.test.ts",
        status: "modified",
        additions: 70,
        deletions: 0,
        addedLines: Array.from({ length: 12 }, (_, index) => ({
          line: index + 1,
          content: `vi.mock("./dependency-${index}", () => ({}));`
        }))
      }
    ];

    const result = analyzeJsProject({
      rootDir: fixtureRoot,
      changedFiles
    });

    expect(result.findings.map((finding) => finding.ruleId)).toContain("test-bloat");
    expect(result.findings.map((finding) => finding.ruleId)).not.toContain("heavy-mocking");
  });

  it("does not report PR #724 test-heavy safety work as test bloat", () => {
    const { changedFiles, fixture } = issue724TestBloatChanges();
    const result = analyzeJsProject({
      rootDir: fixtureRoot,
      changedFiles
    });

    expect(fixture.testAdditions / fixture.sourceAdditions).toBeCloseTo(0.313, 3);
    expect(result.findings).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "test-bloat",
          file: fixture.testPath
        })
      ])
    );
  });

  it("does not treat generic index variables in mocks as changed source mocks", () => {
    const changedFiles: FileChange[] = [
      {
        path: "packages/analyzer-js/src/index.ts",
        status: "modified",
        additions: 10,
        deletions: 0,
        addedLines: [{ line: 1, content: "export function analyze() { return true; }" }]
      },
      {
        path: "packages/analyzer-js/test/analyzer-js.test.ts",
        status: "modified",
        additions: 12,
        deletions: 0,
        addedLines: Array.from({ length: 12 }, (_, index) => ({
          line: index + 1,
          content: `vi.mock("./dependency-${index}", () => ({}));`
        }))
      }
    ];

    const result = analyzeJsProject({
      rootDir: fixtureRoot,
      changedFiles
    });

    expect(result.findings.map((finding) => finding.ruleId)).not.toContain("mocked-changed-source");
  });

  it("flags changed tests without assertions", () => {
    const rootDir = createTempProject({
      "src/auth/session.ts": "export function validateSession(token?: string) { return Boolean(token); }\n",
      "src/auth/session.test.ts": [
        "import { validateSession } from './session';",
        "test('validates a session', () => {",
        "  validateSession('token');",
        "});",
        ""
      ].join("\n")
    });

    const result = analyzeJsProject({
      rootDir,
      changedFiles: [
        change("src/auth/session.ts", "export function validateSession(token?: string) { return Boolean(token); }"),
        change("src/auth/session.test.ts", "  validateSession('token');")
      ]
    });

    expect(result.findings.map((finding) => finding.ruleId)).toContain("test-without-assertions");
    expect(result.recommendedTests).toContain("Add real assertions to src/auth/session.test.ts");
  });

  it("flags top-level smoke execution without assertions", () => {
    const rootDir = createTempProject({
      "src/auth/session.ts": "export function getSession(id: string) { return { id }; }\n",
      "test/unit.ts": [
        "import { getSession } from '../src/auth/session';",
        "const session = getSession('user-1');",
        "console.log(session);",
        ""
      ].join("\n")
    });

    const result = analyzeJsProject({
      rootDir,
      changedFiles: [
        change("src/auth/session.ts", "export function getSession(id: string) { return { id }; }"),
        change("test/unit.ts", "const session = getSession('user-1');")
      ]
    });

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "test-without-assertions",
          file: "test/unit.ts",
          line: 2
        })
      ])
    );
  });

  it("flags snapshot-only changed tests", () => {
    const rootDir = createTempProject({
      "app/dashboard/page.tsx": "export default function Page() { return <main />; }\n",
      "app/dashboard/page.test.tsx": [
        "import Page from './page';",
        "test('renders dashboard', () => {",
        "  expect(Page()).toMatchSnapshot();",
        "});",
        ""
      ].join("\n")
    });

    const result = analyzeJsProject({
      rootDir,
      changedFiles: [
        change("app/dashboard/page.tsx", "export default function Page() { return <main />; }"),
        change("app/dashboard/page.test.tsx", "  expect(Page()).toMatchSnapshot();")
      ]
    });

    expect(result.findings.map((finding) => finding.ruleId)).toContain("snapshot-only-test");
    expect(result.recommendedTests).toContain("Add explicit behavior assertions to app/dashboard/page.test.tsx");
  });

  it("flags changed tests that mock changed source", () => {
    const rootDir = createTempProject({
      "src/imu/calibration.ts": "export function calibrate(value: number) { return value * 2; }\n",
      "src/imu/calibration.test.ts": [
        "import { calibrate } from './calibration';",
        "vi.mock('./calibration', () => ({ calibrate: vi.fn(() => 42) }));",
        "test('calibrates imu data', () => {",
        "  expect(calibrate(20)).toBe(42);",
        "});",
        ""
      ].join("\n")
    });

    const result = analyzeJsProject({
      rootDir,
      changedFiles: [
        change("src/imu/calibration.ts", "export function calibrate(value: number) { return value * 2; }"),
        change("src/imu/calibration.test.ts", "vi.mock('./calibration', () => ({ calibrate: vi.fn(() => 42) }));")
      ]
    });

    expect(result.findings.map((finding) => finding.ruleId)).toContain("mocked-changed-source");
    expect(result.recommendedTests).toContain("Add an integration or real-module check for src/imu/calibration.ts");
  });

  it("flags changed tests unrelated to changed source", () => {
    const rootDir = createTempProject({
      "src/api/users.ts": "export function listUsers() { return []; }\n",
      "src/lib/math.test.ts": [
        "import { add } from './math';",
        "test('adds numbers', () => {",
        "  expect(add(1, 2)).toBe(3);",
        "});",
        ""
      ].join("\n")
    });

    const result = analyzeJsProject({
      rootDir,
      changedFiles: [
        change("src/api/users.ts", "export function listUsers() { return []; }"),
        change("src/lib/math.test.ts", "  expect(add(1, 2)).toBe(3);")
      ]
    });

    expect(result.findings.map((finding) => finding.ruleId)).toContain("unrelated-test-change");
    expect(result.recommendedTests).toContain("Add or update tests that exercise src/api/users.ts");
  });

  it("flags tests that copy implementation logic", () => {
    const sourceLines = [
      { line: 2, content: "const normalized = value.trim().toLowerCase();" },
      { line: 3, content: "const bounded = normalized.slice(0, 8);" },
      { line: 4, content: "return bounded.replace(/[^a-z]/g, '');" }
    ];

    const rootDir = createTempProject({
      "src/imu/normalize.ts": [
        "export function normalize(value: string) {",
        ...sourceLines.map((line) => `  ${line.content}`),
        "}",
        ""
      ].join("\n"),
      "src/imu/normalize.test.ts": [
        "import { normalize } from './normalize';",
        "function copiedNormalize(value: string) {",
        "  const normalized = value.trim().toLowerCase();",
        "  const bounded = normalized.slice(0, 8);",
        "  return bounded.replace(/[^a-z]/g, '');",
        "}",
        "test('normalizes imu id', () => {",
        "  const value = ' SENSOR-123 ';",
        "  expect(normalize(value)).toBe(copiedNormalize(value));",
        "});",
        ""
      ].join("\n")
    });

    const result = analyzeJsProject({
      rootDir,
      changedFiles: [
        {
          path: "src/imu/normalize.ts",
          status: "modified",
          additions: 3,
          deletions: 0,
          addedLines: sourceLines
        },
        change("src/imu/normalize.test.ts", "  const normalized = value.trim().toLowerCase();")
      ]
    });

    expect(result.findings.map((finding) => finding.ruleId)).toContain("copied-implementation-in-test");
    expect(result.recommendedTests).toContain("Exercise src/imu/normalize.ts through its public API instead of copying its logic");
  });

  it("does not flag the PR 724 typed impact graph contract fixture", () => {
    const sourceContent = readCopiedImplementationFixture("issue-724-impact-adapter.ts.txt");
    const testContent = readCopiedImplementationFixture("issue-724-impact-graph.test.ts.txt");
    const rootDir = createTempProject({
      "src/symbols/impact-adapter.ts": sourceContent,
      "src/impact-graph.test.ts": testContent
    });

    const result = analyzeJsProject({
      rootDir,
      changedFiles: [
        contentChange("src/symbols/impact-adapter.ts", sourceContent),
        contentChange("src/impact-graph.test.ts", testContent)
      ]
    });

    expect(result.findings.map((finding) => finding.ruleId)).not.toContain("copied-implementation-in-test");
  });
});

function readCopiedImplementationFixture(name: string): string {
  return readFileSync(new URL(`../fixtures/copied-implementation/${name}`, import.meta.url), "utf8");
}

function contentChange(path: string, content: string): FileChange {
  const addedLines = content
    .trimEnd()
    .split("\n")
    .map((line, index) => ({ line: index + 1, content: line }));

  return {
    path,
    status: "modified",
    additions: addedLines.length,
    deletions: 0,
    addedLines
  };
}
