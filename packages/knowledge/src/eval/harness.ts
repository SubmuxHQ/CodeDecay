import { createHash } from "node:crypto";
import { runFakeAgent } from "./fake-agents";
import { buildAgentPrompt, detectAnswerLeak, detectLabelSwap, judgeTrial } from "./integrity";
import {
  AGENT_EFFICACY_SCHEMA_VERSION,
  type AgentKind,
  type EfficacyRunReport,
  type EfficacyScenario,
  type EfficacyTrialResult
} from "./types";

export interface RunAgentEfficacyOptions {
  scenarios: EfficacyScenario[];
  runId?: string | undefined;
  generatedAt?: string | undefined;
  controlAgent?: AgentKind | undefined;
  treatmentAgent?: AgentKind | undefined;
  publishedPackageTreatment?: boolean | undefined;
  /** Force a label-swap integrity failure for tests. */
  swapLabels?: boolean | undefined;
  /** Force oracle secret into prompts for tests. */
  leakOracleSecret?: boolean | undefined;
}

const DEFAULT_SCENARIOS: EfficacyScenario[] = [
  {
    id: "api-auth-regression",
    title: "Authorization regression hidden by weak tests",
    requirementIds: ["REQ-AUTH-1"],
    plantedDefect: "missing-role-check",
    cleanDecoy: "rename-helper",
    expectedOracle: { mustDetectDefect: true, mustNotFlagDecoy: true },
    allowedTools: ["codedecay.redteam", "codedecay.execute"],
    oracleSecret: "oracle-auth-9f3a"
  },
  {
    id: "idempotent-retry",
    title: "Duplicate job delivery side effect",
    requirementIds: ["REQ-JOB-1"],
    plantedDefect: "non-idempotent-handler",
    expectedOracle: { mustDetectDefect: true },
    allowedTools: ["codedecay.concurrency"],
    oracleSecret: "oracle-job-2c1b"
  }
];

export function defaultEfficacyScenarios(): EfficacyScenario[] {
  return DEFAULT_SCENARIOS.map((scenario) => ({ ...scenario }));
}

export function runAgentEfficacyEval(options: RunAgentEfficacyOptions): EfficacyRunReport {
  const scenarios = options.scenarios;
  const controlAgent = options.controlAgent ?? "honest-fake";
  const treatmentAgent = options.treatmentAgent ?? "honest-fake";
  const trials: EfficacyTrialResult[] = [];
  const integrityIssues: string[] = [];
  let labelSwapDetected = false;
  let answerLeakDetected = false;
  let providerFailuresCounted = 0;
  let contaminationFailures = 0;
  let controlVerified = 0;
  let treatmentVerified = 0;

  for (const scenario of scenarios) {
    const hints = [
      "Run redteam evidence before claiming verified.",
      `Investigate planted risk class without revealing oracle secret.`,
      "Revalidate current tree after repair."
    ];
    const controlPrompt = buildAgentPrompt("control", scenario);
    const treatmentPrompt = options.leakOracleSecret
      ? `${buildAgentPrompt("treatment", scenario, hints)}\nEXPECTED ${scenario.oracleSecret}`
      : buildAgentPrompt("treatment", scenario, hints);

    const controlLeak = detectAnswerLeak(scenario, controlPrompt);
    const treatmentLeak = detectAnswerLeak(scenario, treatmentPrompt);
    if (controlLeak || treatmentLeak) {
      answerLeakDetected = true;
      integrityIssues.push(controlLeak ?? treatmentLeak!);
    }

    let control = runFakeAgent(controlAgent, { arm: "control", scenario });
    let treatment = runFakeAgent(treatmentAgent, {
      arm: "treatment",
      scenario,
      codedecayHints: hints
    });

    if (options.swapLabels) {
      const swappedControl = { ...treatment, arm: "control" as const };
      const swappedTreatment = { ...control, arm: "treatment" as const };
      control = swappedControl;
      treatment = swappedTreatment;
      labelSwapDetected = true;
      integrityIssues.push("Control/treatment labels were swapped.");
    }

    const swapIssue = detectLabelSwap(control, treatment);
    // When arms are correctly labeled, swapIssue is undefined. When we forced content swap but kept arm tags, detect via option flag above.
    if (swapIssue) {
      labelSwapDetected = true;
      integrityIssues.push(swapIssue);
    }

    const controlVerdict = judgeTrial(scenario, control);
    const treatmentVerdict = judgeTrial(scenario, treatment);
    if (controlVerdict === "provider-unavailable" || controlVerdict === "timeout") providerFailuresCounted += 1;
    if (treatmentVerdict === "provider-unavailable" || treatmentVerdict === "timeout") providerFailuresCounted += 1;
    if (controlVerdict === "contamination" || treatmentVerdict === "contamination") contaminationFailures += 1;
    if (controlVerdict === "verified-completion") controlVerified += 1;
    if (treatmentVerdict === "verified-completion") treatmentVerified += 1;

    const issues: string[] = [];
    if (answerLeakDetected) issues.push("answer-leak");
    if (labelSwapDetected) issues.push("label-swap");

    trials.push({
      scenarioId: scenario.id,
      control,
      treatment,
      controlVerdict,
      treatmentVerdict,
      treatmentImproved:
        treatmentVerdict === "verified-completion" && controlVerdict !== "verified-completion",
      issues
    });
  }

  const runId =
    options.runId ??
    createHash("sha256")
      .update(JSON.stringify({ scenarios: scenarios.map((s) => s.id), controlAgent, treatmentAgent }))
      .digest("hex")
      .slice(0, 12);

  return {
    tool: "CodeDecay",
    schemaVersion: AGENT_EFFICACY_SCHEMA_VERSION,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    runId,
    mode: "deterministic-fake-agent",
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
      "Deterministic fake-agent runs prove harness integrity, not real-model efficacy.",
      "Opt-in real Codex/Claude/BYOK trials remain required before Staff-Engineer-equivalent claims.",
      "Ratcheting release thresholds must be set from an unbiased baseline after real-agent runs."
    ],
    fullyVerified: false,
    safety: {
      commandsExecuted: false,
      networkCalled: false,
      hiddenProviderCalls: false,
      telemetry: false
    }
  };
}

export function renderAgentEfficacyMarkdown(report: EfficacyRunReport): string {
  const lines = [
    "## CodeDecay Agent Efficacy Eval",
    "",
    `Run: \`${report.runId}\`; mode: \`${report.mode}\`; publishedPackageTreatment: \`${report.publishedPackageTreatment}\`.`,
    `Summary: controlVerified=${report.summary.controlVerified}, treatmentVerified=${report.summary.treatmentVerified}, providerFailures=${report.summary.providerFailuresCounted}, contamination=${report.summary.contaminationFailures}.`,
    `Integrity: labelSwap=${report.integrity.labelSwapDetected}, answerLeak=${report.integrity.answerLeakDetected}.`,
    "",
    "### Trials",
    ""
  ];
  for (const trial of report.trials) {
    lines.push(
      `- \`${trial.scenarioId}\` control=${trial.controlVerdict} treatment=${trial.treatmentVerdict} improved=${trial.treatmentImproved}`
    );
  }
  lines.push("", "### Limitations", "");
  for (const limitation of report.limitations) lines.push(`- ${limitation}`);
  return `${lines.join("\n")}\n`;
}
