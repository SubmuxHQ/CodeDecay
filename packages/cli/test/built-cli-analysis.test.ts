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
});
