import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { FileChange } from "@submuxhq/codedecay-core";
import { detectWeakTests } from "../src/tests/weak-audit";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("weak test audit", () => {
  it("flags runnable changed tests without assertions", () => {
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

    const result = detectWeakTests(rootDir, [change("src/auth/session.test.ts", [{ line: 3, content: "  validateSession('token');" }])], [
      change("src/auth/session.ts", [{ line: 1, content: "export function validateSession(token?: string) { return Boolean(token); }" }])
    ]);

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "test-without-assertions",
          file: "src/auth/session.test.ts",
          line: 3
        })
      ])
    );
    expect(result.recommendedTests).toContain("Add real assertions to src/auth/session.test.ts");
  });

  it("flags snapshot-only and happy-path-only tests for risky changed source", () => {
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

    const result = detectWeakTests(rootDir, [change("app/dashboard/page.test.tsx", [{ line: 3, content: "  expect(Page()).toMatchSnapshot();" }])], [
      change("app/dashboard/page.tsx", [{ line: 1, content: "export default function Page() { return <main />; }" }])
    ]);

    expect(result.findings.map((finding) => finding.ruleId)).toEqual(
      expect.arrayContaining(["snapshot-only-test", "happy-path-only-test"])
    );
    expect(result.recommendedTests).toEqual(
      expect.arrayContaining([
        "Add explicit behavior assertions to app/dashboard/page.test.tsx",
        "Add negative and edge-case coverage for app/dashboard/page.tsx"
      ])
    );
  });

  it("flags tests that mock changed source and copy implementation logic", () => {
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
        "vi.mock('./normalize', () => ({ normalize: vi.fn(() => 'sensor') }));",
        "function copiedNormalize(value: string) {",
        "  const normalized = value.trim().toLowerCase();",
        "  const bounded = normalized.slice(0, 8);",
        "  return bounded.replace(/[^a-z]/g, '');",
        "}",
        "test('normalizes imu id', () => {",
        "  expect(normalize(' SENSOR-123 ')).toBe(copiedNormalize(' SENSOR-123 '));",
        "});",
        ""
      ].join("\n")
    });

    const result = detectWeakTests(rootDir, [change("src/imu/normalize.test.ts", [{ line: 2, content: "vi.mock('./normalize', () => ({}));" }])], [
      {
        path: "src/imu/normalize.ts",
        status: "modified",
        additions: sourceLines.length,
        deletions: 0,
        addedLines: sourceLines
      }
    ]);

    expect(result.findings.map((finding) => finding.ruleId)).toEqual(
      expect.arrayContaining(["mocked-changed-source", "copied-implementation-in-test"])
    );
    expect(result.recommendedTests).toEqual(
      expect.arrayContaining([
        "Add an integration or real-module check for src/imu/normalize.ts",
        "Exercise src/imu/normalize.ts through its public API instead of copying its logic"
      ])
    );
  });

  it("flags changed tests that do not reference changed source", () => {
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

    const result = detectWeakTests(rootDir, [change("src/lib/math.test.ts", [{ line: 3, content: "  expect(add(1, 2)).toBe(3);" }])], [
      change("src/api/users.ts", [{ line: 1, content: "export function listUsers() { return []; }" }])
    ]);

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "unrelated-test-change",
          file: "src/lib/math.test.ts"
        })
      ])
    );
    expect(result.recommendedTests).toContain("Add or update tests that exercise src/api/users.ts");
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

function createTempProject(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "codedecay-weak-audit-"));
  tempRoots.push(root);

  for (const [path, contents] of Object.entries(files)) {
    const fullPath = join(root, path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, contents, "utf8");
  }

  return root;
}
