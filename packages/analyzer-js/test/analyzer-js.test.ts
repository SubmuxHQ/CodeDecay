import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { FileChange } from "@submuxhq/codedecay-core";
import { analyzeJsProject } from "../src/index";

const fixtureRoot = join(process.cwd(), "test/fixtures/high-risk-auth");
const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("analyzeJsProject", () => {
  it("flags high-risk auth changes without changed tests", () => {
    const changedFiles: FileChange[] = [
      {
        path: "src/auth/session.ts",
        status: "modified",
        additions: 8,
        deletions: 1,
        addedLines: [
          { line: 1, content: "export function validateSession(token: string | null) {" },
          { line: 2, content: "  if (!token) {" },
          { line: 3, content: "    return null;" }
        ]
      }
    ];

    const result = analyzeJsProject({
      rootDir: fixtureRoot,
      changedFiles
    });

    expect(result.findings.map((finding) => finding.ruleId)).toContain("risky-auth-change");
    expect(result.findings.map((finding) => finding.ruleId)).toContain("missing-nearby-tests");
    expect(result.impactedAreas[0]?.kind).toBe("auth");
  });

  it("flags duplicated added logic across changed files", () => {
    const block = [
      { line: 10, content: "const userId = input.userId;" },
      { line: 11, content: "const account = await loadAccount(userId);" },
      { line: 12, content: "if (!account) throw new Error('missing account');" },
      { line: 13, content: "return account.status === 'active';" }
    ];

    const changedFiles: FileChange[] = [
      {
        path: "src/api/users.ts",
        status: "modified",
        additions: 4,
        deletions: 0,
        addedLines: block
      },
      {
        path: "src/api/admin.ts",
        status: "modified",
        additions: 4,
        deletions: 0,
        addedLines: block
      }
    ];

    const result = analyzeJsProject({
      rootDir: fixtureRoot,
      changedFiles
    });

    expect(result.findings.map((finding) => finding.ruleId)).toContain("duplicated-added-logic");
  });

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

  it("detects UI route, database/schema, and config changes", () => {
    const changedFiles: FileChange[] = [
      change("app/dashboard/page.tsx", "export default function Page() { return <main />; }"),
      change("prisma/schema.prisma", "model User { id String @id }"),
      change("vite.config.ts", "export default { plugins: [] };")
    ];

    const result = analyzeJsProject({
      rootDir: fixtureRoot,
      changedFiles
    });

    expect(result.impactedAreas.map((area) => area.kind)).toEqual(["ui", "database", "config"]);
    expect(result.findings.map((finding) => finding.ruleId)).toEqual(
      expect.arrayContaining(["risky-ui-change", "risky-database-change", "risky-config-change"])
    );
  });

  it("flags broad unrelated changes", () => {
    const changedFiles = [
      "apps/web/src/page.ts",
      "packages/api/src/users.ts",
      "scripts/deploy.ts",
      "tools/migrate.ts",
      "services/billing/src/index.ts"
    ].map((path) => change(path, "export const changed = true;"));

    const result = analyzeJsProject({
      rootDir: fixtureRoot,
      changedFiles
    });

    expect(result.findings.map((finding) => finding.ruleId)).toContain("broad-unrelated-change");
  });

  it("flags large and high-complexity changed functions", () => {
    const rootDir = createTempProject({
      "src/risk.ts": [largeFunction("largeHandler", 121), complexFunction("complexHandler", 12)].join("\n\n")
    });

    const result = analyzeJsProject({
      rootDir,
      changedFiles: [
        {
          path: "src/risk.ts",
          status: "modified",
          additions: 30,
          deletions: 0,
          addedLines: [
            { line: 2, content: "  let total = 0;" },
            { line: 127, content: "  if (input.flag0) score += 1;" }
          ]
        }
      ]
    });

    expect(result.findings.map((finding) => finding.ruleId)).toEqual(
      expect.arrayContaining(["large-function", "high-complexity"])
    );
  });

  it("flags test bloat and heavy mocking", () => {
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

    expect(result.findings.map((finding) => finding.ruleId)).toEqual(
      expect.arrayContaining(["test-bloat", "heavy-mocking"])
    );
  });

  it("flags fragile abstractions", () => {
    const changedFiles: FileChange[] = [
      {
        path: "src/services/user.ts",
        status: "modified",
        additions: 4,
        deletions: 0,
        addedLines: [
          { line: 1, content: "const value: any = input;" },
          { line: 2, content: "// @ts-ignore" },
          { line: 3, content: "try { risky(); } catch {}" }
        ]
      }
    ];

    const result = analyzeJsProject({
      rootDir: fixtureRoot,
      changedFiles
    });

    expect(result.findings.map((finding) => finding.ruleId)).toEqual(
      expect.arrayContaining(["typescript-any", "compiler-suppression", "silent-failure"])
    );
  });
});

function change(path: string, content: string): FileChange {
  return {
    path,
    status: "modified",
    additions: 1,
    deletions: 0,
    addedLines: [{ line: 1, content }]
  };
}

function createTempProject(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "codedecay-analyzer-"));
  tempRoots.push(root);

  for (const [path, contents] of Object.entries(files)) {
    const fullPath = join(root, path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, contents, "utf8");
  }

  return root;
}

function largeFunction(name: string, lineCount: number): string {
  const bodyLines = Array.from({ length: lineCount - 2 }, (_, index) => `  total += ${index};`);
  return [`export function ${name}() {`, ...bodyLines, "  return total;", "}"].join("\n");
}

function complexFunction(name: string, branchCount: number): string {
  const branches = Array.from({ length: branchCount }, (_, index) => [
    `  if (input.flag${index}) {`,
    "    score += 1;",
    "  }"
  ].join("\n"));

  return [`export function ${name}(input: Record<string, boolean>) {`, "  let score = 0;", ...branches, "  return score;", "}"].join("\n");
}
