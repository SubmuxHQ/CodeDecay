import type { CodeDecayConfig } from "@submuxhq/codedecay-config";
import type { CodeDecayReport, RequirementContext } from "@submuxhq/codedecay-core";
import type {
  RedteamConsequenceHypothesis,
  RedteamConfiguredCheck,
  RedteamExperimentAttachedResult,
  RedteamExperimentCommand,
  RedteamExperimentPlan,
  RedteamExperimentStep,
  RedteamExperimentTargetKind,
  RedteamExperimentToolAdapter,
  RedteamHypothesisReport,
  RedteamHypothesisVerifier,
  RedteamToolAdapterPlan,
  RedteamVerificationSummary
} from "./types";

export interface CreateExperimentPlansInput {
  analysisReport: CodeDecayReport;
  config: CodeDecayConfig;
  hypotheses?: RedteamHypothesisReport | undefined;
  requirements?: RequirementContext | undefined;
  configuredChecks: RedteamConfiguredCheck[];
  toolAdapterPlans: RedteamToolAdapterPlan[];
  verification?: RedteamVerificationSummary | undefined;
}

export function createExperimentPlans(input: CreateExperimentPlansInput): RedteamExperimentPlan[] {
  const hypotheses = [
    ...(input.hypotheses?.hypotheses ?? []),
    ...(input.hypotheses?.overflow ?? [])
  ].filter((hypothesis) => hypothesis.status === "candidate" || hypothesis.status === "planned");

  return hypotheses.slice(0, 8).map((hypothesis, index) =>
    createExperimentPlan(input, hypothesis, index + 1)
  );
}

function createExperimentPlan(
  input: CreateExperimentPlansInput,
  hypothesis: RedteamConsequenceHypothesis,
  index: number
): RedteamExperimentPlan {
  const commands = experimentCommands(input, hypothesis.proposedVerifier);
  const target = experimentTarget(input, hypothesis);
  const blockers = experimentBlockers(input, hypothesis, commands, target.networkTargets);
  const timeoutMs = firstTimeout(commands) ?? 30_000;
  const status = blockers.length > 0 ? "needs-human" : "valid";

  return {
    id: `experiment-${index}`,
    hypothesisId: hypothesis.id,
    requirementIds: requirementIds(input.requirements, hypothesis),
    target,
    preconditions: preconditions(input, hypothesis, commands),
    setup: setupSteps(input, commands),
    action: {
      description: actionDescription(hypothesis),
      command: commands[0]?.command,
      files: target.files,
      env: requiredEnvNames(input)
    },
    oracle: {
      description: `Compare observable base/head behavior for: ${hypothesis.claim}`,
      disconfirmingResult: hypothesis.disconfirmingResult,
      expectedBase: "Base ref preserves the existing accepted behavior.",
      expectedHead: "Head ref should match base unless this is an explicitly accepted behavior change."
    },
    baseHeadExpectation: "Run the same approved experiment against isolated base and head worktrees; classify changed output as review-required evidence.",
    toolAdapter: experimentToolAdapter(input, hypothesis.proposedVerifier),
    commands,
    timeoutMs,
    cleanup: cleanupPlan(input),
    requiredSecrets: requiredEnvNames(input),
    riskClass: blockers.length > 0 ? "blocked" : riskClass(hypothesis, target.networkTargets),
    approvalState: "proposed",
    status,
    willRun: false,
    networkBoundary: networkBoundary(target.networkTargets),
    generatedArtifacts: [
      { kind: "plan", promoteRequiresApproval: false },
      { kind: "generated-test", promoteRequiresApproval: true },
      { kind: "stdout", promoteRequiresApproval: false },
      { kind: "stderr", promoteRequiresApproval: false },
      { kind: "diff", promoteRequiresApproval: false }
    ],
    attachedResults: attachedResults(input.verification, commands, hypothesis.proposedVerifier),
    limitations: blockers
  };
}

function experimentCommands(
  input: CreateExperimentPlansInput,
  verifier: RedteamHypothesisVerifier
): RedteamExperimentCommand[] {
  if (verifier.kind === "configured-check") {
    return input.configuredChecks
      .filter((check) => matchesName(check.name, verifier.name) || check.command === verifier.command)
      .map((check) => ({
        label: check.name,
        command: check.command,
        source: "configured-check",
        timeoutMs: check.timeoutMs
      }));
  }

  if (verifier.kind === "oss-tool-adapter" || verifier.kind === "static-analyzer") {
    return input.toolAdapterPlans
      .filter((plan) => matchesName(plan.name, verifier.name) || plan.command === verifier.command)
      .map((plan) => ({
        label: plan.name,
        command: plan.command,
        source: "tool-adapter",
        timeoutMs: plan.timeoutMs
      }));
  }

  if (verifier.kind === "product-probe") {
    return productTargetCommands(input.config);
  }

  if (verifier.kind === "differential") {
    return [{ label: "CodeDecay differential", command: "npx codedecay differential --base <base> --head <head> --format json", source: "differential" }];
  }

  return verifier.command
    ? [{ label: verifier.name, command: verifier.command, source: "configured-check" }]
    : [];
}

function productTargetCommands(config: CodeDecayConfig): RedteamExperimentCommand[] {
  return Object.values(config.productTesting.targets).flatMap((target) => {
    const commands: RedteamExperimentCommand[] = [];
    if (target.startCommand) {
      commands.push({ label: `${target.id} start`, command: target.startCommand, source: "product-target", timeoutMs: target.timeoutMs });
    }
    if (target.authSetupCommand) {
      commands.push({ label: `${target.id} auth setup`, command: target.authSetupCommand, source: "product-target", timeoutMs: target.timeoutMs });
    }
    return commands;
  });
}

function experimentToolAdapter(
  input: CreateExperimentPlansInput,
  verifier: RedteamHypothesisVerifier
): RedteamExperimentToolAdapter {
  const configured =
    verifier.kind === "differential" ||
    input.configuredChecks.some((check) => matchesName(check.name, verifier.name) || check.command === verifier.command) ||
    input.toolAdapterPlans.some((plan) => matchesName(plan.name, verifier.name) || plan.command === verifier.command) ||
    (verifier.kind === "product-probe" && Object.keys(input.config.productTesting.targets).length > 0);

  return {
    kind: verifier.kind,
    name: verifier.name,
    configured
  };
}

function experimentTarget(
  input: CreateExperimentPlansInput,
  hypothesis: RedteamConsequenceHypothesis
): RedteamExperimentPlan["target"] {
  const files = relatedFiles(input, hypothesis);
  const routes = input.analysisReport.impactedRoutes?.map((route) => route.route).slice(0, 8) ?? [];
  const networkTargets = Object.values(input.config.productTesting.targets)
    .flatMap((target) => [target.baseUrl, target.healthCheck, target.readiness.effectiveBaseUrl])
    .filter((value): value is string => Boolean(value));

  return {
    kind: targetKind(hypothesis, routes),
    name: hypothesis.affectedRequirementOrFlow,
    files,
    routes,
    networkTargets
  };
}

function relatedFiles(input: CreateExperimentPlansInput, hypothesis: RedteamConsequenceHypothesis): string[] {
  const changedFiles = input.analysisReport.changedFiles.map((file) => file.path);
  const evidenceFiles = hypothesis.evidenceIds
    .map((id) => changedFiles.find((path) => id.includes(path)))
    .filter((path): path is string => Boolean(path));
  return [...new Set([...evidenceFiles, ...changedFiles.slice(0, 5)])];
}

function targetKind(hypothesis: RedteamConsequenceHypothesis, routes: string[]): RedteamExperimentTargetKind {
  const text = [
    hypothesis.claim,
    hypothesis.affectedRequirementOrFlow,
    hypothesis.proposedVerifier.name,
    hypothesis.userVisibleConsequence
  ].join(" ").toLocaleLowerCase();

  if (hypothesis.proposedVerifier.kind === "human-decision") {
    return "human";
  }
  if (text.includes("browser") || text.includes("ui") || text.includes("user flow")) {
    return "browser";
  }
  if (routes.length > 0 || text.includes("api") || text.includes("route") || text.includes("http")) {
    return "api";
  }
  if (text.includes("cli") || text.includes("command") || text.includes("stdout")) {
    return "cli";
  }
  return hypothesis.proposedVerifier.kind === "static-analyzer" ? "static" : "cli";
}

function experimentBlockers(
  input: CreateExperimentPlansInput,
  hypothesis: RedteamConsequenceHypothesis,
  commands: RedteamExperimentCommand[],
  networkTargets: string[]
): string[] {
  const blockers: string[] = [];
  const verifier = experimentToolAdapter(input, hypothesis.proposedVerifier);
  if (!verifier.configured && hypothesis.proposedVerifier.kind !== "human-decision") {
    blockers.push("No matching configured check, product target, differential probe, or tool adapter was found.");
  }
  if (!input.config.safety.allowCommands && commands.length > 0) {
    blockers.push("safety.allowCommands is false; explicit approval is required before execution.");
  }
  if (networkTargets.some((target) => !isLoopbackUrl(target))) {
    blockers.push("Experiment references a non-loopback network target; production or external targets require human review.");
  }
  if (requiredEnvNames(input).length > 0) {
    blockers.push("Experiment requires named environment values; CodeDecay will not read secret values in plan mode.");
  }
  if (hypothesis.proposedVerifier.kind === "human-decision") {
    blockers.push("Verifier is a human decision; no trusted runtime evidence can be collected automatically.");
  }
  return blockers;
}

function preconditions(
  input: CreateExperimentPlansInput,
  hypothesis: RedteamConsequenceHypothesis,
  commands: RedteamExperimentCommand[]
): string[] {
  return [
    "User approves this exact experiment plan.",
    "Base and head refs are supplied by the caller.",
    "Experiment runs in disposable base/head worktrees, never against production by default.",
    commands.length > 0
      ? "All listed commands are present in CodeDecay config or generated by CodeDecay itself."
      : `A verifier must be configured for ${hypothesis.proposedVerifier.name}.`,
    input.config.safety.allowCommands
      ? "Command execution is enabled by config, but this plan remains report-only until approved."
      : "Command execution is disabled by config."
  ];
}

function setupSteps(input: CreateExperimentPlansInput, commands: RedteamExperimentCommand[]): RedteamExperimentStep[] {
  return [
    {
      description: "Create isolated base and head git worktrees for the approved refs.",
      files: [],
      env: []
    },
    {
      description: commands.length > 0
        ? "Run the listed setup/check commands in each isolated worktree through packages/execution."
        : "Configure a safe command, probe, adapter, or product target before execution.",
      command: commands[0]?.command,
      files: [],
      env: requiredEnvNames(input)
    }
  ];
}

function actionDescription(hypothesis: RedteamConsequenceHypothesis): string {
  return `Exercise the consequence path and try to disconfirm: ${hypothesis.claim}`;
}

function cleanupPlan(input: CreateExperimentPlansInput): RedteamExperimentPlan["cleanup"] {
  const commands = Object.values(input.config.productTesting.targets)
    .map((target) => target.teardownCommand)
    .filter((command): command is string => Boolean(command));
  return {
    behavior: "Remove disposable worktrees and run configured teardown commands for product targets.",
    commands,
    failureMode: commands.length > 0 ? "needs-human" : "safe"
  };
}

function requirementIds(
  requirements: RequirementContext | undefined,
  hypothesis: RedteamConsequenceHypothesis
): string[] {
  return requirements?.acceptanceCriteria
    .filter((criterion) =>
      matchesName(criterion.id, hypothesis.affectedRequirementOrFlow) ||
      matchesName(criterion.text, hypothesis.affectedRequirementOrFlow)
    )
    .map((criterion) => criterion.id) ?? [];
}

function requiredEnvNames(input: CreateExperimentPlansInput): string[] {
  const names = Object.values(input.config.productTesting.targets)
    .map((target) => target.previewUrlEnv)
    .filter((name): name is string => Boolean(name));
  return [...new Set(names)];
}

function firstTimeout(commands: RedteamExperimentCommand[]): number | undefined {
  return commands.find((command) => command.timeoutMs !== undefined)?.timeoutMs;
}

function attachedResults(
  verification: RedteamVerificationSummary | undefined,
  commands: RedteamExperimentCommand[],
  verifier: RedteamHypothesisVerifier
): RedteamExperimentAttachedResult[] {
  if (!verification) {
    return [];
  }

  return verification.checks
    .filter((check) =>
      commands.some((command) => command.command === check.command || matchesName(command.label, check.name)) ||
      matchesName(check.name, verifier.name) ||
      (verifier.kind === "differential" && check.differentialStatus !== undefined)
    )
    .map((check) => {
      const result: RedteamExperimentAttachedResult = {
        checkName: check.name,
        status: check.status,
        proof: check.proof,
        summary: check.summary
      };

      if (check.command !== undefined) {
        result.command = check.command;
      }

      if (check.artifacts?.directory !== undefined) {
        result.artifactDirectory = check.artifacts.directory;
      }

      return result;
    });
}

function riskClass(hypothesis: RedteamConsequenceHypothesis, networkTargets: string[]): RedteamExperimentPlan["riskClass"] {
  if (networkTargets.length > 0) {
    return "medium";
  }
  return hypothesis.severitySuggestion === "high" ? "medium" : "low";
}

function networkBoundary(networkTargets: string[]): RedteamExperimentPlan["networkBoundary"] {
  if (networkTargets.length === 0) {
    return "none";
  }
  return networkTargets.every(isLoopbackUrl) ? "loopback-only" : "needs-human";
}

function isLoopbackUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
  } catch {
    return false;
  }
}

function matchesName(left: string | undefined, right: string | undefined): boolean {
  if (!left || !right) {
    return false;
  }
  const normalizedLeft = left.toLocaleLowerCase();
  const normalizedRight = right.toLocaleLowerCase();
  return normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft);
}
