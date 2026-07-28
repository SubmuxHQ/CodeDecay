import { existsSync, readFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  createHighRiskRepo,
  createLowRiskRepo,
  createMediumRiskRepo,
  createNextjsExampleRepo,
  createNodeApiExampleRepo,
  createRepo,
  createTempDir,
  currentCliVersion,
  ensureBuiltCli,
  git,
  gitOutput,
  repoRoot,
  runBuilt,
  writeFile
} from "./helpers/built-cli";

const MULTI_PROCESS_CONTRACT_TIMEOUT_MS = 20_000;
const ISO_TIMESTAMP_PATTERN = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g;

beforeAll(ensureBuiltCli, 120_000);

describe("built codedecay CLI analysis and diff behavior", () => {
  it("returns correct fail-on exit codes for low, medium, and high risk repos", () => {
    const lowRepo = createLowRiskRepo();
    expect(runBuilt(["analyze", "--cwd", lowRepo, "--fail-on", "high"]).status).toBe(0);
    expect(runBuilt(["analyze", "--cwd", lowRepo, "--fail-on", "medium"]).status).toBe(0);
    expect(runBuilt(["analyze", "--cwd", lowRepo, "--fail-on", "low"]).status).toBe(1);

    const mediumRepo = createMediumRiskRepo();
    expect(runBuilt(["analyze", "--cwd", mediumRepo, "--fail-on", "high"]).status).toBe(0);
    expect(runBuilt(["analyze", "--cwd", mediumRepo, "--fail-on", "medium"]).status).toBe(1);
    expect(runBuilt(["analyze", "--cwd", mediumRepo, "--fail-on", "low"]).status).toBe(1);

    const highRepo = createHighRiskRepo();
    expect(runBuilt(["analyze", "--cwd", highRepo, "--fail-on", "high"]).status).toBe(1);
    expect(runBuilt(["analyze", "--cwd", highRepo, "--fail-on", "medium"]).status).toBe(1);
    expect(runBuilt(["analyze", "--cwd", highRepo, "--fail-on", "low"]).status).toBe(1);
  }, MULTI_PROCESS_CONTRACT_TIMEOUT_MS);

  it("honors cwd and writes relative output inside the analyzed repo", () => {
    const repo = createLowRiskRepo();
    const result = runBuilt([
      "analyze",
      "--cwd",
      repo,
      "--format",
      "sarif",
      "--output",
      "codedecay.sarif"
    ]);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(existsSync(join(repo, "codedecay.sarif"))).toBe(true);
  });

  it("keeps consecutive report writes out of their own JSON, Markdown, and SARIF analysis", () => {
    const formats = [
      { format: "json", output: ".codedecay/report.json" },
      { format: "markdown", output: ".codedecay/report.md" },
      { format: "sarif", output: ".codedecay/report.sarif" }
    ];

    for (const { format, output } of formats) {
      const repo = createRepo({
        "src/app.ts": "export const value = 1;\n",
        ".codedecay/memory.json": JSON.stringify({
          version: 1,
          flows: [],
          commands: [],
          invariants: [],
          architecture: [],
          regressions: []
        })
      });
      writeFile(repo, "src/app.ts", "export const value = 2;\n");
      writeFile(
        repo,
        ".codedecay/memory.json",
        JSON.stringify({
          version: 1,
          flows: [],
          commands: [],
          invariants: [
            {
              name: "Preserve user context",
              description: "The report output must not hide intentional memory.",
              files: ["src/**"]
            }
          ],
          architecture: [],
          regressions: []
        })
      );
      writeFile(repo, "custom-report.json", '{"tool":"CodeDecay"}\n');

      const first = runBuilt(["analyze", "--cwd", repo, "--format", format, "--output", output]);
      expect(first.status, first.stderr).toBe(0);
      const firstOutput = readFileSync(join(repo, output), "utf8");
      const second = runBuilt(["analyze", "--cwd", repo, "--format", format, "--output", output]);
      expect(second.status, second.stderr).toBe(0);
      const secondOutput = readFileSync(join(repo, output), "utf8");

      expect(secondOutput.replace(ISO_TIMESTAMP_PATTERN, "<timestamp>")).toBe(
        firstOutput.replace(ISO_TIMESTAMP_PATTERN, "<timestamp>")
      );

      if (format === "json") {
        const paths = JSON.parse(secondOutput).changedFiles.map((change: { path: string }) => change.path);
        expect(paths).toEqual(
          expect.arrayContaining(["src/app.ts", ".codedecay/memory.json", "custom-report.json"])
        );
        expect(paths).not.toContain(output);
      }
    }
  }, MULTI_PROCESS_CONTRACT_TIMEOUT_MS);

  it("prints user-friendly git errors from the built CLI", () => {
    const nonGitDir = createTempDir();
    const nonGit = runBuilt(["analyze", "--cwd", nonGitDir, "--format", "json"]);

    expect(nonGit.status).toBe(2);
    expect(nonGit.stdout).toBe("");
    expect(nonGit.stderr).toBe(
      `CodeDecay failed: ${nonGitDir} is not a git repository. Run from a git repo or pass --cwd <repo>.\n`
    );

    const repo = createLowRiskRepo();
    const invalidRef = runBuilt([
      "analyze",
      "--cwd",
      repo,
      "--base",
      "definitely-missing-ref",
      "--head",
      "HEAD",
      "--format",
      "json"
    ]);

    expect(invalidRef.status).toBe(2);
    expect(invalidRef.stdout).toBe("");
    expect(invalidRef.stderr).toContain('CodeDecay failed: Could not resolve git ref "definitely-missing-ref".');
  });

  it("keeps source-checkout examples independent of unpublished npm versions", () => {
    const examplePackagePaths = [
      "examples/nextjs-risk-demo/package.json",
      "examples/node-api-risk-demo/scenarios/baseline/package_DOT_json.fixture",
      "examples/node-api-risk-demo/scenarios/risky/package_DOT_json.fixture"
    ];

    for (const packagePath of examplePackagePaths) {
      const packageJson = JSON.parse(readFileSync(join(repoRoot, packagePath), "utf8"));

      expect(packageJson.devDependencies?.["@submuxhq/codedecay"]).toBeUndefined();
      expect(JSON.stringify(packageJson.scripts)).toContain("node ../../packages/cli/dist/index.js");
    }
  });

  it("compares configured probes from the built CLI", () => {
    const repo = createRepo({
      "probe.js": [
        "const { readFileSync } = require('node:fs');",
        "const value = readFileSync('value.txt', 'utf8').trim();",
        "console.log(JSON.stringify({ value }));",
        ""
      ].join("\n"),
      "value.txt": "base\n",
      ".codedecay/config.yml": [
        "version: 1",
        "commands: {}",
        "probes:",
        "  - name: value probe",
        "    command: node probe.js",
        "    timeoutMs: 1000",
        "safety:",
        "  commandTimeoutMs: 1000",
        "  allowCommands: true",
        ""
      ].join("\n")
    });
    const base = gitOutput(repo, ["rev-parse", "HEAD"]).trim();
    writeFile(repo, "value.txt", "head\n");
    git(repo, ["add", "."]);
    git(repo, ["commit", "-m", "update value"]);
    const head = gitOutput(repo, ["rev-parse", "HEAD"]).trim();

    const result = runBuilt(["differential", "--cwd", repo, "--base", base, "--head", head, "--format", "json"]);
    const report = JSON.parse(result.stdout);

    expect(result.status).toBe(1);
    expect(report.summary.status).toBe("changed");
    expect(report.results[0].differences).toContain('structured stdout changed at value: "base" -> "head"');
    expect(report.results[0].artifacts.directory).toContain(".codedecay/local/differential/");
  });

  it("runs when dist CLI is invoked through a symlinked path", () => {
    const repo = createLowRiskRepo();
    const symlinkRoot = createTempDir();
    const linkedRoot = join(symlinkRoot, "codedecay-link");
    symlinkSync(repoRoot, linkedRoot, "dir");

    const result = runBuilt(["analyze", "--cwd", repo, "--format", "json"], join(linkedRoot, "packages/cli/dist/index.js"));

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      tool: "CodeDecay",
      summary: {
        riskLevel: "low"
      }
    });
  });

  it("treats production modules under src/tests as source in a real git repository", () => {
    const sourcePath = "packages/demo/src/tests/rules.ts";
    const testPath = "packages/demo/tests/rules.test.ts";
    const repo = createRepo({
      [sourcePath]: "export function accepts(value: number) { return value > 0; }\n",
      [testPath]: [
        "import { strictEqual } from 'node:assert/strict';",
        "import { test } from 'node:test';",
        "import { accepts } from '../src/tests/rules.js';",
        "test('accepts positive values', () => strictEqual(accepts(1), true));",
        ""
      ].join("\n")
    });

    writeFile(repo, sourcePath, "export function accepts(value: number) { return Number.isFinite(value) && value > 0; }\n");
    writeFile(
      repo,
      testPath,
      [
        "import { strictEqual } from 'node:assert/strict';",
        "import { test } from 'node:test';",
        "import { accepts } from '../src/tests/rules.js';",
        "test('accepts only finite positive values', () => {",
        "  strictEqual(accepts(1), true);",
        "  strictEqual(accepts(Number.POSITIVE_INFINITY), false);",
        "});",
        ""
      ].join("\n")
    );

    const result = runBuilt(["analyze", "--cwd", repo, "--format", "json"]);
    const report = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(report.securityAnalysis.scannedFiles).toContain(sourcePath);
    expect(report.impactedAreas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "source", files: expect.arrayContaining([sourcePath]) }),
        expect.objectContaining({ kind: "test", files: expect.arrayContaining([testPath]) })
      ])
    );
    expect(report.findings).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: sourcePath,
          ruleId: expect.stringMatching(/^(test-without-assertions|test-bloat)$/)
        })
      ])
    );
  });

  it("does not report a typed contract fixture as copied implementation", () => {
    const sourcePath = "src/symbols/impact-adapter.ts";
    const testPath = "src/impact-graph.test.ts";
    const fixtureRoot = join(repoRoot, "packages/analyzer-js/fixtures/copied-implementation");
    const repo = createRepo({
      [sourcePath]: "export function createImpactGraph() { return {}; }\n",
      [testPath]: "import { createImpactGraph } from './symbols/impact-adapter';\n"
    });

    writeFile(repo, sourcePath, readFileSync(join(fixtureRoot, "issue-724-impact-adapter.ts.txt"), "utf8"));
    writeFile(repo, testPath, readFileSync(join(fixtureRoot, "issue-724-impact-graph.test.ts.txt"), "utf8"));

    const result = runBuilt(["analyze", "--cwd", repo, "--format", "json"]);
    const report = JSON.parse(result.stdout);

    expect(result.status, result.stderr).toBe(0);
    expect(report.findings).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "copied-implementation-in-test",
          file: testPath
        })
      ])
    );
  });

  it("does not report test growth below the changed production surface as bloat", () => {
    const sourcePath = "src/impact/normalize.ts";
    const testPath = "test/impact-graph.test.ts";
    const repo = createRepo({
      [sourcePath]: "export const sourceValues: number[] = [];\n",
      [testPath]: [
        "import assert from 'node:assert/strict';",
        "import { sourceValues } from '../src/impact/normalize';",
        ""
      ].join("\n")
    });
    const sourceAdditions = Array.from(
      { length: 1018 },
      (_, index) => `sourceValues.push(${index});`
    );
    const testAdditions = Array.from({ length: 319 }, (_, index) =>
      index < 15
        ? `assert.equal(sourceValues[${index}], ${index});`
        : `const fixtureValue${index} = ${index};`
    );

    writeFile(
      repo,
      sourcePath,
      ["export const sourceValues: number[] = [];", ...sourceAdditions, ""].join("\n")
    );
    writeFile(
      repo,
      testPath,
      [
        "import assert from 'node:assert/strict';",
        "import { sourceValues } from '../src/impact/normalize';",
        ...testAdditions,
        ""
      ].join("\n")
    );

    const result = runBuilt(["analyze", "--cwd", repo, "--format", "json"]);
    const report = JSON.parse(result.stdout);

    expect(result.status, result.stderr).toBe(0);
    expect(report.changedFiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: sourcePath, additions: 1018 }),
        expect.objectContaining({ path: testPath, additions: 319 })
      ])
    );
    expect(report.findings).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "test-bloat",
          file: testPath
        })
      ])
    );
  });

  it("reports the executable source and test ranges for copied logic", () => {
    const sourcePath = "src/normalize.ts";
    const testPath = "src/normalize.test.ts";
    const repo = createRepo({
      [sourcePath]: "export function normalize(value: string) { return value; }\n",
      [testPath]: "import { normalize } from './normalize';\n"
    });

    writeFile(
      repo,
      sourcePath,
      [
        "export function normalize(value: string) {",
        "  const normalized = value.trim().toLowerCase();",
        "  const bounded = normalized.slice(0, 8);",
        "  return bounded.replace(/[^a-z]/g, '');",
        "}",
        ""
      ].join("\n")
    );
    writeFile(
      repo,
      testPath,
      [
        "import { normalize } from './normalize';",
        "function copiedNormalize(value: string) {",
        "  const normalized = value.trim().toLowerCase();",
        "  const bounded = normalized.slice(0, 8);",
        "  return bounded.replace(/[^a-z]/g, '');",
        "}",
        "expect(normalize(' SENSOR-123 ')).toBe(copiedNormalize(' SENSOR-123 '));",
        ""
      ].join("\n")
    );

    const result = runBuilt(["analyze", "--cwd", repo, "--format", "json"]);
    const report = JSON.parse(result.stdout);
    const finding = report.findings.find(
      (candidate: { ruleId: string }) => candidate.ruleId === "copied-implementation-in-test"
    );

    expect(result.status, result.stderr).toBe(0);
    expect(finding).toMatchObject({
      file: testPath,
      line: 3,
      description: expect.stringContaining(
        `${testPath}:3-5 matches executable logic from ${sourcePath}:2-4`
      )
    });
    expect(finding.description).toContain("const normalized = value.trim().toLowerCase()");
  });
});
