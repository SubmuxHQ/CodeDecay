import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getGitChangedFiles } from "@submuxhq/codedecay-git";
import { runCodeDecayLoop, type LoopCheckSnapshot, type LoopRedteamReport } from "../src/index";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("CodeDecay loop controller", () => {
  it("reports merge-safe when risk is low, weak tests are gone, and checks pass", async () => {
    const repo = createRepo();
    const report = await runCodeDecayLoop({
      ...baseInput(repo),
      createRedteamReport: async () => redteamReport({ riskLevel: "low", mergeRiskScore: 10, weakTestFindings: 0 }),
      runConfiguredChecks: async () => checkSnapshot("passed", true)
    });

    expect(report.status).toBe("merge-safe");
    expect(report.roundsRun).toBe(1);
    expect(report.safety.commandsExecuted).toBe(true);
  });

  it("runs plan-only without an agent command", async () => {
    const repo = createRepo();
    const renderAgentBundle = vi.fn(() => "agent bundle");
    const report = await runCodeDecayLoop({
      ...baseInput(repo),
      renderAgentBundle,
      createRedteamReport: async () => redteamReport({ riskLevel: "high", mergeRiskScore: 90, weakTestFindings: 1 }),
      runConfiguredChecks: async () => checkSnapshot("passed", true)
    });

    expect(report.status).toBe("plan-only");
    expect(report.rounds[0]?.planOnlyBundle).toBe("agent bundle");
    expect(report.rounds[0]?.agent).toBeUndefined();
    expect(report.safety.commandsExecuted).toBe(true);
    expect(renderAgentBundle).toHaveBeenCalledTimes(1);
  });

  it("stops as stuck when the agent makes no file changes twice", async () => {
    const repo = createRepo();
    const report = await runCodeDecayLoop({
      ...baseInput(repo),
      maxRounds: 3,
      agentCommand: "node -e \"process.stdin.resume()\"",
      createRedteamReport: async () => redteamReport({ riskLevel: "high", mergeRiskScore: 90, weakTestFindings: 1 }),
      runConfiguredChecks: async () => checkSnapshot("passed", true)
    });

    expect(report.status).toBe("stuck");
    expect(report.rounds.filter((round) => round.agent).length).toBe(2);
    expect(report.rounds.every((round) => round.agent?.madeChanges === false)).toBe(true);
  });

  it("reports unverified instead of merge-safe when no checks are configured", async () => {
    const repo = createRepo();
    const report = await runCodeDecayLoop({
      ...baseInput(repo),
      createRedteamReport: async () => redteamReport({ riskLevel: "low", mergeRiskScore: 10, weakTestFindings: 0 }),
      runConfiguredChecks: async () => checkSnapshot("not-configured", false)
    });

    expect(report.status).toBe("unverified");
    expect(report.finalCheckStatus).toBe("not-configured");
  });

  it("stops as needs-human when max rounds are reached without safety", async () => {
    const repo = createRepo();
    const report = await runCodeDecayLoop({
      ...baseInput(repo),
      maxRounds: 2,
      agentCommand: "node -e \"require('fs').appendFileSync('agent.txt', 'x')\"",
      createRedteamReport: async () => redteamReport({ riskLevel: "high", mergeRiskScore: 90, weakTestFindings: 1 }),
      runConfiguredChecks: async () => checkSnapshot("passed", true)
    });

    expect(report.status).toBe("needs-human");
    expect(report.roundsRun).toBe(2);
    expect(report.rounds.filter((round) => round.agent).length).toBe(2);
  });

  it("refuses agent execution when command safety disallows commands", async () => {
    const repo = createRepo();
    const report = await runCodeDecayLoop({
      ...baseInput(repo),
      agentCommand: "node -e \"require('fs').writeFileSync('agent-ran.txt', 'yes')\"",
      commandSafety: { allowCommands: false },
      createRedteamReport: async () => redteamReport({ riskLevel: "high", mergeRiskScore: 90, weakTestFindings: 1 }),
      runConfiguredChecks: async () => checkSnapshot("passed", true)
    });

    expect(report.status).toBe("agent-error");
    expect(report.rounds[0]?.agent).toMatchObject({
      status: "skipped",
      madeChanges: false
    });
    expect(getGitChangedFiles({ cwd: repo }).map((change) => change.path)).not.toContain("agent-ran.txt");
  });
});

function baseInput(repo: string) {
  return {
    cwd: repo,
    agentTimeoutMs: 1000,
    commandSafety: { allowCommands: true },
    renderAgentBundle: () => "agent bundle",
    getChangedFiles: () => getGitChangedFiles({ cwd: repo }),
    now: () => new Date("2026-06-30T00:00:00.000Z")
  };
}

function redteamReport(input: {
  riskLevel: LoopRedteamReport["summary"]["riskLevel"];
  mergeRiskScore: number;
  weakTestFindings: number;
}): LoopRedteamReport {
  return {
    version: "0.3.3",
    summary: {
      riskLevel: input.riskLevel,
      mergeRiskScore: input.mergeRiskScore,
      weakTestFindings: input.weakTestFindings,
      fixTasks: input.riskLevel === "low" && input.weakTestFindings === 0 ? 0 : 1
    },
    fixTasks: input.riskLevel === "low" && input.weakTestFindings === 0
      ? []
      : [{
          title: "Fix risky change",
          priority: "high",
          source: "finding",
          detail: "Fix the risky changed path."
        }],
    safety: {
      commandsExecuted: false,
      llmCalled: false,
      telemetrySent: false,
      cloudDependency: false
    }
  };
}

function checkSnapshot(status: LoopCheckSnapshot["status"], configured: boolean): LoopCheckSnapshot {
  return {
    configured,
    status,
    total: configured ? 1 : 0,
    passed: status === "passed" ? 1 : 0,
    failed: status === "failed" ? 1 : 0,
    skipped: status === "skipped" ? 1 : 0,
    timedOut: status === "timed_out" ? 1 : 0,
    errors: status === "error" ? 1 : 0,
    durationMs: 0
  };
}

function createRepo(): string {
  const repo = join(tmpdir(), `codedecay-loop-${Math.random().toString(16).slice(2)}`);
  mkdirSync(repo, { recursive: true });
  tempRoots.push(repo);
  git(repo, ["init", "-b", "main"]);
  git(repo, ["config", "user.email", "codedecay@example.com"]);
  git(repo, ["config", "user.name", "CodeDecay Test"]);
  writeFile(repo, "README.md", "# Loop fixture\n");
  git(repo, ["add", "."]);
  git(repo, ["commit", "-m", "initial"]);
  return repo;
}

function writeFile(root: string, path: string, contents: string): void {
  const fullPath = join(root, path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, contents, "utf8");
}

function git(repo: string, args: string[]): void {
  execFileSync("git", ["-C", repo, ...args], {
    stdio: "ignore"
  });
}
