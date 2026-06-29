import { describe, expect, it } from "vitest";
import type { FileChange } from "@submuxhq/codedecay-core";
import { analyzeJsProject } from "../src/index";
import { change, createTempProject, fixtureRoot } from "./helpers/integration";

describe("analyzeJsProject risk classification integration", () => {
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

  it("does not treat package names containing test as test files", () => {
    const rootDir = createPackageNameProject();

    const result = analyzeJsProject({
      rootDir,
      changedFiles: [
        change("packages/test-audit/src/index.ts", "export function audit() { return false; }"),
        change("packages/test-audit/test/index.test.ts", "test('audit', () => {});"),
        change("packages/test-audit/__tests__/fixture.ts", "test('fixture', () => {});")
      ]
    });

    expect(result.impactedAreas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "source", files: ["packages/test-audit/src/index.ts"] }),
        expect.objectContaining({ kind: "test", files: ["packages/test-audit/test/index.test.ts"] }),
        expect.objectContaining({ kind: "test", files: ["packages/test-audit/__tests__/fixture.ts"] })
      ])
    );
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: "risky-source-change", file: "packages/test-audit/src/index.ts" }),
        expect.objectContaining({ ruleId: "risky-test-change", file: "packages/test-audit/test/index.test.ts" }),
        expect.objectContaining({ ruleId: "risky-test-change", file: "packages/test-audit/__tests__/fixture.ts" })
      ])
    );
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

  it("keeps asset-only changes out of regression findings", () => {
    const result = analyzeJsProject({
      rootDir: fixtureRoot,
      changedFiles: [
        change("public/logo.svg", "<svg viewBox=\"0 0 24 24\"></svg>"),
        change("public/fonts/display.woff2", "binary fixture")
      ]
    });

    expect(result.impactedAreas).toEqual([]);
    expect(result.findings).toEqual([]);
  });

  it("treats lockfile-only changes as low-signal config changes", () => {
    const result = analyzeJsProject({
      rootDir: fixtureRoot,
      changedFiles: [change("pnpm-lock.yaml", "  '@submuxhq/codedecay@0.2.0':")]
    });

    expect(result.impactedAreas).toEqual([
      expect.objectContaining({ kind: "config", risk: "low", files: ["pnpm-lock.yaml"] })
    ]);
    expect(result.findings).toEqual([
      expect.objectContaining({ ruleId: "risky-config-change", severity: "low", file: "pnpm-lock.yaml" })
    ]);
  });

  it("treats package metadata-only changes as low-signal config changes", () => {
    const result = analyzeJsProject({
      rootDir: fixtureRoot,
      changedFiles: [
        {
          path: "package.json",
          status: "modified",
          additions: 4,
          deletions: 0,
          addedLines: [
            { line: 2, content: '  "description": "Regression-risk analysis for pull requests",' },
            { line: 3, content: '  "keywords": [' },
            { line: 4, content: '    "static-analysis"' },
            { line: 5, content: "  ]" }
          ]
        }
      ]
    });

    expect(result.impactedAreas).toEqual([
      expect.objectContaining({ kind: "config", risk: "low", files: ["package.json"] })
    ]);
    expect(result.findings).toEqual([
      expect.objectContaining({ ruleId: "risky-config-change", severity: "low", file: "package.json" })
    ]);
  });

  it("keeps package dependency changes visible as medium config risk", () => {
    const result = analyzeJsProject({
      rootDir: fixtureRoot,
      changedFiles: [
        {
          path: "package.json",
          status: "modified",
          additions: 2,
          deletions: 0,
          addedLines: [
            { line: 10, content: '  "dependencies": {' },
            { line: 11, content: '    "express": "^5.0.0"' }
          ]
        }
      ]
    });

    expect(result.impactedAreas).toEqual([
      expect.objectContaining({ kind: "config", risk: "medium", files: ["package.json"] })
    ]);
    expect(result.findings).toEqual([
      expect.objectContaining({ ruleId: "risky-config-change", severity: "medium", file: "package.json" })
    ]);
  });

  it("normalizes slash-heavy changed lines without backtracking", () => {
    const repeatedSlashes = "/".repeat(10_000);
    const repeatedQuotedValues = Array.from({ length: 250 }, (_, index) => `const value${index} = "${repeatedSlashes}";`).join("\n");
    const rootDir = createSlashHeavyProject(repeatedQuotedValues);

    const result = analyzeJsProject({
      rootDir,
      changedFiles: [
        change("src/api/slash-a.ts", `const value = "${repeatedSlashes}"; // ${repeatedSlashes}`),
        change("src/api/slash-b.ts", `const value = "${repeatedSlashes}"; // ${repeatedSlashes}`)
      ]
    });

    expect(result.findings.map((finding) => finding.ruleId)).toContain("missing-nearby-tests");
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
});

function createPackageNameProject(): string {
  return createTempProject({
    "packages/test-audit/src/index.ts": "export function audit() { return true; }\n",
    "packages/test-audit/test/index.test.ts": "import { audit } from '../src/index';\n",
    "packages/test-audit/__tests__/fixture.ts": "export const ok = true;\n"
  });
}

function createSlashHeavyProject(repeatedQuotedValues: string): string {
  return createTempProject({
    "src/api/slash-a.ts": `${repeatedQuotedValues}\nexport const a = true;\n`,
    "src/api/slash-b.ts": `${repeatedQuotedValues}\nexport const b = true;\n`
  });
}
