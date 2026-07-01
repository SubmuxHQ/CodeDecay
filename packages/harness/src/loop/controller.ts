import { riskRank } from "./risk";
import { driveAgent } from "./agent";
import { changedFilePaths, createChangedFilesFingerprint } from "./fingerprint";
import type {
  CodeDecayLoopInput,
  LoopAgentResult,
  LoopCheckSnapshot,
  LoopRedteamReport,
  LoopReport,
  LoopRoundSnapshot,
  LoopStatus,
  LoopVerdictEvidence
} from "./types";

interface PreviousAgentRound {
  mergeRiskScore: number;
  weakTestFindings: number;
  madeChanges: boolean;
}

export async function runCodeDecayLoop(input: CodeDecayLoopInput): Promise<LoopReport> {
  const maxRounds = normalizeMaxRounds(input.maxRounds);
  const safeRiskLevel = input.safeRiskLevel ?? "low";
  const securityScoreThreshold = normalizeSecurityScoreThreshold(input.securityScoreThreshold);
  const rounds: LoopRoundSnapshot[] = [];
  let status: LoopStatus = "needs-human";
  let noProgressCount = 0;
  let previousAgentRound: PreviousAgentRound | undefined;
  let latestReport: LoopRedteamReport | undefined;
  let latestChecks: LoopCheckSnapshot | undefined;

  for (let roundNumber = 1; roundNumber <= maxRounds; roundNumber += 1) {
    const beforeChanges = input.getChangedFiles();
    const beforeFingerprint = createChangedFilesFingerprint(beforeChanges);
    const report = await input.createRedteamReport();
    const checks = await input.runConfiguredChecks();
    latestReport = report;
    latestChecks = checks;

    const round: LoopRoundSnapshot = {
      round: roundNumber,
      riskLevel: report.summary.riskLevel,
      mergeRiskScore: report.summary.mergeRiskScore,
      weakTestFindings: report.summary.weakTestFindings,
      fixTasks: report.summary.fixTasks,
      checkStatus: checks.status,
      checksConfigured: checks.configured,
      checksTotal: checks.total
    };
    rounds.push(round);

    if (previousAgentRound?.madeChanges) {
      const riskReduced = didRiskReduce(previousAgentRound, report);
      round.riskReducedFromPreviousRound = riskReduced;
      noProgressCount = riskReduced ? 0 : noProgressCount + 1;
      if (noProgressCount >= 2) {
        status = "stuck";
        break;
      }
    }

    const safeStatus = classifySafeStatus(report, checks, safeRiskLevel, securityScoreThreshold);
    if (safeStatus) {
      status = safeStatus;
      break;
    }

    if (!input.agentCommand) {
      round.planOnlyBundle = input.renderAgentBundle(report);
      status = "plan-only";
      break;
    }

    const bundle = input.renderAgentBundle(report);
    const execution = await driveAgent({
      cwd: input.cwd,
      command: input.agentCommand,
      bundle,
      timeoutMs: input.agentTimeoutMs,
      safety: input.commandSafety
    });
    const afterChanges = input.getChangedFiles();
    const afterFingerprint = createChangedFilesFingerprint(afterChanges);
    const madeChanges = beforeFingerprint !== afterFingerprint;
    const agent: LoopAgentResult = {
      command: input.agentCommand,
      status: execution.status,
      durationMs: execution.durationMs,
      stdout: execution.stdout,
      stderr: execution.stderr,
      madeChanges,
      changedFiles: changedFilePaths(afterChanges)
    };

    if (execution.exitCode !== undefined) {
      agent.exitCode = execution.exitCode;
    }

    if (execution.error !== undefined) {
      agent.error = execution.error;
    }

    round.agent = agent;

    if (execution.status !== "passed") {
      status = "agent-error";
      break;
    }

    if (!madeChanges) {
      noProgressCount += 1;
      if (noProgressCount >= 2) {
        status = "stuck";
        break;
      }
    }

    previousAgentRound = {
      mergeRiskScore: report.summary.mergeRiskScore,
      weakTestFindings: report.summary.weakTestFindings,
      madeChanges
    };

    if (roundNumber === maxRounds) {
      status = "needs-human";
    }
  }

  const finalReport = latestReport ?? await input.createRedteamReport();
  const finalChecks = latestChecks ?? await input.runConfiguredChecks();
  const verdict = createLoopVerdictEvidence(finalReport, finalChecks, safeRiskLevel, securityScoreThreshold, status);
  return {
    tool: "CodeDecay",
    mode: "closed-loop",
    version: finalReport.version,
    generatedAt: (input.now ?? (() => new Date()))().toISOString(),
    status,
    cwd: input.cwd,
    base: input.base,
    head: input.head,
    maxRounds,
    roundsRun: rounds.length,
    planOnly: !input.agentCommand,
    finalRiskLevel: finalReport.summary.riskLevel,
    finalMergeRiskScore: finalReport.summary.mergeRiskScore,
    finalSecurityScore: finalReport.summary.securityScore,
    finalWeakTestFindings: finalReport.summary.weakTestFindings,
    finalCheckStatus: finalChecks.status,
    verdict,
    finalFixTasks: finalReport.fixTasks,
    rounds,
    nextSteps: nextStepsForStatus(status, verdict),
    safety: {
      commandsExecuted: didExecuteCommands(rounds),
      agentCommandConfigured: Boolean(input.agentCommand),
      llmCalled: finalReport.safety.llmCalled,
      telemetrySent: false,
      cloudDependency: false,
      autoCommitted: false,
      autoPushed: false
    }
  };
}

function normalizeMaxRounds(value: number | undefined): number {
  if (value === undefined) {
    return 4;
  }

  if (!Number.isInteger(value) || value < 1) {
    throw new Error("--max-rounds must be a positive integer.");
  }

  return value;
}

function normalizeSecurityScoreThreshold(value: number | undefined): number {
  if (value === undefined) {
    return 0;
  }

  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error("--max-security-score must be a number from 0 to 100.");
  }

  return value;
}

export function classifySafeStatus(
  report: LoopRedteamReport,
  checks: LoopCheckSnapshot,
  safeRiskLevel: LoopRedteamReport["summary"]["riskLevel"],
  securityScoreThreshold = 0
): "merge-safe-verified" | "merge-safe-shallow" | "unverified" | undefined {
  const evidence = createLoopVerdictEvidence(report, checks, safeRiskLevel, securityScoreThreshold, "needs-human");
  if (!evidence.riskAllowed || !evidence.weakTestsClear || !evidence.securityScoreAllowed || evidence.highFindingCount > 0) {
    return undefined;
  }

  if (!checks.configured || checks.total === 0) {
    return "unverified";
  }

  if (!evidence.checksPassed || evidence.blockingReasons.length > 0) {
    return undefined;
  }

  return evidence.missingDepth.length === 0 ? "merge-safe-verified" : "merge-safe-shallow";
}

export function createLoopVerdictEvidence(
  report: LoopRedteamReport,
  checks: LoopCheckSnapshot,
  safeRiskLevel: LoopRedteamReport["summary"]["riskLevel"],
  securityScoreThreshold: number,
  status: LoopStatus
): LoopVerdictEvidence {
  const highFindings = report.analysis.findings.filter((finding) => finding.severity === "high");
  const highSecurityFindings = highFindings.filter((finding) => finding.category === "security");
  const securityMatcherFindings = report.analysis.securityCandidates?.length ?? report.analysis.securityAnalysis?.candidateCount ?? 0;
  const securityMatcherHighFindings = (report.analysis.securityCandidates ?? []).filter(
    (candidate) => candidate.severity === "high"
  ).length;
  const evidence: LoopVerdictEvidence = {
    status,
    riskAllowed: riskRank(report.summary.riskLevel) <= riskRank(safeRiskLevel),
    weakTestsClear: report.summary.weakTestFindings === 0,
    checksPassed: checks.configured && checks.total > 0 && checks.status === "passed",
    checksConfigured: checks.configured && checks.total > 0,
    securityScoreAllowed: report.summary.securityScore <= securityScoreThreshold,
    securityScore: report.summary.securityScore,
    securityScoreThreshold,
    highFindingCount: highFindings.length,
    highSecurityFindingCount: Math.max(highSecurityFindings.length, securityMatcherHighFindings),
    securityMatchersRan: Boolean(report.analysis.securityAnalysis),
    securityMatcherFindings,
    securityMatcherHighFindings,
    verifiedBy: [],
    missingDepth: [],
    blockingReasons: []
  };

  if (evidence.checksPassed) {
    evidence.verifiedBy.push("configured checks (passed)");
  } else if (!evidence.checksConfigured) {
    evidence.blockingReasons.push("No configured checks ran.");
  } else {
    evidence.blockingReasons.push(`Configured checks ended with status ${checks.status}.`);
  }

  if (evidence.securityMatchersRan) {
    evidence.verifiedBy.push(`security matchers (${evidence.securityMatcherFindings} finding(s))`);
  } else {
    evidence.missingDepth.push("security matchers did not scan changed source");
  }

  if (checks.semgrep.configured && checks.semgrep.ran && checks.semgrep.status === "passed" && checks.semgrep.findingCount === 0) {
    evidence.verifiedBy.push("Semgrep (0 findings)");
  } else if (!checks.semgrep.configured) {
    evidence.missingDepth.push("no Semgrep adapter configured");
  } else if (!checks.semgrep.ran) {
    evidence.missingDepth.push(`Semgrep adapter configured but ${checks.semgrep.status}`);
  } else {
    evidence.blockingReasons.push(`Semgrep reported ${checks.semgrep.findingCount} finding(s).`);
  }

  if (checks.coverage.configured && checks.coverage.present && checks.coverage.status === "passed") {
    const percent = checks.coverage.percent === undefined ? "unknown" : `${checks.coverage.percent}%`;
    evidence.verifiedBy.push(`coverage evidence (${percent})`);
  } else if (!checks.coverage.configured) {
    evidence.missingDepth.push("no coverage adapter configured");
  } else if (!checks.coverage.present) {
    evidence.missingDepth.push(`coverage adapter configured but no coverage evidence was present (${checks.coverage.status})`);
  } else {
    evidence.blockingReasons.push(`Coverage adapter ended with status ${checks.coverage.status}.`);
  }

  if (checks.mutation.configured && checks.mutation.present && checks.mutation.status === "passed" && (checks.mutation.weakMutants ?? 0) === 0) {
    const score = checks.mutation.mutationScore === undefined ? "unknown" : `${checks.mutation.mutationScore}%`;
    evidence.verifiedBy.push(`mutation evidence (${score})`);
  } else if (!checks.mutation.configured) {
    evidence.missingDepth.push("no mutation adapter configured");
  } else if (!checks.mutation.present) {
    evidence.missingDepth.push(`mutation adapter configured but no mutation evidence was present (${checks.mutation.status})`);
  } else {
    evidence.blockingReasons.push(`Mutation adapter reported ${checks.mutation.weakMutants ?? "unknown"} surviving/no-coverage mutant(s).`);
  }

  if (!evidence.riskAllowed) {
    evidence.blockingReasons.push(`Risk level ${report.summary.riskLevel} exceeds safe threshold ${safeRiskLevel}.`);
  }

  if (!evidence.weakTestsClear) {
    evidence.blockingReasons.push(`${report.summary.weakTestFindings} weak-test finding(s) remain.`);
  }

  if (!evidence.securityScoreAllowed) {
    evidence.blockingReasons.push(`Security score ${report.summary.securityScore}/100 exceeds threshold ${securityScoreThreshold}/100.`);
  }

  if (evidence.highFindingCount > 0) {
    evidence.blockingReasons.push(`${evidence.highFindingCount} high-severity finding(s) remain.`);
  }

  return evidence;
}

function didRiskReduce(previous: PreviousAgentRound, current: LoopRedteamReport): boolean {
  return (
    current.summary.mergeRiskScore < previous.mergeRiskScore ||
    current.summary.weakTestFindings < previous.weakTestFindings
  );
}

function didExecuteCommands(rounds: LoopRoundSnapshot[]): boolean {
  return rounds.some((round) => {
    if (didCheckExecuteCommand(round.checkStatus)) {
      return true;
    }

    return round.agent ? didAgentExecuteCommand(round.agent.status) : false;
  });
}

function didCheckExecuteCommand(status: LoopCheckSnapshot["status"]): boolean {
  return status === "passed" || status === "failed" || status === "timed_out" || status === "error";
}

function didAgentExecuteCommand(status: LoopAgentResult["status"]): boolean {
  return status === "passed" || status === "failed" || status === "timed_out" || status === "error";
}

function nextStepsForStatus(status: LoopStatus, verdict: LoopVerdictEvidence): string[] {
  switch (status) {
    case "merge-safe-verified":
      return [
        "Review the working tree diff.",
        "Commit the verified changes yourself when ready.",
        "Treat this as configured-check clean, not a guarantee of production safety."
      ];
    case "merge-safe-shallow":
      return [
        "Review the working tree diff and the missing-depth list before merge.",
        "Enable Semgrep, coverage, and StrykerJS adapters to upgrade this verdict to merge-safe-verified.",
        "Treat this as shallow configured-check clean, not a guarantee of production safety."
      ];
    case "unverified":
      return [
        "Add or enable configured checks in .codedecay/config.yml.",
        "Run codedecay loop again after tests/build/probes can execute.",
        "Do not treat this PR as merge-safe-* until real checks pass."
      ];
    case "plan-only":
      return [
        "Review the generated agent bundle and fix tasks.",
        "Run again with --agent-cmd only after configuring a user-owned local agent command.",
        "Keep safety.allowCommands false unless you explicitly want CodeDecay to run local commands."
      ];
    case "stuck":
      return [
        "Inspect the agent stdout/stderr and working tree.",
        "Narrow the task or fix the remaining high-signal findings manually.",
        "Run codedecay loop again after making a concrete change."
      ];
    case "agent-error":
      return [
        "Fix the configured --agent-cmd or safety.allowCommands settings.",
        "Remember agent output is untrusted until deterministic checks pass.",
        "Run in plan-only mode to inspect the prompt that would be sent."
      ];
    case "needs-human":
      return [
        "Max rounds were reached before CodeDecay could prove merge safety.",
        "Review remaining fix tasks and check failures manually.",
        "Increase --max-rounds only if the agent is making measurable progress.",
        ...missingDepthNextSteps(verdict)
      ];
  }
}

function missingDepthNextSteps(verdict: LoopVerdictEvidence): string[] {
  if (verdict.missingDepth.length === 0) {
    return [];
  }

  return ["Run codedecay doctor and enable missing OSS adapters such as Semgrep, coverage, or StrykerJS for deeper evidence."];
}
