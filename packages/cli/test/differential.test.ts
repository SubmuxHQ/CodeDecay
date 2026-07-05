import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createDifferentialRepo, createLowRiskRepo, createRepo, createTempDir, git, gitOutput, run, writeFile } from "./helpers";

describe("codedecay differential CLI contract", () => {
  it("reports changed structured probe output between base and head", async () => {
    const { repo, base, head } = createDifferentialRepo({ headValue: "head", allowCommands: true });

    const result = await run(["differential", "--base", base, "--head", head, "--format", "json"], repo);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(1);
    expect(report.summary).toMatchObject({
      status: "changed",
      total: 1,
      changed: 1
    });
    expect(report.results[0]).toMatchObject({
      status: "changed",
      differences: ['structured stdout changed at value: "base" -> "head"'],
      rerunCommand: `npx codedecay differential --base ${base} --head ${head} --format markdown`,
      base: {
        status: "passed",
        structuredOutput: { value: "base" }
      },
      head: {
        status: "passed",
        structuredOutput: { value: "head" }
      }
    });
    expect(report.results[0].artifacts.directory).toContain(".codedecay/local/differential/");
    expect(existsSync(join(repo, report.results[0].artifacts.baseResult))).toBe(true);
    expect(existsSync(join(repo, report.results[0].artifacts.headResult))).toBe(true);
    expect(gitOutput(repo, ["worktree", "list", "--porcelain"])).not.toContain("codedecay-base-");
    expect(gitOutput(repo, ["worktree", "list", "--porcelain"])).not.toContain("codedecay-head-");
  });

  it("reports changed HTTP-style JSON status, body, and schema fields", async () => {
    const { repo, base, head } = createHttpProbeDifferentialRepo();

    const result = await run(["differential", "--base", base, "--head", head, "--format", "json"], repo);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(1);
    expect(report.results[0]).toMatchObject({
      status: "changed",
      differences: [
        "structured stdout changed at body.ok: true -> false",
        'structured stdout changed at schema.fields: ["id"] -> ["id","error"]',
        "structured stdout changed at status: 200 -> 500"
      ]
    });
  });

  it("reports changed CLI probe exit code between base and head", async () => {
    const { repo, base, head } = createExitCodeDifferentialRepo();

    const result = await run(["differential", "--base", base, "--head", head, "--format", "json"], repo);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(1);
    expect(report.results[0]).toMatchObject({
      status: "changed",
      differences: ["status changed from passed to failed", "exit code changed from 0 to 2"],
      base: {
        status: "passed",
        exitCode: 0
      },
      head: {
        status: "failed",
        exitCode: 2
      }
    });
  });

  it("passes when configured probes behave the same on base and head", async () => {
    const { repo, base, head } = createDifferentialRepo({ headValue: "base", allowCommands: true });

    const result = await run(["differential", "--base", base, "--head", head, "--format", "markdown"], repo);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("## CodeDecay Differential Report");
    expect(result.stdout).toContain("**Overall status:** Passed");
  });

  it("skips differential probes when command execution is disabled", async () => {
    const { repo, base, head } = createDifferentialRepo({ headValue: "head", allowCommands: false });

    const result = await run(["differential", "--base", base, "--head", head, "--format", "json"], repo);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(report.summary.status).toBe("skipped");
    expect(report.results[0].status).toBe("skipped");
  });

  it("writes differential reports to relative --output paths from --cwd", async () => {
    const { repo, base, head } = createDifferentialRepo({ headValue: "base", allowCommands: true });
    const outsideCwd = createTempDir();

    const result = await run(
      ["differential", "--cwd", repo, "--base", base, "--head", head, "--format", "json", "--output", "codedecay-diff.json"],
      outsideCwd
    );

    const outputPath = join(repo, "codedecay-diff.json");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
    expect(JSON.parse(readFileSync(outputPath, "utf8")).summary.status).toBe("passed");
  });

  it("fails clearly when differential refs are missing", async () => {
    const repo = createLowRiskRepo();

    const result = await run(["differential", "--format", "json"], repo);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("codedecay differential requires --base <ref> and --head <ref>.");
  });

  it("fails clearly when differential refs are invalid", async () => {
    const repo = createLowRiskRepo();

    const result = await run(["differential", "--base", "missing-ref", "--head", "HEAD", "--format", "json"], repo);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain('Could not resolve git ref "missing-ref".');
  });
});

function createHttpProbeDifferentialRepo(): { repo: string; base: string; head: string } {
  const repo = createRepo({
    "probe.js": "console.log(require('fs').readFileSync('response.json', 'utf8'));\n",
    "response.json": `${JSON.stringify({ status: 200, body: { ok: true }, schema: { fields: ["id"] } })}\n`,
    ".codedecay/config.yml": differentialProbeConfig(true)
  });
  const base = gitOutput(repo, ["rev-parse", "HEAD"]).trim();

  writeFile(repo, "response.json", `${JSON.stringify({ status: 500, body: { ok: false }, schema: { fields: ["id", "error"] } })}\n`);
  git(repo, ["add", "."]);
  git(repo, ["commit", "-m", "change response"]);
  const head = gitOutput(repo, ["rev-parse", "HEAD"]).trim();

  return { repo, base, head };
}

function createExitCodeDifferentialRepo(): { repo: string; base: string; head: string } {
  const repo = createRepo({
    "probe.js": "process.exit(Number(require('fs').readFileSync('exit-code.txt', 'utf8').trim()));\n",
    "exit-code.txt": "0\n",
    ".codedecay/config.yml": differentialProbeConfig(true)
  });
  const base = gitOutput(repo, ["rev-parse", "HEAD"]).trim();

  writeFile(repo, "exit-code.txt", "2\n");
  git(repo, ["add", "."]);
  git(repo, ["commit", "-m", "change exit code"]);
  const head = gitOutput(repo, ["rev-parse", "HEAD"]).trim();

  return { repo, base, head };
}

function differentialProbeConfig(allowCommands: boolean): string {
  return [
    "version: 1",
    "commands: {}",
    "probes:",
    "  - name: value probe",
    "    command: node probe.js",
    "    timeoutMs: 1000",
    "safety:",
    "  commandTimeoutMs: 1000",
    `  allowCommands: ${allowCommands}`,
    ""
  ].join("\n");
}
