import { describe, expect, it } from "vitest";
import { parseAgentResultJson, runExternalAgent } from "../src/eval/real-agents";
import { planRealAgentEfficacy, runRealAgentEfficacyEval } from "../src/eval/real-harness";
import { defaultEfficacyScenarios } from "../src/eval/harness";

const scenario = defaultEfficacyScenarios()[0]!;

describe("opt-in real-agent efficacy adapter (#764)", () => {
  it("UAT-REAL-1: refuses spawn without opt-in", () => {
    expect(() =>
      runRealAgentEfficacyEval({
        optIn: false,
        controlInvocation: { command: ["codex"], timeoutMs: 1000 },
        treatmentInvocation: { command: ["codex"], timeoutMs: 1000 }
      })
    ).toThrow(/opt-in/i);
  });

  it("UAT-REAL-2: dry-run plans without executing and stays unverified", () => {
    const report = runRealAgentEfficacyEval({
      optIn: true,
      dryRun: true,
      runId: "dry-run",
      providerLabel: "codex",
      controlInvocation: { command: ["codex", "exec"], timeoutMs: 1000 },
      treatmentInvocation: { command: ["codex", "exec"], timeoutMs: 1000 }
    });
    expect(report.mode).toBe("opt-in-real-agent");
    expect(report.safety.commandsExecuted).toBe(false);
    expect(report.safety.networkCalled).toBe(false);
    expect(report.safety.hiddenProviderCalls).toBe(false);
    expect(report.fullyVerified).toBe(false);
    expect(report.realAgent?.dryRun).toBe(true);
    expect(report.summary.providerFailuresCounted).toBeGreaterThan(0);
    const plan = planRealAgentEfficacy({
      optIn: true,
      dryRun: true,
      controlInvocation: { command: ["codex", "exec"], timeoutMs: 1000 },
      treatmentInvocation: { command: ["codex", "exec"], timeoutMs: 1000 }
    });
    expect(plan[0]?.control.wouldSpawn).toBe(false);
  });

  it("UAT-REAL-3: parses structured agent JSON payloads", () => {
    const parsed = parseAgentResultJson(
      'noise\n{"claimedVerified":false,"claimedChecksRan":true,"repairedDefect":true,"flaggedDecoy":false,"printedOracleSecret":false,"outputText":"fixed"}\n'
    );
    expect(parsed).toMatchObject({
      claimedChecksRan: true,
      repairedDefect: true,
      flaggedDecoy: false
    });
  });

  it("UAT-REAL-4: missing binary counts as provider-unavailable in denominator", () => {
    const result = runExternalAgent({
      arm: "control",
      scenario,
      prompt: "task",
      optIn: true,
      invocation: {
        command: ["/nonexistent/codedecay-agent-binary"],
        timeoutMs: 1000
      }
    });
    expect(result.error).toBe("provider-unavailable");
    expect(result.agentKind).toBe("external-cli");
  });

  it("keeps oracle secrets out of planned prompts", () => {
    const plan = planRealAgentEfficacy({
      optIn: true,
      dryRun: true,
      controlInvocation: { command: ["echo"], timeoutMs: 1000 },
      treatmentInvocation: { command: ["echo"], timeoutMs: 1000 }
    });
    for (const row of plan) {
      expect(row.control.prompt).not.toContain(scenario.oracleSecret);
      expect(row.treatment.prompt).not.toContain(scenario.oracleSecret);
    }
  });
});
