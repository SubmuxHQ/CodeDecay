import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeJsProject } from "../src";
import { change, createTempProject } from "./helpers/integration";

describe("changed path test proof map", () => {
  it("marks changed functions as proven when runtime coverage executes changed lines", () => {
    const rootDir = createTempProject({
      "src/feature.ts": "export function getFeature() {\n  return true;\n}\n"
    });
    writeLcov(rootDir, "src/feature.ts", ["DA:1,1", "DA:2,1"]);

    const result = analyzeJsProject({
      rootDir,
      changedFiles: [
        {
          ...change("src/feature.ts", "export function getFeature() {"),
          addedLines: [
            { line: 1, content: "export function getFeature() {" },
            { line: 2, content: "  return true;" }
          ]
        }
      ]
    });

    expect(result.testProofMap?.entries).toEqual([
      expect.objectContaining({
        file: "src/feature.ts",
        status: "proven_by_runtime_coverage",
        evidence: "runtime-coverage",
        proof: "deterministic"
      })
    ]);
    expect(result.findings.map((finding) => finding.ruleId)).not.toContain("missing-nearby-tests");
  });

  it("marks changed functions imported by tests as static-only without runtime proof", () => {
    const rootDir = createTempProject({
      "src/feature.ts": "export function getFeature() {\n  return true;\n}\n",
      "src/feature.test.ts": "import { getFeature } from './feature';\ntest('feature', () => expect(getFeature()).toBe(true));\n"
    });

    const result = analyzeJsProject({
      rootDir,
      changedFiles: [change("src/feature.ts", "export function getFeature() {")]
    });

    expect(result.testProofMap?.entries).toEqual([
      expect.objectContaining({
        file: "src/feature.ts",
        symbol: "getFeature",
        status: "referenced_only_statically",
        staticReferences: ["src/feature.test.ts"]
      })
    ]);
    expect(result.recommendedTests).toContain(
      "Strengthen src/feature.test.ts so it executes src/feature.ts#getFeature with assertions; static import alone is not proof."
    );
  });

  it("marks changed modules as weakened when tests mock the changed boundary", () => {
    const rootDir = createTempProject({
      "src/feature.ts": "export function getFeature() {\n  return true;\n}\n",
      "src/feature.test.ts": [
        "import { getFeature } from './feature';",
        "vi.mock('./feature', () => ({ getFeature: vi.fn() }));",
        "test('feature', () => expect(getFeature()).toBe(true));",
        ""
      ].join("\n")
    });

    const result = analyzeJsProject({
      rootDir,
      changedFiles: [change("src/feature.ts", "export function getFeature() {")]
    });

    expect(result.testProofMap?.entries[0]).toMatchObject({
      file: "src/feature.ts",
      symbol: "getFeature",
      status: "weakened_by_mocking",
      evidence: "weak-mock",
      weakenedByMocks: ["src/feature.test.ts"]
    });
    expect(result.testProofMap?.entries[0]?.repairTask).toContain("without mocking getFeature");
  });

  it("distinguishes static route handler references from runtime-covered route handlers", () => {
    const rootDir = createTempProject({
      "app/api/feature/route.ts": "export async function GET() {\n  return Response.json({ ok: true });\n}\n",
      "app/api/feature/route.test.ts": "import { GET } from './route';\ntest('route helper', () => expect(GET).toBeDefined());\n"
    });

    const staticResult = analyzeJsProject({
      rootDir,
      changedFiles: [change("app/api/feature/route.ts", "export async function GET() {")]
    });
    expect(staticResult.testProofMap?.entries[0]).toMatchObject({
      file: "app/api/feature/route.ts",
      symbol: "GET",
      status: "referenced_only_statically",
      staticReferences: ["app/api/feature/route.test.ts"]
    });

    writeLcov(rootDir, "app/api/feature/route.ts", ["DA:1,1", "DA:2,1"]);
    const coveredResult = analyzeJsProject({
      rootDir,
      changedFiles: [
        {
          ...change("app/api/feature/route.ts", "export async function GET() {"),
          addedLines: [
            { line: 1, content: "export async function GET() {" },
            { line: 2, content: "  return Response.json({ ok: true });" }
          ]
        }
      ]
    });

    expect(coveredResult.testProofMap?.entries[0]).toMatchObject({
      file: "app/api/feature/route.ts",
      symbol: "GET",
      status: "proven_by_runtime_coverage"
    });
  });
});

function writeLcov(rootDir: string, sourcePath: string, lines: string[]): void {
  const lcovPath = join(rootDir, "coverage/lcov.info");
  mkdirSync(dirname(lcovPath), { recursive: true });
  writeFileSync(lcovPath, [`SF:${join(rootDir, sourcePath)}`, ...lines, "end_of_record", ""].join("\n"), "utf8");
}
