import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createLowRiskRepo,
  createMediumRiskRepo,
  createRepo,
  createTempDir,
  ensureBuiltCli,
  git,
  gitOutput,
  repoRoot,
  writeFile
} from "./helpers/built-cli";

const PACKED_CLI_PROCESS_TIMEOUT_MS = 20_000;
let packedFixtureRoot = "";
let packedPackageRoot = "";
let packedCliPath = "";

beforeAll(() => {
  ensureBuiltCli();
  packedFixtureRoot = mkdtempSync(join(tmpdir(), "codedecay-packed-ai-"));
  const packDir = join(packedFixtureRoot, "pack");
  const installDir = join(packedFixtureRoot, "install");
  mkdirSync(packDir, { recursive: true });
  mkdirSync(installDir, { recursive: true });

  const packed: unknown = JSON.parse(
    execFileSync("npm", ["pack", "--json", "--pack-destination", packDir], {
      cwd: join(repoRoot, "packages/cli"),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 120_000
    })
  );
  const filename = findPackedFilename(packed);
  if (!filename) {
    throw new Error("npm pack did not return a package filename.");
  }

  writeFileSync(join(installDir, "package.json"), JSON.stringify({ private: true }), "utf8");
  execFileSync(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--package-lock=false",
      join(packDir, filename)
    ],
    {
      cwd: installDir,
      stdio: "ignore",
      timeout: 120_000
    }
  );
  packedPackageRoot = join(installDir, "node_modules/@submuxhq/codedecay");
  packedCliPath = join(packedPackageRoot, "dist/index.js");
  if (!existsSync(packedCliPath)) {
    throw new Error(`Packed CLI entrypoint is missing: ${packedCliPath}`);
  }
  const installedPackage = JSON.parse(readFileSync(join(packedPackageRoot, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
  };
  const dependencySpecs = Object.values(installedPackage.dependencies ?? {});
  if (dependencySpecs.some((specifier) => /^(workspace:|link:|file:)/.test(specifier))) {
    throw new Error("Packed CLI contains a workspace-only dependency protocol.");
  }
}, 120_000);

afterAll(() => {
  rmSync(packedFixtureRoot, { recursive: true, force: true });
});

describe("packed codedecay AI workflow", () => {
  it("runs the complete AI bundle contract without workspace dependencies", () => {
    const repo = createRepo({
      "src/api/users.ts": "export function users() { return []; }\n"
    });
    const base = gitOutput(repo, ["rev-parse", "HEAD"]).trim();
    writeFile(repo, "src/api/users.ts", "export function users() { return [{ id: 1, active: true }]; }\n");
    git(repo, ["add", "."]);
    git(repo, ["commit", "--quiet", "-m", "return active users"]);
    const head = gitOutput(repo, ["rev-parse", "HEAD"]).trim();
    const invocationCwd = createTempDir();
    const unfiltered = runPacked(
      ["ai", "--cwd", repo, "--base", base, "--head", head, "--format", "json"],
      invocationCwd
    );
    const unfilteredBundle = JSON.parse(unfiltered.stdout);
    const filterCandidate = (
      unfilteredBundle.tasks as Array<{ source: string; priority: string; file?: string }>
    ).find((task) => task.file === "src/api/users.ts");
    if (!filterCandidate?.file) {
      throw new Error("Packed AI bundle did not include a filterable users API task.");
    }

    const result = runPacked(
      [
        "ai",
        "--cwd",
        repo,
        "--base",
        base,
        "--head",
        head,
        "--task",
        "Protect users API behavior",
        "--filter-source",
        filterCandidate.source,
        "--filter-priority",
        filterCandidate.priority,
        "--filter-file",
        filterCandidate.file,
        "--format",
        "json",
        "--output",
        "artifacts/codedecay-ai.json"
      ],
      invocationCwd
    );
    const outputPath = join(repo, "artifacts/codedecay-ai.json");
    const bundle = JSON.parse(readFileSync(outputPath, "utf8"));

    expect(result).toMatchObject({ status: 0, stdout: "", stderr: "", timedOut: false });
    expect(bundle).toMatchObject({
      mode: "agent-task-bundle",
      agentProfile: { id: "codex", name: "Codex" },
      summary: { changedFiles: 1 },
      taskFilters: {
        source: filterCandidate.source,
        priority: filterCandidate.priority,
        file: filterCandidate.file
      },
      safety: {
        commandsExecuted: false,
        llmCalled: false,
        telemetrySent: false,
        cloudDependency: false
      }
    });
    expect(bundle.tasks.length).toBeGreaterThan(0);
    expect(
      bundle.tasks.every(
        (task: { source: string; priority: string; file?: string }) =>
          task.source === filterCandidate.source &&
          task.priority === filterCandidate.priority &&
          task.file === filterCandidate.file
      )
    ).toBe(true);
    expect(packedPackageRoot.startsWith(repoRoot)).toBe(false);

    const alternate = runPacked(
      [
        "ai",
        "--cwd",
        repo,
        "--base",
        base,
        "--head",
        head,
        "--profile",
        "cursor",
        "--format",
        "json"
      ],
      invocationCwd
    );

    expect(alternate.status).toBe(0);
    expect(JSON.parse(alternate.stdout).agentProfile).toMatchObject({
      id: "cursor",
      name: "Cursor"
    });
  });

  it("runs preflight from the package and returns actionable invalid-input errors", () => {
    const repo = createRepo({
      "src/billing/export.ts": "export function exportBilling() { return []; }\n",
      "test/billing/export.test.ts": "export const existingCoverage = true;\n"
    });

    const preflight = runPacked([
      "ai",
      "preflight",
      "--cwd",
      repo,
      "--task",
      "Add an authorized billing export API",
      "--format",
      "json"
    ]);
    const report = JSON.parse(preflight.stdout);

    expect(preflight).toMatchObject({ status: 0, stderr: "", timedOut: false });
    expect(report).toMatchObject({
      mode: "agent-preflight",
      task: "Add an authorized billing export API",
      safety: { commandsExecuted: false, llmCalled: false }
    });
    expect(report.deterministicEvidence.candidateFiles).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "src/billing/export.ts" })])
    );

    const missingTask = runPacked(["ai", "preflight", "--cwd", repo, "--format", "json"]);
    expect(missingTask.status).toBe(2);
    expect(missingTask.stdout).toBe("");
    expect(missingTask.stderr).toContain("ai preflight requires --task <description>.");

    const invalidFilter = runPacked(["ai", "--cwd", repo, "--filter-source", "guess"]);
    expect(invalidFilter.status).toBe(2);
    expect(invalidFilter.stderr).toContain('Invalid --filter-source "guess"');

    const invalidRef = runPacked([
      "ai",
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
    expect(invalidRef.stderr).toContain('Could not resolve git ref "definitely-missing-ref"');
  });

  it("distinguishes passing, failing, skipped, and safety-blocked checks", () => {
    const passingRepo = createLowRiskRepo();
    writeExecutionConfig(
      passingRepo,
      true,
      "node -e \"require('fs').writeFileSync('ai-check-ran.txt','yes'); console.log('verified')\""
    );
    const passing = runPacked(["ai", "--cwd", passingRepo, "--with-checks", "--format", "json"]);
    const passingBundle = JSON.parse(passing.stdout);

    expect(passing.status).toBe(0);
    expect(passingBundle.verification).toMatchObject({ status: "verified", passed: 1 });
    expect(passingBundle.safety.commandsExecuted).toBe(true);
    expect(readFileSync(join(passingRepo, "ai-check-ran.txt"), "utf8")).toBe("yes");

    const failingRepo = createLowRiskRepo();
    writeExecutionConfig(failingRepo, true, "node -e \"console.error('proof failed'); process.exit(1)\"");
    const failingOutput = join(failingRepo, "artifacts/failing.json");
    const failing = runPacked([
      "ai",
      "--cwd",
      failingRepo,
      "--with-checks",
      "--format",
      "json",
      "--output",
      "artifacts/failing.json"
    ]);
    const failingBundle = JSON.parse(readFileSync(failingOutput, "utf8"));

    expect(failing).toMatchObject({ status: 1, stdout: "", timedOut: false });
    expect(failingBundle.verification).toMatchObject({ status: "failed", failed: 1 });
    expect(failingBundle.tasks).toEqual(
      expect.arrayContaining([expect.objectContaining({ source: "configured-check", proof: "tool-evidence" })])
    );

    const skippedRepo = createLowRiskRepo();
    writeExecutionConfig(
      skippedRepo,
      false,
      "node -e \"require('fs').writeFileSync('ai-check-ran.txt','yes')\""
    );
    const skipped = runPacked(["ai", "--cwd", skippedRepo, "--with-checks", "--format", "json"]);
    const skippedBundle = JSON.parse(skipped.stdout);

    expect(skipped.status).toBe(0);
    expect(skippedBundle.verification).toMatchObject({ status: "unverified", skipped: 1 });
    expect(skippedBundle.safety.commandsExecuted).toBe(false);
    expect(existsSync(join(skippedRepo, "ai-check-ran.txt"))).toBe(false);

    const blockedRepo = createLowRiskRepo();
    writeExecutionConfig(blockedRepo, true, "rm -rf ./dist");
    const blockedOutput = join(blockedRepo, "artifacts/blocked.json");
    const blocked = runPacked([
      "ai",
      "--cwd",
      blockedRepo,
      "--with-checks",
      "--format",
      "json",
      "--output",
      "artifacts/blocked.json"
    ]);
    const blockedBundle = JSON.parse(readFileSync(blockedOutput, "utf8"));

    expect(blocked).toMatchObject({ status: 1, stdout: "", timedOut: false });
    expect(blockedBundle.verification).toMatchObject({ status: "blocked", blocked: 1 });
    expect(blockedBundle.safety.commandsExecuted).toBe(false);
  });

  it("writes the packed bundle before a risk gate exits non-zero", () => {
    const repo = createMediumRiskRepo();
    const outputPath = join(repo, "reports/risk-gated.json");

    const result = runPacked([
      "ai",
      "--cwd",
      repo,
      "--fail-on",
      "medium",
      "--format",
      "json",
      "--output",
      "reports/risk-gated.json"
    ]);

    expect(result).toMatchObject({ status: 1, stdout: "", timedOut: false });
    expect(JSON.parse(readFileSync(outputPath, "utf8"))).toMatchObject({
      agentProfile: { id: "codex" },
      summary: { riskLevel: "medium" }
    });
  });

  it("supports a deterministic agent repair and reports stronger final proof", () => {
    const repo = createRepo({
      "package.json": JSON.stringify({ type: "module" }),
      "src/api/users.js": "export function activeUsers(users) { return users; }\n"
    });
    writeFile(
      repo,
      "src/api/users.js",
      "export function activeUsers(users) { return users.filter((user) => user.active); }\n"
    );

    const before = runPacked(["ai", "--cwd", repo, "--format", "json"]);
    const beforeBundle = JSON.parse(before.stdout);

    expect(before.status).toBe(0);
    expect(beforeBundle.summary.missingTestFindings).toBeGreaterThan(0);
    expect(beforeBundle.tasks).toEqual(
      expect.arrayContaining([expect.objectContaining({ source: "test-proof" })])
    );

    applyDeterministicTestRepair(repo);
    const realTest = spawnSync(process.execPath, ["--test", "test/users.test.js"], {
      cwd: repo,
      encoding: "utf8",
      timeout: PACKED_CLI_PROCESS_TIMEOUT_MS
    });
    expect(realTest.status).toBe(0);

    const after = runPacked(["ai", "--cwd", repo, "--format", "json"]);
    const afterBundle = JSON.parse(after.stdout);

    expect(after.status).toBe(0);
    expect(afterBundle.summary.missingTestFindings).toBeLessThan(beforeBundle.summary.missingTestFindings);
    expect(afterBundle.evidence.testProofEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: "src/api/users.js",
          status: "referenced_only_statically",
          staticReferences: ["test/users.test.js"]
        })
      ])
    );
  });
});

function runPacked(args: string[], cwd = repoRoot) {
  const result = spawnSync(process.execPath, [packedCliPath, ...args], {
    cwd,
    encoding: "utf8",
    timeout: PACKED_CLI_PROCESS_TIMEOUT_MS
  });

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    timedOut: (result.error as NodeJS.ErrnoException | undefined)?.code === "ETIMEDOUT"
  };
}

function writeExecutionConfig(repo: string, allowCommands: boolean, testCommand: string): void {
  writeFile(
    repo,
    ".codedecay/config.yml",
    [
      "version: 1",
      "commands:",
      "  test:",
      `    - ${testCommand}`,
      "safety:",
      `  allowCommands: ${allowCommands}`,
      "  commandTimeoutMs: 5000",
      ""
    ].join("\n")
  );
}

function applyDeterministicTestRepair(repo: string): void {
  writeFile(
    repo,
    "test/users.test.js",
    [
      "import assert from \"node:assert/strict\";",
      "import test from \"node:test\";",
      "import { activeUsers } from \"../src/api/users.js\";",
      "",
      "test(\"returns only active users\", () => {",
      "  const users = [{ id: 1, active: true }, { id: 2, active: false }];",
      "  assert.deepEqual(activeUsers(users), [{ id: 1, active: true }]);",
      "});",
      ""
    ].join("\n")
  );
}

function findPackedFilename(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return value.map(findPackedFilename).find((filename) => filename !== undefined);
  }
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.filename === "string") {
    return record.filename;
  }
  return Object.values(record).map(findPackedFilename).find((filename) => filename !== undefined);
}
