import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { runConfiguredCommand, type CommandExecutionResult } from "@submuxhq/codedecay-execution";
import {
  createEvidence,
  createHarnessFailureResult,
  summarizeHarnessResult,
  type CodeDecayHarness,
  type Evidence,
  type EvidenceSeverity,
  type HarnessPlan,
  type HarnessPlanInput,
  type HarnessRunContext,
  type HarnessRunResult,
  type HarnessSummary
} from "@submuxhq/codedecay-harness";
import { createCoverageHarness, createConfiguredCoverageHarness } from "./coverage";
import { createSemgrepHarness, createConfiguredSemgrepHarness } from "./semgrep";
import {
  compactExecutionMetadata,
  evidenceSeverityFromExecution,
  failureModeFromExecution,
  harnessStatusFromExecution
} from "./shared/execution";
import { normalizeArtifactPath } from "./shared/paths";
import { elapsed, isPlainObject, optionalStringValue, validateNonEmptyString } from "./shared/values";
import type {
  AgentProcessHarnessOptions,
  CodeDecayAgentBundleFormat,
  CodeDecayAgentProcessToolAdapter,
  CodeDecayAgentProfile,
  CodeDecayCommandToolAdapter,
  CodeDecayConfig,
  CodeDecaySchemathesisToolAdapter,
  CodeDecayStrykerToolAdapter,
  ConfiguredToolAdapterKind,
  ConfiguredToolHarness,
  PactHarnessOptions,
  PlaywrightHarnessOptions,
  SchemathesisHarnessOptions,
  StrykerHarnessOptions
} from "./types";

export { createCoverageHarness, createSemgrepHarness };
export type {
  AgentProcessHarnessOptions,
  ConfiguredToolAdapterKind,
  ConfiguredToolHarness,
  CoverageHarnessOptions,
  PactHarnessOptions,
  PlaywrightHarnessOptions,
  SchemathesisHarnessOptions,
  SemgrepHarnessOptions,
  StrykerHarnessOptions
} from "./types";

const PLAYWRIGHT_HARNESS_NAME = "playwright";
const DEFAULT_PLAYWRIGHT_COMMAND = "pnpm exec playwright test";
const DEFAULT_PLAYWRIGHT_TIMEOUT_MS = 120_000;
const STRYKER_HARNESS_NAME = "stryker";
const DEFAULT_STRYKER_COMMAND = "pnpm exec stryker run";
const DEFAULT_STRYKER_TIMEOUT_MS = 300_000;
const DEFAULT_STRYKER_REPORT_PATH = "reports/mutation/mutation.json";
const SCHEMATHESIS_HARNESS_NAME = "schemathesis";
const DEFAULT_SCHEMATHESIS_SCHEMA = "openapi.yaml";
const DEFAULT_SCHEMATHESIS_BASE_URL = "http://127.0.0.1:3000";
const DEFAULT_SCHEMATHESIS_TIMEOUT_MS = 300_000;
const PACT_HARNESS_NAME = "pact";
const DEFAULT_PACT_COMMAND = "pnpm run test:pact";
const DEFAULT_PACT_TIMEOUT_MS = 180_000;
const AGENT_PROCESS_HARNESS_NAME = "agent-process";
const DEFAULT_AGENT_PROCESS_TIMEOUT_MS = 300_000;
const DEFAULT_AGENT_PROCESS_PROFILE: CodeDecayAgentProfile = "generic";
const DEFAULT_AGENT_PROCESS_BUNDLE_FORMAT: CodeDecayAgentBundleFormat = "markdown";
const AGENT_PROCESS_BUNDLE_DIR = ".codedecay/local/agent-process";

export function createAgentProcessHarness(options: AgentProcessHarnessOptions = {}): CodeDecayHarness {
  validateAgentProcessOptions(options);

  return {
    name: AGENT_PROCESS_HARNESS_NAME,
    capabilities: ["agent-reasoning", "execution"],
    requiredConfig: [
      {
        key: "agentProcess.command",
        description: "Command that runs a local user-owned agent or agent harness.",
        required: true
      },
      {
        key: "safety.allowCommands",
        description: "Must be true before CodeDecay runs configured commands.",
        required: true
      }
    ],
    plan: async (input) => createAgentProcessPlan(input, options),
    run: async (plan, context) => runAgentProcessPlan(plan, context, options),
    collectEvidence: async (result) => result.evidence,
    summarize: async (evidence) =>
      summarizeHarnessResult({
        harnessName: AGENT_PROCESS_HARNESS_NAME,
        status: evidence.some((item) => item.severity === "high") ? "failed" : "passed",
        durationMs: 0,
        evidence,
        artifacts: [],
        summary: `${AGENT_PROCESS_HARNESS_NAME} produced ${evidence.length} evidence item(s).`
      })
  };
}

export function createPlaywrightHarness(options: PlaywrightHarnessOptions = {}): CodeDecayHarness {
  const command = options.command ?? DEFAULT_PLAYWRIGHT_COMMAND;
  validatePlaywrightOptions({ ...options, command });

  return {
    name: PLAYWRIGHT_HARNESS_NAME,
    capabilities: ["browser-flow", "test-execution", "execution"],
    requiredConfig: [
      {
        key: "playwright.command",
        description: "Command that runs Playwright checks for the repo.",
        required: false
      },
      {
        key: "safety.allowCommands",
        description: "Must be true before CodeDecay runs configured commands.",
        required: true
      }
    ],
    plan: async (input) => createPlaywrightPlan(input, command, Boolean(options.allowCommands)),
    run: async (plan, context) => runPlaywrightPlan(plan, context, { ...options, command }),
    collectEvidence: async (result) => result.evidence,
    summarize: async (evidence) =>
      summarizeHarnessResult({
        harnessName: PLAYWRIGHT_HARNESS_NAME,
        status: evidence.some((item) => item.severity === "high") ? "failed" : "passed",
        durationMs: 0,
        evidence,
        artifacts: [],
        summary: `${PLAYWRIGHT_HARNESS_NAME} produced ${evidence.length} evidence item(s).`
      })
  };
}

export function createStrykerHarness(options: StrykerHarnessOptions = {}): CodeDecayHarness {
  const command = options.command ?? DEFAULT_STRYKER_COMMAND;
  validateStrykerOptions({ ...options, command });

  return {
    name: STRYKER_HARNESS_NAME,
    capabilities: ["mutation-testing", "test-execution", "execution"],
    requiredConfig: [
      {
        key: "stryker.command",
        description: "Command that runs StrykerJS mutation tests for the repo.",
        required: false
      },
      {
        key: "safety.allowCommands",
        description: "Must be true before CodeDecay runs configured commands.",
        required: true
      }
    ],
    plan: async (input) => createStrykerPlan(input, command, Boolean(options.allowCommands)),
    run: async (plan, context) => runStrykerPlan(plan, context, { ...options, command }),
    collectEvidence: async (result) => result.evidence,
    summarize: async (evidence) =>
      summarizeHarnessResult({
        harnessName: STRYKER_HARNESS_NAME,
        status: evidence.some((item) => item.severity === "high") ? "failed" : "passed",
        durationMs: 0,
        evidence,
        artifacts: [],
        summary: `${STRYKER_HARNESS_NAME} produced ${evidence.length} evidence item(s).`
      })
  };
}

export function createSchemathesisHarness(options: SchemathesisHarnessOptions = {}): CodeDecayHarness {
  const command = resolveSchemathesisCommand(options);
  validateSchemathesisOptions({ ...options, command });

  return {
    name: SCHEMATHESIS_HARNESS_NAME,
    capabilities: ["api-fuzzing", "test-execution", "execution"],
    requiredConfig: [
      {
        key: "schemathesis.command",
        description: "Command that runs Schemathesis API fuzzing for the repo.",
        required: false
      },
      {
        key: "schemathesis.schema",
        description: "OpenAPI or GraphQL schema path or URL used when no explicit command is provided.",
        required: false
      },
      {
        key: "schemathesis.baseUrl",
        description: "Base URL for file-based schemas when no explicit command is provided.",
        required: false
      },
      {
        key: "safety.allowCommands",
        description: "Must be true before CodeDecay runs configured commands.",
        required: true
      }
    ],
    plan: async (input) => createSchemathesisPlan(input, command, Boolean(options.allowCommands)),
    run: async (plan, context) => runSchemathesisPlan(plan, context, { ...options, command }),
    collectEvidence: async (result) => result.evidence,
    summarize: async (evidence) =>
      summarizeHarnessResult({
        harnessName: SCHEMATHESIS_HARNESS_NAME,
        status: evidence.some((item) => item.severity === "high") ? "failed" : "passed",
        durationMs: 0,
        evidence,
        artifacts: [],
        summary: `${SCHEMATHESIS_HARNESS_NAME} produced ${evidence.length} evidence item(s).`
      })
  };
}

export function createPactHarness(options: PactHarnessOptions = {}): CodeDecayHarness {
  const command = options.command ?? DEFAULT_PACT_COMMAND;
  validatePactOptions({ ...options, command });

  return {
    name: PACT_HARNESS_NAME,
    capabilities: ["contract-testing", "test-execution", "execution"],
    requiredConfig: [
      {
        key: "pact.command",
        description: "Command that runs Pact contract tests for the repo.",
        required: false
      },
      {
        key: "safety.allowCommands",
        description: "Must be true before CodeDecay runs configured commands.",
        required: true
      }
    ],
    plan: async (input) => createPactPlan(input, command, Boolean(options.allowCommands)),
    run: async (plan, context) => runPactPlan(plan, context, { ...options, command }),
    collectEvidence: async (result) => result.evidence,
    summarize: async (evidence) =>
      summarizeHarnessResult({
        harnessName: PACT_HARNESS_NAME,
        status: evidence.some((item) => item.severity === "high") ? "failed" : "passed",
        durationMs: 0,
        evidence,
        artifacts: [],
        summary: `${PACT_HARNESS_NAME} produced ${evidence.length} evidence item(s).`
      })
  };
}

export function createConfiguredToolHarnesses(config: CodeDecayConfig): ConfiguredToolHarness[] {
  const configured: ConfiguredToolHarness[] = [];

  if (config.toolAdapters.agentProcess?.enabled) {
    configured.push(createConfiguredAgentProcessHarness(config.toolAdapters.agentProcess, config.safety.allowCommands));
  }

  if (config.toolAdapters.playwright?.enabled) {
    configured.push(
      createConfiguredCommandHarness({
        kind: "playwright",
        name: "Playwright",
        adapter: config.toolAdapters.playwright,
        defaultCommand: DEFAULT_PLAYWRIGHT_COMMAND,
        create: createPlaywrightHarness,
        allowCommands: config.safety.allowCommands
      })
    );
  }

  if (config.toolAdapters.stryker?.enabled) {
    configured.push(createConfiguredStrykerHarness(config.toolAdapters.stryker, config.safety.allowCommands));
  }

  if (config.toolAdapters.schemathesis?.enabled) {
    configured.push(createConfiguredSchemathesisHarness(config.toolAdapters.schemathesis, config.safety.allowCommands));
  }

  if (config.toolAdapters.pact?.enabled) {
    configured.push(
      createConfiguredCommandHarness({
        kind: "pact",
        name: "Pact",
        adapter: config.toolAdapters.pact,
        defaultCommand: DEFAULT_PACT_COMMAND,
        create: createPactHarness,
        allowCommands: config.safety.allowCommands
      })
    );
  }

  if (config.toolAdapters.semgrep?.enabled) {
    configured.push(createConfiguredSemgrepHarness(config.toolAdapters.semgrep, config.safety.allowCommands));
  }

  if (config.toolAdapters.coverage?.enabled) {
    configured.push(createConfiguredCoverageHarness(config.toolAdapters.coverage, config.safety.allowCommands));
  }

  return configured;
}

function createConfiguredAgentProcessHarness(
  adapter: CodeDecayAgentProcessToolAdapter,
  allowCommands: boolean
): ConfiguredToolHarness {
  const options: AgentProcessHarnessOptions = {
    allowCommands
  };

  if (adapter.command !== undefined) {
    options.command = adapter.command;
  }

  if (adapter.profile !== undefined) {
    options.profile = adapter.profile;
  }

  if (adapter.bundleFormat !== undefined) {
    options.bundleFormat = adapter.bundleFormat;
  }

  if (adapter.timeoutMs !== undefined) {
    options.timeoutMs = adapter.timeoutMs;
  }

  const profile = options.profile ?? DEFAULT_AGENT_PROCESS_PROFILE;
  const bundleFormat = options.bundleFormat ?? DEFAULT_AGENT_PROCESS_BUNDLE_FORMAT;
  const configured: ConfiguredToolHarness = {
    kind: "agent-process",
    name: "Agent Process",
    command: options.command ?? "<agent command required>",
    context: {
      agentProfile: profile,
      agentBundleFormat: bundleFormat
    },
    harness: createAgentProcessHarness(options)
  };

  if (adapter.timeoutMs !== undefined) {
    configured.timeoutMs = adapter.timeoutMs;
  }

  return configured;
}

function createConfiguredCommandHarness(input: {
  kind: ConfiguredToolAdapterKind;
  name: string;
  adapter: CodeDecayCommandToolAdapter;
  defaultCommand: string;
  create: (options: { command: string; timeoutMs?: number | undefined; allowCommands: boolean }) => CodeDecayHarness;
  allowCommands: boolean;
}): ConfiguredToolHarness {
  const command = input.adapter.command ?? input.defaultCommand;
  const harnessOptions: { command: string; timeoutMs?: number | undefined; allowCommands: boolean } = {
    command,
    allowCommands: input.allowCommands
  };

  if (input.adapter.timeoutMs !== undefined) {
    harnessOptions.timeoutMs = input.adapter.timeoutMs;
  }

  const configured: ConfiguredToolHarness = {
    kind: input.kind,
    name: input.name,
    command,
    harness: input.create(harnessOptions)
  };

  if (input.adapter.timeoutMs !== undefined) {
    configured.timeoutMs = input.adapter.timeoutMs;
  }

  return configured;
}

function createConfiguredStrykerHarness(
  adapter: CodeDecayStrykerToolAdapter,
  allowCommands: boolean
): ConfiguredToolHarness {
  const command = adapter.command ?? DEFAULT_STRYKER_COMMAND;
  const options: StrykerHarnessOptions = {
    command,
    allowCommands
  };

  if (adapter.timeoutMs !== undefined) {
    options.timeoutMs = adapter.timeoutMs;
  }

  if (adapter.reportPath !== undefined) {
    options.reportPath = adapter.reportPath;
  }

  const configured: ConfiguredToolHarness = {
    kind: "stryker",
    name: "StrykerJS",
    command,
    harness: createStrykerHarness(options)
  };

  if (adapter.timeoutMs !== undefined) {
    configured.timeoutMs = adapter.timeoutMs;
  }

  return configured;
}

function createConfiguredSchemathesisHarness(
  adapter: CodeDecaySchemathesisToolAdapter,
  allowCommands: boolean
): ConfiguredToolHarness {
  const options: SchemathesisHarnessOptions = {
    allowCommands
  };

  if (adapter.command !== undefined) {
    options.command = adapter.command;
  }

  if (adapter.schema !== undefined) {
    options.schema = adapter.schema;
  }

  if (adapter.baseUrl !== undefined) {
    options.baseUrl = adapter.baseUrl;
  }

  if (adapter.timeoutMs !== undefined) {
    options.timeoutMs = adapter.timeoutMs;
  }

  const command = resolveSchemathesisCommand(options);
  const configured: ConfiguredToolHarness = {
    kind: "schemathesis",
    name: "Schemathesis",
    command,
    harness: createSchemathesisHarness(options)
  };

  if (adapter.timeoutMs !== undefined) {
    configured.timeoutMs = adapter.timeoutMs;
  }

  return configured;
}

function createAgentProcessPlan(input: HarnessPlanInput, options: AgentProcessHarnessOptions): HarnessPlan {
  const command = options.command ?? "<agent command required>";
  const profile = options.profile ?? DEFAULT_AGENT_PROCESS_PROFILE;
  const bundleFormat = options.bundleFormat ?? DEFAULT_AGENT_PROCESS_BUNDLE_FORMAT;

  return {
    id: "agent-process-review",
    harnessName: AGENT_PROCESS_HARNESS_NAME,
    summary: "Run a configured local agent process against a CodeDecay task bundle and collect untrusted suggestions.",
    requiresApproval: !options.allowCommands,
    steps: [
      {
        id: "prepare-agent-bundle",
        title: "Prepare agent task bundle",
        description: `Write a ${bundleFormat} CodeDecay agent bundle for profile ${profile} under ${AGENT_PROCESS_BUNDLE_DIR}.`
      },
      {
        id: "run-agent-process",
        title: "Run local agent process",
        description: `Run \`${command}\` from ${input.cwd} with CODEDECAY_AGENT_BUNDLE_PATH set.`
      }
    ]
  };
}

async function runAgentProcessPlan(
  plan: HarnessPlan,
  context: HarnessRunContext,
  options: AgentProcessHarnessOptions
): Promise<HarnessRunResult> {
  validateAgentProcessPlan(plan);
  const startedAt = Date.now();
  const profile = options.profile ?? DEFAULT_AGENT_PROCESS_PROFILE;
  const bundleFormat = options.bundleFormat ?? DEFAULT_AGENT_PROCESS_BUNDLE_FORMAT;
  const command = options.command;

  if (!command) {
    const durationMs = elapsed(startedAt);
    const evidence = [
      createEvidence({
        source: { kind: "agent", name: "Agent Process", id: AGENT_PROCESS_HARNESS_NAME },
        kind: "agent-suggestion",
        severity: "info",
        summary: "Agent process was skipped because no local agent command was configured.",
        trusted: false,
        metadata: {
          status: "skipped",
          profile,
          bundleFormat,
          untrusted: true
        }
      })
    ];

    return createHarnessFailureResult({
      harnessName: AGENT_PROCESS_HARNESS_NAME,
      mode: "missing-config",
      message: "Agent process requires toolAdapters.agentProcess.command before CodeDecay can run it.",
      status: "skipped",
      durationMs,
      evidence
    });
  }

  const bundle = writeAgentProcessBundle(context.cwd, context.context, profile, bundleFormat);
  const timeoutMs = context.timeoutMs ?? options.timeoutMs ?? DEFAULT_AGENT_PROCESS_TIMEOUT_MS;
  const execution = await runConfiguredCommand({
    command,
    cwd: context.cwd,
    timeoutMs,
    outputLimit: options.outputLimit,
    env: {
      CODEDECAY_AGENT_BUNDLE_PATH: bundle.absolutePath,
      CODEDECAY_AGENT_BUNDLE_RELATIVE_PATH: bundle.artifactPath,
      CODEDECAY_AGENT_BUNDLE_FORMAT: bundle.bundleFormat,
      CODEDECAY_AGENT_PROFILE: profile,
      CODEDECAY_AGENT_OUTPUT_UNTRUSTED: "1"
    },
    safety: {
      allowCommands: options.allowCommands ?? false,
      allowUnsafeCommands: options.allowUnsafeCommands
    }
  });
  const durationMs = elapsed(startedAt);
  const artifacts = [{ path: bundle.artifactPath, description: "CodeDecay agent task bundle passed to the local agent process." }];
  const evidence = [agentProcessEvidenceFromExecution(execution, bundle, profile)];

  if (execution.status !== "passed") {
    const failed = createHarnessFailureResult({
      harnessName: AGENT_PROCESS_HARNESS_NAME,
      mode: failureModeFromExecution(execution),
      message: agentProcessFailureMessageFromExecution(execution),
      status: harnessStatusFromExecution(execution),
      durationMs,
      evidence
    });

    return {
      ...failed,
      artifacts
    };
  }

  return {
    harnessName: AGENT_PROCESS_HARNESS_NAME,
    status: "passed",
    durationMs,
    evidence,
    artifacts,
    summary: agentProcessEvidenceSummaryFromExecution(execution)
  };
}

function createPlaywrightPlan(
  input: HarnessPlanInput,
  command: string,
  allowCommands: boolean
): HarnessPlan {
  return {
    id: "playwright-browser-flow",
    harnessName: PLAYWRIGHT_HARNESS_NAME,
    summary: "Run configured Playwright browser/user-flow checks and collect tool evidence.",
    requiresApproval: !allowCommands,
    steps: [
      {
        id: "run-playwright",
        title: "Run Playwright checks",
        description: `Run \`${command}\` from ${input.cwd}.`
      }
    ]
  };
}

function createStrykerPlan(
  input: HarnessPlanInput,
  command: string,
  allowCommands: boolean
): HarnessPlan {
  return {
    id: "stryker-mutation-testing",
    harnessName: STRYKER_HARNESS_NAME,
    summary: "Run configured StrykerJS mutation tests and collect tool evidence.",
    requiresApproval: !allowCommands,
    steps: [
      {
        id: "run-stryker",
        title: "Run StrykerJS mutation tests",
        description: `Run \`${command}\` from ${input.cwd}.`
      }
    ]
  };
}

function createSchemathesisPlan(
  input: HarnessPlanInput,
  command: string,
  allowCommands: boolean
): HarnessPlan {
  return {
    id: "schemathesis-api-fuzzing",
    harnessName: SCHEMATHESIS_HARNESS_NAME,
    summary: "Run configured Schemathesis API fuzzing and collect tool evidence.",
    requiresApproval: !allowCommands,
    steps: [
      {
        id: "run-schemathesis",
        title: "Run Schemathesis API fuzzing",
        description: `Run \`${command}\` from ${input.cwd}.`
      }
    ]
  };
}

function createPactPlan(
  input: HarnessPlanInput,
  command: string,
  allowCommands: boolean
): HarnessPlan {
  return {
    id: "pact-contract-testing",
    harnessName: PACT_HARNESS_NAME,
    summary: "Run configured Pact contract tests and collect tool evidence.",
    requiresApproval: !allowCommands,
    steps: [
      {
        id: "run-pact",
        title: "Run Pact contract tests",
        description: `Run \`${command}\` from ${input.cwd}.`
      }
    ]
  };
}

async function runPlaywrightPlan(
  plan: HarnessPlan,
  context: HarnessRunContext,
  options: PlaywrightHarnessOptions & { command: string }
): Promise<HarnessRunResult> {
  validatePlan(plan);
  const startedAt = Date.now();
  const timeoutMs = context.timeoutMs ?? options.timeoutMs ?? DEFAULT_PLAYWRIGHT_TIMEOUT_MS;
  const execution = await runConfiguredCommand({
    command: options.command,
    cwd: context.cwd,
    timeoutMs,
    outputLimit: options.outputLimit,
    safety: {
      allowCommands: options.allowCommands ?? false,
      allowUnsafeCommands: options.allowUnsafeCommands
    }
  });
  const durationMs = elapsed(startedAt);
  const evidence = [evidenceFromExecution(execution)];

  if (execution.status === "passed") {
    return {
      harnessName: PLAYWRIGHT_HARNESS_NAME,
      status: "passed",
      durationMs,
      evidence,
      artifacts: [],
      summary: "Playwright checks passed."
    };
  }

  return createHarnessFailureResult({
    harnessName: PLAYWRIGHT_HARNESS_NAME,
    mode: failureModeFromExecution(execution),
    message: failureMessageFromExecution(execution),
    status: harnessStatusFromExecution(execution),
    durationMs,
    evidence
  });
}

async function runStrykerPlan(
  plan: HarnessPlan,
  context: HarnessRunContext,
  options: StrykerHarnessOptions & { command: string }
): Promise<HarnessRunResult> {
  validateStrykerPlan(plan);
  const startedAt = Date.now();
  const timeoutMs = context.timeoutMs ?? options.timeoutMs ?? DEFAULT_STRYKER_TIMEOUT_MS;
  const execution = await runConfiguredCommand({
    command: options.command,
    cwd: context.cwd,
    timeoutMs,
    outputLimit: options.outputLimit,
    safety: {
      allowCommands: options.allowCommands ?? false,
      allowUnsafeCommands: options.allowUnsafeCommands
    }
  });
  const durationMs = elapsed(startedAt);
  const mutationReport = analyzeStrykerMutationReport(context.cwd, options.reportPath ?? DEFAULT_STRYKER_REPORT_PATH);
  const evidence = [
    strykerEvidenceFromExecution(execution),
    ...strykerEvidenceFromReport(mutationReport, options.command)
  ];
  const artifacts = mutationReport?.reportPath
    ? [
        {
          path: mutationReport.reportPath,
          description: "StrykerJS mutation testing report."
        }
      ]
    : [];

  if (execution.status === "passed") {
    if (mutationReport?.parseError || (mutationReport && mutationReport.weakMutants.length > 0)) {
      const failed = createHarnessFailureResult({
        harnessName: STRYKER_HARNESS_NAME,
        mode: mutationReport.parseError ? "internal-error" : "no-evidence",
        message: mutationReport.parseError ?? strykerReportFailureMessage(mutationReport),
        status: "failed",
        durationMs,
        evidence
      });
      return {
        ...failed,
        artifacts
      };
    }

    return {
      harnessName: STRYKER_HARNESS_NAME,
      status: "passed",
      durationMs,
      evidence,
      artifacts,
      summary: "StrykerJS mutation checks passed."
    };
  }

  const failed = createHarnessFailureResult({
    harnessName: STRYKER_HARNESS_NAME,
    mode: failureModeFromExecution(execution),
    message: strykerFailureMessageFromExecution(execution),
    status: harnessStatusFromExecution(execution),
    durationMs,
    evidence
  });
  return {
    ...failed,
    artifacts
  };
}

async function runSchemathesisPlan(
  plan: HarnessPlan,
  context: HarnessRunContext,
  options: SchemathesisHarnessOptions & { command: string }
): Promise<HarnessRunResult> {
  validateSchemathesisPlan(plan);
  const startedAt = Date.now();
  const timeoutMs = context.timeoutMs ?? options.timeoutMs ?? DEFAULT_SCHEMATHESIS_TIMEOUT_MS;
  const execution = await runConfiguredCommand({
    command: options.command,
    cwd: context.cwd,
    timeoutMs,
    outputLimit: options.outputLimit,
    safety: {
      allowCommands: options.allowCommands ?? false,
      allowUnsafeCommands: options.allowUnsafeCommands
    }
  });
  const durationMs = elapsed(startedAt);
  const evidence = [schemathesisEvidenceFromExecution(execution)];

  if (execution.status === "passed") {
    return {
      harnessName: SCHEMATHESIS_HARNESS_NAME,
      status: "passed",
      durationMs,
      evidence,
      artifacts: [],
      summary: "Schemathesis API fuzzing passed."
    };
  }

  return createHarnessFailureResult({
    harnessName: SCHEMATHESIS_HARNESS_NAME,
    mode: failureModeFromExecution(execution),
    message: schemathesisFailureMessageFromExecution(execution),
    status: harnessStatusFromExecution(execution),
    durationMs,
    evidence
  });
}

async function runPactPlan(
  plan: HarnessPlan,
  context: HarnessRunContext,
  options: PactHarnessOptions & { command: string }
): Promise<HarnessRunResult> {
  validatePactPlan(plan);
  const startedAt = Date.now();
  const timeoutMs = context.timeoutMs ?? options.timeoutMs ?? DEFAULT_PACT_TIMEOUT_MS;
  const execution = await runConfiguredCommand({
    command: options.command,
    cwd: context.cwd,
    timeoutMs,
    outputLimit: options.outputLimit,
    safety: {
      allowCommands: options.allowCommands ?? false,
      allowUnsafeCommands: options.allowUnsafeCommands
    }
  });
  const durationMs = elapsed(startedAt);
  const evidence = [pactEvidenceFromExecution(execution)];

  if (execution.status === "passed") {
    return {
      harnessName: PACT_HARNESS_NAME,
      status: "passed",
      durationMs,
      evidence,
      artifacts: [],
      summary: "Pact contract tests passed."
    };
  }

  return createHarnessFailureResult({
    harnessName: PACT_HARNESS_NAME,
    mode: failureModeFromExecution(execution),
    message: pactFailureMessageFromExecution(execution),
    status: harnessStatusFromExecution(execution),
    durationMs,
    evidence
  });
}

function evidenceFromExecution(execution: CommandExecutionResult): Evidence {
  return createEvidence({
    source: {
      kind: "tool",
      name: "Playwright",
      id: "playwright"
    },
    kind: "browser-flow",
    severity: evidenceSeverityFromExecution(execution),
    summary: evidenceSummaryFromExecution(execution),
    trusted: true,
    command: execution.command,
    metadata: compactExecutionMetadata(execution)
  });
}

function strykerEvidenceFromExecution(execution: CommandExecutionResult): Evidence {
  return createEvidence({
    source: {
      kind: "tool",
      name: "StrykerJS",
      id: "stryker"
    },
    kind: "mutation",
    severity: evidenceSeverityFromExecution(execution),
    summary: strykerEvidenceSummaryFromExecution(execution),
    trusted: true,
    command: execution.command,
    metadata: compactExecutionMetadata(execution)
  });
}

interface StrykerMutationReportAnalysis {
  reportPath: string;
  totalMutants: number;
  survivedMutants: number;
  noCoverageMutants: number;
  weakMutants: StrykerWeakMutant[];
  mutationScore?: number | undefined;
  parseError?: string | undefined;
}

interface StrykerWeakMutant {
  id?: string | undefined;
  file: string;
  line?: number | undefined;
  status: "Survived" | "NoCoverage";
  mutatorName?: string | undefined;
  replacement?: string | undefined;
  statusReason?: string | undefined;
}

function analyzeStrykerMutationReport(
  cwd: string,
  reportPath: string
): StrykerMutationReportAnalysis | undefined {
  const absolutePath = isAbsolute(reportPath) ? reportPath : join(cwd, reportPath);
  if (!existsSync(absolutePath)) {
    return undefined;
  }

  const normalizedReportPath = normalizeArtifactPath(cwd, absolutePath);

  try {
    const parsed = JSON.parse(readFileSync(absolutePath, "utf8"));
    return summarizeStrykerMutationReport(parsed, cwd, normalizedReportPath);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      reportPath: normalizedReportPath,
      totalMutants: 0,
      survivedMutants: 0,
      noCoverageMutants: 0,
      weakMutants: [],
      parseError: `Could not parse StrykerJS mutation report at ${normalizedReportPath}: ${message}`
    };
  }
}

function summarizeStrykerMutationReport(
  value: unknown,
  cwd: string,
  reportPath: string
): StrykerMutationReportAnalysis {
  const files = isPlainObject(value) && isPlainObject(value.files) ? value.files : {};
  const weakMutants: StrykerWeakMutant[] = [];
  let totalMutants = 0;
  let survivedMutants = 0;
  let noCoverageMutants = 0;

  for (const [filePath, fileReport] of Object.entries(files)) {
    if (!isPlainObject(fileReport) || !Array.isArray(fileReport.mutants)) {
      continue;
    }

    const normalizedFile = normalizeArtifactPath(cwd, filePath);
    for (const mutant of fileReport.mutants) {
      if (!isPlainObject(mutant)) {
        continue;
      }

      totalMutants += 1;
      const status = normalizeStrykerMutantStatus(mutant.status);
      if (!status) {
        continue;
      }

      if (status === "Survived") {
        survivedMutants += 1;
      } else {
        noCoverageMutants += 1;
      }

      weakMutants.push({
        id: optionalStringValue(mutant.id),
        file: normalizedFile,
        line: readMutantStartLine(mutant.location),
        status,
        mutatorName: optionalStringValue(mutant.mutatorName),
        replacement: optionalStringValue(mutant.replacement),
        statusReason: optionalStringValue(mutant.statusReason)
      });
    }
  }

  return {
    reportPath,
    totalMutants,
    survivedMutants,
    noCoverageMutants,
    weakMutants: weakMutants.sort((left, right) => `${left.file}:${left.line ?? 0}`.localeCompare(`${right.file}:${right.line ?? 0}`)),
    mutationScore: readMutationScore(value)
  };
}

function strykerEvidenceFromReport(
  report: StrykerMutationReportAnalysis | undefined,
  command: string
): Evidence[] {
  if (!report) {
    return [];
  }

  if (report.parseError) {
    return [
      createEvidence({
        source: { kind: "tool", name: "StrykerJS", id: "stryker" },
        kind: "mutation",
        severity: "high",
        summary: report.parseError,
        trusted: true,
        command,
        artifactPath: report.reportPath,
        metadata: {
          reportPath: report.reportPath
        }
      })
    ];
  }

  const summaryEvidence = createEvidence({
    source: { kind: "tool", name: "StrykerJS", id: "stryker" },
    kind: "mutation",
    severity: report.weakMutants.length > 0 ? "high" : "info",
    summary:
      report.weakMutants.length > 0
        ? `StrykerJS found ${report.weakMutants.length} surviving or no-coverage mutant(s) in ${new Set(report.weakMutants.map((mutant) => mutant.file)).size} file(s).`
        : "StrykerJS report found no surviving or no-coverage mutants.",
    trusted: true,
    command,
    artifactPath: report.reportPath,
    metadata: compactStrykerReportMetadata(report)
  });

  return [
    summaryEvidence,
    ...report.weakMutants.slice(0, 5).map((mutant) =>
      createEvidence({
        source: { kind: "tool", name: "StrykerJS", id: "stryker" },
        kind: "mutation",
        severity: "high",
        summary: `${mutant.status} ${mutant.mutatorName ?? "mutation"} mutant in ${mutant.file}${mutant.line ? `:${mutant.line}` : ""}.`,
        trusted: true,
        file: mutant.file,
        line: mutant.line,
        command,
        artifactPath: report.reportPath,
        metadata: compactMutantMetadata(mutant)
      })
    )
  ];
}

function strykerReportFailureMessage(report: StrykerMutationReportAnalysis): string {
  return `StrykerJS found ${report.weakMutants.length} surviving or no-coverage mutant(s). Strengthen tests before merge.`;
}

function compactStrykerReportMetadata(report: StrykerMutationReportAnalysis): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    reportPath: report.reportPath,
    totalMutants: report.totalMutants,
    survivedMutants: report.survivedMutants,
    noCoverageMutants: report.noCoverageMutants
  };

  if (report.mutationScore !== undefined) {
    metadata.mutationScore = report.mutationScore;
  }

  return metadata;
}

function compactMutantMetadata(mutant: StrykerWeakMutant): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    status: mutant.status
  };

  if (mutant.id) {
    metadata.id = mutant.id;
  }

  if (mutant.mutatorName) {
    metadata.mutatorName = mutant.mutatorName;
  }

  if (mutant.replacement) {
    metadata.replacement = mutant.replacement;
  }

  if (mutant.statusReason) {
    metadata.statusReason = mutant.statusReason;
  }

  return metadata;
}

function schemathesisEvidenceFromExecution(execution: CommandExecutionResult): Evidence {
  return createEvidence({
    source: {
      kind: "tool",
      name: "Schemathesis",
      id: "schemathesis"
    },
    kind: "api-fuzz",
    severity: evidenceSeverityFromExecution(execution),
    summary: schemathesisEvidenceSummaryFromExecution(execution),
    trusted: true,
    command: execution.command,
    metadata: compactExecutionMetadata(execution)
  });
}

function pactEvidenceFromExecution(execution: CommandExecutionResult): Evidence {
  return createEvidence({
    source: {
      kind: "tool",
      name: "Pact",
      id: "pact"
    },
    kind: "contract",
    severity: evidenceSeverityFromExecution(execution),
    summary: pactEvidenceSummaryFromExecution(execution),
    trusted: true,
    command: execution.command,
    metadata: compactExecutionMetadata(execution)
  });
}

interface AgentProcessBundle {
  artifactPath: string;
  absolutePath: string;
  bundleFormat: CodeDecayAgentBundleFormat;
}

function writeAgentProcessBundle(
  cwd: string,
  context: Record<string, unknown> | undefined,
  profile: CodeDecayAgentProfile,
  format: CodeDecayAgentBundleFormat
): AgentProcessBundle {
  const contextBundle = optionalStringValue(context?.agentBundle);
  const rawContextFormat = context?.agentBundleFormat;
  const contextFormat = isAgentBundleFormat(rawContextFormat) ? rawContextFormat : format;
  const bundleFormat = contextFormat ?? format;
  const artifactPath = join(AGENT_PROCESS_BUNDLE_DIR, bundleFormat === "json" ? "bundle.json" : "bundle.md");
  const absolutePath = join(cwd, artifactPath);
  const contents = contextBundle ?? fallbackAgentProcessBundle(profile, bundleFormat);

  mkdirSync(join(cwd, AGENT_PROCESS_BUNDLE_DIR), { recursive: true });
  writeFileSync(absolutePath, contents.endsWith("\n") ? contents : `${contents}\n`, "utf8");

  return {
    artifactPath,
    absolutePath,
    bundleFormat
  };
}

function fallbackAgentProcessBundle(profile: CodeDecayAgentProfile, format: CodeDecayAgentBundleFormat): string {
  if (format === "json") {
    return JSON.stringify(
      {
        tool: "CodeDecay",
        mode: "agent-task-bundle",
        agentProfile: { id: profile },
        notes: [
          "No CodeDecay analysis bundle was provided by the caller.",
          "Treat this file as local context only; agent output is untrusted until verified."
        ]
      },
      null,
      2
    );
  }

  return [
    "## CodeDecay Agent Task Bundle",
    "",
    `Profile: ${profile}`,
    "",
    "No CodeDecay analysis bundle was provided by the caller.",
    "Treat this file as local context only; agent output is untrusted until verified."
  ].join("\n");
}

function agentProcessEvidenceFromExecution(
  execution: CommandExecutionResult,
  bundle: AgentProcessBundle,
  profile: CodeDecayAgentProfile
): Evidence {
  const metadata = {
    ...compactExecutionMetadata(execution),
    profile,
    bundleFormat: bundle.bundleFormat,
    bundlePath: bundle.artifactPath,
    untrusted: true
  };

  return createEvidence({
    source: { kind: "agent", name: "Agent Process", id: AGENT_PROCESS_HARNESS_NAME },
    kind: "agent-suggestion",
    severity: agentProcessEvidenceSeverity(execution),
    summary: agentProcessEvidenceSummaryFromExecution(execution),
    trusted: false,
    command: execution.command,
    artifactPath: bundle.artifactPath,
    metadata
  });
}

function agentProcessEvidenceSeverity(execution: CommandExecutionResult): EvidenceSeverity {
  if (execution.status === "passed") {
    return execution.stdout.trim() || execution.stderr.trim() ? "low" : "info";
  }

  if (execution.status === "skipped") {
    return "info";
  }

  return "high";
}

function evidenceSummaryFromExecution(execution: CommandExecutionResult): string {
  if (execution.status === "passed") {
    return "Playwright checks passed.";
  }

  if (execution.status === "skipped") {
    return "Playwright checks were skipped because command execution is disabled.";
  }

  if (execution.status === "blocked") {
    return `Playwright command was blocked: ${execution.blockedReason ?? "unsafe command"}.`;
  }

  if (execution.status === "timed_out") {
    return "Playwright command timed out.";
  }

  if (execution.status === "error") {
    return `Playwright command errored: ${execution.error ?? "unknown error"}.`;
  }

  return `Playwright command failed with exit code ${execution.exitCode ?? "unknown"}.`;
}

function strykerEvidenceSummaryFromExecution(execution: CommandExecutionResult): string {
  if (execution.status === "passed") {
    return "StrykerJS mutation checks passed.";
  }

  if (execution.status === "skipped") {
    return "StrykerJS mutation checks were skipped because command execution is disabled.";
  }

  if (execution.status === "blocked") {
    return `StrykerJS command was blocked: ${execution.blockedReason ?? "unsafe command"}.`;
  }

  if (execution.status === "timed_out") {
    return "StrykerJS command timed out.";
  }

  if (execution.status === "error") {
    return `StrykerJS command errored: ${execution.error ?? "unknown error"}.`;
  }

  return `StrykerJS command failed with exit code ${execution.exitCode ?? "unknown"}.`;
}

function schemathesisEvidenceSummaryFromExecution(execution: CommandExecutionResult): string {
  if (execution.status === "passed") {
    return "Schemathesis API fuzzing passed.";
  }

  if (execution.status === "skipped") {
    return "Schemathesis API fuzzing was skipped because command execution is disabled.";
  }

  if (execution.status === "blocked") {
    return `Schemathesis command was blocked: ${execution.blockedReason ?? "unsafe command"}.`;
  }

  if (execution.status === "timed_out") {
    return "Schemathesis command timed out.";
  }

  if (execution.status === "error") {
    return `Schemathesis command errored: ${execution.error ?? "unknown error"}.`;
  }

  return `Schemathesis command failed with exit code ${execution.exitCode ?? "unknown"}.`;
}

function pactEvidenceSummaryFromExecution(execution: CommandExecutionResult): string {
  if (execution.status === "passed") {
    return "Pact contract tests passed.";
  }

  if (execution.status === "skipped") {
    return "Pact contract tests were skipped because command execution is disabled.";
  }

  if (execution.status === "blocked") {
    return `Pact command was blocked: ${execution.blockedReason ?? "unsafe command"}.`;
  }

  if (execution.status === "timed_out") {
    return "Pact command timed out.";
  }

  if (execution.status === "error") {
    return `Pact command errored: ${execution.error ?? "unknown error"}.`;
  }

  return `Pact command failed with exit code ${execution.exitCode ?? "unknown"}.`;
}

function agentProcessEvidenceSummaryFromExecution(execution: CommandExecutionResult): string {
  if (execution.status === "passed") {
    const output = firstNonEmptyLine(execution.stdout) ?? firstNonEmptyLine(execution.stderr);
    return output
      ? `Agent process produced untrusted suggestions: ${output}`
      : "Agent process completed without producing output.";
  }

  if (execution.status === "skipped") {
    return "Agent process was skipped because command execution is disabled.";
  }

  if (execution.status === "blocked") {
    return `Agent process command was blocked: ${execution.blockedReason ?? "unsafe command"}.`;
  }

  if (execution.status === "timed_out") {
    return "Agent process command timed out.";
  }

  if (execution.status === "error") {
    return `Agent process command errored: ${execution.error ?? "unknown error"}.`;
  }

  return `Agent process command failed with exit code ${execution.exitCode ?? "unknown"}.`;
}

function failureMessageFromExecution(execution: CommandExecutionResult): string {
  if (execution.status === "skipped") {
    return "Playwright command execution is disabled.";
  }

  if (execution.status === "blocked") {
    return `Playwright command was blocked by safety policy: ${execution.blockedReason ?? "unsafe command"}.`;
  }

  return evidenceSummaryFromExecution(execution);
}

function strykerFailureMessageFromExecution(execution: CommandExecutionResult): string {
  if (execution.status === "skipped") {
    return "StrykerJS command execution is disabled.";
  }

  if (execution.status === "blocked") {
    return `StrykerJS command was blocked by safety policy: ${execution.blockedReason ?? "unsafe command"}.`;
  }

  return strykerEvidenceSummaryFromExecution(execution);
}

function schemathesisFailureMessageFromExecution(execution: CommandExecutionResult): string {
  if (execution.status === "skipped") {
    return "Schemathesis command execution is disabled.";
  }

  if (execution.status === "blocked") {
    return `Schemathesis command was blocked by safety policy: ${execution.blockedReason ?? "unsafe command"}.`;
  }

  return schemathesisEvidenceSummaryFromExecution(execution);
}

function pactFailureMessageFromExecution(execution: CommandExecutionResult): string {
  if (execution.status === "skipped") {
    return "Pact command execution is disabled.";
  }

  if (execution.status === "blocked") {
    return `Pact command was blocked by safety policy: ${execution.blockedReason ?? "unsafe command"}.`;
  }

  return pactEvidenceSummaryFromExecution(execution);
}

function agentProcessFailureMessageFromExecution(execution: CommandExecutionResult): string {
  if (execution.status === "skipped") {
    return "Agent process command execution is disabled.";
  }

  if (execution.status === "blocked") {
    return `Agent process command was blocked by safety policy: ${execution.blockedReason ?? "unsafe command"}.`;
  }

  return agentProcessEvidenceSummaryFromExecution(execution);
}

function normalizeStrykerMutantStatus(value: unknown): "Survived" | "NoCoverage" | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.toLowerCase().replace(/[\s_-]/g, "");
  if (normalized === "survived") {
    return "Survived";
  }

  if (normalized === "nocoverage") {
    return "NoCoverage";
  }

  return undefined;
}

function readMutantStartLine(value: unknown): number | undefined {
  if (!isPlainObject(value) || !isPlainObject(value.start)) {
    return undefined;
  }

  return typeof value.start.line === "number" && Number.isFinite(value.start.line)
    ? value.start.line
    : undefined;
}

function readMutationScore(value: unknown): number | undefined {
  if (!isPlainObject(value) || !isPlainObject(value.thresholds)) {
    return undefined;
  }

  const score = value.thresholds.mutationScore;
  return typeof score === "number" && Number.isFinite(score) ? score : undefined;
}

function firstNonEmptyLine(value: string): string | undefined {
  const line = value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find((item) => item.length > 0);

  if (!line) {
    return undefined;
  }

  const limit = 180;
  return line.length <= limit ? line : `${line.slice(0, limit)}...`;
}

function isAgentBundleFormat(value: unknown): value is CodeDecayAgentBundleFormat {
  return value === "markdown" || value === "json";
}

function validateAgentProcessOptions(options: AgentProcessHarnessOptions): void {
  if (options.command !== undefined) {
    validateNonEmptyString(options.command, "Agent process command");
  }

  if (options.profile !== undefined && !isCodeDecayAgentProfile(options.profile)) {
    throw new Error("Agent process profile must be generic, codex, claude-code, cursor, pi, opencode, or desktop.");
  }

  if (options.bundleFormat !== undefined && !isAgentBundleFormat(options.bundleFormat)) {
    throw new Error("Agent process bundleFormat must be markdown or json.");
  }

  if (options.timeoutMs !== undefined && (!Number.isInteger(options.timeoutMs) || options.timeoutMs <= 0)) {
    throw new Error("Agent process timeoutMs must be a positive integer.");
  }

  if (options.outputLimit !== undefined && (!Number.isInteger(options.outputLimit) || options.outputLimit <= 0)) {
    throw new Error("Agent process outputLimit must be a positive integer.");
  }
}

function validatePlaywrightOptions(options: PlaywrightHarnessOptions & { command: string }): void {
  validateNonEmptyString(options.command, "Playwright command");

  if (options.timeoutMs !== undefined && (!Number.isInteger(options.timeoutMs) || options.timeoutMs <= 0)) {
    throw new Error("Playwright timeoutMs must be a positive integer.");
  }

  if (options.outputLimit !== undefined && (!Number.isInteger(options.outputLimit) || options.outputLimit <= 0)) {
    throw new Error("Playwright outputLimit must be a positive integer.");
  }
}

function validateStrykerOptions(options: StrykerHarnessOptions & { command: string }): void {
  validateNonEmptyString(options.command, "StrykerJS command");

  if (options.reportPath !== undefined) {
    validateNonEmptyString(options.reportPath, "StrykerJS reportPath");
  }

  if (options.timeoutMs !== undefined && (!Number.isInteger(options.timeoutMs) || options.timeoutMs <= 0)) {
    throw new Error("StrykerJS timeoutMs must be a positive integer.");
  }

  if (options.outputLimit !== undefined && (!Number.isInteger(options.outputLimit) || options.outputLimit <= 0)) {
    throw new Error("StrykerJS outputLimit must be a positive integer.");
  }
}

function validateSchemathesisOptions(options: SchemathesisHarnessOptions & { command: string }): void {
  validateNonEmptyString(options.command, "Schemathesis command");

  if (options.schema !== undefined) {
    validateNonEmptyString(options.schema, "Schemathesis schema");
  }

  if (options.baseUrl !== undefined) {
    validateNonEmptyString(options.baseUrl, "Schemathesis baseUrl");
  }

  if (options.timeoutMs !== undefined && (!Number.isInteger(options.timeoutMs) || options.timeoutMs <= 0)) {
    throw new Error("Schemathesis timeoutMs must be a positive integer.");
  }

  if (options.outputLimit !== undefined && (!Number.isInteger(options.outputLimit) || options.outputLimit <= 0)) {
    throw new Error("Schemathesis outputLimit must be a positive integer.");
  }
}

function validatePactOptions(options: PactHarnessOptions & { command: string }): void {
  validateNonEmptyString(options.command, "Pact command");

  if (options.timeoutMs !== undefined && (!Number.isInteger(options.timeoutMs) || options.timeoutMs <= 0)) {
    throw new Error("Pact timeoutMs must be a positive integer.");
  }

  if (options.outputLimit !== undefined && (!Number.isInteger(options.outputLimit) || options.outputLimit <= 0)) {
    throw new Error("Pact outputLimit must be a positive integer.");
  }
}

function isCodeDecayAgentProfile(value: string): value is CodeDecayAgentProfile {
  return (
    value === "generic" ||
    value === "codex" ||
    value === "claude-code" ||
    value === "cursor" ||
    value === "pi" ||
    value === "opencode" ||
    value === "desktop"
  );
}

function validatePlan(plan: HarnessPlan): void {
  if (plan.harnessName !== PLAYWRIGHT_HARNESS_NAME) {
    throw new Error(`Playwright harness cannot run plan for ${plan.harnessName}.`);
  }
}

function validateAgentProcessPlan(plan: HarnessPlan): void {
  if (plan.harnessName !== AGENT_PROCESS_HARNESS_NAME) {
    throw new Error(`Agent process harness cannot run plan for ${plan.harnessName}.`);
  }
}

function validateStrykerPlan(plan: HarnessPlan): void {
  if (plan.harnessName !== STRYKER_HARNESS_NAME) {
    throw new Error(`StrykerJS harness cannot run plan for ${plan.harnessName}.`);
  }
}

function validateSchemathesisPlan(plan: HarnessPlan): void {
  if (plan.harnessName !== SCHEMATHESIS_HARNESS_NAME) {
    throw new Error(`Schemathesis harness cannot run plan for ${plan.harnessName}.`);
  }
}

function validatePactPlan(plan: HarnessPlan): void {
  if (plan.harnessName !== PACT_HARNESS_NAME) {
    throw new Error(`Pact harness cannot run plan for ${plan.harnessName}.`);
  }
}

function resolveSchemathesisCommand(options: SchemathesisHarnessOptions): string {
  if (options.command !== undefined) {
    return options.command;
  }

  const schema = options.schema ?? DEFAULT_SCHEMATHESIS_SCHEMA;
  const baseUrl = options.baseUrl ?? DEFAULT_SCHEMATHESIS_BASE_URL;
  return `st run ${quoteShellArg(schema)} --url ${quoteShellArg(baseUrl)}`;
}

function quoteShellArg(value: string): string {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) {
    return value;
  }

  return `'${value.replace(/'/g, "'\\''")}'`;
}
