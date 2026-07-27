import { describe, expect, it, vi } from "vitest";
import {
  runCodeDecayLoop,
  type LoopCheckSnapshot,
  type LoopRedteamReport
} from "../src/index";

describe("closed-loop progress evidence", () => {
  it("keeps running for decay, security, product-failure, and check improvements", async () => {
    const reports = [
      report(80, 60, 3),
      report(70, 60, 3),
      report(70, 50, 3),
      report(70, 50, 2)
    ];
    const checks = [check("failed"), check("failed"), check("failed"), check("passed")];
    const createRedteamReport = vi.fn(async () => reports.shift()!);
    const runConfiguredChecks = vi.fn(async () => checks.shift()!);
    let fingerprint = 0;
    const result = await runCodeDecayLoop({
      cwd: process.cwd(),
      maxRounds: 3,
      agentCommand: "node -e \"process.stdin.resume()\"",
      agentTimeoutMs: 1000,
      commandSafety: { allowCommands: true },
      createRedteamReport,
      runConfiguredChecks,
      renderAgentBundle: () => "agent bundle",
      getChangedFiles: () => [{
        path: "agent.txt",
        status: "modified",
        additions: fingerprint++,
        deletions: 0,
        addedLines: []
      }]
    });

    expect(result.status).toBe("needs-human");
    expect(result.rounds.filter((round) => round.agent)).toHaveLength(3);
    expect(result.rounds[1]?.riskReducedFromPreviousRound).toBe(true);
    expect(result.rounds[2]?.riskReducedFromPreviousRound).toBe(true);
    expect(result.rounds[2]?.postAgentVerification).toMatchObject({
      productFailureBundles: 2,
      checkStatus: "passed"
    });
    expect([createRedteamReport.mock.calls.length, runConfiguredChecks.mock.calls.length]).toEqual([4, 4]);
  });
});

function report(decayScore: number, securityScore: number, productFailureBundles: number): LoopRedteamReport {
  return {
    version: "0.3.5",
    summary: {
      riskLevel: "high",
      mergeRiskScore: 90,
      decayScore,
      securityScore,
      weakTestFindings: 4,
      productFailureBundles,
      fixTasks: 1
    },
    analysis: { findings: [] },
    fixTasks: [{ title: "Fix risk", priority: "high", source: "finding", detail: "Fix it." }],
    safety: { commandsExecuted: false, llmCalled: false, telemetrySent: false, cloudDependency: false }
  };
}

function check(status: LoopCheckSnapshot["status"]): LoopCheckSnapshot {
  return {
    configured: true,
    status,
    total: 1,
    passed: status === "passed" ? 1 : 0,
    failed: status === "failed" ? 1 : 0,
    skipped: 0,
    timedOut: 0,
    errors: 0,
    durationMs: 0,
    semgrep: { configured: false, ran: false, status: "not-configured", findingCount: 0, highFindingCount: 0 },
    coverage: { configured: false, present: false, status: "not-configured" },
    mutation: { configured: false, present: false, status: "not-configured" }
  };
}
