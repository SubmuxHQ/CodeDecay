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
  LoopStatus
} from "./types";

interface PreviousAgentRound {
  mergeRiskScore: number;
  weakTestFindings: number;
  madeChanges: boolean;
}

export async function runCodeDecayLoop(input: CodeDecayLoopInput): Promise<LoopReport> {
  const maxRounds = normalizeMaxRounds(input.maxRounds);
  const safeRiskLevel = input.safeRiskLevel ?? "low";
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

    const safeStatus = classifySafeStatus(report, checks, safeRiskLevel);
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
    finalWeakTestFindings: finalReport.summary.weakTestFindings,
    finalCheckStatus: finalChecks.status,
    finalFixTasks: finalReport.fixTasks,
    rounds,
    nextSteps: nextStepsForStatus(status),
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

function classifySafeStatus(
  report: LoopRedteamReport,
  checks: LoopCheckSnapshot,
  safeRiskLevel: LoopRedteamReport["summary"]["riskLevel"]
): "merge-safe" | "unverified" | undefined {
  const riskAllowed = riskRank(report.summary.riskLevel) <= riskRank(safeRiskLevel);
  const noWeakTests = report.summary.weakTestFindings === 0;
  if (!riskAllowed || !noWeakTests) {
    return undefined;
  }

  return checks.configured && checks.total > 0 && checks.status === "passed" ? "merge-safe" : "unverified";
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

function nextStepsForStatus(status: LoopStatus): string[] {
  switch (status) {
    case "merge-safe":
      return [
        "Review the working tree diff.",
        "Commit the verified changes yourself when ready.",
        "Do not skip human review for business-critical flows."
      ];
    case "unverified":
      return [
        "Add or enable configured checks in .codedecay/config.yml.",
        "Run codedecay loop again after tests/build/probes can execute.",
        "Do not treat this PR as merge-safe until real checks pass."
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
        "Increase --max-rounds only if the agent is making measurable progress."
      ];
  }
}
