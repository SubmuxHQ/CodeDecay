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

beforeAll(ensureBuiltCli);

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
  });

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
    expect(report.results[0].differences).toContain("structured stdout changed");
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
});
