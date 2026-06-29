import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { FileChange } from "@submuxhq/codedecay-core";
import { analyzeTestRecommendations, recommendTests } from "../src/tests/recommendations";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("test recommendations", () => {
  it("recommends same-name nearby test files", () => {
    const rootDir = createTempProject({
      "src/auth/session.ts": "export function validateSession() { return true; }\n",
      "src/auth/session.test.ts": "test('session', () => {});\n",
      "src/auth/session-flow.spec.ts": "test('session flow', () => {});\n"
    });

    expect(recommendTests(rootDir, [change("src/auth/session.ts")])).toEqual(
      expect.arrayContaining(["src/auth/session.test.ts", "src/auth/session-flow.spec.ts"])
    );
  });

  it("recommends tests from parent or child directories", () => {
    const rootDir = createTempProject({
      "src/payments/webhooks/handler.ts": "export function handleWebhook() { return true; }\n",
      "src/payments/payment.test.ts": "test('payments', () => {});\n",
      "src/payments/webhooks/handler.integration.test.ts": "test('handler', () => {});\n"
    });

    expect(recommendTests(rootDir, [change("src/payments/webhooks/handler.ts")])).toEqual(
      expect.arrayContaining(["src/payments/payment.test.ts", "src/payments/webhooks/handler.integration.test.ts"])
    );
  });

  it("falls back to add-or-run recommendation when no nearby test exists", () => {
    const rootDir = createTempProject({
      "src/api/users.ts": "export function listUsers() { return []; }\n",
      "test/unrelated.test.ts": "test('math', () => {});\n"
    });

    expect(recommendTests(rootDir, [change("src/api/users.ts")])).toEqual(["Add or run tests covering src/api/users.ts"]);
  });

  it("returns missing-test findings for uncovered risky source changes without changed tests", () => {
    const rootDir = createTempProject({
      "app/api/auth/route.ts": "export async function POST() { return Response.json({ ok: true }); }\n"
    });

    const result = analyzeTestRecommendations({
      rootDir,
      changedSourceFiles: [change("app/api/auth/route.ts")],
      changedTestFiles: []
    });

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "missing-nearby-tests",
          severity: "high",
          file: "app/api/auth/route.ts"
        })
      ])
    );
    expect(result.recommendedTests).toContain("Add or run tests covering app/api/auth/route.ts");
  });

  it("does not report missing tests for changed sources with runtime coverage evidence", () => {
    const rootDir = createTempProject({
      "app/api/auth/route.ts": "export async function POST() { return Response.json({ ok: true }); }\n"
    });

    const result = analyzeTestRecommendations({
      rootDir,
      changedSourceFiles: [change("app/api/auth/route.ts")],
      changedTestFiles: [],
      fullyCoveredSourcePaths: new Set(["app/api/auth/route.ts"])
    });

    expect(result.findings).toEqual([]);
    expect(result.recommendedTests).toContain("Add or run tests covering app/api/auth/route.ts");
  });
});

function change(path: string): FileChange {
  return {
    path,
    status: "modified",
    additions: 1,
    deletions: 0,
    addedLines: [{ line: 1, content: "export const changed = true;" }]
  };
}

function createTempProject(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "codedecay-test-recommendations-"));
  tempRoots.push(root);

  for (const [path, contents] of Object.entries(files)) {
    const fullPath = join(root, path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, contents, "utf8");
  }

  return root;
}
