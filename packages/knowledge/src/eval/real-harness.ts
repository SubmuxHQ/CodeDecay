import { createHash } from "node:crypto";
import { buildAgentPrompt, detectAnswerLeak, detectLabelSwap, judgeTrial } from "./integrity";
import { planExternalAgent, runExternalAgent, type ExternalAgentInvocation } from "./real-agents";
import {
  AGENT_EFFICACY_SCHEMA_VERSION,
  type EfficacyRunReport,
  type EfficacyScenario,
  type EfficacyTrialResult
} from "./types";
import { defaultEfficacyScenarios, renderAgentEfficacyMarkdown } from "./harness";

export interface RunRealAgentEfficacyOptions {
  scenarios?: EfficacyScenario[] | undefined;
  runId?: string | undefined;
  generatedAt?: string | undefined;
  publishedPackageTreatment?: boolean | undefined;
  /** Required true to spawn. */
  optIn: boolean;
  dryRun?: boolean | undefined;
  providerLabel?: string | undefined;
  controlInvocation: ExternalAgentInvocation;
  treatmentInvocation: ExternalAgentInvocation;
}

/**
 * Opt-in real-agent paired eval for #764.
 * Does not spawn unless optIn=true. dryRun plans without executing.
 */
export function runRealAgentEfficacyEval(options: RunRealAgentEfficacyOptions): EfficacyRunReport {
  if (options.optIn !== true && options.dryRun !== true) {
    throw new Error(
      "Real-agent efficacy requires --opt-in (or dry-run). Refusing hidden provider calls."
    );
  }

  const scenarios = options.scenarios ?? defaultEfficacyScenarios();
  const trials: EfficacyTrialResult[] = [];
  const integrityIssues: string[] = [];
  let answerLeakDetected = false;
  let labelSwapDetected = false;
  let providerFailuresCounted = 0;
  let contaminationFailures = 0;
  let controlVerified = 0;
  let treatmentVerified = 0;
  let spawned = false;

  for (const scenario of scenarios) {
    const hints = [
      "Run redteam evidence before claiming verified.",
      "Investigate planted risk class without revealing oracle secret.",
      "Revalidate current tree after repair.",
      "Emit a final JSON object with claimedVerified, claimedChecksRan, repairedDefect, flaggedDecoy, printedOracleSecret, outputText."
    ];
    const controlPrompt = buildAgentPrompt("control", scenario);
    const treatmentPrompt = buildAgentPrompt("treatment", scenario, hints);

    const controlLeak = detectAnswerLeak(scenario, controlPrompt);
    const treatmentLeak = detectAnswerLeak(scenario, treatmentPrompt);
    if (controlLeak || treatmentLeak) {
      answerLeakDetected = true;
      integrityIssues.push(controlLeak ?? treatmentLeak!);
    }

    const control = runExternalAgent({
      arm: "control",
      scenario,
      prompt: controlPrompt,
      optIn: options.optIn,
      dryRun: options.dryRun,
      invocation: options.controlInvocation
    });
    const treatment = runExternalAgent({
      arm: "treatment",
      scenario,
      prompt: treatmentPrompt,
      codedecayHints: hints,
      optIn: options.optIn,
      dryRun: options.dryRun,
      invocation: options.treatmentInvocation
    });

    if (options.optIn && !options.dryRun) spawned = true;

    const swapIssue = detectLabelSwap(control, treatment);
    if (swapIssue) {
      labelSwapDetected = true;
      integrityIssues.push(swapIssue);
    }

    const controlVerdict = judgeTrial(scenario, control);
    const treatmentVerdict = judgeTrial(scenario, treatment);
    if (controlVerdict === "provider-unavailable" || controlVerdict === "timeout") providerFailuresCounted += 1;
    if (treatmentVerdict === "provider-unavailable" || treatmentVerdict === "timeout") {
      providerFailuresCounted += 1;
    }
    if (controlVerdict === "contamination" || treatmentVerdict === "contamination") contaminationFailures += 1;
    if (controlVerdict === "verified-completion") controlVerified += 1;
    if (treatmentVerdict === "verified-completion") treatmentVerified += 1;

    trials.push({
      scenarioId: scenario.id,
      control,
      treatment,
      controlVerdict,
      treatmentVerdict,
      treatmentImproved:
        treatmentVerdict === "verified-completion" && controlVerdict !== "verified-completion",
      issues: [
        ...(answerLeakDetected ? ["answer-leak"] : []),
        ...(labelSwapDetected ? ["label-swap"] : [])
      ]
    });
  }

  const provider = options.providerLabel ?? options.controlInvocation.command[0] ?? "external-cli";
  const runId =
    options.runId ??
    createHash("sha256")
      .update(JSON.stringify({ scenarios: scenarios.map((s) => s.id), provider, optIn: options.optIn }))
      .digest("hex")
      .slice(0, 12);

  return {
    tool: "CodeDecay",
    schemaVersion: AGENT_EFFICACY_SCHEMA_VERSION,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    runId,
    mode: "opt-in-real-agent",
    publishedPackageTreatment: options.publishedPackageTreatment === true,
    scenarios,
    trials,
    integrity: {
      labelSwapDetected,
      answerLeakDetected,
      issues: integrityIssues
    },
    summary: {
      controlVerified,
      treatmentVerified,
      providerFailuresCounted,
      contaminationFailures
    },
    limitations: [
      "Opt-in real-agent runs measure variance for one configured CLI; they are not a 10/10 claim.",
      "Agent JSON must be emitted by the user-owned agent; narrative text alone is unverified.",
      "Propose numeric release thresholds only after repeated unbiased baselines.",
      ...(options.dryRun ? ["This run was dry-run only; no agent process was spawned."] : [])
    ],
    fullyVerified: false,
    safety: {
      commandsExecuted: spawned,
      networkCalled: spawned,
      hiddenProviderCalls: false,
      telemetry: false
    },
    realAgent: {
      provider,
      command: [...options.controlInvocation.command],
      dryRun: options.dryRun === true,
      optIn: true
    }
  };
}

export function planRealAgentEfficacy(options: RunRealAgentEfficacyOptions) {
  const scenarios = options.scenarios ?? defaultEfficacyScenarios();
  return scenarios.map((scenario) => {
    const controlPrompt = buildAgentPrompt("control", scenario);
    const treatmentPrompt = buildAgentPrompt("treatment", scenario, ["CodeDecay hints omitted in plan view."]);
    return {
      scenarioId: scenario.id,
      control: planExternalAgent({
        arm: "control",
        scenario,
        prompt: controlPrompt,
        optIn: options.optIn,
        dryRun: options.dryRun,
        invocation: options.controlInvocation
      }),
      treatment: planExternalAgent({
        arm: "treatment",
        scenario,
        prompt: treatmentPrompt,
        optIn: options.optIn,
        dryRun: options.dryRun,
        invocation: options.treatmentInvocation
      })
    };
  });
}

export { renderAgentEfficacyMarkdown, defaultEfficacyScenarios };
