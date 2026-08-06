import { createHash } from "node:crypto";
import { isMemoryContextFinding } from "@submuxhq/codedecay-core";
import {
  appendLoopAuditRecord,
  createAuditRecordFromRound,
  defaultLoopAuditPath,
  loadLoopAuditResumeState,
  writeLoopAuditSummary
} from "./audit";
import {
  checkChangedFileBudgets,
  checkModelCallBudget,
  checkWallTimeBudget,
  createLoopBudgetState,
  detectOscillation,
  detectWideningScope,
  type LoopBudgetConfig
} from "./budgets";
import { mergeHypothesisStatuses, parseVerifierHypothesisProposals } from "./hypotheses";
import { riskRank } from "./risk";
import { driveAgent } from "./agent";
import { changedFilePaths, createChangedFilesFingerprint } from "./fingerprint";
import {
  createLoopProgressSnapshot,
  didLoopEvidenceImprove,
  type LoopProgressSnapshot
} from "./progress";
import type {
  CodeDecayLoopInput,
  LoopAgentRole,
  LoopAgentResult,
  LoopCheckSnapshot,
  LoopHypothesisStatusSnapshot,
  LoopRedteamReport,
  LoopReport,
  LoopRoundSnapshot,
  LoopStateMachineSnapshot,
  LoopStatus,
  LoopVerificationSnapshot,
  LoopVerdictEvidence
} from "./types";

interface PreviousAgentRound {
  evidence: LoopProgressSnapshot;
  madeChanges: boolean;
  changedPaths: string[];
}

export async function runCodeDecayLoop(input: CodeDecayLoopInput): Promise<LoopReport> {
  const maxRounds = normalizeMaxRounds(input.maxRounds);
  const safeRiskLevel = input.safeRiskLevel ?? "low";
  const securityScoreThreshold = normalizeSecurityScoreThreshold(input.securityScoreThreshold);
  const builderCommand = input.builderCommand ?? input.agentCommand;
  const nowFn = input.now ?? (() => new Date());
  const budgetConfig: LoopBudgetConfig = {
    maxWallTimeMs: input.maxWallTimeMs,
    maxChangedFiles: input.maxChangedFiles,
    allowedPathPrefixes: input.allowedPathPrefixes,
    protectedPathPrefixes: input.protectedPathPrefixes,
    maxModelCalls: input.maxModelCalls
  };
  const budgetState = createLoopBudgetState(nowFn().getTime());
  const resume = input.resumeFromAuditPath ? loadLoopAuditResumeState(input.resumeFromAuditPath) : undefined;
  if (resume) {
    budgetState.modelCalls = resume.modelCalls;
  }
  const runId = input.runId ?? resume?.runId ?? `loop-${nowFn().toISOString().replace(/[:.]/g, "-")}`;
  const auditPath = input.auditPath ?? defaultLoopAuditPath(input.cwd, runId);
  const rounds: LoopRoundSnapshot[] = [];
  let status: LoopStatus = "needs-human";
  let stopReason: string | undefined = resume?.stopReason;
  let noProgressCount = 0;
  let previousAgentRound: PreviousAgentRound | undefined;
  let latestReport: LoopRedteamReport | undefined;
  let latestChecks: LoopCheckSnapshot | undefined;
  let postAgentVerificationPending = false;
  let hypothesisStatuses: LoopHypothesisStatusSnapshot[] = [];

  for (let roundNumber = 1; roundNumber <= maxRounds; roundNumber += 1) {
    const wallViolation = checkWallTimeBudget(budgetConfig, budgetState, nowFn().getTime());
    if (wallViolation) {
      status = wallViolation.status;
      stopReason = wallViolation.reason;
      break;
    }

    const beforeChanges = input.getChangedFiles();
    const beforeFingerprint = createChangedFilesFingerprint(beforeChanges);
    const scopeViolation = checkChangedFileBudgets(budgetConfig, beforeChanges);
    if (scopeViolation) {
      status = scopeViolation.status;
      stopReason = scopeViolation.reason;
      break;
    }

    const report = await input.createRedteamReport();
    const checks = await input.runConfiguredChecks();
    latestReport = report;
    latestChecks = checks;

    if (postAgentVerificationPending) {
      recordPostAgentVerification(rounds.at(-1), report, checks);
      const lastRound = rounds.at(-1);
      if (lastRound?.stateMachine) {
        lastRound.stateMachine = createStateMachineSnapshot(
          "current-tree-reverify",
          report,
          checks,
          createChangedFilesFingerprint(input.getChangedFiles()),
          [
            ...(lastRound.stateMachine.decisions ?? []),
            {
              phase: "current-tree-reverify",
              actor: "codedecay",
              summary: "Revalidated current tree after builder edit with deterministic checks.",
              evidenceIds: loopEvidenceIds(report, checks)
            }
          ],
          hypothesisStatuses
        );
      }
      postAgentVerificationPending = false;
    }

    const round = createRoundSnapshot(roundNumber, report, checks);
    round.stateMachine = createStateMachineSnapshot("analyze", report, checks, beforeFingerprint, [
      {
        phase: "analyze",
        actor: "codedecay",
        summary: "Current tree analyzed and configured checks captured before any builder edit.",
        evidenceIds: loopEvidenceIds(report, checks)
      }
    ], hypothesisStatuses);
    rounds.push(round);

    if (previousAgentRound?.madeChanges) {
      const riskReduced = didLoopEvidenceImprove(
        previousAgentRound.evidence,
        createLoopProgressSnapshot(report, checks)
      );
      round.riskReducedFromPreviousRound = riskReduced;
      noProgressCount = riskReduced ? 0 : noProgressCount + 1;
      if (noProgressCount >= 2) {
        status = "stuck";
        stopReason = "No evidence gain across consecutive builder rounds.";
        break;
      }
      const widen = detectWideningScope(
        previousAgentRound.changedPaths,
        changedFilePaths(input.getChangedFiles())
      );
      if (widen) {
        status = widen.status;
        stopReason = widen.reason;
        break;
      }
    }

    const safeStatus = classifySafeStatus(report, checks, safeRiskLevel, securityScoreThreshold);
    if (safeStatus) {
      status = safeStatus;
      stopReason = `Trusted proof reached: ${safeStatus}.`;
      break;
    }

    if (!builderCommand) {
      round.planOnlyBundle = renderBundle(input, "builder", report);
      status = "plan-only";
      stopReason = "No builder command configured; emitted a plan-only bundle.";
      round.stateMachine = createStateMachineSnapshot("plan", report, checks, beforeFingerprint, [
        {
          phase: "plan",
          actor: "codedecay",
          summary: stopReason,
          evidenceIds: loopEvidenceIds(report, checks)
        }
      ], hypothesisStatuses);
      break;
    }

    const modelBudget = checkModelCallBudget(budgetConfig, budgetState);
    if (modelBudget) {
      status = modelBudget.status;
      stopReason = modelBudget.reason;
      break;
    }

    budgetState.modelCalls += 1;
    const agent = await executeAgentRound(input, "builder", report, beforeFingerprint, builderCommand);
    const madeChanges = agent.madeChanges;
    round.agent = agent;
    round.builder = agent;
    round.agentRequirementEdits = agent.changedFiles.map((file) => ({
      file,
      requirementIds: requirementIdsForFile(report, file),
      trusted: false
    }));
    postAgentVerificationPending = madeChanges;
    const afterBuilderFingerprint = createChangedFilesFingerprint(input.getChangedFiles());
    const afterBuilderPaths = changedFilePaths(input.getChangedFiles());
    const postEditScope = checkChangedFileBudgets(budgetConfig, input.getChangedFiles());
    round.stateMachine = createStateMachineSnapshot(
      madeChanges ? "repair" : "build-edit",
      report,
      checks,
      afterBuilderFingerprint,
      [
        {
          phase: madeChanges ? "repair" : "build-edit",
          actor: "builder",
          summary: madeChanges
            ? `Builder edited ${agent.changedFiles.length} changed file(s).`
            : "Builder completed without changing the tree.",
          evidenceIds: agent.changedFiles.map((file) => `builder-changed:${file}`)
        }
      ],
      hypothesisStatuses
    );

    if (postEditScope) {
      status = postEditScope.status;
      stopReason = postEditScope.reason;
      persistRoundAudit({
        auditPath,
        runId,
        round,
        nowFn,
        budgetState,
        stopReason,
        statusHint: status
      });
      break;
    }

    if (madeChanges) {
      const oscillation = detectOscillation(budgetState, afterBuilderFingerprint);
      if (oscillation) {
        status = oscillation.status;
        stopReason = oscillation.reason;
        persistRoundAudit({
          auditPath,
          runId,
          round,
          nowFn,
          budgetState,
          stopReason,
          statusHint: status
        });
        break;
      }
    }

    if (agent.status !== "passed") {
      status = "builder-error";
      stopReason = `Builder command ended with status ${agent.status}.`;
      persistRoundAudit({
        auditPath,
        runId,
        round,
        nowFn,
        budgetState,
        stopReason,
        statusHint: status
      });
      break;
    }

    if (input.verifierCommand) {
      const verifierModelBudget = checkModelCallBudget(budgetConfig, budgetState);
      if (verifierModelBudget) {
        status = verifierModelBudget.status;
        stopReason = verifierModelBudget.reason;
        persistRoundAudit({
          auditPath,
          runId,
          round,
          nowFn,
          budgetState,
          stopReason,
          statusHint: status
        });
        break;
      }
      budgetState.modelCalls += 1;
      const verifier = await executeAgentRound(
        input,
        "verifier",
        report,
        createChangedFilesFingerprint(input.getChangedFiles()),
        input.verifierCommand
      );
      round.verifier = verifier;
      hypothesisStatuses = mergeHypothesisStatuses(
        hypothesisStatuses,
        parseVerifierHypothesisProposals(verifier)
      );
      if (verifier.madeChanges) {
        status = "unsafe-change";
        stopReason = `Verifier changed files despite read-only role: ${verifier.changedFiles.join(", ")}.`;
        round.stateMachine = createStateMachineSnapshot("challenge", report, checks, createChangedFilesFingerprint(input.getChangedFiles()), [
          {
            phase: "challenge",
            actor: "verifier",
            summary: stopReason,
            evidenceIds: verifier.changedFiles.map((file) => `verifier-unsafe-change:${file}`)
          }
        ], hypothesisStatuses);
        persistRoundAudit({
          auditPath,
          runId,
          round,
          nowFn,
          budgetState,
          stopReason,
          statusHint: status
        });
        break;
      }
      if (verifier.status !== "passed") {
        status = "verifier-error";
        stopReason = `Verifier command ended with status ${verifier.status}.`;
        round.stateMachine = createStateMachineSnapshot("challenge", report, checks, createChangedFilesFingerprint(input.getChangedFiles()), [
          {
            phase: "challenge",
            actor: "verifier",
            summary: stopReason,
            evidenceIds: ["verifier:error"]
          }
        ], hypothesisStatuses);
        persistRoundAudit({
          auditPath,
          runId,
          round,
          nowFn,
          budgetState,
          stopReason,
          statusHint: status
        });
        break;
      }
      round.stateMachine = createStateMachineSnapshot("challenge", report, checks, createChangedFilesFingerprint(input.getChangedFiles()), [
        {
          phase: "challenge",
          actor: "verifier",
          summary: "Verifier challenged the current tree without editing files. Output is advisory until deterministic proof corroborates it.",
          evidenceIds: [
            "verifier:challenge-output",
            ...hypothesisStatuses.map((entry) => `hypothesis:${entry.hypothesisId}:${entry.status}`)
          ]
        }
      ], hypothesisStatuses);
    }

    if (!madeChanges) {
      noProgressCount += 1;
      if (noProgressCount >= 2) {
        status = "stuck";
        stopReason = "Builder made no file changes twice.";
        persistRoundAudit({
          auditPath,
          runId,
          round,
          nowFn,
          budgetState,
          stopReason,
          statusHint: status
        });
        break;
      }
    }

    previousAgentRound = {
      evidence: createLoopProgressSnapshot(report, checks),
      madeChanges,
      changedPaths: afterBuilderPaths
    };

    persistRoundAudit({
      auditPath,
      runId,
      round,
      nowFn,
      budgetState,
      statusHint: status
    });

    if (roundNumber === maxRounds) {
      status = "needs-human";
      stopReason = "Max rounds reached before trusted proof.";
    }
  }

  let finalReport = latestReport ?? await input.createRedteamReport();
  let finalChecks = latestChecks ?? await input.runConfiguredChecks();

  if (postAgentVerificationPending) {
    const verification = await revalidateFinalAgentEdit(
      input,
      rounds.at(-1),
      previousAgentRound,
      safeRiskLevel,
      securityScoreThreshold,
      status,
      hypothesisStatuses
    );
    finalReport = verification.report;
    finalChecks = verification.checks;
    status = verification.status;
    if (!stopReason && verification.status !== status) {
      stopReason = `Final revalidation status: ${verification.status}.`;
    }
  }

  const verdict = createLoopVerdictEvidence(finalReport, finalChecks, safeRiskLevel, securityScoreThreshold, status);
  const finalStateMachine = createStateMachineSnapshot("terminal-verdict", finalReport, finalChecks, createChangedFilesFingerprint(input.getChangedFiles()), [
    {
      phase: "terminal-verdict",
      actor: "codedecay",
      summary: stopReason ?? `Loop stopped with status ${status}.`,
      evidenceIds: loopEvidenceIds(finalReport, finalChecks)
    }
  ], hypothesisStatuses);
  const reportOut = assembleLoopReport({
    input,
    maxRounds,
    rounds,
    status,
    finalReport,
    finalChecks,
    verdict,
    stateMachine: finalStateMachine,
    auditPath,
    stopReason
  });
  writeLoopAuditSummary(auditPath, reportOut);
  return reportOut;
}

function persistRoundAudit(input: {
  auditPath: string;
  runId: string;
  round: LoopRoundSnapshot;
  nowFn: () => Date;
  budgetState: ReturnType<typeof createLoopBudgetState>;
  stopReason?: string | undefined;
  statusHint?: LoopStatus | undefined;
}): void {
  appendLoopAuditRecord(
    input.auditPath,
    createAuditRecordFromRound({
      runId: input.runId,
      round: input.round,
      timestamp: input.nowFn().toISOString(),
      modelCalls: input.budgetState.modelCalls,
      wallTimeMs: input.nowFn().getTime() - input.budgetState.startedAtMs,
      fingerprintCount: input.budgetState.fingerprints.length,
      stopReason: input.stopReason,
      statusHint: input.statusHint
    })
  );
}

function createRoundSnapshot(
  round: number,
  report: LoopRedteamReport,
  checks: LoopCheckSnapshot
): LoopRoundSnapshot {
  return {
    round,
    riskLevel: report.summary.riskLevel,
    mergeRiskScore: report.summary.mergeRiskScore,
    decayScore: report.summary.decayScore,
    securityScore: report.summary.securityScore,
    weakTestFindings: report.summary.weakTestFindings,
    productFailureBundles: report.summary.productFailureBundles,
    fixTasks: report.summary.fixTasks,
    checkStatus: checks.status,
    checksConfigured: checks.configured,
    checksTotal: checks.total,
    requirementStatuses: requirementStatuses(report)
  };
}

function renderBundle(input: CodeDecayLoopInput, role: LoopAgentRole, report: LoopRedteamReport): string {
  if (role === "builder") {
    return input.renderBuilderBundle?.(report) ?? input.renderAgentBundle(report);
  }

  return input.renderVerifierBundle?.(report) ?? input.renderAgentBundle(report);
}

function loopRoles(input: CodeDecayLoopInput): LoopReport["roles"] {
  const builderCommand = input.builderCommand ?? input.agentCommand;
  return [
    {
      role: "builder",
      id: input.builderIdentity ?? "builder",
      commandConfigured: Boolean(builderCommand),
      canEdit: true,
      canVerifyCriteria: false,
      receivesHiddenReasoning: false,
      proofAuthority: "none"
    },
    {
      role: "verifier",
      id: input.verifierIdentity ?? "verifier",
      commandConfigured: Boolean(input.verifierCommand),
      canEdit: false,
      canVerifyCriteria: false,
      receivesHiddenReasoning: false,
      proofAuthority: "none"
    }
  ];
}

function createStateMachineSnapshot(
  phase: LoopStateMachineSnapshot["phase"],
  report: LoopRedteamReport,
  checks: LoopCheckSnapshot,
  changedTreeFingerprint: string,
  decisions: LoopStateMachineSnapshot["decisions"],
  hypothesisStatuses: LoopHypothesisStatusSnapshot[] = []
): LoopStateMachineSnapshot {
  return {
    schemaVersion: 1,
    phase,
    changedTreeFingerprint: hashChangedTreeFingerprint(changedTreeFingerprint),
    requirementStatuses: requirementStatuses(report) ?? [],
    hypothesisStatuses,
    experimentStatuses: experimentStatuses(checks),
    unresolvedHumanDecisions: unresolvedHumanDecisions(report, checks),
    decisions
  };
}

function hashChangedTreeFingerprint(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function experimentStatuses(checks: LoopCheckSnapshot): LoopStateMachineSnapshot["experimentStatuses"] {
  if (!checks.configured || checks.total === 0) {
    return [{ experimentId: "configured-checks", status: "not-run" }];
  }

  if (checks.status === "passed") {
    return [{ experimentId: "configured-checks", status: "passed" }];
  }

  if (checks.status === "blocked" || checks.status === "skipped" || checks.status === "not-configured") {
    return [{ experimentId: "configured-checks", status: "blocked" }];
  }

  return [{ experimentId: "configured-checks", status: "failed" }];
}

function unresolvedHumanDecisions(report: LoopRedteamReport, checks: LoopCheckSnapshot): string[] {
  const decisions: string[] = [];
  if ((report.requirementTrace?.summary.blockingRequirementIds.length ?? 0) > 0) {
    decisions.push("acceptance-criteria-unverified");
  }
  if (!checks.configured || checks.total === 0 || checks.status === "blocked") {
    decisions.push("configured-checks-need-human");
  }
  return decisions;
}

function loopEvidenceIds(report: LoopRedteamReport, checks: LoopCheckSnapshot): string[] {
  const evidence = [
    `risk:${report.summary.riskLevel}:${report.summary.mergeRiskScore}`,
    `checks:${checks.status}:${checks.total}`
  ];
  for (const criterion of report.requirementTrace?.criteria ?? []) {
    evidence.push(`requirement:${criterion.requirementId}:${criterion.status}`);
  }
  return evidence;
}

async function executeAgentRound(
  input: CodeDecayLoopInput,
  role: LoopAgentRole,
  report: LoopRedteamReport,
  beforeFingerprint: string,
  command: string
): Promise<LoopAgentResult> {
  const beforeChanges = input.getChangedFiles();
  const execution = await driveAgent({
    cwd: input.cwd,
    command,
    bundle: renderBundle(input, role, report),
    timeoutMs: input.agentTimeoutMs,
    safety: input.commandSafety
  });
  const afterChanges = input.getChangedFiles();
  const madeChanges = beforeFingerprint !== createChangedFilesFingerprint(afterChanges);
  const agent: LoopAgentResult = {
    role,
    identity: role === "builder" ? input.builderIdentity ?? "builder" : input.verifierIdentity ?? "verifier",
    command,
    status: execution.status,
    durationMs: execution.durationMs,
    stdout: execution.stdout,
    stderr: execution.stderr,
    madeChanges,
    changedFiles: role === "verifier" && madeChanges
      ? changedFilePathsSince(beforeChanges, afterChanges)
      : changedFilePaths(afterChanges),
    notes: role === "verifier"
      ? ["Verifier output is advisory; only deterministic checks and runtime evidence can verify criteria."]
      : undefined
  };

  if (execution.exitCode !== undefined) {
    agent.exitCode = execution.exitCode;
  }

  if (execution.error !== undefined) {
    agent.error = execution.error;
  }

  return agent;
}

function changedFilePathsSince(
  beforeChanges: Array<{ path: string }>,
  afterChanges: Array<{ path: string }>
): string[] {
  const beforeByPath = new Map(beforeChanges.map((change) => [change.path, JSON.stringify(change)]));
  return afterChanges
    .filter((change) => beforeByPath.get(change.path) !== JSON.stringify(change))
    .map((change) => change.path);
}

interface AssembleLoopReportInput {
  input: CodeDecayLoopInput;
  maxRounds: number;
  rounds: LoopRoundSnapshot[];
  status: LoopStatus;
  finalReport: LoopRedteamReport;
  finalChecks: LoopCheckSnapshot;
  verdict: LoopVerdictEvidence;
  stateMachine: LoopStateMachineSnapshot;
  auditPath?: string | undefined;
  stopReason?: string | undefined;
}

function assembleLoopReport(state: AssembleLoopReportInput): LoopReport {
  const { input, maxRounds, rounds, status, finalReport, finalChecks, verdict, stateMachine } = state;
  const builderCommand = input.builderCommand ?? input.agentCommand;
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
    planOnly: !builderCommand,
    finalRiskLevel: finalReport.summary.riskLevel,
    finalMergeRiskScore: finalReport.summary.mergeRiskScore,
    finalDecayScore: finalReport.summary.decayScore,
    finalSecurityScore: finalReport.summary.securityScore,
    finalWeakTestFindings: finalReport.summary.weakTestFindings,
    finalProductFailureBundles: finalReport.summary.productFailureBundles,
    finalCheckStatus: finalChecks.status,
    roles: loopRoles(input),
    stateMachine,
    verdict,
    finalFixTasks: finalReport.fixTasks,
    requirementTrace: finalReport.requirementTrace,
    rounds,
    nextSteps: nextStepsForStatus(status, verdict),
    auditPath: state.auditPath,
    stopReason: state.stopReason,
    safety: {
      commandsExecuted: didExecuteCommands(rounds),
      agentCommandConfigured: Boolean(builderCommand),
      builderCommandConfigured: Boolean(builderCommand),
      verifierCommandConfigured: Boolean(input.verifierCommand),
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
): "verified" | "shallow-proof" | "unverified" | undefined {
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

  return evidence.missingDepth.length === 0 ? "verified" : "shallow-proof";
}

export function createLoopVerdictEvidence(
  report: LoopRedteamReport,
  checks: LoopCheckSnapshot,
  safeRiskLevel: LoopRedteamReport["summary"]["riskLevel"],
  securityScoreThreshold: number,
  status: LoopStatus
): LoopVerdictEvidence {
  const highFindings = report.analysis.findings.filter(
    (finding) => finding.severity === "high" && !isMemoryContextFinding(finding)
  );
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
    blockingReasons: [],
    requirementsSatisfied: (report.requirementTrace?.summary.blockingRequirementIds.length ?? 0) === 0,
    blockingRequirementIds: [...(report.requirementTrace?.summary.blockingRequirementIds ?? [])]
  };
  if (!evidence.requirementsSatisfied) {
    evidence.blockingReasons.push(
      `Acceptance criteria remain unverified: ${evidence.blockingRequirementIds.join(", ")}.`
    );
  }

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

function createVerificationSnapshot(
  report: LoopRedteamReport,
  checks: LoopCheckSnapshot
): LoopVerificationSnapshot {
  return {
    riskLevel: report.summary.riskLevel,
    mergeRiskScore: report.summary.mergeRiskScore,
    decayScore: report.summary.decayScore,
    securityScore: report.summary.securityScore,
    weakTestFindings: report.summary.weakTestFindings,
    productFailureBundles: report.summary.productFailureBundles,
    fixTasks: report.summary.fixTasks,
    checkStatus: checks.status,
    checksConfigured: checks.configured,
    checksTotal: checks.total,
    requirementStatuses: requirementStatuses(report)
  };
}

function requirementStatuses(report: LoopRedteamReport): LoopRoundSnapshot["requirementStatuses"] {
  return report.requirementTrace?.criteria.map((criterion) => ({
    requirementId: criterion.requirementId,
    status: criterion.status
  }));
}

function requirementIdsForFile(report: LoopRedteamReport, file: string): string[] {
  return report.requirementTrace?.criteria
    .filter((criterion) => criterion.implementation.files.includes(file))
    .map((criterion) => criterion.requirementId) ?? [];
}

function recordPostAgentVerification(
  round: LoopRoundSnapshot | undefined,
  report: LoopRedteamReport,
  checks: LoopCheckSnapshot
): void {
  if (round?.agent?.madeChanges) {
    round.postAgentVerification = createVerificationSnapshot(report, checks);
  }
}

async function revalidateFinalAgentEdit(
  input: CodeDecayLoopInput,
  finalRound: LoopRoundSnapshot | undefined,
  previousAgentRound: PreviousAgentRound | undefined,
  safeRiskLevel: LoopRedteamReport["summary"]["riskLevel"],
  securityScoreThreshold: number,
  currentStatus: LoopStatus,
  hypothesisStatuses: LoopHypothesisStatusSnapshot[]
): Promise<{ report: LoopRedteamReport; checks: LoopCheckSnapshot; status: LoopStatus }> {
  const report = await input.createRedteamReport();
  const checks = await input.runConfiguredChecks();
  recordPostAgentVerification(finalRound, report, checks);

  if (finalRound) {
    finalRound.stateMachine = createStateMachineSnapshot(
      "current-tree-reverify",
      report,
      checks,
      createChangedFilesFingerprint(input.getChangedFiles()),
      [
        ...(finalRound.stateMachine?.decisions ?? []),
        {
          phase: "current-tree-reverify",
          actor: "codedecay",
          summary: "Final current-tree revalidation after the last builder edit.",
          evidenceIds: loopEvidenceIds(report, checks)
        }
      ],
      hypothesisStatuses
    );
  }

  if (finalRound?.agent?.madeChanges && previousAgentRound?.madeChanges) {
    finalRound.riskReducedFromPreviousRound = didLoopEvidenceImprove(
      previousAgentRound.evidence,
      createLoopProgressSnapshot(report, checks)
    );
  }

  const status = revalidatedStatus({
    currentStatus,
    agentStatus: finalRound?.agent?.status,
    report,
    checks,
    safeRiskLevel,
    securityScoreThreshold,
    exhaustedRounds: finalRound !== undefined && finalRound.round >= normalizeMaxRounds(input.maxRounds)
  });
  return { report, checks, status };
}

function preservesTerminalReason(status: LoopStatus): boolean {
  return status === "unsafe-change" ||
    status === "builder-error" ||
    status === "verifier-error" ||
    status === "agent-error";
}

function revalidatedStatus(input: {
  currentStatus: LoopStatus;
  agentStatus: LoopAgentResult["status"] | undefined;
  report: LoopRedteamReport;
  checks: LoopCheckSnapshot;
  safeRiskLevel: LoopRedteamReport["summary"]["riskLevel"];
  securityScoreThreshold: number;
  exhaustedRounds: boolean;
}): LoopStatus {
  if (preservesTerminalReason(input.currentStatus) || input.agentStatus !== "passed") {
    return input.currentStatus;
  }

  const safeStatus = classifySafeStatus(input.report, input.checks, input.safeRiskLevel, input.securityScoreThreshold);
  if (safeStatus) {
    return safeStatus;
  }

  return input.exhaustedRounds ? "budget-exhausted" : "needs-human";
}

function didExecuteCommands(rounds: LoopRoundSnapshot[]): boolean {
  return rounds.some((round) => {
    if (
      didCheckExecuteCommand(round.checkStatus) ||
      (round.postAgentVerification && didCheckExecuteCommand(round.postAgentVerification.checkStatus))
    ) {
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
    case "verified":
    case "merge-safe-verified":
      return [
        "Review the working tree diff.",
        "Commit the verified changes yourself when ready.",
        "Treat this as configured-check clean, not a guarantee of production safety."
      ];
    case "shallow-proof":
    case "merge-safe-shallow":
      return [
        "Review the working tree diff and the missing-depth list before merge.",
        "Enable Semgrep, coverage, and StrykerJS adapters to upgrade this verdict to verified.",
        "Treat this as shallow configured-check clean, not a guarantee of production safety."
      ];
    case "unverified":
      return [
        "Add or enable configured checks in .codedecay/config.yml.",
        "Run codedecay loop again after tests/build/probes can execute.",
        "Do not treat this PR as verified until real checks pass."
      ];
    case "plan-only":
      return [
        "Review the generated agent bundle and fix tasks.",
        "Run again with --agent-cmd or --builder-cmd only after configuring a user-owned local agent command.",
        "Keep safety.allowCommands false unless you explicitly want CodeDecay to run local commands."
      ];
    case "stuck":
      return [
        "Inspect the agent stdout/stderr and working tree.",
        "Narrow the task or fix the remaining high-signal findings manually.",
        "Run codedecay loop again after making a concrete change."
      ];
    case "budget-exhausted":
      return [
        "The loop exhausted its configured round budget before reaching trusted proof.",
        "Review remaining fix tasks and verifier output manually.",
        "Increase --max-rounds only if prior rounds show measurable evidence gain."
      ];
    case "unsafe-change":
      return [
        "A read-only verifier or protected role changed files.",
        "Inspect the working tree before continuing.",
        "Re-run with a verifier command that cannot edit the repository."
      ];
    case "builder-error":
    case "agent-error":
      return [
        "Fix the configured --agent-cmd/--builder-cmd or safety.allowCommands settings.",
        "Remember agent output is untrusted until deterministic checks pass.",
        "Run in plan-only mode to inspect the prompt that would be sent."
      ];
    case "verifier-error":
      return [
        "Fix the configured --verifier-cmd or run without a verifier command.",
        "Do not let builder output self-verify the result.",
        "Use deterministic checks and current-tree redteam evidence as the source of truth."
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
