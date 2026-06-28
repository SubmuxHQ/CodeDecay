import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import type {
  CodeDecayAgentBundleFormat,
  CodeDecayAgentProcessToolAdapter,
  CodeDecayAgentProfile,
  CodeDecayCoverageFailOn,
  CodeDecayCoverageToolAdapter,
  CodeDecayCommandToolAdapter,
  CodeDecayConfig,
  CodeDecaySchemathesisToolAdapter,
  CodeDecaySemgrepToolAdapter,
  CodeDecayToolSeverity,
  CodeDecayStrykerToolAdapter
} from "@submuxhq/codedecay-config";
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

export interface PlaywrightHarnessOptions {
  command?: string | undefined;
  timeoutMs?: number | undefined;
  allowCommands?: boolean | undefined;
  allowUnsafeCommands?: boolean | undefined;
  outputLimit?: number | undefined;
}

export interface StrykerHarnessOptions {
  command?: string | undefined;
  reportPath?: string | undefined;
  timeoutMs?: number | undefined;
  allowCommands?: boolean | undefined;
  allowUnsafeCommands?: boolean | undefined;
  outputLimit?: number | undefined;
}

export interface SchemathesisHarnessOptions {
  command?: string | undefined;
  schema?: string | undefined;
  baseUrl?: string | undefined;
  timeoutMs?: number | undefined;
  allowCommands?: boolean | undefined;
  allowUnsafeCommands?: boolean | undefined;
  outputLimit?: number | undefined;
}

export interface PactHarnessOptions {
  command?: string | undefined;
  timeoutMs?: number | undefined;
  allowCommands?: boolean | undefined;
  allowUnsafeCommands?: boolean | undefined;
  outputLimit?: number | undefined;
}

export interface SemgrepHarnessOptions {
  command?: string | undefined;
  config?: string | undefined;
  reportPath?: string | undefined;
  failOnSeverity?: CodeDecayToolSeverity | undefined;
  timeoutMs?: number | undefined;
  allowCommands?: boolean | undefined;
  allowUnsafeCommands?: boolean | undefined;
  outputLimit?: number | undefined;
}

export interface CoverageHarnessOptions {
  command?: string | undefined;
  reportPaths?: string[] | undefined;
  failOn?: CodeDecayCoverageFailOn | undefined;
  timeoutMs?: number | undefined;
  allowCommands?: boolean | undefined;
  allowUnsafeCommands?: boolean | undefined;
  outputLimit?: number | undefined;
}

export interface AgentProcessHarnessOptions {
  command?: string | undefined;
  profile?: CodeDecayAgentProfile | undefined;
  bundleFormat?: CodeDecayAgentBundleFormat | undefined;
  timeoutMs?: number | undefined;
  allowCommands?: boolean | undefined;
  allowUnsafeCommands?: boolean | undefined;
  outputLimit?: number | undefined;
}

export type ConfiguredToolAdapterKind =
  | "agent-process"
  | "playwright"
  | "stryker"
  | "schemathesis"
  | "pact"
  | "semgrep"
  | "coverage";

export interface ConfiguredToolHarness {
  kind: ConfiguredToolAdapterKind;
  name: string;
  command: string;
  timeoutMs?: number | undefined;
  context?: Record<string, unknown> | undefined;
  harness: CodeDecayHarness;
}

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
const SEMGREP_HARNESS_NAME = "semgrep";
const DEFAULT_SEMGREP_TIMEOUT_MS = 180_000;
const DEFAULT_SEMGREP_FAIL_ON_SEVERITY: CodeDecayToolSeverity = "high";
const LOCAL_SEMGREP_CONFIG_CANDIDATES = [".semgrep.yml", ".semgrep.yaml", ".semgrep", "semgrep.yml", "semgrep.yaml"];
const COVERAGE_HARNESS_NAME = "coverage";
const DEFAULT_COVERAGE_TIMEOUT_MS = 120_000;
const DEFAULT_COVERAGE_FAIL_ON: CodeDecayCoverageFailOn = "none";
const DEFAULT_COVERAGE_REPORT_PATHS = ["coverage/coverage-final.json", "coverage-final.json", "coverage/lcov.info", "lcov.info"];
const DEFAULT_COVERAGE_DISCOVERY_DIRS = ["coverage", ".v8-coverage", ".nyc_output"];
const AGENT_PROCESS_HARNESS_NAME = "agent-process";
const DEFAULT_AGENT_PROCESS_TIMEOUT_MS = 300_000;
const DEFAULT_AGENT_PROCESS_PROFILE: CodeDecayAgentProfile = "generic";
const DEFAULT_AGENT_PROCESS_BUNDLE_FORMAT: CodeDecayAgentBundleFormat = "markdown";
const AGENT_PROCESS_BUNDLE_DIR = ".codedecay/local/agent-process";
const TOOL_SEVERITY_ORDER: Record<CodeDecayToolSeverity, number> = {
  low: 0,
  medium: 1,
  high: 2
};

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

export function createSemgrepHarness(options: SemgrepHarnessOptions = {}): CodeDecayHarness {
  validateSemgrepOptions(options);

  return {
    name: SEMGREP_HARNESS_NAME,
    capabilities: ["static-analysis", "execution"],
    requiredConfig: [
      {
        key: "semgrep.command",
        description: "Optional explicit command that runs Semgrep. Required for registry or remote configs.",
        required: false
      },
      {
        key: "semgrep.config",
        description: "Local Semgrep config path used when no explicit command is provided.",
        required: false
      },
      {
        key: "safety.allowCommands",
        description: "Must be true before CodeDecay runs configured commands.",
        required: true
      }
    ],
    plan: async (input) => createSemgrepPlan(input, resolveSemgrepDisplayCommand(options), Boolean(options.allowCommands)),
    run: async (plan, context) => runSemgrepPlan(plan, context, options),
    collectEvidence: async (result) => result.evidence,
    summarize: async (evidence) =>
      summarizeHarnessResult({
        harnessName: SEMGREP_HARNESS_NAME,
        status: evidence.some((item) => item.severity === "high") ? "failed" : "passed",
        durationMs: 0,
        evidence,
        artifacts: [],
        summary: `${SEMGREP_HARNESS_NAME} produced ${evidence.length} evidence item(s).`
      })
  };
}

export function createCoverageHarness(options: CoverageHarnessOptions = {}): CodeDecayHarness {
  validateCoverageOptions(options);

  return {
    name: COVERAGE_HARNESS_NAME,
    capabilities: ["coverage", "test-execution", "execution"],
    requiredConfig: [
      {
        key: "coverage.command",
        description: "Optional command that runs the repo's own coverage-producing tests.",
        required: false
      },
      {
        key: "coverage.reportPaths",
        description: "Optional local Istanbul, LCOV, or V8 coverage artifact paths.",
        required: false
      },
      {
        key: "safety.allowCommands",
        description: "Must be true before CodeDecay runs configured commands.",
        required: true
      }
    ],
    plan: async (input) => createCoveragePlan(input, resolveCoverageDisplayCommand(options), Boolean(options.allowCommands)),
    run: async (plan, context) => runCoveragePlan(plan, context, options),
    collectEvidence: async (result) => result.evidence,
    summarize: async (evidence) =>
      summarizeHarnessResult({
        harnessName: COVERAGE_HARNESS_NAME,
        status: evidence.some((item) => item.severity === "high") ? "failed" : "passed",
        durationMs: 0,
        evidence,
        artifacts: [],
        summary: `${COVERAGE_HARNESS_NAME} produced ${evidence.length} evidence item(s).`
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

function createConfiguredSemgrepHarness(
  adapter: CodeDecaySemgrepToolAdapter,
  allowCommands: boolean
): ConfiguredToolHarness {
  const options: SemgrepHarnessOptions = {
    allowCommands
  };

  if (adapter.command !== undefined) {
    options.command = adapter.command;
  }

  if (adapter.config !== undefined) {
    options.config = adapter.config;
  }

  if (adapter.reportPath !== undefined) {
    options.reportPath = adapter.reportPath;
  }

  if (adapter.failOnSeverity !== undefined) {
    options.failOnSeverity = adapter.failOnSeverity;
  }

  if (adapter.timeoutMs !== undefined) {
    options.timeoutMs = adapter.timeoutMs;
  }

  const configured: ConfiguredToolHarness = {
    kind: "semgrep",
    name: "Semgrep",
    command: resolveSemgrepDisplayCommand(options),
    harness: createSemgrepHarness(options)
  };

  if (adapter.timeoutMs !== undefined) {
    configured.timeoutMs = adapter.timeoutMs;
  }

  return configured;
}

function createConfiguredCoverageHarness(
  adapter: CodeDecayCoverageToolAdapter,
  allowCommands: boolean
): ConfiguredToolHarness {
  const options: CoverageHarnessOptions = {
    allowCommands
  };

  if (adapter.command !== undefined) {
    options.command = adapter.command;
  }

  if (adapter.reportPaths !== undefined) {
    options.reportPaths = adapter.reportPaths;
  }

  if (adapter.failOn !== undefined) {
    options.failOn = adapter.failOn;
  }

  if (adapter.timeoutMs !== undefined) {
    options.timeoutMs = adapter.timeoutMs;
  }

  const configured: ConfiguredToolHarness = {
    kind: "coverage",
    name: "Coverage",
    command: resolveCoverageDisplayCommand(options),
    harness: createCoverageHarness(options)
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

function createSemgrepPlan(
  input: HarnessPlanInput,
  command: string,
  allowCommands: boolean
): HarnessPlan {
  return {
    id: "semgrep-static-analysis",
    harnessName: SEMGREP_HARNESS_NAME,
    summary: "Run configured Semgrep static analysis and collect tool evidence.",
    requiresApproval: !allowCommands,
    steps: [
      {
        id: "run-semgrep",
        title: "Run Semgrep static analysis",
        description: `Run \`${command}\` from ${input.cwd}.`
      }
    ]
  };
}

function createCoveragePlan(
  input: HarnessPlanInput,
  command: string,
  allowCommands: boolean
): HarnessPlan {
  return {
    id: "coverage-evidence",
    harnessName: COVERAGE_HARNESS_NAME,
    summary: "Run or collect configured coverage evidence from local artifacts.",
    requiresApproval: command !== "collect coverage artifacts" && !allowCommands,
    steps: [
      {
        id: "run-or-collect-coverage",
        title: "Run or collect coverage evidence",
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

async function runSemgrepPlan(
  plan: HarnessPlan,
  context: HarnessRunContext,
  options: SemgrepHarnessOptions
): Promise<HarnessRunResult> {
  validateSemgrepPlan(plan);
  const startedAt = Date.now();
  const resolved = resolveSemgrepRunCommand(context.cwd, options);
  const failOnSeverity = options.failOnSeverity ?? DEFAULT_SEMGREP_FAIL_ON_SEVERITY;

  if (!resolved.command) {
    const durationMs = elapsed(startedAt);
    const evidence = [
      createEvidence({
        source: { kind: "tool", name: "Semgrep", id: "semgrep" },
        kind: "static-analysis",
        severity: "info",
        summary: "Semgrep was skipped because no local Semgrep config was configured or discovered.",
        trusted: true,
        command: resolved.displayCommand,
        metadata: {
          status: "skipped",
          searchedConfigs: LOCAL_SEMGREP_CONFIG_CANDIDATES
        }
      })
    ];

    return createHarnessFailureResult({
      harnessName: SEMGREP_HARNESS_NAME,
      mode: "missing-config",
      message: "Semgrep requires a local config path or explicit command before CodeDecay can run it.",
      status: "skipped",
      durationMs,
      evidence
    });
  }

  const timeoutMs = context.timeoutMs ?? options.timeoutMs ?? DEFAULT_SEMGREP_TIMEOUT_MS;
  const execution = await runConfiguredCommand({
    command: resolved.command,
    cwd: context.cwd,
    timeoutMs,
    outputLimit: options.outputLimit,
    safety: {
      allowCommands: options.allowCommands ?? false,
      allowUnsafeCommands: options.allowUnsafeCommands
    }
  });
  const durationMs = elapsed(startedAt);
  const canParseSemgrepReport = execution.status === "passed" || execution.status === "failed";
  const analysis = canParseSemgrepReport
    ? analyzeSemgrepReport(context.cwd, options.reportPath, execution.stdout)
    : undefined;
  const artifacts = analysis?.artifactPath
    ? [
        {
          path: analysis.artifactPath,
          description: "Semgrep JSON report."
        }
      ]
    : [];
  const evidence = [
    semgrepEvidenceFromExecution(execution),
    ...semgrepEvidenceFromReport(analysis, execution.command, failOnSeverity)
  ];

  if (execution.status !== "passed") {
    const failed = createHarnessFailureResult({
      harnessName: SEMGREP_HARNESS_NAME,
      mode: failureModeFromExecution(execution),
      message: semgrepFailureMessageFromExecution(execution),
      status: harnessStatusFromExecution(execution),
      durationMs,
      evidence
    });
    return {
      ...failed,
      artifacts
    };
  }

  if (analysis?.parseError) {
    const failed = createHarnessFailureResult({
      harnessName: SEMGREP_HARNESS_NAME,
      mode: "internal-error",
      message: analysis.parseError,
      status: "failed",
      durationMs,
      evidence
    });
    return {
      ...failed,
      artifacts
    };
  }

  const thresholdFindings = analysis ? findingsAtOrAboveThreshold(analysis.findings, failOnSeverity) : [];
  if (thresholdFindings.length > 0) {
    const failed = createHarnessFailureResult({
      harnessName: SEMGREP_HARNESS_NAME,
      mode: "tool-finding",
      message: `Semgrep found ${thresholdFindings.length} finding(s) at or above ${failOnSeverity} severity.`,
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
    harnessName: SEMGREP_HARNESS_NAME,
    status: "passed",
    durationMs,
    evidence,
    artifacts,
    summary: "Semgrep static analysis passed."
  };
}

async function runCoveragePlan(
  plan: HarnessPlan,
  context: HarnessRunContext,
  options: CoverageHarnessOptions
): Promise<HarnessRunResult> {
  validateCoveragePlan(plan);
  const startedAt = Date.now();
  const failOn = options.failOn ?? DEFAULT_COVERAGE_FAIL_ON;
  let execution: CommandExecutionResult | undefined;

  if (options.command) {
    const timeoutMs = context.timeoutMs ?? options.timeoutMs ?? DEFAULT_COVERAGE_TIMEOUT_MS;
    execution = await runConfiguredCommand({
      command: options.command,
      cwd: context.cwd,
      timeoutMs,
      outputLimit: options.outputLimit,
      safety: {
        allowCommands: options.allowCommands ?? false,
        allowUnsafeCommands: options.allowUnsafeCommands
      }
    });
  }

  const durationMs = elapsed(startedAt);
  const canParseCoverage = !execution || execution.status === "passed" || execution.status === "failed";
  const analysis = canParseCoverage ? analyzeCoverageReports(context.cwd, options.reportPaths) : undefined;
  const artifacts = analysis?.sources.map((source) => ({
    path: source.path,
    description: `${source.kind.toUpperCase()} coverage report.`
  })) ?? [];
  const command = options.command ?? "collect coverage artifacts";
  const evidence = [
    ...(execution ? [coverageEvidenceFromExecution(execution)] : [coverageCollectionEvidence(command)]),
    ...coverageEvidenceFromReport(analysis, command, failOn)
  ];

  if (execution && execution.status !== "passed") {
    const failed = createHarnessFailureResult({
      harnessName: COVERAGE_HARNESS_NAME,
      mode: failureModeFromExecution(execution),
      message: coverageFailureMessageFromExecution(execution),
      status: harnessStatusFromExecution(execution),
      durationMs,
      evidence
    });
    return {
      ...failed,
      artifacts
    };
  }

  if (!analysis) {
    const message = options.command
      ? "Coverage command completed, but no supported coverage artifact was found."
      : "No supported coverage artifact was configured or discovered.";
    const failed = createHarnessFailureResult({
      harnessName: COVERAGE_HARNESS_NAME,
      mode: options.command ? "no-evidence" : "missing-config",
      message,
      status: options.command ? "failed" : "skipped",
      durationMs,
      evidence
    });
    return {
      ...failed,
      artifacts
    };
  }

  if (analysis.parseErrors.length > 0) {
    const failed = createHarnessFailureResult({
      harnessName: COVERAGE_HARNESS_NAME,
      mode: "internal-error",
      message: `Could not parse ${analysis.parseErrors.length} coverage artifact(s).`,
      status: "failed",
      durationMs,
      evidence
    });
    return {
      ...failed,
      artifacts
    };
  }

  if (failOn === "uncovered" && analysis.totals.uncoveredLines > 0) {
    const failed = createHarnessFailureResult({
      harnessName: COVERAGE_HARNESS_NAME,
      mode: "tool-finding",
      message: `Coverage artifacts contain ${analysis.totals.uncoveredLines} uncovered measured line(s).`,
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
    harnessName: COVERAGE_HARNESS_NAME,
    status: "passed",
    durationMs,
    evidence,
    artifacts,
    summary: "Coverage evidence collected."
  };
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

function semgrepEvidenceFromExecution(execution: CommandExecutionResult): Evidence {
  return createEvidence({
    source: {
      kind: "tool",
      name: "Semgrep",
      id: "semgrep"
    },
    kind: "static-analysis",
    severity: evidenceSeverityFromExecution(execution),
    summary: semgrepEvidenceSummaryFromExecution(execution),
    trusted: true,
    command: execution.command,
    metadata: compactExecutionMetadata(execution)
  });
}

function coverageEvidenceFromExecution(execution: CommandExecutionResult): Evidence {
  return createEvidence({
    source: {
      kind: "tool",
      name: "Coverage",
      id: "coverage"
    },
    kind: "coverage",
    severity: evidenceSeverityFromExecution(execution),
    summary: coverageEvidenceSummaryFromExecution(execution),
    trusted: true,
    command: execution.command,
    metadata: compactExecutionMetadata(execution)
  });
}

function coverageCollectionEvidence(command: string): Evidence {
  return createEvidence({
    source: {
      kind: "tool",
      name: "Coverage",
      id: "coverage"
    },
    kind: "coverage",
    severity: "info",
    summary: "Coverage adapter is collecting existing local coverage artifacts without running a command.",
    trusted: true,
    command,
    metadata: {
      status: "collected"
    }
  });
}

type CoverageSourceKind = "istanbul" | "lcov" | "v8";

interface CoverageLineMapEntry {
  measured: Set<number>;
  covered: Set<number>;
  sourceKinds: Set<CoverageSourceKind>;
  sourcePaths: Set<string>;
}

interface CoverageArtifactSource {
  kind: CoverageSourceKind;
  path: string;
}

interface CoverageFileSummary {
  path: string;
  measuredLines: number[];
  coveredLines: number[];
  uncoveredLines: number[];
  sourceKinds: CoverageSourceKind[];
  sourcePaths: string[];
}

interface CoverageReportAnalysis {
  sources: CoverageArtifactSource[];
  files: CoverageFileSummary[];
  totals: {
    files: number;
    measuredLines: number;
    coveredLines: number;
    uncoveredLines: number;
  };
  parseErrors: string[];
}

function analyzeCoverageReports(cwd: string, reportPaths: string[] | undefined): CoverageReportAnalysis | undefined {
  const artifacts = findCoverageArtifacts(cwd, reportPaths);
  if (artifacts.length === 0) {
    return undefined;
  }

  const linesByFile = new Map<string, CoverageLineMapEntry>();
  const sources: CoverageArtifactSource[] = [];
  const parseErrors: string[] = [];

  for (const artifact of artifacts) {
    const parsed =
      artifact.kind === "istanbul"
        ? readIstanbulCoverage(cwd, artifact.absolutePath)
        : artifact.kind === "lcov"
          ? readLcovCoverage(cwd, artifact.absolutePath)
          : readV8Coverage(cwd, artifact.absolutePath);

    if (parsed.parseError) {
      parseErrors.push(parsed.parseError);
      continue;
    }

    if (parsed.linesByFile.size === 0) {
      continue;
    }

    sources.push({
      kind: artifact.kind,
      path: artifact.relativePath
    });

    for (const [path, lines] of parsed.linesByFile) {
      mergeCoverageEntry(linesByFile, path, lines);
    }
  }

  if (sources.length === 0 && parseErrors.length === 0) {
    return undefined;
  }

  const files = [...linesByFile.entries()]
    .map(([path, entry]) => {
      const measuredLines = dedupeNumbers([...entry.measured]);
      const coveredLines = measuredLines.filter((line) => entry.covered.has(line));
      const uncoveredLines = measuredLines.filter((line) => !entry.covered.has(line));
      return {
        path,
        measuredLines,
        coveredLines,
        uncoveredLines,
        sourceKinds: dedupeStrings([...entry.sourceKinds]) as CoverageSourceKind[],
        sourcePaths: dedupeStrings([...entry.sourcePaths])
      };
    })
    .sort((left, right) => left.path.localeCompare(right.path));

  return {
    sources: dedupeCoverageSources(sources),
    files,
    totals: {
      files: files.length,
      measuredLines: files.reduce((sum, file) => sum + file.measuredLines.length, 0),
      coveredLines: files.reduce((sum, file) => sum + file.coveredLines.length, 0),
      uncoveredLines: files.reduce((sum, file) => sum + file.uncoveredLines.length, 0)
    },
    parseErrors
  };
}

function coverageEvidenceFromReport(
  report: CoverageReportAnalysis | undefined,
  command: string,
  failOn: CodeDecayCoverageFailOn
): Evidence[] {
  if (!report) {
    return [];
  }

  if (report.parseErrors.length > 0) {
    return [
      createEvidence({
        source: { kind: "tool", name: "Coverage", id: "coverage" },
        kind: "coverage",
        severity: "high",
        summary: `Could not parse ${report.parseErrors.length} coverage artifact(s).`,
        trusted: true,
        command,
        metadata: {
          parseErrors: report.parseErrors.slice(0, 5)
        }
      })
    ];
  }

  const uncoveredFiles = report.files.filter((file) => file.uncoveredLines.length > 0);
  const summaryEvidence = createEvidence({
    source: { kind: "tool", name: "Coverage", id: "coverage" },
    kind: "coverage",
    severity: failOn === "uncovered" && report.totals.uncoveredLines > 0 ? "high" : report.totals.uncoveredLines > 0 ? "medium" : "info",
    summary:
      report.totals.uncoveredLines > 0
        ? `Coverage artifacts measured ${report.totals.measuredLines} line(s); ${report.totals.uncoveredLines} line(s) are uncovered.`
        : `Coverage artifacts measured ${report.totals.measuredLines} covered line(s) across ${report.totals.files} file(s).`,
    trusted: true,
    command,
    metadata: {
      sources: report.sources,
      failOn,
      ...report.totals
    }
  });

  return [
    summaryEvidence,
    ...uncoveredFiles.slice(0, 10).map((file) =>
      createEvidence({
        source: { kind: "tool", name: "Coverage", id: "coverage" },
        kind: "coverage",
        severity: failOn === "uncovered" ? "high" : "medium",
        summary: `${file.path} has ${file.uncoveredLines.length} uncovered measured line(s).`,
        trusted: true,
        file: file.path,
        line: file.uncoveredLines[0],
        command,
        artifactPath: file.sourcePaths[0],
        metadata: compactCoverageFileMetadata(file)
      })
    )
  ];
}

function compactCoverageFileMetadata(file: CoverageFileSummary): Record<string, unknown> {
  return {
    measuredLines: file.measuredLines.length,
    coveredLines: file.coveredLines.length,
    uncoveredLines: file.uncoveredLines.length,
    firstUncoveredLines: file.uncoveredLines.slice(0, 10),
    sourceKinds: file.sourceKinds,
    sourcePaths: file.sourcePaths
  };
}

interface SemgrepReportAnalysis {
  artifactPath?: string | undefined;
  findings: SemgrepFinding[];
  parseError?: string | undefined;
}

interface SemgrepFinding {
  checkId?: string | undefined;
  path?: string | undefined;
  line?: number | undefined;
  endLine?: number | undefined;
  message: string;
  severity: EvidenceSeverity;
  rawSeverity?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
  fingerprint?: string | undefined;
}

function analyzeSemgrepReport(
  cwd: string,
  reportPath: string | undefined,
  stdout: string
): SemgrepReportAnalysis | undefined {
  if (reportPath) {
    const absolutePath = isAbsolute(reportPath) ? reportPath : join(cwd, reportPath);
    if (existsSync(absolutePath)) {
      const artifactPath = normalizeArtifactPath(cwd, absolutePath);
      return parseSemgrepJson(readFileSync(absolutePath, "utf8"), cwd, artifactPath);
    }
  }

  if (!stdout.trim()) {
    return undefined;
  }

  return parseSemgrepJson(stdout, cwd, reportPath ? normalizeArtifactPath(cwd, reportPath) : undefined);
}

function parseSemgrepJson(raw: string, cwd: string, artifactPath: string | undefined): SemgrepReportAnalysis {
  try {
    const parsed = JSON.parse(raw);
    return summarizeSemgrepReport(parsed, cwd, artifactPath);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      artifactPath,
      findings: [],
      parseError: `Could not parse Semgrep JSON${artifactPath ? ` at ${artifactPath}` : ""}: ${message}`
    };
  }
}

function summarizeSemgrepReport(
  value: unknown,
  cwd: string,
  artifactPath: string | undefined
): SemgrepReportAnalysis {
  const results = isPlainObject(value) && Array.isArray(value.results) ? value.results : [];
  const findings = results
    .map((item) => normalizeSemgrepFinding(item, cwd))
    .filter((finding): finding is SemgrepFinding => Boolean(finding))
    .sort((left, right) => `${left.path ?? ""}:${left.line ?? 0}:${left.checkId ?? ""}`.localeCompare(`${right.path ?? ""}:${right.line ?? 0}:${right.checkId ?? ""}`));

  return {
    artifactPath,
    findings
  };
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

function normalizeSemgrepFinding(value: unknown, cwd: string): SemgrepFinding | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }

  const extra = isPlainObject(value.extra) ? value.extra : {};
  const start = isPlainObject(value.start) ? value.start : {};
  const end = isPlainObject(value.end) ? value.end : {};
  const rawPath = optionalStringValue(value.path);
  const rawSeverity = optionalStringValue(extra.severity);
  const metadata = isPlainObject(extra.metadata) ? compactSemgrepMetadata(extra.metadata) : undefined;

  return {
    checkId: optionalStringValue(value.check_id),
    path: rawPath ? normalizeArtifactPath(cwd, rawPath) : undefined,
    line: optionalNumberValue(start.line),
    endLine: optionalNumberValue(end.line),
    message: optionalStringValue(extra.message) ?? optionalStringValue(value.message) ?? "Semgrep finding.",
    severity: semgrepSeverityToEvidenceSeverity(rawSeverity),
    rawSeverity,
    metadata,
    fingerprint: optionalStringValue(extra.fingerprint)
  };
}

function semgrepEvidenceFromReport(
  report: SemgrepReportAnalysis | undefined,
  command: string,
  failOnSeverity: CodeDecayToolSeverity
): Evidence[] {
  if (!report) {
    return [];
  }

  if (report.parseError) {
    return [
      createEvidence({
        source: { kind: "tool", name: "Semgrep", id: "semgrep" },
        kind: "static-analysis",
        severity: "high",
        summary: report.parseError,
        trusted: true,
        command,
        artifactPath: report.artifactPath,
        metadata: {
          reportPath: report.artifactPath
        }
      })
    ];
  }

  const thresholdFindings = findingsAtOrAboveThreshold(report.findings, failOnSeverity);
  const summaryEvidence = createEvidence({
    source: { kind: "tool", name: "Semgrep", id: "semgrep" },
    kind: "static-analysis",
    severity: report.findings.length === 0 ? "info" : thresholdFindings.length > 0 ? "high" : highestSemgrepEvidenceSeverity(report.findings),
    summary:
      report.findings.length > 0
        ? `Semgrep found ${report.findings.length} finding(s); ${thresholdFindings.length} at or above ${failOnSeverity} severity.`
        : "Semgrep found no findings.",
    trusted: true,
    command,
    artifactPath: report.artifactPath,
    metadata: {
      reportPath: report.artifactPath,
      findingCount: report.findings.length,
      failOnSeverity,
      thresholdFindingCount: thresholdFindings.length
    }
  });

  return [
    summaryEvidence,
    ...report.findings.slice(0, 10).map((finding) =>
      createEvidence({
        source: { kind: "tool", name: "Semgrep", id: "semgrep" },
        kind: "static-analysis",
        severity: finding.severity,
        summary: semgrepFindingSummary(finding),
        trusted: true,
        file: finding.path,
        line: finding.line,
        command,
        artifactPath: report.artifactPath,
        metadata: compactSemgrepFindingMetadata(finding)
      })
    )
  ];
}

function findingsAtOrAboveThreshold(
  findings: SemgrepFinding[],
  threshold: CodeDecayToolSeverity
): SemgrepFinding[] {
  return findings.filter((finding) => semgrepFindingSeverityLevel(finding.severity) >= TOOL_SEVERITY_ORDER[threshold]);
}

function semgrepFindingSeverityLevel(severity: EvidenceSeverity): number {
  if (severity === "high") {
    return TOOL_SEVERITY_ORDER.high;
  }

  if (severity === "medium") {
    return TOOL_SEVERITY_ORDER.medium;
  }

  return TOOL_SEVERITY_ORDER.low;
}

function semgrepSeverityToEvidenceSeverity(value: string | undefined): EvidenceSeverity {
  const normalized = value?.trim().toUpperCase();
  if (normalized === "ERROR") {
    return "high";
  }

  if (normalized === "WARNING") {
    return "medium";
  }

  if (normalized === "INFO") {
    return "low";
  }

  return "low";
}

function highestSemgrepEvidenceSeverity(findings: SemgrepFinding[]): EvidenceSeverity {
  if (findings.some((finding) => finding.severity === "high")) {
    return "high";
  }

  if (findings.some((finding) => finding.severity === "medium")) {
    return "medium";
  }

  return "low";
}

function semgrepFindingSummary(finding: SemgrepFinding): string {
  const rule = finding.checkId ? `${finding.checkId}: ` : "";
  const location = finding.path ? ` in ${finding.path}${finding.line ? `:${finding.line}` : ""}` : "";
  return `${rule}${finding.message}${location}.`;
}

function compactSemgrepFindingMetadata(finding: SemgrepFinding): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    severity: finding.rawSeverity ?? finding.severity
  };

  if (finding.checkId) {
    metadata.checkId = finding.checkId;
  }

  if (finding.endLine !== undefined) {
    metadata.endLine = finding.endLine;
  }

  if (finding.fingerprint) {
    metadata.fingerprint = finding.fingerprint;
  }

  if (finding.metadata) {
    metadata.metadata = finding.metadata;
  }

  return metadata;
}

function compactSemgrepMetadata(value: Record<string, unknown>): Record<string, unknown> | undefined {
  const allowed = ["category", "confidence", "impact", "likelihood", "technology", "cwe", "owasp", "references"];
  const metadata: Record<string, unknown> = {};

  for (const key of allowed) {
    const item = value[key];
    if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
      metadata[key] = item;
    } else if (Array.isArray(item) && item.every((entry) => typeof entry === "string" || typeof entry === "number")) {
      metadata[key] = item.slice(0, 10);
    }
  }

  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function evidenceSeverityFromExecution(execution: CommandExecutionResult): "info" | "high" {
  return execution.status === "passed" || execution.status === "skipped" ? "info" : "high";
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

function semgrepEvidenceSummaryFromExecution(execution: CommandExecutionResult): string {
  if (execution.status === "passed") {
    return "Semgrep static analysis command passed.";
  }

  if (execution.status === "skipped") {
    return "Semgrep static analysis was skipped because command execution is disabled.";
  }

  if (execution.status === "blocked") {
    return `Semgrep command was blocked: ${execution.blockedReason ?? "unsafe command"}.`;
  }

  if (execution.status === "timed_out") {
    return "Semgrep command timed out.";
  }

  if (execution.status === "error") {
    return `Semgrep command errored: ${execution.error ?? "unknown error"}.`;
  }

  return `Semgrep command failed with exit code ${execution.exitCode ?? "unknown"}.`;
}

function coverageEvidenceSummaryFromExecution(execution: CommandExecutionResult): string {
  if (execution.status === "passed") {
    return "Coverage command passed.";
  }

  if (execution.status === "skipped") {
    return "Coverage command was skipped because command execution is disabled.";
  }

  if (execution.status === "blocked") {
    return `Coverage command was blocked: ${execution.blockedReason ?? "unsafe command"}.`;
  }

  if (execution.status === "timed_out") {
    return "Coverage command timed out.";
  }

  if (execution.status === "error") {
    return `Coverage command errored: ${execution.error ?? "unknown error"}.`;
  }

  return `Coverage command failed with exit code ${execution.exitCode ?? "unknown"}.`;
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

function compactExecutionMetadata(execution: CommandExecutionResult): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    status: execution.status,
    durationMs: execution.durationMs
  };

  if (execution.exitCode !== undefined) {
    metadata.exitCode = execution.exitCode;
  }

  if (execution.blockedReason) {
    metadata.blockedReason = execution.blockedReason;
  }

  if (execution.stdout.trim()) {
    metadata.stdout = trimOutput(execution.stdout);
  }

  if (execution.stderr.trim()) {
    metadata.stderr = trimOutput(execution.stderr);
  }

  return metadata;
}

function failureModeFromExecution(execution: CommandExecutionResult): "command-denied" | "unsafe-command" | "timeout" | "internal-error" | "nonzero-exit" {
  if (execution.status === "skipped") {
    return "command-denied";
  }

  if (execution.status === "blocked") {
    return "unsafe-command";
  }

  if (execution.status === "timed_out") {
    return "timeout";
  }

  if (execution.status === "error") {
    return "internal-error";
  }

  return "nonzero-exit";
}

function harnessStatusFromExecution(execution: CommandExecutionResult): "skipped" | "failed" | "timed_out" | "error" {
  if (execution.status === "skipped" || execution.status === "blocked") {
    return "skipped";
  }

  if (execution.status === "timed_out") {
    return "timed_out";
  }

  if (execution.status === "error") {
    return "error";
  }

  return "failed";
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

function semgrepFailureMessageFromExecution(execution: CommandExecutionResult): string {
  if (execution.status === "skipped") {
    return "Semgrep command execution is disabled.";
  }

  if (execution.status === "blocked") {
    return `Semgrep command was blocked by safety policy: ${execution.blockedReason ?? "unsafe command"}.`;
  }

  return semgrepEvidenceSummaryFromExecution(execution);
}

function coverageFailureMessageFromExecution(execution: CommandExecutionResult): string {
  if (execution.status === "skipped") {
    return "Coverage command execution is disabled.";
  }

  if (execution.status === "blocked") {
    return `Coverage command was blocked by safety policy: ${execution.blockedReason ?? "unsafe command"}.`;
  }

  return coverageEvidenceSummaryFromExecution(execution);
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

function resolveSemgrepRunCommand(
  cwd: string,
  options: SemgrepHarnessOptions
): { command?: string | undefined; displayCommand: string } {
  if (options.command) {
    return {
      command: options.command,
      displayCommand: options.command
    };
  }

  const config = options.config ?? discoverLocalSemgrepConfig(cwd);
  const displayCommand = resolveSemgrepDisplayCommand(options);
  if (!config) {
    return {
      displayCommand
    };
  }

  return {
    command: buildSemgrepCommand(config),
    displayCommand
  };
}

function resolveSemgrepDisplayCommand(options: Pick<SemgrepHarnessOptions, "command" | "config">): string {
  if (options.command) {
    return options.command;
  }

  return buildSemgrepCommand(options.config ?? "<local-config>");
}

function resolveCoverageDisplayCommand(options: Pick<CoverageHarnessOptions, "command">): string {
  return options.command ?? "collect coverage artifacts";
}

function buildSemgrepCommand(config: string): string {
  return `semgrep scan --config ${shellQuote(config)} --json --metrics=off --disable-version-check`;
}

function discoverLocalSemgrepConfig(cwd: string): string | undefined {
  return LOCAL_SEMGREP_CONFIG_CANDIDATES.find((candidate) => existsSync(join(cwd, candidate)));
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(value)) {
    return value;
  }

  return `'${value.replace(/'/g, "'\\''")}'`;
}

function findCoverageArtifacts(
  cwd: string,
  reportPaths: string[] | undefined
): Array<{ kind: CoverageSourceKind; absolutePath: string; relativePath: string }> {
  const discovered = new Map<string, { kind: CoverageSourceKind; absolutePath: string; relativePath: string }>();
  const candidates = reportPaths ?? DEFAULT_COVERAGE_REPORT_PATHS;

  for (const candidate of candidates) {
    collectCoverageCandidate(cwd, candidate, discovered);
  }

  if (reportPaths === undefined) {
    for (const directory of DEFAULT_COVERAGE_DISCOVERY_DIRS) {
      collectCoverageCandidate(cwd, directory, discovered);
    }
  }

  return [...discovered.values()].sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function collectCoverageCandidate(
  cwd: string,
  candidate: string,
  discovered: Map<string, { kind: CoverageSourceKind; absolutePath: string; relativePath: string }>
): void {
  const absolutePath = isAbsolute(candidate) ? candidate : join(cwd, candidate);
  if (!existsSync(absolutePath)) {
    return;
  }

  let stats;
  try {
    stats = statSync(absolutePath);
  } catch {
    return;
  }

  if (stats.isDirectory()) {
    for (const file of listCoverageFiles(cwd, absolutePath)) {
      addCoverageArtifact(cwd, file, discovered);
    }
    return;
  }

  addCoverageArtifact(cwd, absolutePath, discovered);
}

function listCoverageFiles(cwd: string, currentDir: string): string[] {
  const relativeDir = relative(cwd, currentDir).replaceAll("\\", "/");
  if (relativeDir.startsWith("..")) {
    return [];
  }

  let entries: string[] = [];
  try {
    entries = readdirSync(currentDir);
  } catch {
    return [];
  }

  const files: string[] = [];
  for (const entry of entries) {
    const absolutePath = join(currentDir, entry);
    let stats;
    try {
      stats = statSync(absolutePath);
    } catch {
      continue;
    }

    if (stats.isDirectory()) {
      files.push(...listCoverageFiles(cwd, absolutePath));
    } else {
      files.push(absolutePath);
    }
  }

  return files;
}

function addCoverageArtifact(
  cwd: string,
  absolutePath: string,
  discovered: Map<string, { kind: CoverageSourceKind; absolutePath: string; relativePath: string }>
): void {
  const kind = detectCoverageArtifactKind(absolutePath);
  if (!kind) {
    return;
  }

  discovered.set(absolutePath, {
    kind,
    absolutePath,
    relativePath: normalizeArtifactPath(cwd, absolutePath)
  });
}

function detectCoverageArtifactKind(absolutePath: string): CoverageSourceKind | undefined {
  const normalized = normalizePath(absolutePath).toLowerCase();
  if (normalized.endsWith("/coverage-final.json") || normalized.endsWith("coverage-final.json")) {
    return "istanbul";
  }

  if (normalized.endsWith("/lcov.info") || normalized.endsWith("lcov.info")) {
    return "lcov";
  }

  if (normalized.endsWith(".json")) {
    return "v8";
  }

  return undefined;
}

function readIstanbulCoverage(
  cwd: string,
  absolutePath: string
): { linesByFile: Map<string, CoverageLineMapEntry>; parseError?: string | undefined } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(absolutePath, "utf8"));
  } catch (error: unknown) {
    return {
      linesByFile: new Map(),
      parseError: coverageParseError(cwd, absolutePath, error)
    };
  }

  if (!isPlainObject(parsed)) {
    return { linesByFile: new Map() };
  }

  const linesByFile = new Map<string, CoverageLineMapEntry>();
  for (const [rawPath, value] of Object.entries(parsed)) {
    if (!isPlainObject(value)) {
      continue;
    }

    const normalizedPath = normalizeCoveragePath(cwd, rawPath);
    if (!normalizedPath) {
      continue;
    }

    if (isPlainObject(value.l)) {
      for (const [rawLine, rawCount] of Object.entries(value.l)) {
        const line = Number(rawLine);
        const count = Number(rawCount);
        if (!Number.isInteger(line) || Number.isNaN(count)) {
          continue;
        }

        addCoverageLine(linesByFile, normalizedPath, line, count > 0, "istanbul", normalizeArtifactPath(cwd, absolutePath));
      }
      continue;
    }

    if (!isPlainObject(value.statementMap) || !isPlainObject(value.s)) {
      continue;
    }

    for (const [statementId, statement] of Object.entries(value.statementMap)) {
      if (!isPlainObject(statement) || !isPlainObject(statement.start) || !isPlainObject(statement.end)) {
        continue;
      }

      const startLine = Number(statement.start.line);
      const endLine = Number(statement.end.line);
      const count = Number(value.s[statementId]);
      if (!Number.isInteger(startLine) || !Number.isInteger(endLine) || Number.isNaN(count)) {
        continue;
      }

      for (let line = startLine; line <= endLine; line += 1) {
        addCoverageLine(linesByFile, normalizedPath, line, count > 0, "istanbul", normalizeArtifactPath(cwd, absolutePath));
      }
    }
  }

  return { linesByFile };
}

function readLcovCoverage(
  cwd: string,
  absolutePath: string
): { linesByFile: Map<string, CoverageLineMapEntry>; parseError?: string | undefined } {
  let raw: string;
  try {
    raw = readFileSync(absolutePath, "utf8");
  } catch (error: unknown) {
    return {
      linesByFile: new Map(),
      parseError: coverageParseError(cwd, absolutePath, error)
    };
  }

  const linesByFile = new Map<string, CoverageLineMapEntry>();
  let currentFile: string | undefined;

  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith("SF:")) {
      currentFile = normalizeCoveragePath(cwd, line.slice(3).trim());
      continue;
    }

    if (line.startsWith("DA:") && currentFile) {
      const [rawLine, rawCount] = line.slice(3).split(",");
      const lineNumber = Number(rawLine);
      const count = Number(rawCount);
      if (!Number.isInteger(lineNumber) || Number.isNaN(count)) {
        continue;
      }

      addCoverageLine(linesByFile, currentFile, lineNumber, count > 0, "lcov", normalizeArtifactPath(cwd, absolutePath));
      continue;
    }

    if (line === "end_of_record") {
      currentFile = undefined;
    }
  }

  return { linesByFile };
}

function readV8Coverage(
  cwd: string,
  absolutePath: string
): { linesByFile: Map<string, CoverageLineMapEntry>; parseError?: string | undefined } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(absolutePath, "utf8"));
  } catch (error: unknown) {
    return {
      linesByFile: new Map(),
      parseError: coverageParseError(cwd, absolutePath, error)
    };
  }

  const linesByFile = new Map<string, CoverageLineMapEntry>();
  for (const script of extractV8Scripts(parsed)) {
    const normalizedPath = normalizeCoveragePath(cwd, script.url);
    if (!normalizedPath) {
      continue;
    }

    const content = readLocalFile(cwd, normalizedPath);
    if (!content) {
      continue;
    }

    const lineOffsets = createLineOffsets(content);
    for (const range of script.ranges) {
      const startLine = lineNumberForOffset(lineOffsets, range.startOffset);
      const endLine = lineNumberForOffset(lineOffsets, Math.max(range.startOffset, range.endOffset - 1));
      for (let line = startLine; line <= endLine; line += 1) {
        addCoverageLine(linesByFile, normalizedPath, line, range.count > 0, "v8", normalizeArtifactPath(cwd, absolutePath));
      }
    }
  }

  return { linesByFile };
}

function extractV8Scripts(value: unknown): Array<{ url: string; ranges: Array<{ startOffset: number; endOffset: number; count: number }> }> {
  const results = Array.isArray(value)
    ? value
    : isPlainObject(value) && Array.isArray(value.result)
      ? value.result
      : [];
  const scripts: Array<{ url: string; ranges: Array<{ startOffset: number; endOffset: number; count: number }> }> = [];

  for (const script of results) {
    if (!isPlainObject(script) || typeof script.url !== "string" || !Array.isArray(script.functions)) {
      continue;
    }

    const ranges: Array<{ startOffset: number; endOffset: number; count: number }> = [];
    for (const fn of script.functions) {
      if (!isPlainObject(fn) || !Array.isArray(fn.ranges)) {
        continue;
      }

      for (const range of fn.ranges) {
        if (!isPlainObject(range)) {
          continue;
        }

        const startOffset = Number(range.startOffset);
        const endOffset = Number(range.endOffset);
        const count = Number(range.count);
        if (!Number.isInteger(startOffset) || !Number.isInteger(endOffset) || Number.isNaN(count)) {
          continue;
        }

        ranges.push({ startOffset, endOffset, count });
      }
    }

    if (ranges.length > 0) {
      scripts.push({ url: script.url, ranges });
    }
  }

  return scripts;
}

function addCoverageLine(
  linesByFile: Map<string, CoverageLineMapEntry>,
  path: string,
  line: number,
  covered: boolean,
  sourceKind: CoverageSourceKind,
  sourcePath: string
): void {
  if (!Number.isInteger(line) || line <= 0) {
    return;
  }

  const entry =
    linesByFile.get(path) ??
    ({
      measured: new Set<number>(),
      covered: new Set<number>(),
      sourceKinds: new Set<CoverageSourceKind>(),
      sourcePaths: new Set<string>()
    } satisfies CoverageLineMapEntry);

  entry.measured.add(line);
  if (covered) {
    entry.covered.add(line);
  }
  entry.sourceKinds.add(sourceKind);
  entry.sourcePaths.add(normalizePath(sourcePath));
  linesByFile.set(path, entry);
}

function mergeCoverageEntry(
  target: Map<string, CoverageLineMapEntry>,
  path: string,
  entry: CoverageLineMapEntry
): void {
  const existing =
    target.get(path) ??
    ({
      measured: new Set<number>(),
      covered: new Set<number>(),
      sourceKinds: new Set<CoverageSourceKind>(),
      sourcePaths: new Set<string>()
    } satisfies CoverageLineMapEntry);

  for (const line of entry.measured) {
    existing.measured.add(line);
  }

  for (const line of entry.covered) {
    existing.covered.add(line);
  }

  for (const kind of entry.sourceKinds) {
    existing.sourceKinds.add(kind);
  }

  for (const sourcePath of entry.sourcePaths) {
    existing.sourcePaths.add(sourcePath);
  }

  target.set(path, existing);
}

function dedupeCoverageSources(sources: CoverageArtifactSource[]): CoverageArtifactSource[] {
  const seen = new Set<string>();
  const deduped: CoverageArtifactSource[] = [];

  for (const source of sources) {
    const key = `${source.kind}:${source.path}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(source);
  }

  return deduped.sort((left, right) => `${left.kind}:${left.path}`.localeCompare(`${right.kind}:${right.path}`));
}

function normalizeCoveragePath(cwd: string, rawPath: string): string | undefined {
  if (typeof rawPath !== "string" || rawPath.trim().length === 0) {
    return undefined;
  }

  const normalizedInput = normalizePath(rawPath.trim().replace(/^file:\/\//, ""));
  if (normalizedInput.includes("://")) {
    return undefined;
  }

  if (normalizedInput.startsWith("/")) {
    const relativePath = relative(cwd, normalizedInput).replaceAll("\\", "/");
    if (!relativePath.startsWith("../")) {
      return relativePath;
    }
  }

  return normalizedInput.replace(/^\.\//, "");
}

function readLocalFile(cwd: string, path: string): string | undefined {
  try {
    return readFileSync(join(cwd, path), "utf8");
  } catch {
    return undefined;
  }
}

function createLineOffsets(content: string): number[] {
  const offsets = [0];
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] === "\n") {
      offsets.push(index + 1);
    }
  }
  return offsets;
}

function lineNumberForOffset(offsets: number[], offset: number): number {
  let low = 0;
  let high = offsets.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const current = offsets[mid] ?? 0;
    const next = offsets[mid + 1] ?? Number.MAX_SAFE_INTEGER;
    if (offset >= current && offset < next) {
      return mid + 1;
    }

    if (offset < current) {
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  return offsets.length;
}

function coverageParseError(cwd: string, absolutePath: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `Could not parse coverage report at ${normalizeArtifactPath(cwd, absolutePath)}: ${message}`;
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}

function dedupeNumbers(values: number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function normalizeArtifactPath(cwd: string, path: string): string {
  const absolutePath = isAbsolute(path) ? path : resolve(cwd, path);
  const relativePath = relative(cwd, absolutePath).replaceAll("\\", "/");
  return relativePath.startsWith("..") ? absolutePath.replaceAll("\\", "/") : relativePath;
}

function optionalStringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
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

function optionalNumberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isAgentBundleFormat(value: unknown): value is CodeDecayAgentBundleFormat {
  return value === "markdown" || value === "json";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function validateSemgrepOptions(options: SemgrepHarnessOptions): void {
  if (options.command !== undefined) {
    validateNonEmptyString(options.command, "Semgrep command");
  }

  if (options.config !== undefined) {
    validateNonEmptyString(options.config, "Semgrep config");
    validateLocalSemgrepConfig(options.config);
  }

  if (options.reportPath !== undefined) {
    validateNonEmptyString(options.reportPath, "Semgrep reportPath");
  }

  if (options.failOnSeverity !== undefined && !isCodeDecayToolSeverity(options.failOnSeverity)) {
    throw new Error("Semgrep failOnSeverity must be low, medium, or high.");
  }

  if (options.timeoutMs !== undefined && (!Number.isInteger(options.timeoutMs) || options.timeoutMs <= 0)) {
    throw new Error("Semgrep timeoutMs must be a positive integer.");
  }

  if (options.outputLimit !== undefined && (!Number.isInteger(options.outputLimit) || options.outputLimit <= 0)) {
    throw new Error("Semgrep outputLimit must be a positive integer.");
  }
}

function validateCoverageOptions(options: CoverageHarnessOptions): void {
  if (options.command !== undefined) {
    validateNonEmptyString(options.command, "Coverage command");
  }

  if (options.reportPaths !== undefined) {
    if (options.reportPaths.length === 0) {
      throw new Error("Coverage reportPaths must contain at least one path.");
    }

    for (const reportPath of options.reportPaths) {
      validateNonEmptyString(reportPath, "Coverage reportPath");
    }
  }

  if (options.failOn !== undefined && !isCodeDecayCoverageFailOn(options.failOn)) {
    throw new Error("Coverage failOn must be none or uncovered.");
  }

  if (options.timeoutMs !== undefined && (!Number.isInteger(options.timeoutMs) || options.timeoutMs <= 0)) {
    throw new Error("Coverage timeoutMs must be a positive integer.");
  }

  if (options.outputLimit !== undefined && (!Number.isInteger(options.outputLimit) || options.outputLimit <= 0)) {
    throw new Error("Coverage outputLimit must be a positive integer.");
  }
}

function validateLocalSemgrepConfig(config: string): void {
  const normalized = config.trim().toLowerCase();
  if (normalized === "auto" || normalized.includes("://") || normalized.startsWith("p/") || normalized.startsWith("r/")) {
    throw new Error("Semgrep config must be a local path. Use semgrep.command for registry, auto, or remote configs.");
  }
}

function isCodeDecayToolSeverity(value: string): value is CodeDecayToolSeverity {
  return value === "low" || value === "medium" || value === "high";
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

function isCodeDecayCoverageFailOn(value: string): value is CodeDecayCoverageFailOn {
  return value === "none" || value === "uncovered";
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

function validateSemgrepPlan(plan: HarnessPlan): void {
  if (plan.harnessName !== SEMGREP_HARNESS_NAME) {
    throw new Error(`Semgrep harness cannot run plan for ${plan.harnessName}.`);
  }
}

function validateCoveragePlan(plan: HarnessPlan): void {
  if (plan.harnessName !== COVERAGE_HARNESS_NAME) {
    throw new Error(`Coverage harness cannot run plan for ${plan.harnessName}.`);
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

function validateNonEmptyString(value: string, label: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${label} is required.`);
  }
}

function trimOutput(output: string): string {
  const trimmed = output.trim();
  const limit = 2000;
  if (trimmed.length <= limit) {
    return trimmed;
  }

  return `${trimmed.slice(trimmed.length - limit)}\n[output truncated to last ${limit} characters]`;
}

function elapsed(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt);
}
