import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createRepo,
  createHighRiskRepo,
  createLowRiskRepo,
  createTempDir,
  run,
  writeExecutionConfig,
  writeFile
} from "./helpers";

describe("codedecay loop CLI contract", () => {
  it("reports merge-safe-shallow with low risk and passing configured checks when depth evidence is missing", async () => {
    const repo = createLowRiskRepoWithPassingCheck();

    const result = await run(["loop", "--format", "json"], repo);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(report.status).toBe("merge-safe-shallow");
    expect(report.roundsRun).toBe(1);
    expect(report.finalCheckStatus).toBe("passed");
    expect(report.verdict.missingDepth).toEqual(
      expect.arrayContaining(["no Semgrep adapter configured", "no coverage adapter configured", "no mutation adapter configured"])
    );
    expect(report.safety.commandsExecuted).toBe(true);
  });

  it("carries Semgrep, coverage, and mutation evidence into a merge-safe-verified verdict", async () => {
    const repo = createLowRiskRepoWithVerifiedChecks();

    const result = await run(["loop", "--format", "json"], repo);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(report.status).toBe("merge-safe-verified");
    expect(report.rounds[0].checkStatus).toBe("passed");
    expect(report.verdict.verifiedBy).toEqual(
      expect.arrayContaining(["Semgrep (0 findings)", "coverage evidence (100%)", "mutation evidence (100%)"])
    );
    expect(report.verdict.missingDepth).toEqual([]);
  });

  it("runs plan-only without an agent command and writes output relative to --cwd", async () => {
    const repo = createHighRiskRepo();
    const outside = createTempDir();

    const result = await run(["loop", "--cwd", repo, "--format", "json", "--output", "codedecay-loop.json"], outside);
    const outputPath = join(repo, "codedecay-loop.json");
    const report = JSON.parse(readFileSync(outputPath, "utf8"));

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
    expect(report.status).toBe("plan-only");
    expect(report.rounds[0].planOnlyBundle).toContain("CodeDecay Agent Task Bundle");
    expect(report.safety.commandsExecuted).toBe(false);
  });

  it("reports unverified instead of merge-safe when no checks are configured", async () => {
    const repo = createLowRiskRepo();

    const result = await run(["loop", "--format", "json"], repo);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(1);
    expect(report.status).toBe("unverified");
    expect(report.finalCheckStatus).toBe("not-configured");
  });

  it("returns agent-error when safety blocks the configured agent command", async () => {
    const repo = createHighRiskRepo();
    writeExecutionConfig(repo, {
      allowCommands: false,
      testCommand: "node -e \"process.exit(0)\""
    });

    const result = await run([
      "loop",
      "--format",
      "json",
      "--agent-cmd",
      "node -e \"require('fs').writeFileSync('agent-ran.txt','yes')\""
    ], repo);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(1);
    expect(report.status).toBe("agent-error");
    expect(report.rounds[0].agent.status).toBe("skipped");
    expect(existsSync(join(repo, "agent-ran.txt"))).toBe(false);
  });

  it("returns needs-human after max rounds when risk does not drop", async () => {
    const repo = createHighRiskRepo();
    writeExecutionConfig(repo, {
      allowCommands: true,
      testCommand: "node -e \"process.exit(0)\""
    });
    writeFile(repo, "scripts/agent.mjs", "import { appendFileSync } from 'node:fs';\nappendFileSync('agent.txt', 'x');\n");

    const result = await run([
      "loop",
      "--format",
      "json",
      "--max-rounds",
      "2",
      "--agent-cmd",
      "node scripts/agent.mjs"
    ], repo);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(1);
    expect(report.status).toBe("needs-human");
    expect(report.roundsRun).toBe(2);
    expect(report.rounds.filter((round: { agent?: unknown }) => round.agent).length).toBe(2);
    expect(readFileSync(join(repo, "agent.txt"), "utf8")).toBe("xx");
  });

  it("renders markdown by default", async () => {
    const repo = createLowRiskRepoWithPassingCheck();

    const result = await run(["loop"], repo);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("## CodeDecay Loop Report");
    expect(result.stdout).toContain("**Status:** merge safe shallow");
    expect(result.stdout).toContain("### Verdict Evidence");
  });
});

function createLowRiskRepoWithPassingCheck(): string {
  const repo = createRepo({
    "README.md": "# Project\n",
    ".codedecay/config.yml": [
      "version: 1",
      "commands:",
      "  test:",
      "    - node -e \"process.exit(0)\"",
      "safety:",
      "  commandTimeoutMs: 1000",
      "  allowCommands: true",
      ""
    ].join("\n")
  });
  writeFile(repo, "README.md", "# Project\nDocs change.\n");
  return repo;
}

function createLowRiskRepoWithVerifiedChecks(): string {
  const repo = createRepo({
    "README.md": "# Project\n",
    ".codedecay/config.yml": [
      "version: 1",
      "commands:",
      "  test:",
      "    - node -e \"process.exit(0)\"",
      "toolAdapters:",
      "  semgrep:",
      "    command: node semgrep-pass.js",
      "    reportPath: reports/semgrep.json",
      "  coverage:",
      "    reportPaths:",
      "      - coverage/coverage-final.json",
      "    failOn: none",
      "  stryker:",
      "    command: node stryker-pass.js",
      "    reportPath: reports/mutation/mutation.json",
      "safety:",
      "  commandTimeoutMs: 1000",
      "  allowCommands: true",
      ""
    ].join("\n"),
    "semgrep-pass.js": "console.log('semgrep done');\n",
    "stryker-pass.js": "console.log('stryker done');\n",
    "reports/semgrep.json": JSON.stringify({ results: [] }, null, 2),
    "coverage/coverage-final.json": JSON.stringify({ "src/index.ts": { l: { "1": 1, "2": 1 } } }, null, 2),
    "reports/mutation/mutation.json": JSON.stringify({
      thresholds: { mutationScore: 100 },
      files: {
        "src/index.ts": {
          mutants: [{ id: "1", status: "Killed", mutatorName: "StringLiteral" }]
        }
      }
    }, null, 2)
  });
  writeFile(repo, "README.md", "# Project\nDocs change.\n");
  return repo;
}
