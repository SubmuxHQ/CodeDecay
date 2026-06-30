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
  it("reports merge-safe with low risk and passing configured checks", async () => {
    const repo = createLowRiskRepoWithPassingCheck();

    const result = await run(["loop", "--format", "json"], repo);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(report.status).toBe("merge-safe");
    expect(report.roundsRun).toBe(1);
    expect(report.finalCheckStatus).toBe("passed");
    expect(report.safety.commandsExecuted).toBe(true);
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
    expect(result.stdout).toContain("**Status:** merge safe");
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
