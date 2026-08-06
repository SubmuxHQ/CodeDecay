import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getGitChangedFiles } from "@submuxhq/codedecay-git";
import {
  classifySafeStatus,
  renderLoopMarkdown,
  runCodeDecayLoop,
  type LoopCheckSnapshot,
  type LoopRedteamReport
} from "../src/index";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("CodeDecay loop controller", () => {
  it("reports shallow-proof when gates pass but depth evidence is missing", async () => {
    const repo = createRepo();
    const report = await runCodeDecayLoop({
      ...baseInput(repo),
      createRedteamReport: async () => redteamReport({ riskLevel: "low", mergeRiskScore: 10, weakTestFindings: 0 }),
      runConfiguredChecks: async () => checkSnapshot("passed", true)
    });

    expect(report.status).toBe("shallow-proof");
    expect(report.roundsRun).toBe(1);
    expect(report.safety.commandsExecuted).toBe(true);
    expect(report.verdict.missingDepth).toEqual(
      expect.arrayContaining(["no Semgrep adapter configured", "no coverage adapter configured", "no mutation adapter configured"])
    );
  });

  it("reports verified when security, coverage, mutation, and configured checks pass", async () => {
    const repo = createRepo();
    const report = await runCodeDecayLoop({
      ...baseInput(repo),
      createRedteamReport: async () =>
        redteamReport({
          riskLevel: "low",
          mergeRiskScore: 10,
          weakTestFindings: 0,
          securityAnalysis: { scannedFiles: ["src/index.ts"], candidateCount: 0 }
        }),
      runConfiguredChecks: async () => verifiedCheckSnapshot()
    });

    expect(report.status).toBe("verified");
    expect(report.verdict.verifiedBy).toEqual(
      expect.arrayContaining(["Semgrep (0 findings)", "coverage evidence (100%)", "mutation evidence (100%)"])
    );
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

  it("does not invoke the agent when only untrusted memory context remains", async () => {
    const repo = createRepo();
    const report = await runCodeDecayLoop({
      ...baseInput(repo),
      agentCommand: "node -e \"require('fs').writeFileSync('agent-ran.txt', 'yes')\"",
      createRedteamReport: async () =>
        redteamReport({
          riskLevel: "low",
          mergeRiskScore: 0,
          weakTestFindings: 0,
          findings: [
            {
              ruleId: "memory-invariant-impacted",
              title: "Project invariant may be impacted",
              severity: "high",
              category: "regression",
              file: "src/index.ts"
            }
          ]
        }),
      runConfiguredChecks: async () => checkSnapshot("passed", true)
    });

    expect(report.status).toBe("shallow-proof");
    expect(report.verdict.highFindingCount).toBe(0);
    expect(report.rounds[0]?.agent).toBeUndefined();
    expect(existsSync(join(repo, "agent-ran.txt"))).toBe(false);
  });

  it("stops as budget-exhausted when max rounds are reached without safety", async () => {
    const repo = createRepo();
    const report = await runCodeDecayLoop({
      ...baseInput(repo),
      maxRounds: 2,
      agentCommand: "node -e \"require('fs').appendFileSync('agent.txt', 'x')\"",
      createRedteamReport: async () => redteamReport({ riskLevel: "high", mergeRiskScore: 90, weakTestFindings: 1 }),
      runConfiguredChecks: async () => checkSnapshot("passed", true)
    });

    expect(report.status).toBe("budget-exhausted");
    expect(report.roundsRun).toBe(2);
    expect(report.rounds.filter((round) => round.agent).length).toBe(2);
  });

  it("revalidates a final improving agent edit without invoking the agent again", async () => {
    const repo = createRepo();
    const createRedteamReport = vi.fn()
      .mockResolvedValueOnce(redteamReport({ riskLevel: "high", mergeRiskScore: 90, weakTestFindings: 1 }))
      .mockResolvedValueOnce(redteamReport({ riskLevel: "low", mergeRiskScore: 10, weakTestFindings: 0 }));
    const runConfiguredChecks = vi.fn()
      .mockResolvedValueOnce(checkSnapshot("failed", true))
      .mockResolvedValueOnce(checkSnapshot("passed", true));
    const report = await runCodeDecayLoop({
      ...baseInput(repo),
      maxRounds: 1,
      agentCommand: "node -e \"require('fs').writeFileSync('agent.txt', 'fixed')\"",
      createRedteamReport,
      runConfiguredChecks
    });
    expect(report.status).toBe("shallow-proof");
    expect(report.roundsRun).toBe(1);
    expect(report.rounds.filter((round) => round.agent).length).toBe(1);
    expect(report.rounds[0]?.postAgentVerification).toMatchObject({
      mergeRiskScore: 10,
      weakTestFindings: 0,
      checkStatus: "passed"
    });
    expect(report).toMatchObject({
      finalMergeRiskScore: 10,
      finalWeakTestFindings: 0,
      finalCheckStatus: "passed"
    });
    expect([createRedteamReport.mock.calls.length, runConfiguredChecks.mock.calls.length]).toEqual([2, 2]);
    expect(renderLoopMarkdown(report)).toContain(
      "Post-agent verification: low risk, merge 10/100, checks passed."
    );
  });

  it("keeps agent edits untrusted until post-edit requirement evidence verifies them", async () => {
    const repo = createRepo();
    const createRedteamReport = vi.fn()
      .mockResolvedValueOnce(redteamReport({
        riskLevel: "high",
        mergeRiskScore: 90,
        weakTestFindings: 1,
        requirementStatus: "proof-missing"
      }))
      .mockResolvedValueOnce(redteamReport({
        riskLevel: "low",
        mergeRiskScore: 10,
        weakTestFindings: 0,
        requirementStatus: "verified"
      }));
    const report = await runCodeDecayLoop({
      ...baseInput(repo),
      maxRounds: 1,
      agentCommand: "node -e \"require('fs').mkdirSync('src',{recursive:true}); require('fs').writeFileSync('src/users.ts','fixed')\"",
      createRedteamReport,
      runConfiguredChecks: async () => checkSnapshot("passed", true)
    });

    expect(report.rounds[0]?.agentRequirementEdits).toEqual([
      { file: "src/users.ts", requirementIds: ["AC-USERS"], trusted: false }
    ]);
    expect(report.rounds[0]?.postAgentVerification?.requirementStatuses).toEqual([
      { requirementId: "AC-USERS", status: "verified" }
    ]);
    expect(report.requirementTrace?.criteria[0]?.status).toBe("verified");
  });

  it("reports a worsening final edit and its failed post-edit checks as current evidence", async () => {
    const repo = createRepo();
    const createRedteamReport = vi.fn()
      .mockResolvedValueOnce(redteamReport({ riskLevel: "high", mergeRiskScore: 70, weakTestFindings: 1 }))
      .mockResolvedValueOnce(redteamReport({
        riskLevel: "high",
        mergeRiskScore: 96,
        decayScore: 85,
        securityScore: 45,
        weakTestFindings: 2,
        productFailureBundles: 2
      }));
    const runConfiguredChecks = vi.fn()
      .mockResolvedValueOnce(checkSnapshot("passed", true))
      .mockResolvedValueOnce(checkSnapshot("failed", true));
    const report = await runCodeDecayLoop({
      ...baseInput(repo),
      maxRounds: 1,
      agentCommand: "node -e \"require('fs').writeFileSync('agent.txt', 'worse')\"",
      createRedteamReport,
      runConfiguredChecks
    });
    expect(report.status).toBe("budget-exhausted");
    expect(report.rounds[0]?.agent).toMatchObject({ status: "passed", madeChanges: true });
    expect(report.rounds[0]?.postAgentVerification).toMatchObject({
      mergeRiskScore: 96,
      decayScore: 85,
      securityScore: 45,
      weakTestFindings: 2,
      productFailureBundles: 2,
      checkStatus: "failed"
    });
    expect(report).toMatchObject({
      finalMergeRiskScore: 96,
      finalDecayScore: 85,
      finalSecurityScore: 45,
      finalWeakTestFindings: 2,
      finalProductFailureBundles: 2,
      finalCheckStatus: "failed"
    });
    expect([createRedteamReport.mock.calls.length, runConfiguredChecks.mock.calls.length]).toEqual([2, 2]);
  });

  it("keeps builder-error after revalidating files left by a failed builder", async () => {
    const repo = createRepo();
    const createRedteamReport = vi.fn()
      .mockResolvedValueOnce(redteamReport({ riskLevel: "high", mergeRiskScore: 90, weakTestFindings: 1 }))
      .mockResolvedValueOnce(redteamReport({ riskLevel: "low", mergeRiskScore: 10, weakTestFindings: 0 }));
    const runConfiguredChecks = vi.fn().mockResolvedValue(checkSnapshot("passed", true));
    const report = await runCodeDecayLoop({
      ...baseInput(repo),
      maxRounds: 1,
      agentCommand: "node -e \"require('fs').writeFileSync('partial.txt', 'edit'); process.exit(1)\"",
      createRedteamReport,
      runConfiguredChecks
    });
    expect(report.status).toBe("builder-error");
    expect(report.rounds[0]?.agent).toMatchObject({ status: "failed", madeChanges: true });
    expect(report.rounds[0]?.postAgentVerification).toMatchObject({
      mergeRiskScore: 10,
      checkStatus: "passed"
    });
    expect(report.finalMergeRiskScore).toBe(10);
    expect([createRedteamReport.mock.calls.length, runConfiguredChecks.mock.calls.length]).toEqual([2, 2]);
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

    expect(report.status).toBe("builder-error");
    expect(report.rounds[0]?.agent).toMatchObject({
      status: "skipped",
      madeChanges: false
    });
    expect(getGitChangedFiles({ cwd: repo }).map((change) => change.path)).not.toContain("agent-ran.txt");
  });

  it("records separate builder and verifier roles without letting verifier output prove criteria", async () => {
    const repo = createRepo();
    const report = await runCodeDecayLoop({
      ...baseInput(repo),
      maxRounds: 1,
      builderCommand: "node -e \"require('fs').writeFileSync('agent.txt', 'fixed')\"",
      verifierCommand: "node -e \"console.log('challenge: missing API proof')\"",
      builderIdentity: "codex-builder",
      verifierIdentity: "codex-verifier",
      createRedteamReport: async () => redteamReport({ riskLevel: "high", mergeRiskScore: 90, weakTestFindings: 1 }),
      runConfiguredChecks: async () => checkSnapshot("passed", true)
    });

    expect(report.roles).toEqual([
      expect.objectContaining({ role: "builder", id: "codex-builder", canEdit: true, canVerifyCriteria: false }),
      expect.objectContaining({ role: "verifier", id: "codex-verifier", canEdit: false, canVerifyCriteria: false })
    ]);
    expect(report.status).toBe("budget-exhausted");
    expect(report.rounds[0]?.builder).toMatchObject({ role: "builder", identity: "codex-builder", madeChanges: true });
    expect(report.rounds[0]?.verifier).toMatchObject({ role: "verifier", identity: "codex-verifier", madeChanges: false });
    expect(report.stateMachine).toMatchObject({
      schemaVersion: 1,
      phase: "terminal-verdict"
    });
  });

  it("stops as unsafe-change when the verifier edits files", async () => {
    const repo = createRepo();
    const report = await runCodeDecayLoop({
      ...baseInput(repo),
      maxRounds: 1,
      builderCommand: "node -e \"require('fs').writeFileSync('agent.txt', 'fixed')\"",
      verifierCommand: "node -e \"require('fs').writeFileSync('verifier-edit.txt', 'bad')\"",
      createRedteamReport: async () => redteamReport({ riskLevel: "high", mergeRiskScore: 90, weakTestFindings: 1 }),
      runConfiguredChecks: async () => checkSnapshot("passed", true)
    });

    expect(report.status).toBe("unsafe-change");
    expect(report.rounds[0]?.verifier).toMatchObject({
      role: "verifier",
      madeChanges: true,
      changedFiles: ["verifier-edit.txt"]
    });
    expect(report.nextSteps).toContain("A read-only verifier or protected role changed files.");
  });

  it("UAT-LOOP-1/2: verifier finds planted API miss, builder repairs, final tree reaches verified", async () => {
    const repo = createRepo();
    let builderCalls = 0;
    const createRedteamReport = vi.fn()
      .mockResolvedValueOnce(redteamReport({
        riskLevel: "high",
        mergeRiskScore: 80,
        weakTestFindings: 0,
        requirementStatus: "proof-missing"
      }))
      .mockResolvedValueOnce(redteamReport({
        riskLevel: "high",
        mergeRiskScore: 70,
        weakTestFindings: 0,
        requirementStatus: "proof-missing"
      }))
      .mockResolvedValueOnce(redteamReport({
        riskLevel: "low",
        mergeRiskScore: 5,
        weakTestFindings: 0,
        requirementStatus: "verified",
        securityAnalysis: { scannedFiles: ["src/users.ts"], candidateCount: 0 }
      }))
      .mockResolvedValue(redteamReport({
        riskLevel: "low",
        mergeRiskScore: 5,
        weakTestFindings: 0,
        requirementStatus: "verified",
        securityAnalysis: { scannedFiles: ["src/users.ts"], candidateCount: 0 }
      }));

    const report = await runCodeDecayLoop({
      ...baseInput(repo),
      maxRounds: 2,
      runId: "uat-loop-1",
      builderCommand: "node -e \"const fs=require('fs'); fs.mkdirSync('src',{recursive:true}); const n=fs.existsSync('src/users.ts')?2:1; fs.writeFileSync('src/users.ts','fix-'+n);\"",
      verifierCommand: "node -e \"console.log('hypothesis: missing API contract proof'); console.log('challenge: unit test passes but API requirement unmet')\"",
      createRedteamReport,
      runConfiguredChecks: async () => {
        builderCalls += 1;
        return builderCalls >= 3 ? verifiedCheckSnapshot() : checkSnapshot("passed", true);
      }
    });

    expect(report.rounds.some((round) => round.verifier?.stdout.includes("missing API"))).toBe(true);
    expect(report.stateMachine.hypothesisStatuses.some((entry) => entry.status === "candidate")).toBe(true);
    expect(report.status).toBe("verified");
    expect(report.requirementTrace?.criteria[0]?.status).toBe("verified");
    expect(report.auditPath).toContain("loop-audit");
    expect(existsSync(report.auditPath!)).toBe(true);
  });

  it("UAT-LOOP-4: protected-path edits and oscillation stop with correct statuses", async () => {
    const protectedRepo = createRepo();
    const protectedReport = await runCodeDecayLoop({
      ...baseInput(protectedRepo),
      maxRounds: 1,
      protectedPathPrefixes: [".codedecay"],
      builderCommand: "node -e \"require('fs').mkdirSync('.codedecay',{recursive:true}); require('fs').writeFileSync('.codedecay/policy.yml','bad')\"",
      createRedteamReport: async () => redteamReport({ riskLevel: "high", mergeRiskScore: 90, weakTestFindings: 1 }),
      runConfiguredChecks: async () => checkSnapshot("passed", true)
    });
    expect(protectedReport.status).toBe("unsafe-change");
    expect(protectedReport.stopReason).toContain("Protected path");

    const oscillateRepo = createRepo();
    const oscillateReport = await runCodeDecayLoop({
      ...baseInput(oscillateRepo),
      maxRounds: 4,
      builderCommand: "node -e \"require('fs').writeFileSync('flip.txt', 'same')\"",
      createRedteamReport: async () => redteamReport({ riskLevel: "high", mergeRiskScore: 90, weakTestFindings: 1 }),
      runConfiguredChecks: async () => checkSnapshot("passed", true)
    });
    expect(["stuck", "budget-exhausted", "needs-human"]).toContain(oscillateReport.status);
  });

  it("UAT-LOOP-5: verifier outage preserves deterministic evidence and does not let builder self-verify", async () => {
    const repo = createRepo();
    const createRedteamReport = vi.fn()
      .mockResolvedValueOnce(redteamReport({ riskLevel: "high", mergeRiskScore: 90, weakTestFindings: 1 }))
      .mockResolvedValue(redteamReport({
        riskLevel: "low",
        mergeRiskScore: 10,
        weakTestFindings: 0,
        securityAnalysis: { scannedFiles: ["agent.txt"], candidateCount: 0 }
      }));
    const report = await runCodeDecayLoop({
      ...baseInput(repo),
      maxRounds: 1,
      builderCommand: "node -e \"require('fs').writeFileSync('agent.txt', 'fixed')\"",
      verifierCommand: "node -e \"process.exit(2)\"",
      createRedteamReport,
      runConfiguredChecks: async () => verifiedCheckSnapshot()
    });

    expect(report.status).toBe("verifier-error");
    expect(report.roles.find((role) => role.role === "verifier")?.canVerifyCriteria).toBe(false);
    expect(report.roles.find((role) => role.role === "builder")?.proofAuthority).toBe("none");
    expect(report.finalCheckStatus).toBe("passed");
    expect(report.finalMergeRiskScore).toBe(10);
  });
});

describe("classifySafeStatus", () => {
  it("does not let memory-only high findings block a configured-check-clean verdict", () => {
    const status = classifySafeStatus(
      redteamReport({
        riskLevel: "low",
        mergeRiskScore: 0,
        weakTestFindings: 0,
        findings: [
          {
            ruleId: "memory-invariant-impacted",
            title: "Project invariant may be impacted",
            severity: "high",
            category: "regression",
            file: "src/service.ts"
          },
          {
            ruleId: "memory-past-regression-area",
            title: "Past regression area changed",
            severity: "high",
            category: "regression",
            file: "src/service.ts"
          }
        ]
      }),
      checkSnapshot("passed", true),
      "low"
    );

    expect(status).toBe("shallow-proof");
  });

  it("does not return merge-safe when a high security finding remains", () => {
    const status = classifySafeStatus(
      redteamReport({
        riskLevel: "low",
        mergeRiskScore: 10,
        weakTestFindings: 0,
        securityScore: 0,
        findings: [{
          ruleId: "security-sql-injection",
          title: "SQL injection candidate",
          severity: "high",
          category: "security",
          file: "src/api/users.ts"
        }],
        securityAnalysis: { scannedFiles: ["src/api/users.ts"], candidateCount: 1 }
      }),
      verifiedCheckSnapshot(),
      "low"
    );

    expect(status).toBeUndefined();
  });

  it("returns shallow-proof when gates pass without scanner, coverage, or mutation depth", () => {
    const status = classifySafeStatus(
      redteamReport({ riskLevel: "low", mergeRiskScore: 10, weakTestFindings: 0 }),
      checkSnapshot("passed", true),
      "low"
    );

    expect(status).toBe("shallow-proof");
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
  decayScore?: number | undefined;
  weakTestFindings: number;
  securityScore?: number | undefined;
  productFailureBundles?: number | undefined;
  findings?: LoopRedteamReport["analysis"]["findings"] | undefined;
  securityAnalysis?: LoopRedteamReport["analysis"]["securityAnalysis"] | undefined;
  requirementStatus?: "proof-missing" | "verified" | undefined;
}): LoopRedteamReport {
  return {
    version: "0.3.3",
    summary: {
      riskLevel: input.riskLevel,
      mergeRiskScore: input.mergeRiskScore,
      decayScore: input.decayScore ?? input.mergeRiskScore,
      securityScore: input.securityScore ?? 0,
      weakTestFindings: input.weakTestFindings,
      productFailureBundles: input.productFailureBundles ?? 0,
      fixTasks: input.riskLevel === "low" && input.weakTestFindings === 0 ? 0 : 1
    },
    analysis: {
      findings: input.findings ?? [],
      securityAnalysis: input.securityAnalysis
    },
    fixTasks: input.riskLevel === "low" && input.weakTestFindings === 0
      ? []
      : [{
          title: "Fix risky change",
          priority: "high",
          source: "finding",
          detail: "Fix the risky changed path."
        }],
    requirementTrace: input.requirementStatus ? requirementTrace(input.requirementStatus) : undefined,
    safety: {
      commandsExecuted: false,
      llmCalled: false,
      telemetrySent: false,
      cloudDependency: false
    }
  };
}

function requirementTrace(status: "proof-missing" | "verified"): NonNullable<LoopRedteamReport["requirementTrace"]> {
  return {
    schemaVersion: 1,
    criteria: [{
      requirementId: "AC-USERS",
      text: "Users API works.",
      sourceIds: ["issue"],
      requiredProof: ["Integration test"],
      status,
      implementation: {
        files: ["src/users.ts"],
        symbols: [],
        routes: ["/api/users"],
        flows: [{ name: "Users API", kind: "api" }]
      },
      risks: [],
      edgeCases: [],
      evidence: [{
        id: `AC-USERS::${status}`,
        kind: status === "verified" ? "configured-check" : "limitation",
        outcome: status === "verified" ? "passed" : "missing",
        trusted: true,
        source: "test",
        target: "users integration",
        summary: status
      }],
      limitations: status === "verified" ? [] : ["Proof missing."]
    }],
    summary: {
      total: 1,
      statuses: {
        unmapped: 0,
        "implementation-found": 0,
        "proof-missing": status === "proof-missing" ? 1 : 0,
        "proof-failed": 0,
        verified: status === "verified" ? 1 : 0,
        "needs-human": 0
      },
      blockingRequirementIds: status === "verified" ? [] : ["AC-USERS"]
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
    durationMs: 0,
    semgrep: {
      configured: false,
      ran: false,
      status: "not-configured",
      findingCount: 0,
      highFindingCount: 0
    },
    coverage: {
      configured: false,
      present: false,
      status: "not-configured"
    },
    mutation: {
      configured: false,
      present: false,
      status: "not-configured"
    }
  };
}

function verifiedCheckSnapshot(): LoopCheckSnapshot {
  return {
    ...checkSnapshot("passed", true),
    semgrep: {
      configured: true,
      ran: true,
      status: "passed",
      findingCount: 0,
      highFindingCount: 0
    },
    coverage: {
      configured: true,
      present: true,
      status: "passed",
      percent: 100,
      measuredLines: 2,
      coveredLines: 2,
      uncoveredLines: 0
    },
    mutation: {
      configured: true,
      present: true,
      status: "passed",
      mutationScore: 100,
      totalMutants: 1,
      weakMutants: 0
    }
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
