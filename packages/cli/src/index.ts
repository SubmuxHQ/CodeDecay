import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeJsProject } from "@submuxhq/codedecay-analyzer-js";
import {
  loadCodeDecayConfig,
  type CodeDecayProductApiEndpoint,
  type CodeDecayProductTarget,
  type LoadedCodeDecayConfig
} from "@submuxhq/codedecay-config";
import {
  CODEDECAY_PRODUCT_LATEST_REPORT_PATH,
  CODEDECAY_VERSION,
  createAnalysisReport,
  dedupeStrings,
  productFailureBundlesFromProductTargetReport,
  shouldFailForRisk,
  type CodeDecayReport,
  type ProductCheckKind,
  type ProductFailureClassification,
  type ProductFailureBundle,
  type ProductFailureStep,
  type RiskLevel
} from "@submuxhq/codedecay-core";
import { checkCommandSafety, runConfiguredCommand, type CommandExecutionResult, type ExecutionStatus } from "@submuxhq/codedecay-execution";
import { getGitChangedFiles, getRepoRoot } from "@submuxhq/codedecay-git";
import {
  applyMemoryContext,
  loadCodeDecayMemory,
  type CodeDecayMemory,
  type MemoryMatcher
} from "@submuxhq/codedecay-memory";
import { renderReport } from "@submuxhq/codedecay-report";
import { createTestProofAudit } from "@submuxhq/codedecay-test-audit";
import YAML from "yaml";
import { runAgentCommand as runAgentCommandWithDependencies } from "./commands/agent";
import { runConfigCommand } from "./commands/config";
import { runDifferentialCommand as runDifferentialCommandWithDependencies } from "./commands/differential";
import { runExecuteCommand as runExecuteCommandWithDependencies } from "./commands/execute";
import { runLlmReviewCommand as runLlmReviewCommandWithDependencies } from "./commands/llm-review";
import { runUninstallCommand, runUpdateCommand, runVersionCommand } from "./commands/maintenance";
import {
  runMemoryCommand as runMemoryCommandWithDependencies,
  runMemoryImportCommand as runMemoryImportCommandWithDependencies,
  runMemoryLearnCommand as runMemoryLearnCommandWithDependencies
} from "./commands/memory";
import { runRedteamCommand as runRedteamCommandWithDependencies } from "./commands/redteam";
import { runSnapshotCommand as runSnapshotCommandWithDependencies } from "./commands/snapshot";
import { COMMAND_ORDER, HELP_DOCS, ROOT_FLAG_ALIASES, UTILITY_COMMAND_ORDER } from "./docs/commands";
import { CliExit } from "./errors";
import { write, writeStderr, writeStdout } from "./io";
import { throwUnknownCommand as throwUnknownCommandWithDocs } from "./parsers/diagnostics";
import {
  HelpRequested,
  parseAnalyzeArgs,
  parseDashboardArgs,
  parseMcpArgs,
  parseProductArgs,
} from "./parsers/args";
import type {
  AnalyzeOptions,
  AgentOptions,
  CliAnalysisContext,
  CliCommandContext,
  CliCommandHandler,
  CliRuntime,
  ConfigFormat,
  DashboardOptions,
  LlmReviewOptions,
  McpOptions,
  ManagedProductProcess,
  ProductBlockedAction,
  ProductExplorationResult,
  ProductExplorerOptions,
  ProductFlowLink,
  ProductFlowMap,
  ProductFlowPage,
  ProductGeneratedTestCase,
  ProductGeneratedTestFailure,
  ProductGeneratedTestManifest,
  ProductGeneratedTestRunResult,
  ProductGeneratedTestsResult,
  ProductHealthResult,
  ProductInteractiveElement,
  ProductOptions,
  ProductStartResult,
  ProductTargetReport,
  ProductTargetResult,
  ProductTargetStatus,
  ProductTargetSummary,
  RedteamOptions,
  SnapshotOptions
} from "./types";
import {
  renderCommandHelp,
  renderCommandManual,
  renderRootHelp as renderRootHelpDocument,
  renderRootManual as renderRootManualDocument,
  type CommandDoc
} from "./renderers/discovery";
import { appendCodeBlock, appendOutputBlock, formatStatus } from "./renderers/command-output";

const COMMAND_HANDLERS: Record<string, CliCommandHandler> = {
  agent: (context) => runAgentCommandWithDependencies(context, {
    createAnalysisContext: createAnalysisContextForCli,
    resolveRepoRoot: getRepoRootForCli,
    writeOutput: writeCliOutput
  }),
  analyze: runAnalyzeCommand,
  config: runConfigCommand,
  dashboard: runDashboardCommand,
  differential: (context) => runDifferentialCommandWithDependencies(context, {
    formatGitError: formatGitErrorForCli,
    resolveRepoRoot: getRepoRootForCli,
    writeOutput: writeCliOutput
  }),
  execute: (context) => runExecuteCommandWithDependencies(context, {
    createAnalysisContext: createAnalysisContextForCli,
    writeOutput: writeCliOutput
  }),
  "llm-review": (context) => runLlmReviewCommandWithDependencies(context, {
    createAnalysisContext: createAnalysisContextForCli,
    resolveRepoRoot: getRepoRootForCli,
    writeOutput: writeCliOutput
  }),
  mcp: runMcpCommand,
  memory: (context) => runMemoryCommandWithDependencies(context, { resolveRepoRoot: getRepoRootForCli }),
  "memory-import": (context) => runMemoryImportCommandWithDependencies(context, { resolveRepoRoot: getRepoRootForCli }),
  "memory-learn": (context) => runMemoryLearnCommandWithDependencies(context, { resolveRepoRoot: getRepoRootForCli }),
  product: runProductCommand,
  redteam: (context) => runRedteamCommandWithDependencies(context, {
    createAnalysisContext: createAnalysisContextForCli,
    resolveRepoRoot: getRepoRootForCli,
    writeOutput: writeCliOutput
  }),
  snapshot: (context) => runSnapshotCommandWithDependencies(context, {
    createAnalysisContext: createAnalysisContextForCli,
    resolveRepoRoot: getRepoRootForCli,
    writeOutput: writeCliOutput
  })
};

if (isDirectRun()) {
  runCli(process.argv.slice(2)).then((exitCode) => {
    process.exitCode = exitCode;
  });
}

export async function runCli(args: string[], runtime: CliRuntime = {}): Promise<number> {
  try {
    await run(args, runtime);
    return 0;
  } catch (error: unknown) {
    if (error instanceof CliExit) {
      return error.exitCode;
    }

    if (error instanceof HelpRequested) {
      printHelp(runtime);
      return 0;
    }

    const message = error instanceof Error ? error.message : String(error);
    writeStderr(runtime, `CodeDecay failed: ${message}\n`);
    return 2;
  }
}

async function run(args: string[], runtime: CliRuntime): Promise<void | number> {
  const [command, ...commandArgs] = args;
  const runtimeCwd = runtime.cwd ?? process.cwd();

  if (!command || command === "--help" || command === "-h") {
    printHelp(runtime);
    return;
  }

  if (command === "help") {
    const topic = commandArgs[0];
    printHelp(runtime, topic === "--help" || topic === "-h" ? undefined : topic);
    return;
  }

  if (command === "--version" || command === "-V" || command === "version") {
    if (commandArgs.includes("--help") || commandArgs.includes("-h")) {
      printHelp(runtime, "version");
      return;
    }

    runVersionCommand(runtime);
    return;
  }

  if (command === "man") {
    const topic = commandArgs[0];
    if (topic === "--help" || topic === "-h") {
      printHelp(runtime, "man");
      return;
    }

    printManual(runtime, topic);
    return;
  }

  if (command === "update") {
    if (commandArgs.includes("--help") || commandArgs.includes("-h")) {
      printHelp(runtime, "update");
      return;
    }

    await runUpdateCommand({
      args: commandArgs,
      runtime,
      runtimeCwd
    });
    return;
  }

  if (command === "uninstall") {
    if (commandArgs.includes("--help") || commandArgs.includes("-h")) {
      printHelp(runtime, "uninstall");
      return;
    }

    await runUninstallCommand({
      args: commandArgs,
      runtime,
      runtimeCwd
    });
    return;
  }

  if (commandArgs.includes("--help") || commandArgs.includes("-h")) {
    printHelp(runtime, command);
    return;
  }

  const handler = COMMAND_HANDLERS[command];
  if (!handler) {
    throwUnknownCommand(command);
  }

  await handler({
    args: commandArgs,
    runtime,
    runtimeCwd
  });
}

async function runMcpCommand(context: CliCommandContext): Promise<void> {
  const options = parseMcpArgs(context.args);
  const cwd = resolve(context.runtimeCwd, options.cwd ?? ".");
  const { startMcpServer } = await import("@submuxhq/codedecay-mcp");
  await startMcpServer({ cwd, cliPath: fileURLToPath(import.meta.url) });
}

async function runProductCommand(context: CliCommandContext): Promise<void> {
  const options = parseProductArgs(context.args);
  const cwd = resolve(context.runtimeCwd, options.cwd ?? ".");
  const loadedConfig = loadCodeDecayConfig({ cwd });
  const report = await createProductTargetReport(cwd, loadedConfig, options);

  writeCliOutput({
    cwd,
    output: options.output,
    rendered: renderProductTargetReport(report, options.format),
    runtime: context.runtime
  });

  if (isProductTargetFailure(report.summary.status)) {
    const shouldFail =
      options.failOnClassifications && options.failOnClassifications.length > 0
        ? shouldFailProductReportForClassifications(report, options.failOnClassifications)
        : true;
    if (shouldFail) {
      throw new CliExit(1);
    }
  }
}

function shouldFailProductReportForClassifications(
  report: ProductTargetReport,
  classifications: ProductFailureClassification[]
): boolean {
  const failures = productFailureBundlesFromProductTargetReport(report);
  const gate = new Set(classifications);
  return failures.some((failure) => gate.has(failure.classification));
}

function runDashboardCommand(context: CliCommandContext): void {
  const options = parseDashboardArgs(context.args);
  const cwd = resolve(context.runtimeCwd, options.cwd ?? ".");
  const rootDir = getRepoRootForCli(cwd, { format: "markdown" });
  const outputDir = resolve(cwd, options.output ?? join(".codedecay", "local", "dashboard"));
  resetProductDashboardFailures(outputDir);
  const dashboard = createProductDashboard(rootDir, outputDir, options);

  writeProductDashboard(outputDir, dashboard);
  write(context.runtime.stdout, renderProductDashboardSummary(dashboard, options.format));
}

interface ProductDashboard {
  tool: "CodeDecay";
  version: string;
  generatedAt: string;
  outputDir: string;
  summary: ProductDashboardSummary;
  runs: ProductDashboardRun[];
  failures: ProductDashboardFailure[];
}

interface ProductDashboardSummary {
  runs: number;
  targets: number;
  passed: number;
  failed: number;
  blocked: number;
  timedOut: number;
  skipped: number;
  failures: number;
  flaky: number;
  confirmedRegressions: number;
}

interface ProductDashboardRun {
  id: string;
  sourcePath: string;
  generatedAt?: string | undefined;
  status: ProductTargetStatus;
  durationMs?: number | undefined;
  targets: string[];
  passed: number;
  failed: number;
  blocked: number;
  timedOut: number;
  skipped: number;
}

interface ProductDashboardFailure {
  id: string;
  runId: string;
  title: string;
  targetId: string;
  checkId: string;
  checkKind: ProductCheckKind;
  priority: RiskLevel;
  classification: ProductFailureClassification;
  classificationConfidence?: number | undefined;
  classificationEvidence?: string[] | undefined;
  summary: string;
  expected: string;
  actual: string;
  impactedFiles: string[];
  rerunCommand: string;
  jsonPath: string;
  markdownPath: string;
}

function createProductDashboard(rootDir: string, outputDir: string, options: DashboardOptions): ProductDashboard {
  const artifactPaths = discoverProductDashboardArtifacts(rootDir, options.inputPaths);
  const runs: ProductDashboardRun[] = [];
  const failures: ProductDashboardFailure[] = [];
  const targetIds = new Set<string>();
  const generatedAt = new Date().toISOString();

  for (const artifactPath of artifactPaths) {
    const report = loadProductDashboardReport(artifactPath);
    if (!report) {
      continue;
    }

    const runId = dashboardSlug(relativePathForArtifact(rootDir, artifactPath));
    const run = productDashboardRunFromReport(runId, rootDir, artifactPath, report);
    runs.push(run);
    for (const targetId of run.targets) {
      targetIds.add(targetId);
    }

    for (const bundle of productFailureBundlesFromProductTargetReport(report)) {
      const sanitized = sanitizeProductFailureBundle(bundle);
      const failureId = dashboardSlug(`${runId}-${sanitized.id}`);
      const jsonPath = join("failures", `${failureId}.json`);
      const markdownPath = join("failures", `${failureId}.md`);
      failures.push({
        id: failureId,
        runId,
        title: sanitized.title,
        targetId: sanitized.target.id,
        checkId: sanitized.checkId,
        checkKind: sanitized.checkKind,
        priority: sanitized.priority,
        classification: sanitized.classification,
        classificationConfidence: sanitized.classificationConfidence,
        classificationEvidence: sanitized.classificationEvidence,
        summary: sanitized.summary,
        expected: sanitized.expected,
        actual: sanitized.actual,
        impactedFiles: sanitized.impactedFiles,
        rerunCommand: sanitized.rerunCommand,
        jsonPath,
        markdownPath
      });
      writeProductDashboardFailure(outputDir, jsonPath, markdownPath, sanitized);
    }
  }

  const sortedRuns = runs.sort((left, right) => (right.generatedAt ?? "").localeCompare(left.generatedAt ?? "") || left.id.localeCompare(right.id));
  const sortedFailures = failures.sort((left, right) => {
    const risk = priorityRank(right.priority) - priorityRank(left.priority);
    if (risk !== 0) {
      return risk;
    }

    return left.id.localeCompare(right.id);
  });

  return {
    tool: "CodeDecay",
    version: CODEDECAY_VERSION,
    generatedAt,
    outputDir: relativePathForArtifact(rootDir, outputDir),
    summary: {
      runs: sortedRuns.length,
      targets: targetIds.size,
      passed: sortedRuns.reduce((count, run) => count + run.passed, 0),
      failed: sortedRuns.reduce((count, run) => count + run.failed, 0),
      blocked: sortedRuns.reduce((count, run) => count + run.blocked, 0),
      timedOut: sortedRuns.reduce((count, run) => count + run.timedOut, 0),
      skipped: sortedRuns.reduce((count, run) => count + run.skipped, 0),
      failures: sortedFailures.length,
      flaky: sortedFailures.filter((failure) => failure.classification === "likely-flaky").length,
      confirmedRegressions: sortedFailures.filter((failure) => failure.classification === "confirmed-regression").length
    },
    runs: sortedRuns,
    failures: sortedFailures
  };
}

function discoverProductDashboardArtifacts(rootDir: string, inputPaths: string[]): string[] {
  const candidates = [
    join(rootDir, ".codedecay", "local", "product-runs"),
    join(rootDir, ".codedecay", "local", "product-trends"),
    ...inputPaths.map((path) => resolve(rootDir, path))
  ];
  const discovered: string[] = [];

  for (const candidate of candidates) {
    discovered.push(...discoverJsonFiles(candidate));
  }

  return dedupeStrings(discovered.map((path) => resolve(path))).sort((left, right) => left.localeCompare(right));
}

function discoverJsonFiles(path: string): string[] {
  if (!existsSync(path)) {
    return [];
  }

  const stats = statSync(path);
  if (stats.isFile()) {
    return path.endsWith(".json") ? [path] : [];
  }

  if (!stats.isDirectory()) {
    return [];
  }

  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = join(path, entry.name);
    if (entry.isDirectory()) {
      return discoverJsonFiles(child);
    }

    return entry.isFile() && entry.name.endsWith(".json") ? [child] : [];
  });
}

function loadProductDashboardReport(path: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    if (parsed && typeof parsed === "object" && Array.isArray((parsed as { targets?: unknown }).targets)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function productDashboardRunFromReport(
  runId: string,
  rootDir: string,
  artifactPath: string,
  report: Record<string, unknown>
): ProductDashboardRun {
  const summary = dashboardRecord(report.summary);
  const targets = Array.isArray(report.targets) ? report.targets.map(dashboardRecord).filter(Boolean) : [];
  return {
    id: runId,
    sourcePath: relativePathForArtifact(rootDir, artifactPath),
    generatedAt: dashboardString(report.generatedAt),
    status: productTargetStatusValue(dashboardString(summary?.status)) ?? "skipped",
    durationMs: dashboardNumber(summary?.durationMs),
    targets: dedupeStrings(targets.map((target) => dashboardString(target?.id)).filter((id): id is string => Boolean(id))),
    passed: dashboardNumber(summary?.passed) ?? targets.filter((target) => dashboardString(target?.status) === "passed").length,
    failed: dashboardNumber(summary?.failed) ?? targets.filter((target) => dashboardString(target?.status) === "failed").length,
    blocked: dashboardNumber(summary?.blocked) ?? targets.filter((target) => dashboardString(target?.status) === "blocked").length,
    timedOut: dashboardNumber(summary?.timedOut) ?? targets.filter((target) => dashboardString(target?.status) === "timed_out").length,
    skipped: dashboardNumber(summary?.skipped) ?? targets.filter((target) => dashboardString(target?.status) === "skipped").length
  };
}

function writeProductDashboard(outputDir: string, dashboard: ProductDashboard): void {
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(join(outputDir, "dashboard.json"), `${JSON.stringify(dashboard, null, 2)}\n`, "utf8");
  writeFileSync(join(outputDir, "index.html"), renderProductDashboardHtml(dashboard), "utf8");
}

function resetProductDashboardFailures(outputDir: string): void {
  rmSync(join(outputDir, "failures"), { recursive: true, force: true });
}

function writeProductDashboardFailure(
  outputDir: string,
  jsonPath: string,
  markdownPath: string,
  bundle: ProductFailureBundle
): void {
  mkdirSync(join(outputDir, "failures"), { recursive: true });
  writeFileSync(join(outputDir, jsonPath), `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
  writeFileSync(join(outputDir, markdownPath), renderProductDashboardFailureMarkdown(bundle), "utf8");
}

function sanitizeProductFailureBundle(bundle: ProductFailureBundle): ProductFailureBundle {
  return {
    ...bundle,
    target: {
      ...bundle.target,
      baseUrl: bundle.target.baseUrl ? sanitizeDashboardUrl(bundle.target.baseUrl) : undefined
    },
    title: redactDashboardText(bundle.title),
    summary: redactDashboardText(bundle.summary),
    failedStep: sanitizeDashboardStep(bundle.failedStep),
    neighboringSteps: bundle.neighboringSteps.map(sanitizeDashboardStep),
    artifacts: bundle.artifacts.map((artifact) => ({
      ...artifact,
      label: artifact.label ? redactDashboardText(artifact.label) : undefined,
      description: artifact.description ? redactDashboardText(artifact.description) : undefined
    })),
    expected: redactDashboardText(bundle.expected),
    actual: redactDashboardText(bundle.actual),
    classificationEvidence: bundle.classificationEvidence?.map(redactDashboardText),
    rootCauseHypothesis: bundle.rootCauseHypothesis ? redactDashboardText(bundle.rootCauseHypothesis) : undefined,
    suggestedFixTasks: bundle.suggestedFixTasks.map(redactDashboardText),
    rerunCommand: redactDashboardText(bundle.rerunCommand)
  };
}

function sanitizeDashboardStep(step: ProductFailureStep): ProductFailureStep {
  return {
    ...step,
    label: redactDashboardText(step.label),
    expected: step.expected ? redactDashboardText(step.expected) : undefined,
    actual: step.actual ? redactDashboardText(step.actual) : undefined
  };
}

function sanitizeDashboardUrl(value: string): string {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, url.pathname === "/" ? "/" : "");
  } catch {
    return value.split(/[?#]/, 1)[0] ?? value;
  }
}

function redactDashboardText(value: string): string {
  return value
    .replace(/https?:\/\/[^\s`)"']+/g, (url) => sanitizeDashboardUrl(url))
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]")
    .replace(
      /\b(token|access_token|refresh_token|api[_-]?key|secret|password|session|cookie)=([^&\s]+)/gi,
      "$1=[redacted]"
    )
    .replace(/\s+/g, " ")
    .trim();
}

function renderProductDashboardSummary(dashboard: ProductDashboard, format: ConfigFormat): string {
  if (format === "json") {
    return `${JSON.stringify(dashboard, null, 2)}\n`;
  }

  return [
    "## CodeDecay Product Dashboard",
    "",
    `Dashboard written to \`${dashboard.outputDir}\`.`,
    "",
    "| Metric | Count |",
    "| --- | ---: |",
    `| Runs | ${dashboard.summary.runs} |`,
    `| Targets | ${dashboard.summary.targets} |`,
    `| Failures | ${dashboard.summary.failures} |`,
    `| Confirmed regressions | ${dashboard.summary.confirmedRegressions} |`,
    `| Likely flaky | ${dashboard.summary.flaky} |`,
    "",
    dashboard.failures.length > 0 ? "Open `index.html` for failure bundle links and rerun commands." : "No product failures found.",
    ""
  ].join("\n");
}

function renderProductDashboardHtml(dashboard: ProductDashboard): string {
  const failureRows = dashboard.failures
    .map(
      (failure) => `<tr>
        <td>${escapeHtml(failure.priority)}</td>
        <td>${escapeHtml(failure.classification)}</td>
        <td>${escapeHtml(failure.targetId)}</td>
        <td>${escapeHtml(failure.title)}</td>
        <td><a href="${escapeAttribute(failure.markdownPath)}">Markdown</a> · <a href="${escapeAttribute(failure.jsonPath)}">JSON</a></td>
      </tr>`
    )
    .join("\n");
  const runRows = dashboard.runs
    .map(
      (run) => `<tr>
        <td>${escapeHtml(run.generatedAt ?? "unknown")}</td>
        <td>${escapeHtml(run.status)}</td>
        <td>${escapeHtml(run.targets.join(", ") || "none")}</td>
        <td>${escapeHtml(run.sourcePath)}</td>
      </tr>`
    )
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CodeDecay Product Dashboard</title>
  <style>
    :root { color-scheme: dark; font-family: ui-sans-serif, system-ui, sans-serif; background: #090909; color: #f4f1ec; }
    body { margin: 0; padding: 32px; background: radial-gradient(circle at top left, #24160c, #090909 38%); }
    main { max-width: 1120px; margin: 0 auto; }
    .hero { border: 1px solid #2b2b2b; background: #111; border-radius: 24px; padding: 28px; box-shadow: 0 24px 80px rgba(0,0,0,.35); }
    h1 { margin: 0 0 8px; font-size: clamp(2rem, 5vw, 4rem); letter-spacing: -.05em; }
    .muted { color: #aaa39a; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 14px; margin: 24px 0; }
    .card { border: 1px solid #2b2b2b; background: #151515; border-radius: 18px; padding: 18px; }
    .num { font-size: 2rem; font-weight: 800; color: #f08a24; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0 32px; overflow: hidden; border-radius: 16px; }
    th, td { border-bottom: 1px solid #272727; padding: 12px; text-align: left; vertical-align: top; }
    th { color: #f08a24; background: #111; }
    a { color: #f08a24; }
    code { background: #1c1c1c; padding: 2px 6px; border-radius: 6px; }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <p class="muted">Generated ${escapeHtml(dashboard.generatedAt)}</p>
      <h1>CodeDecay Product Dashboard</h1>
      <p class="muted">Static product verification history. No backend, telemetry, or hosted service required.</p>
      <div class="grid">
        <div class="card"><div class="num">${dashboard.summary.runs}</div><div>Runs</div></div>
        <div class="card"><div class="num">${dashboard.summary.targets}</div><div>Targets</div></div>
        <div class="card"><div class="num">${dashboard.summary.failures}</div><div>Failures</div></div>
        <div class="card"><div class="num">${dashboard.summary.confirmedRegressions}</div><div>Confirmed regressions</div></div>
        <div class="card"><div class="num">${dashboard.summary.flaky}</div><div>Likely flaky</div></div>
      </div>
    </section>
    <h2>Failures</h2>
    <table>
      <thead><tr><th>Priority</th><th>Classification</th><th>Target</th><th>Title</th><th>Bundle</th></tr></thead>
      <tbody>${failureRows || '<tr><td colspan="5">No product failures found.</td></tr>'}</tbody>
    </table>
    <h2>Runs</h2>
    <table>
      <thead><tr><th>Generated</th><th>Status</th><th>Targets</th><th>Source</th></tr></thead>
      <tbody>${runRows || '<tr><td colspan="4">No product run artifacts found.</td></tr>'}</tbody>
    </table>
  </main>
</body>
</html>
`;
}

function renderProductDashboardFailureMarkdown(bundle: ProductFailureBundle): string {
  return [
    `# ${bundle.title}`,
    "",
    `- Classification: ${bundle.classification}${bundle.classificationConfidence !== undefined ? ` (${Math.round(bundle.classificationConfidence * 100)}% confidence)` : ""}`,
    `- Priority: ${bundle.priority}`,
    `- Target: ${bundle.target.id}${bundle.target.baseUrl ? ` (${bundle.target.baseUrl})` : ""}`,
    `- Check: ${bundle.checkId} (${bundle.checkKind})`,
    `- Expected: ${bundle.expected}`,
    `- Actual: ${bundle.actual}`,
    `- Rerun: \`${bundle.rerunCommand}\``,
    "",
    "## Evidence",
    "",
    ...(bundle.classificationEvidence ?? ["No classification evidence recorded."]).map((evidence) => `- ${evidence}`),
    "",
    "## Repair Tasks",
    "",
    ...bundle.suggestedFixTasks.map((task) => `- ${task}`),
    ""
  ].join("\n");
}

function dashboardRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function dashboardString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function dashboardNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function productTargetStatusValue(value: string | undefined): ProductTargetStatus | undefined {
  return value === "passed" || value === "failed" || value === "skipped" || value === "blocked" || value === "timed_out"
    ? value
    : undefined;
}

function dashboardSlug(value: string): string {
  return slugifyLowerAscii(value, "dashboard", 96);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };
    return entities[char] ?? char;
  });
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function runAnalyzeCommand(context: CliCommandContext): void {
  const options = parseAnalyzeArgs(context.args);
  const cwd = resolve(context.runtimeCwd, options.cwd ?? ".");
  const rootDir = getRepoRootForCli(cwd, options);
  const { report } = createAnalysisContextForCli(rootDir, options);

  writeCliOutput({
    cwd,
    output: options.output,
    rendered: renderReport(report, options.format),
    runtime: context.runtime
  });

  if (options.failOn && shouldFailForRisk(report.summary.riskLevel, options.failOn)) {
    throw new CliExit(1);
  }
}

function createAnalysisContextForCli(
  rootDir: string,
  options: AnalyzeOptions | AgentOptions | RedteamOptions | SnapshotOptions | LlmReviewOptions
): CliAnalysisContext {
  const changedFiles = getChangedFilesForCli(rootDir, options);
  const analyzerResult = analyzeJsProject({
    rootDir,
    changedFiles
  });
  const loadedMemory = loadCodeDecayMemory(rootDir);
  const analyzerResultWithMemory = applyMemoryContext({
    memory: loadedMemory.memory,
    changedFiles,
    impactedAreas: analyzerResult.impactedAreas,
    analyzerResult
  });

  return {
    loadedMemory,
    report: createAnalysisReport({
      base: options.base,
      head: options.head,
      changedFiles,
      analyzerResult: analyzerResultWithMemory,
      productFailureBundles: loadLatestProductFailureBundles(rootDir)
    })
  };
}

function loadLatestProductFailureBundles(rootDir: string): ProductFailureBundle[] {
  const reportPath = join(rootDir, CODEDECAY_PRODUCT_LATEST_REPORT_PATH);
  if (!existsSync(reportPath)) {
    return [];
  }

  try {
    return productFailureBundlesFromProductTargetReport(JSON.parse(readFileSync(reportPath, "utf8")));
  } catch {
    return [];
  }
}

function throwUnknownCommand(command: string): never {
  return throwUnknownCommandWithDocs({
    command,
    docs: HELP_DOCS,
    rootFlagAliases: ROOT_FLAG_ALIASES
  });
}

function writeOutput(cwd: string, path: string, contents: string): void {
  const outputPath = resolve(cwd, path);
  const outputDir = dirname(outputPath);
  mkdirSync(outputDir, { recursive: true });

  writeFileSync(outputPath, contents, "utf8");
}

function writeCliOutput(input: {
  cwd: string;
  output?: string | undefined;
  rendered: string;
  runtime: CliRuntime;
}): void {
  if (input.output) {
    writeOutput(input.cwd, input.output, input.rendered);
    return;
  }

  write(input.runtime.stdout, input.rendered);
}

async function createProductTargetReport(
  rootDir: string,
  loadedConfig: LoadedCodeDecayConfig,
  options: ProductOptions
): Promise<ProductTargetReport> {
  const startedAt = Date.now();
  const allTargets = Object.values(loadedConfig.config.productTesting.targets).sort((left, right) => left.id.localeCompare(right.id));
  const targets = selectProductTargets(allTargets, options.target);
  if ((options.explore || options.generateTests || options.runGeneratedTests || options.generateApiTests || options.runGeneratedApiTests) && targets.length === 0) {
    throw new Error("codedecay product execution workflows require at least one configured productTesting target.");
  }

  const results: ProductTargetResult[] = [];

  for (const target of targets) {
    results.push(await runProductTarget(rootDir, loadedConfig, target, options));
  }

  const report: ProductTargetReport = {
    tool: "CodeDecay",
    version: CODEDECAY_VERSION,
    generatedAt: new Date().toISOString(),
    summary: createProductTargetSummary(results, elapsed(startedAt)),
    targets: results,
    safety: {
      commandsExecuted: results.some((result) => commandActuallyExecuted(result.setup) || commandActuallyExecuted(result.teardown) || result.start?.status === "started"),
      browserAutomationRan: results.some((result) => result.exploration?.status === "passed" || result.exploration?.status === "failed"),
      generatedTestsRan: results.some((result) => result.generatedTestRun !== undefined || result.generatedApiTestRun !== undefined),
      startupCommandsAllowed: loadedConfig.config.safety.allowCommands,
      telemetrySent: false,
      cloudDependency: false,
      notes: [
        "Product target checks are explicit and local-first.",
        "CodeDecay only runs configured product target commands when safety.allowCommands is true.",
        "Existing baseUrl and preview URL targets can be health-checked without startup commands.",
        "Product exploration uses a project-provided Playwright install and never installs browsers.",
        "Generated tests are review artifacts unless --run-generated-tests or --run-generated-api-tests is explicitly used."
      ]
    }
  };

  if (loadedConfig.sourcePath) {
    report.configSource = loadedConfig.sourcePath;
  }

  return report;
}

function selectProductTargets(targets: CodeDecayProductTarget[], requestedTarget: string | undefined): CodeDecayProductTarget[] {
  if (!requestedTarget) {
    return targets;
  }

  const target = targets.find((candidate) => candidate.id === requestedTarget);
  if (!target) {
    const available = targets.length > 0 ? targets.map((candidate) => candidate.id).join(", ") : "none";
    throw new Error(`Unknown product target "${requestedTarget}". Available targets: ${available}.`);
  }

  return [target];
}

async function runProductTarget(
  rootDir: string,
  loadedConfig: LoadedCodeDecayConfig,
  target: CodeDecayProductTarget,
  options: ProductOptions
): Promise<ProductTargetResult> {
  const startedAt = Date.now();
  const notes = [...target.readiness.notes];
  let setup: CommandExecutionResult | undefined;
  let startResult: ManagedProductProcess | undefined;
  let health: ProductHealthResult | undefined;
  let exploration: ProductExplorationResult | undefined;
  let generatedTests: ProductGeneratedTestsResult | undefined;
  let generatedTestRun: ProductGeneratedTestRunResult | undefined;
  let generatedApiTests: ProductGeneratedTestsResult | undefined;
  let generatedApiTestRun: ProductGeneratedTestRunResult | undefined;
  let teardown: CommandExecutionResult | undefined;
  let status: ProductTargetStatus = "skipped";
  let shouldRunHealthCheck = true;

  try {
    if (target.authSetupCommand) {
      setup = await runProductOneShotCommand(rootDir, loadedConfig, target.authSetupCommand, target.timeoutMs);
      if (setup.status !== "passed") {
        status = productStatusFromRequiredCommand(setup.status);
        notes.push("Auth setup command did not pass; health checking was skipped.");
        shouldRunHealthCheck = false;
      }
    }

    if (shouldRunHealthCheck && target.startCommand) {
      startResult = await startManagedProductProcess(rootDir, loadedConfig, target.startCommand, target.timeoutMs);
      if (startResult.status !== "started") {
        status = startResult.status === "blocked" ? "blocked" : "failed";
        notes.push("Start command did not produce a managed running process; health checking was skipped.");
        shouldRunHealthCheck = false;
      }
    }

    if (shouldRunHealthCheck) {
      const healthUrl = target.healthCheck ?? target.readiness.effectiveBaseUrl ?? target.baseUrl;
      if (!healthUrl) {
        status = target.readiness.status === "needs-command-approval" || target.readiness.status === "missing-preview-url" ? "blocked" : "skipped";
        notes.push("No healthCheck, baseUrl, or resolved preview URL is available for product target polling.");
        shouldRunHealthCheck = false;
      } else {
        health = await pollProductHealth(healthUrl, target.timeoutMs);
        status = health.status;
      }
    }

    if (options.explore) {
      if (health?.status === "passed") {
        exploration = await exploreProductTarget(rootDir, loadedConfig, target, health, {
          maxPages: options.maxPages,
          maxActions: options.maxActions,
          allowDestructiveActions: options.allowDestructiveActions
        });
        if (exploration.status !== "passed") {
          status = exploration.status;
        }
      } else if (!isProductTargetFailure(status)) {
        status = "blocked";
        exploration = {
          status: "blocked",
          driver: "playwright",
          pages: 0,
          interactiveElements: 0,
          blockedActions: 0,
          skippedActions: 0,
          durationMs: 0,
          error: "Product exploration requires a healthy target URL.",
          notes: ["Run a target with baseUrl, resolved previewUrlEnv, or healthCheck before exploration."]
        };
      }
    }

    if (options.generateTests || options.runGeneratedTests) {
      generatedTests = options.generateTests
        ? generateProductTestsForTarget(rootDir, target, exploration?.artifactPath)
        : loadGeneratedProductTestsForTarget(rootDir, target);
      if (generatedTests.status !== "passed") {
        status = generatedTests.status;
      } else if (options.runGeneratedTests) {
        generatedTestRun = await runGeneratedProductTests(rootDir, loadedConfig, target, generatedTests, "--run-generated-tests", options.testId);
        if (generatedTestRun.status !== "passed") {
          status = generatedTestRun.status;
        }
      }
    }

    if (options.generateApiTests || options.runGeneratedApiTests) {
      generatedApiTests = options.generateApiTests
        ? generateProductApiTestsForTarget(rootDir, loadedConfig, target, health, options.allowDestructiveActions)
        : loadGeneratedProductApiTestsForTarget(rootDir, target);
      if (generatedApiTests.status !== "passed") {
        status = generatedApiTests.status;
      } else if (options.runGeneratedApiTests) {
        generatedApiTestRun = await runGeneratedProductTests(rootDir, loadedConfig, target, generatedApiTests, "--run-generated-api-tests", options.testId);
        if (generatedApiTestRun.status !== "passed") {
          status = generatedApiTestRun.status;
        }
      }
    }
  } finally {
    if (startResult?.child) {
      await stopManagedProductProcess(startResult.child);
    }

    if (target.teardownCommand && (startResult?.status === "started" || setup?.status === "passed")) {
      teardown = await runProductOneShotCommand(rootDir, loadedConfig, target.teardownCommand, target.timeoutMs);
      if (teardown.status !== "passed" && !isProductTargetFailure(status)) {
        status = productStatusFromRequiredCommand(teardown.status);
        notes.push("Teardown command did not pass after product target execution.");
      }
    }
  }

  return createProductTargetResult(
    target,
    status,
    startedAt,
    notes,
    setup,
    startResult,
    health,
    exploration,
    generatedTests,
    generatedTestRun,
    generatedApiTests,
    generatedApiTestRun,
    teardown
  );
}

function createProductTargetResult(
  target: CodeDecayProductTarget,
  status: ProductTargetStatus,
  startedAt: number,
  notes: string[],
  setup: CommandExecutionResult | undefined,
  start: ManagedProductProcess | undefined,
  health: ProductHealthResult | undefined,
  exploration: ProductExplorationResult | undefined,
  generatedTests: ProductGeneratedTestsResult | undefined,
  generatedTestRun: ProductGeneratedTestRunResult | undefined,
  generatedApiTests: ProductGeneratedTestsResult | undefined,
  generatedApiTestRun: ProductGeneratedTestRunResult | undefined,
  teardown: CommandExecutionResult | undefined
): ProductTargetResult {
  const result: ProductTargetResult = {
    id: target.id,
    status,
    readiness: target.readiness,
    baseUrl: target.readiness.effectiveBaseUrl ?? target.baseUrl,
    healthCheck: target.healthCheck,
    timeoutMs: target.timeoutMs,
    durationMs: elapsed(startedAt),
    notes
  };

  if (setup) {
    result.setup = setup;
  }

  if (start) {
    const { child: _child, ...serializableStart } = start;
    result.start = serializableStart;
  }

  if (health) {
    result.health = health;
  }

  if (exploration) {
    result.exploration = exploration;
  }

  if (generatedTests) {
    result.generatedTests = generatedTests;
  }

  if (generatedTestRun) {
    result.generatedTestRun = generatedTestRun;
  }

  if (generatedApiTests) {
    result.generatedApiTests = generatedApiTests;
  }

  if (generatedApiTestRun) {
    result.generatedApiTestRun = generatedApiTestRun;
  }

  if (teardown) {
    result.teardown = teardown;
  }

  return result;
}

async function runProductOneShotCommand(
  rootDir: string,
  loadedConfig: LoadedCodeDecayConfig,
  command: string,
  timeoutMs: number
): Promise<CommandExecutionResult> {
  return await runConfiguredCommand({
    command,
    cwd: rootDir,
    timeoutMs,
    safety: {
      allowCommands: loadedConfig.config.safety.allowCommands
    }
  });
}

async function startManagedProductProcess(
  rootDir: string,
  loadedConfig: LoadedCodeDecayConfig,
  command: string,
  timeoutMs: number
): Promise<ManagedProductProcess> {
  const startedAt = Date.now();
  if (!loadedConfig.config.safety.allowCommands) {
    return {
      command,
      status: "blocked",
      durationMs: 0,
      stdout: "",
      stderr: "Product target startup is disabled by config safety.allowCommands.",
      blockedReason: "safety.allowCommands is false"
    };
  }

  const safety = checkCommandSafety(command);
  if (!safety.safe) {
    const message = `Command was blocked by CodeDecay safety policy: ${safety.reason}.`;
    return {
      command,
      status: "blocked",
      durationMs: 0,
      stdout: "",
      stderr: message,
      error: message,
      blockedReason: safety.reason
    };
  }

  let stdout = "";
  let stderr = "";
  let spawnError: Error | undefined;
  const child = spawn(command, {
    cwd: rootDir,
    shell: true,
    env: {
      ...process.env,
      CI: process.env.CI ?? "1"
    }
  });

  child.stdout.on("data", (chunk: Buffer) => {
    stdout = appendLimitedOutput(stdout, chunk.toString("utf8"), 16 * 1024);
  });

  child.stderr.on("data", (chunk: Buffer) => {
    stderr = appendLimitedOutput(stderr, chunk.toString("utf8"), 16 * 1024);
  });

  child.on("error", (error) => {
    spawnError = error;
  });

  await delay(Math.min(250, Math.max(50, Math.floor(timeoutMs / 10))));

  if (spawnError) {
    return {
      command,
      status: "error",
      durationMs: elapsed(startedAt),
      stdout,
      stderr,
      error: spawnError.message
    };
  }

  if (child.exitCode !== null) {
    return {
      command,
      status: "error",
      durationMs: elapsed(startedAt),
      stdout,
      stderr,
      error: `Start command exited early with code ${child.exitCode}.`
    };
  }

  return {
    command,
    status: "started",
    durationMs: elapsed(startedAt),
    stdout,
    stderr,
    pid: child.pid,
    child
  };
}

async function stopManagedProductProcess(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null || child.killed) {
    return;
  }

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      if (child.exitCode === null && !child.killed) {
        child.kill("SIGKILL");
      }
      resolve();
    }, 1000);

    child.once("close", () => {
      clearTimeout(timeout);
      resolve();
    });

    child.kill("SIGTERM");
  });
}

async function pollProductHealth(url: string, timeoutMs: number): Promise<ProductHealthResult> {
  const startedAt = Date.now();
  const deadline = startedAt + timeoutMs;
  let attempts = 0;
  let lastStatus: number | undefined;
  let lastError: string | undefined;

  while (Date.now() <= deadline) {
    attempts += 1;
    const remainingMs = Math.max(1, deadline - Date.now());
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.min(2500, remainingMs));

    try {
      const response = await fetch(url, {
        signal: controller.signal
      });
      lastStatus = response.status;

      if (response.status >= 200 && response.status < 400) {
        clearTimeout(timeout);
        return {
          url,
          status: "passed",
          attempts,
          durationMs: elapsed(startedAt),
          httpStatus: response.status
        };
      }

      lastError = `Health check returned HTTP ${response.status}.`;
    } catch (error: unknown) {
      lastError = error instanceof Error ? error.message : String(error);
    } finally {
      clearTimeout(timeout);
    }

    await delay(Math.min(500, Math.max(0, deadline - Date.now())));
  }

  return {
    url,
    status: "timed_out",
    attempts,
    durationMs: elapsed(startedAt),
    httpStatus: lastStatus,
    error: lastError ? `Timed out waiting for a healthy response: ${lastError}` : "Timed out waiting for a healthy response."
  };
}

async function exploreProductTarget(
  rootDir: string,
  loadedConfig: LoadedCodeDecayConfig,
  target: CodeDecayProductTarget,
  health: ProductHealthResult,
  options: ProductExplorerOptions
): Promise<ProductExplorationResult> {
  const startedAt = Date.now();
  const baseUrl = resolveProductExploreBaseUrl(target, health);
  const notes = [
    "Explorer uses same-origin crawling by default.",
    "Destructive forms and actions are recorded as blocked unless --allow-destructive-actions is set."
  ];

  if (!loadedConfig.config.safety.allowCommands) {
    return {
      status: "blocked",
      driver: "playwright",
      pages: 0,
      interactiveElements: 0,
      blockedActions: 0,
      skippedActions: 0,
      durationMs: elapsed(startedAt),
      error: "Product exploration requires safety.allowCommands to be true.",
      notes
    };
  }

  if (!baseUrl) {
    return {
      status: "blocked",
      driver: "playwright",
      pages: 0,
      interactiveElements: 0,
      blockedActions: 0,
      skippedActions: 0,
      durationMs: elapsed(startedAt),
      error: "Product exploration requires a baseUrl, resolved previewUrlEnv, or healthCheck URL.",
      notes
    };
  }

  const playwright = loadProjectPlaywright(rootDir);
  if (!playwright.ok) {
    return {
      status: "blocked",
      driver: "playwright",
      pages: 0,
      interactiveElements: 0,
      blockedActions: 0,
      skippedActions: 0,
      durationMs: elapsed(startedAt),
      error: playwright.error,
      notes: [...notes, "Install Playwright in the target project; CodeDecay does not install browsers or packages."]
    };
  }

  let browser: ProductPlaywrightBrowser | undefined;
  try {
    browser = await playwright.module.chromium.launch({ headless: true });
    const artifactRoot = join(".codedecay", "local", "product-flow-maps", sanitizeArtifactSegment(target.id));
    const flowMap = await crawlProductFlowMap({
      browser,
      rootDir,
      artifactRoot,
      target,
      baseUrl,
      options,
      timeoutMs: target.timeoutMs
    });
    const artifactPath = join(artifactRoot, "flow-map.json");
    writeOutput(rootDir, artifactPath, `${JSON.stringify(flowMap, null, 2)}\n`);

    return {
      status: "passed",
      driver: "playwright",
      artifactPath,
      pages: flowMap.summary.pages,
      interactiveElements: flowMap.summary.interactiveElements,
      blockedActions: flowMap.summary.blockedActions,
      skippedActions: flowMap.summary.skippedActions,
      durationMs: elapsed(startedAt),
      notes
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: "failed",
      driver: "playwright",
      pages: 0,
      interactiveElements: 0,
      blockedActions: 0,
      skippedActions: 0,
      durationMs: elapsed(startedAt),
      error: `Playwright product exploration failed: ${message}`,
      notes: [...notes, "CodeDecay does not install Playwright browsers; run the project's normal Playwright setup if browser launch fails."]
    };
  } finally {
    await browser?.close?.();
  }
}

interface ProductPlaywrightModule {
  chromium: {
    launch: (options: { headless: boolean }) => Promise<ProductPlaywrightBrowser>;
  };
}

interface ProductPlaywrightBrowser {
  newPage: () => Promise<ProductPlaywrightPage>;
  close?: () => Promise<void>;
}

interface ProductPlaywrightPage {
  goto: (url: string, options: { waitUntil: "domcontentloaded"; timeout: number }) => Promise<unknown>;
  content: () => Promise<string>;
  title?: () => Promise<string>;
  url?: () => string;
  screenshot?: (options: { path: string; fullPage: boolean }) => Promise<unknown>;
  close?: () => Promise<void>;
}

function loadProjectPlaywright(rootDir: string): { ok: true; module: ProductPlaywrightModule } | { ok: false; error: string } {
  try {
    const projectRequire = createRequire(join(rootDir, "package.json"));
    const loaded = projectRequire("playwright") as Partial<ProductPlaywrightModule>;
    if (!loaded.chromium?.launch) {
      return {
        ok: false,
        error: "Project Playwright package does not expose chromium.launch."
      };
    }

    return {
      ok: true,
      module: loaded as ProductPlaywrightModule
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: `Playwright is not installed or cannot be loaded from the target project: ${message}`
    };
  }
}

async function crawlProductFlowMap(input: {
  browser: ProductPlaywrightBrowser;
  rootDir: string;
  artifactRoot: string;
  target: CodeDecayProductTarget;
  baseUrl: string;
  options: ProductExplorerOptions;
  timeoutMs: number;
}): Promise<ProductFlowMap> {
  const startUrl = normalizeExploreUrl(input.baseUrl);
  const origin = new URL(startUrl).origin;
  const queue: Array<{ url: string; depth: number }> = [{ url: startUrl, depth: 0 }];
  const queued = new Set([startUrl]);
  const visited = new Set<string>();
  const pages: ProductFlowPage[] = [];
  const crawlState = {
    recordedActions: 0,
    skippedActions: 0,
    blockedActions: [] as ProductBlockedAction[]
  };
  const page = await input.browser.newPage();

  try {
    while (queue.length > 0 && pages.length < input.options.maxPages) {
      const next = queue.shift();
      if (!next || visited.has(next.url)) {
        continue;
      }

      visited.add(next.url);
      await page.goto(next.url, {
        waitUntil: "domcontentloaded",
        timeout: Math.min(input.timeoutMs, 30_000)
      });
      const currentUrl = normalizeExploreUrl(page.url?.() ?? next.url);
      if (new URL(currentUrl).origin !== origin) {
        continue;
      }

      const html = await page.content();
      const title = page.title ? await page.title().catch(() => extractHtmlTitle(html)) : extractHtmlTitle(html);
      const extracted = extractProductFlowPage({
        url: currentUrl,
        html,
        origin,
        depth: next.depth,
        options: input.options,
        state: crawlState
      });
      const screenshotPath = await captureProductScreenshot({
        page,
        rootDir: input.rootDir,
        artifactRoot: input.artifactRoot,
        url: currentUrl
      });

      pages.push({
        ...extracted,
        title: title || extracted.title,
        ...(screenshotPath ? { screenshotPath } : {})
      });

      for (const link of extracted.links) {
        if (!link.discovered || queued.has(link.href) || visited.has(link.href)) {
          continue;
        }

        queued.add(link.href);
        queue.push({ url: link.href, depth: next.depth + 1 });
      }
    }
  } finally {
    await page.close?.();
  }

  const interactiveElements = pages.reduce((count, item) => count + item.interactiveElements.length, 0);
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    target: {
      id: input.target.id,
      baseUrl: startUrl,
      origin
    },
    driver: "playwright",
    limits: {
      sameOrigin: true,
      maxPages: input.options.maxPages,
      maxActions: input.options.maxActions,
      allowDestructiveActions: input.options.allowDestructiveActions
    },
    summary: {
      pages: pages.length,
      interactiveElements,
      blockedActions: crawlState.blockedActions.length,
      skippedActions: crawlState.skippedActions
    },
    pages,
    blockedActions: crawlState.blockedActions
  };
}

function extractProductFlowPage(input: {
  url: string;
  html: string;
  origin: string;
  depth: number;
  options: ProductExplorerOptions;
  state: {
    recordedActions: number;
    skippedActions: number;
    blockedActions: ProductBlockedAction[];
  };
}): ProductFlowPage {
  const links = extractProductLinks(input.html, input.url, input.origin);
  const interactiveElements: ProductInteractiveElement[] = [];

  for (const link of links) {
    appendInteractiveElement(interactiveElements, input.state, input.options, input.url, {
      kind: "link",
      selector: link.selector,
      name: link.text,
      action: link.href,
      destructive: false,
      blocked: false
    });
  }

  for (const form of extractProductForms(input.html, input.url)) {
    appendInteractiveElement(interactiveElements, input.state, input.options, input.url, form);
  }

  for (const button of extractProductButtons(input.html)) {
    appendInteractiveElement(interactiveElements, input.state, input.options, input.url, button);
  }

  for (const inputElement of extractProductInputs(input.html)) {
    appendInteractiveElement(interactiveElements, input.state, input.options, input.url, inputElement);
  }

  return {
    url: input.url,
    title: extractHtmlTitle(input.html),
    path: new URL(input.url).pathname || "/",
    depth: input.depth,
    links,
    interactiveElements
  };
}

function appendInteractiveElement(
  elements: ProductInteractiveElement[],
  state: {
    recordedActions: number;
    skippedActions: number;
    blockedActions: ProductBlockedAction[];
  },
  options: ProductExplorerOptions,
  pageUrl: string,
  element: ProductInteractiveElement
): void {
  if (state.recordedActions >= options.maxActions) {
    state.skippedActions += 1;
    return;
  }

  const blockedElement =
    element.destructive && !options.allowDestructiveActions
      ? {
          ...element,
          blocked: true,
          blockReason: element.blockReason ?? "Potentially destructive product action."
        }
      : {
          ...element,
          blocked: false,
          blockReason: undefined
        };

  elements.push(blockedElement);
  state.recordedActions += 1;

  if (blockedElement.blocked) {
    state.blockedActions.push({
      pageUrl,
      selector: blockedElement.selector,
      name: blockedElement.name,
      reason: blockedElement.blockReason ?? "Potentially destructive product action."
    });
  }
}

function extractProductLinks(html: string, baseUrl: string, origin: string): ProductFlowLink[] {
  const links: ProductFlowLink[] = [];
  const seen = new Set<string>();

  for (const element of extractHtmlElements(html, "a")) {
    const attrs = parseHtmlAttributes(element.rawAttributes);
    const rawHref = attrs.href;
    if (!rawHref || rawHref.startsWith("#") || /^(mailto|tel|javascript):/i.test(rawHref)) {
      continue;
    }

    const href = resolveMaybeUrl(rawHref, baseUrl);
    if (!href || seen.has(href)) {
      continue;
    }

    seen.add(href);
    const sameOrigin = new URL(href).origin === origin;
    links.push({
      href,
      text: accessibleName(attrs, stripHtml(element.innerHtml), rawHref),
      selector: `a[href="${escapeSelectorValue(rawHref)}"]`,
      sameOrigin,
      discovered: sameOrigin
    });
  }

  return links.sort((left, right) => left.href.localeCompare(right.href));
}

function extractProductForms(html: string, baseUrl: string): ProductInteractiveElement[] {
  const forms: ProductInteractiveElement[] = [];
  let index = 0;

  for (const element of extractHtmlElements(html, "form")) {
    index += 1;
    const attrs = parseHtmlAttributes(element.rawAttributes);
    const method = (attrs.method ?? "get").toLowerCase();
    const rawAction = attrs.action ?? baseUrl;
    const action = resolveMaybeUrl(rawAction, baseUrl) ?? rawAction;
    const text = stripHtml(element.innerHtml);
    const name = accessibleName(attrs, text, `form ${index}`);
    const destructive = method !== "get" || isDestructiveText(`${name} ${method} ${rawAction}`);

    forms.push({
      kind: "form",
      selector: selectorFromAttrs("form", attrs, index),
      name,
      action,
      method,
      destructive,
      blocked: destructive,
      blockReason: destructive ? `Form method ${method.toUpperCase()} may mutate product state.` : undefined
    });
  }

  return forms;
}

function extractProductButtons(html: string): ProductInteractiveElement[] {
  const buttons: ProductInteractiveElement[] = [];
  let index = 0;

  for (const element of extractHtmlElements(html, "button")) {
    index += 1;
    const attrs = parseHtmlAttributes(element.rawAttributes);
    const name = accessibleName(attrs, stripHtml(element.innerHtml), `button ${index}`);
    const type = (attrs.type ?? "submit").toLowerCase();
    const destructive = isDestructiveText(`${name} ${type}`);

    buttons.push({
      kind: "button",
      selector: selectorFromAttrs("button", attrs, index),
      name,
      inputType: type,
      destructive,
      blocked: destructive,
      blockReason: destructive ? "Button name or type matches a destructive action pattern." : undefined
    });
  }

  return buttons;
}

function extractProductInputs(html: string): ProductInteractiveElement[] {
  const inputs: ProductInteractiveElement[] = [];
  let index = 0;

  for (const element of extractHtmlStartTags(html, "input")) {
    index += 1;
    const attrs = parseHtmlAttributes(element.rawAttributes);
    const type = (attrs.type ?? "text").toLowerCase();
    const name = accessibleName(attrs, attrs.value ?? attrs.placeholder ?? "", `input ${index}`);
    const destructive = ["submit", "button", "reset"].includes(type) && isDestructiveText(`${name} ${type}`);

    inputs.push({
      kind: "input",
      selector: selectorFromAttrs("input", attrs, index),
      name,
      inputType: type,
      destructive,
      blocked: destructive,
      blockReason: destructive ? "Input action matches a destructive action pattern." : undefined
    });
  }

  return inputs;
}

async function captureProductScreenshot(input: {
  page: ProductPlaywrightPage;
  rootDir: string;
  artifactRoot: string;
  url: string;
}): Promise<string | undefined> {
  if (!input.page.screenshot) {
    return undefined;
  }

  const screenshotPath = join(input.artifactRoot, "screenshots", `${sanitizeArtifactSegment(new URL(input.url).pathname || "root")}.png`);
  try {
    mkdirSync(dirname(join(input.rootDir, screenshotPath)), { recursive: true });
    await input.page.screenshot({
      path: join(input.rootDir, screenshotPath),
      fullPage: true
    });
    return screenshotPath;
  } catch {
    return undefined;
  }
}

function resolveProductExploreBaseUrl(target: CodeDecayProductTarget, health: ProductHealthResult): string | undefined {
  const configured = target.readiness.effectiveBaseUrl ?? target.baseUrl;
  if (configured) {
    return normalizeExploreUrl(configured);
  }

  const healthOrigin = resolveMaybeUrl(health.url, health.url);
  return healthOrigin ? new URL(healthOrigin).origin : undefined;
}

function normalizeExploreUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  return url.toString().replace(/\/$/, "") || url.origin;
}

function resolveMaybeUrl(value: string, baseUrl: string): string | undefined {
  try {
    const url = new URL(value, baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return undefined;
    }
    url.hash = "";
    return url.toString().replace(/\/$/, "") || url.origin;
  } catch {
    return undefined;
  }
}

function parseHtmlAttributes(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};

  let index = 0;
  while (index < raw.length) {
    while (index < raw.length && (isHtmlWhitespace(raw[index] ?? "") || raw[index] === "/")) {
      index += 1;
    }

    const nameStart = index;
    while (index < raw.length && isHtmlAttributeNameChar(raw[index] ?? "")) {
      index += 1;
    }

    if (index === nameStart) {
      index += 1;
      continue;
    }

    const key = raw.slice(nameStart, index).toLowerCase();
    while (index < raw.length && isHtmlWhitespace(raw[index] ?? "")) {
      index += 1;
    }

    let value = "";
    if (raw[index] === "=") {
      index += 1;
      while (index < raw.length && isHtmlWhitespace(raw[index] ?? "")) {
        index += 1;
      }

      const quote = raw[index];
      if (quote === '"' || quote === "'") {
        index += 1;
        const valueStart = index;
        while (index < raw.length && raw[index] !== quote) {
          index += 1;
        }
        value = raw.slice(valueStart, index);
        if (raw[index] === quote) {
          index += 1;
        }
      } else {
        const valueStart = index;
        while (index < raw.length && !isHtmlWhitespace(raw[index] ?? "") && !['"', "'", ">", "/", "=", "`"].includes(raw[index] ?? "")) {
          index += 1;
        }
        value = raw.slice(valueStart, index);
      }
    }

    attrs[key] = decodeHtmlEntities(value);
  }

  return attrs;
}

function selectorFromAttrs(tag: string, attrs: Record<string, string>, index: number): string {
  if (attrs.id) {
    return `${tag}#${escapeSelectorValue(attrs.id)}`;
  }

  if (attrs.name) {
    return `${tag}[name="${escapeSelectorValue(attrs.name)}"]`;
  }

  if (attrs["aria-label"]) {
    return `${tag}[aria-label="${escapeSelectorValue(attrs["aria-label"])}"]`;
  }

  if (attrs.type) {
    return `${tag}[type="${escapeSelectorValue(attrs.type)}"]:nth-of-type(${index})`;
  }

  return `${tag}:nth-of-type(${index})`;
}

function accessibleName(attrs: Record<string, string>, text: string, fallback: string): string {
  const candidate = attrs["aria-label"] ?? attrs.title ?? attrs.name ?? attrs.value ?? attrs.placeholder ?? text;
  const cleaned = normalizeWhitespace(candidate);
  return cleaned || fallback;
}

function extractHtmlTitle(html: string): string {
  const title = extractHtmlElements(html, "title")[0];
  return title ? normalizeWhitespace(stripHtml(title.innerHtml)) : "";
}

function stripHtml(value: string): string {
  return normalizeWhitespace(decodeHtmlEntities(extractHtmlText(value)));
}

function normalizeWhitespace(value: string): string {
  let normalized = "";
  let pendingSpace = false;

  for (const char of value) {
    if (isHtmlWhitespace(char)) {
      pendingSpace = normalized.length > 0;
      continue;
    }

    if (pendingSpace) {
      normalized += " ";
      pendingSpace = false;
    }
    normalized += char;
  }

  return normalized;
}

function decodeHtmlEntities(value: string): string {
  const namedEntities: Record<string, string> = {
    nbsp: " ",
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'"
  };
  let decoded = "";
  let index = 0;

  while (index < value.length) {
    if (value[index] !== "&") {
      decoded += value[index] ?? "";
      index += 1;
      continue;
    }

    const semicolon = findEntitySemicolon(value, index + 1);
    if (semicolon === -1) {
      decoded += "&";
      index += 1;
      continue;
    }

    const entity = value.slice(index + 1, semicolon);
    const replacement = decodeHtmlEntity(entity, namedEntities);
    if (replacement === undefined) {
      decoded += value.slice(index, semicolon + 1);
    } else {
      decoded += replacement;
    }
    index = semicolon + 1;
  }

  return decoded;
}

interface ParsedHtmlElement {
  rawAttributes: string;
  innerHtml: string;
}

interface ParsedHtmlStartTag {
  tagName: string;
  rawAttributes: string;
  tagEnd: number;
  closing: boolean;
  selfClosing: boolean;
}

function extractHtmlElements(html: string, tagName: string): ParsedHtmlElement[] {
  const target = tagName.toLowerCase();
  const elements: ParsedHtmlElement[] = [];
  let index = 0;

  while (index < html.length) {
    const tagStart = html.indexOf("<", index);
    if (tagStart === -1) {
      break;
    }

    const tag = parseHtmlStartTagAt(html, tagStart);
    if (!tag) {
      index = tagStart + 1;
      continue;
    }

    if (!tag.closing && tag.tagName === target) {
      const closingStart = findClosingTagStart(html, target, tag.tagEnd + 1);
      if (closingStart === -1) {
        index = tag.tagEnd + 1;
        continue;
      }

      const closingTag = parseHtmlStartTagAt(html, closingStart);
      elements.push({
        rawAttributes: tag.rawAttributes,
        innerHtml: html.slice(tag.tagEnd + 1, closingStart)
      });
      index = closingTag ? closingTag.tagEnd + 1 : closingStart + 1;
      continue;
    }

    index = tag.tagEnd + 1;
  }

  return elements;
}

function extractHtmlStartTags(html: string, tagName: string): Array<Omit<ParsedHtmlElement, "innerHtml">> {
  const target = tagName.toLowerCase();
  const elements: Array<Omit<ParsedHtmlElement, "innerHtml">> = [];
  let index = 0;

  while (index < html.length) {
    const tagStart = html.indexOf("<", index);
    if (tagStart === -1) {
      break;
    }

    const tag = parseHtmlStartTagAt(html, tagStart);
    if (!tag) {
      index = tagStart + 1;
      continue;
    }

    if (!tag.closing && tag.tagName === target) {
      elements.push({ rawAttributes: tag.rawAttributes });
    }
    index = tag.tagEnd + 1;
  }

  return elements;
}

function extractHtmlText(html: string): string {
  let text = "";
  let index = 0;

  while (index < html.length) {
    const tagStart = html.indexOf("<", index);
    if (tagStart === -1) {
      text += html.slice(index);
      break;
    }

    text += html.slice(index, tagStart);
    const tag = parseHtmlStartTagAt(html, tagStart);
    if (!tag) {
      text += "<";
      index = tagStart + 1;
      continue;
    }

    if (!tag.closing && (tag.tagName === "script" || tag.tagName === "style")) {
      const closingStart = findClosingTagStart(html, tag.tagName, tag.tagEnd + 1);
      if (closingStart === -1) {
        break;
      }
      const closingTag = parseHtmlStartTagAt(html, closingStart);
      index = closingTag ? closingTag.tagEnd + 1 : closingStart + 1;
      continue;
    }

    text += " ";
    index = tag.tagEnd + 1;
  }

  return text;
}

function parseHtmlStartTagAt(html: string, tagStart: number): ParsedHtmlStartTag | undefined {
  if (html[tagStart] !== "<") {
    return undefined;
  }

  const tagEnd = findHtmlTagEnd(html, tagStart + 1);
  if (tagEnd === -1) {
    return undefined;
  }

  let index = tagStart + 1;
  while (index < tagEnd && isHtmlWhitespace(html[index] ?? "")) {
    index += 1;
  }

  const closing = html[index] === "/";
  if (closing) {
    index += 1;
    while (index < tagEnd && isHtmlWhitespace(html[index] ?? "")) {
      index += 1;
    }
  }

  const nameStart = index;
  while (index < tagEnd && isHtmlTagNameChar(html[index] ?? "")) {
    index += 1;
  }

  const tagName = html.slice(nameStart, index).toLowerCase();
  const rawAttributes = closing || !tagName ? "" : html.slice(index, tagEnd);
  let selfClosing = false;
  let cursor = tagEnd - 1;
  while (cursor > index && isHtmlWhitespace(html[cursor] ?? "")) {
    cursor -= 1;
  }
  if (html[cursor] === "/") {
    selfClosing = true;
  }

  return {
    tagName,
    rawAttributes,
    tagEnd,
    closing,
    selfClosing
  };
}

function findHtmlTagEnd(html: string, start: number): number {
  let quote: string | undefined;
  for (let index = start; index < html.length; index += 1) {
    const char = html[index] ?? "";
    if (quote) {
      if (char === quote) {
        quote = undefined;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === ">") {
      return index;
    }
  }

  return -1;
}

function findClosingTagStart(html: string, tagName: string, start: number): number {
  let index = start;
  let depth = 0;

  while (index < html.length) {
    const tagStart = html.indexOf("<", index);
    if (tagStart === -1) {
      return -1;
    }

    const tag = parseHtmlStartTagAt(html, tagStart);
    if (!tag) {
      index = tagStart + 1;
      continue;
    }

    if (tag.tagName === tagName) {
      if (tag.closing) {
        if (depth === 0) {
          return tagStart;
        }
        depth -= 1;
      } else if (!tag.selfClosing) {
        depth += 1;
      }
    }

    index = tag.tagEnd + 1;
  }

  return -1;
}

function findEntitySemicolon(value: string, start: number): number {
  const maxEntityLength = 32;
  const limit = Math.min(value.length, start + maxEntityLength);
  for (let index = start; index < limit; index += 1) {
    const char = value[index] ?? "";
    if (char === ";") {
      return index;
    }
    if (isHtmlWhitespace(char) || char === "&") {
      return -1;
    }
  }
  return -1;
}

function decodeHtmlEntity(entity: string, namedEntities: Record<string, string>): string | undefined {
  const normalized = entity.toLowerCase();
  if (normalized.startsWith("#x")) {
    return decodeNumericHtmlEntity(normalized.slice(2), 16);
  }
  if (normalized.startsWith("#")) {
    return decodeNumericHtmlEntity(normalized.slice(1), 10);
  }
  if (normalized === "#39") {
    return "'";
  }
  return namedEntities[normalized];
}

function decodeNumericHtmlEntity(value: string, radix: 10 | 16): string | undefined {
  if (!value || !isValidNumericEntity(value, radix)) {
    return undefined;
  }

  const codePoint = Number.parseInt(value, radix);
  if (!Number.isFinite(codePoint) || codePoint <= 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
    return undefined;
  }

  return String.fromCodePoint(codePoint);
}

function isValidNumericEntity(value: string, radix: 10 | 16): boolean {
  for (const char of value) {
    if (radix === 10) {
      if (char < "0" || char > "9") {
        return false;
      }
    } else if (!((char >= "0" && char <= "9") || (char >= "a" && char <= "f"))) {
      return false;
    }
  }
  return true;
}

function isHtmlWhitespace(char: string): boolean {
  return char === " " || char === "\n" || char === "\r" || char === "\t" || char === "\f" || char === "\v" || char === "\u00a0";
}

function isHtmlTagNameChar(char: string): boolean {
  return (
    (char >= "a" && char <= "z") ||
    (char >= "A" && char <= "Z") ||
    (char >= "0" && char <= "9") ||
    char === "-" ||
    char === ":"
  );
}

function isHtmlAttributeNameChar(char: string): boolean {
  return isHtmlTagNameChar(char) || char === "_" || char === ".";
}

function isDestructiveText(value: string): boolean {
  return /\b(delete|remove|destroy|drop|reset|purchase|payment|checkout|confirm|submit|disable|revoke|archive)\b/i.test(value);
}

function escapeSelectorValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function sanitizeArtifactSegment(value: string): string {
  return slugifyAllowedAscii(value, "root", 160, isArtifactSegmentChar);
}

function slugifyLowerAscii(value: string, fallback: string, maxLength: number): string {
  return slugifyAllowedAscii(value.toLowerCase(), fallback, maxLength, isLowerAsciiAlphaNumeric);
}

function slugifyAllowedAscii(
  value: string,
  fallback: string,
  maxLength: number,
  allowed: (char: string) => boolean
): string {
  let slug = "";
  let pendingSeparator = false;

  for (const char of value) {
    if (allowed(char)) {
      if (pendingSeparator && slug.length > 0 && slug.length < maxLength) {
        slug += "-";
      }
      pendingSeparator = false;
      if (slug.length < maxLength) {
        slug += char;
      }
      continue;
    }

    pendingSeparator = slug.length > 0;
  }

  return trimTrailingHyphens(slug) || fallback;
}

function trimTrailingHyphens(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === "-") {
    end -= 1;
  }
  return end === value.length ? value : value.slice(0, end);
}

function isLowerAsciiAlphaNumeric(char: string): boolean {
  return (char >= "a" && char <= "z") || (char >= "0" && char <= "9");
}

function isArtifactSegmentChar(char: string): boolean {
  return (
    (char >= "A" && char <= "Z") ||
    (char >= "a" && char <= "z") ||
    (char >= "0" && char <= "9") ||
    char === "." ||
    char === "_" ||
    char === "-"
  );
}

function generateProductTestsForTarget(
  rootDir: string,
  target: CodeDecayProductTarget,
  flowMapArtifactPath: string | undefined
): ProductGeneratedTestsResult {
  const startedAt = Date.now();
  const notes = [
    "Generated tests are written for review and are never committed or promoted automatically.",
    "Locator strategy prefers roles, labels, placeholders, and visible text before selector fallbacks."
  ];
  const sourceFlowMapPath = flowMapArtifactPath ?? defaultProductFlowMapPath(target.id);

  if (!existsSync(join(rootDir, sourceFlowMapPath))) {
    return {
      status: "blocked",
      tests: [],
      durationMs: elapsed(startedAt),
      error: `Flow map artifact not found at ${sourceFlowMapPath}. Run codedecay product --target ${target.id} --explore first.`,
      notes
    };
  }

  let flowMap: ProductFlowMap;
  try {
    flowMap = JSON.parse(readFileSync(join(rootDir, sourceFlowMapPath), "utf8")) as ProductFlowMap;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: "failed",
      tests: [],
      durationMs: elapsed(startedAt),
      error: `Could not read flow map ${sourceFlowMapPath}: ${message}`,
      notes
    };
  }

  const impactedPaths = findPrioritizedProductPaths(rootDir);
  const tests = createGeneratedProductTestCases(flowMap, impactedPaths);
  if (tests.length === 0) {
    return {
      status: "blocked",
      tests: [],
      durationMs: elapsed(startedAt),
      error: "Flow map did not contain enough safe route, link, input, or form evidence to generate tests.",
      notes
    };
  }

  const testSourcePath = join(".codedecay", "local", "generated-tests", sanitizeArtifactSegment(target.id), "product.generated.spec.ts");
  const manifestPath = join(".codedecay", "local", "generated-tests", sanitizeArtifactSegment(target.id), "manifest.json");
  const source = renderGeneratedProductTestSource(flowMap, tests, sourceFlowMapPath);
  const manifest: ProductGeneratedTestManifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    target: {
      id: target.id,
      baseUrl: flowMap.target.baseUrl
    },
    sourceFlowMapPath,
    testSourcePath,
    reviewRequired: true,
    promoteByCopyingTo: "tests/e2e/codedecay-product.spec.ts",
    tests
  };

  writeOutput(rootDir, testSourcePath, source);
  writeOutput(rootDir, manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  return {
    status: "passed",
    sourcePath: testSourcePath,
    manifestPath,
    tests,
    durationMs: elapsed(startedAt),
    notes
  };
}

function loadGeneratedProductTestsForTarget(rootDir: string, target: CodeDecayProductTarget): ProductGeneratedTestsResult {
  const startedAt = Date.now();
  const manifestPath = defaultProductGeneratedTestManifestPath(target.id);
  const notes = [
    "Loaded existing generated tests without regenerating source.",
    "Review edits are preserved when using --run-generated-tests without --generate-tests."
  ];

  if (!existsSync(join(rootDir, manifestPath))) {
    return {
      status: "blocked",
      tests: [],
      durationMs: elapsed(startedAt),
      error: `Generated test manifest not found at ${manifestPath}. Run codedecay product --target ${target.id} --generate-tests first.`,
      notes
    };
  }

  try {
    const manifest = JSON.parse(readFileSync(join(rootDir, manifestPath), "utf8")) as ProductGeneratedTestManifest;
    if (!manifest.testSourcePath || !existsSync(join(rootDir, manifest.testSourcePath))) {
      return {
        status: "blocked",
        manifestPath,
        tests: manifest.tests ?? [],
        durationMs: elapsed(startedAt),
        error: `Generated test source not found at ${manifest.testSourcePath}. Run codedecay product --target ${target.id} --generate-tests first.`,
        notes
      };
    }

    return {
      status: "passed",
      sourcePath: manifest.testSourcePath,
      manifestPath,
      tests: manifest.tests ?? [],
      durationMs: elapsed(startedAt),
      notes
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: "failed",
      manifestPath,
      tests: [],
      durationMs: elapsed(startedAt),
      error: `Could not read generated test manifest ${manifestPath}: ${message}`,
      notes
    };
  }
}

type ProductHttpMethod = "GET" | "HEAD" | "OPTIONS" | "POST" | "PUT" | "PATCH" | "DELETE";

interface OpenApiDocument {
  openapi?: string | undefined;
  swagger?: string | undefined;
  servers?: Array<{ url?: string | undefined }> | undefined;
  paths?: Record<string, OpenApiPathItem | undefined> | undefined;
}

interface OpenApiPathItem {
  parameters?: OpenApiParameter[] | undefined;
  get?: OpenApiOperation | undefined;
  head?: OpenApiOperation | undefined;
  options?: OpenApiOperation | undefined;
  post?: OpenApiOperation | undefined;
  put?: OpenApiOperation | undefined;
  patch?: OpenApiOperation | undefined;
  delete?: OpenApiOperation | undefined;
}

interface OpenApiOperation {
  operationId?: string | undefined;
  summary?: string | undefined;
  description?: string | undefined;
  parameters?: OpenApiParameter[] | undefined;
  requestBody?: OpenApiRequestBody | undefined;
  responses?: Record<string, unknown> | undefined;
}

interface OpenApiParameter {
  name?: string | undefined;
  in?: string | undefined;
  required?: boolean | undefined;
  schema?: OpenApiSchema | undefined;
  example?: unknown;
}

interface OpenApiRequestBody {
  content?: Record<string, { schema?: OpenApiSchema | undefined; example?: unknown } | undefined> | undefined;
  required?: boolean | undefined;
}

interface OpenApiSchema {
  type?: string | undefined;
  format?: string | undefined;
  enum?: unknown[] | undefined;
  default?: unknown;
  example?: unknown;
  properties?: Record<string, OpenApiSchema | undefined> | undefined;
  required?: string[] | undefined;
  items?: OpenApiSchema | undefined;
}

interface ResolvedOpenApiSchema {
  schemaPath: string;
  absolutePath: string;
  source: "configured" | "discovered";
}

const PRODUCT_API_METHODS: ProductHttpMethod[] = ["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"];
const SAFE_PRODUCT_API_METHODS = new Set<ProductHttpMethod>(["GET", "HEAD", "OPTIONS"]);

function generateProductApiTestsForTarget(
  rootDir: string,
  loadedConfig: LoadedCodeDecayConfig,
  target: CodeDecayProductTarget,
  health: ProductHealthResult | undefined,
  allowDestructiveActions: boolean
): ProductGeneratedTestsResult {
  const startedAt = Date.now();
  const notes = [
    "Generated API tests are written for review and are never committed or promoted automatically.",
    "OpenAPI request checks accept documented non-5xx statuses and fail unexpected server errors.",
    "Mutating API methods are generated as skipped review cases unless --allow-destructive-actions is passed."
  ];
  const schema = resolveProductOpenApiSchema(rootDir, loadedConfig);
  if (!schema.ok && target.apiEndpoints.length === 0) {
    return {
      status: "blocked",
      tests: [],
      durationMs: elapsed(startedAt),
      error: schema.error,
      notes
    };
  }

  let document: OpenApiDocument | undefined;
  if (schema.ok) {
    try {
      document = YAML.parse(readFileSync(schema.schema.absolutePath, "utf8")) as OpenApiDocument;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        status: "failed",
        tests: [],
        durationMs: elapsed(startedAt),
        error: `Could not read OpenAPI schema ${schema.schema.schemaPath}: ${message}`,
        notes
      };
    }

    if (!document || typeof document !== "object" || !document.paths || typeof document.paths !== "object") {
      return {
        status: "blocked",
        tests: [],
        durationMs: elapsed(startedAt),
        error: `OpenAPI schema ${schema.schema.schemaPath} does not contain a usable paths object.`,
        notes
      };
    }
  } else if (target.apiEndpoints.length > 0) {
    notes.push(schema.error);
  }

  const baseUrl = resolveProductApiBaseUrl(loadedConfig, target, health, document);
  if (!baseUrl) {
    return {
      status: "blocked",
      tests: [],
      durationMs: elapsed(startedAt),
      error: "API test generation requires productTesting.targets.<id>.baseUrl, previewUrlEnv, toolAdapters.schemathesis.baseUrl, healthCheck, or an absolute OpenAPI servers[0].url.",
      notes
    };
  }

  const impactedPaths = findPrioritizedProductPaths(rootDir);
  const tests = [
    ...(document ? createGeneratedProductApiTestCases(document, baseUrl, impactedPaths) : []),
    ...createConfiguredProductApiTestCases(target.apiEndpoints, baseUrl, impactedPaths)
  ];
  if (tests.length === 0) {
    return {
      status: "blocked",
      tests: [],
      durationMs: elapsed(startedAt),
      error: schema.ok
        ? `OpenAPI schema ${schema.schema.schemaPath} did not contain supported HTTP operations and no apiEndpoints are configured.`
        : "No supported configured apiEndpoints were found.",
      notes
    };
  }

  const testSourcePath = join(".codedecay", "local", "generated-api-tests", sanitizeArtifactSegment(target.id), "api.generated.spec.ts");
  const manifestPath = join(".codedecay", "local", "generated-api-tests", sanitizeArtifactSegment(target.id), "manifest.json");
  const sourceLabel = schema.ok ? schema.schema.schemaPath : `productTesting.targets.${target.id}.apiEndpoints`;
  const source = renderGeneratedProductApiTestSource(target.id, baseUrl, sourceLabel, tests, allowDestructiveActions);
  const manifest: ProductGeneratedTestManifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    target: {
      id: target.id,
      baseUrl
    },
    sourceOpenApiSchemaPath: schema.ok ? schema.schema.schemaPath : undefined,
    sourceApiEndpoints: target.apiEndpoints.length > 0 ? `productTesting.targets.${target.id}.apiEndpoints` : undefined,
    testSourcePath,
    reviewRequired: true,
    promoteByCopyingTo: "tests/api/codedecay-api.spec.ts",
    tests
  };

  writeOutput(rootDir, testSourcePath, source);
  writeOutput(rootDir, manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  return {
    status: "passed",
    sourcePath: testSourcePath,
    manifestPath,
    tests,
    durationMs: elapsed(startedAt),
    notes: [
      ...notes,
      ...(schema.ok ? [`OpenAPI schema: ${schema.schema.schemaPath} (${schema.schema.source}).`] : []),
      ...(target.apiEndpoints.length > 0 ? [`Configured API endpoints: ${target.apiEndpoints.length}.`] : [])
    ]
  };
}

function loadGeneratedProductApiTestsForTarget(rootDir: string, target: CodeDecayProductTarget): ProductGeneratedTestsResult {
  const startedAt = Date.now();
  const manifestPath = defaultProductGeneratedApiTestManifestPath(target.id);
  const notes = [
    "Loaded existing generated API tests without regenerating source.",
    "Review edits are preserved when using --run-generated-api-tests without --generate-api-tests."
  ];

  if (!existsSync(join(rootDir, manifestPath))) {
    return {
      status: "blocked",
      tests: [],
      durationMs: elapsed(startedAt),
      error: `Generated API test manifest not found at ${manifestPath}. Run codedecay product --target ${target.id} --generate-api-tests first.`,
      notes
    };
  }

  try {
    const manifest = JSON.parse(readFileSync(join(rootDir, manifestPath), "utf8")) as ProductGeneratedTestManifest;
    if (!manifest.testSourcePath || !existsSync(join(rootDir, manifest.testSourcePath))) {
      return {
        status: "blocked",
        manifestPath,
        tests: manifest.tests ?? [],
        durationMs: elapsed(startedAt),
        error: `Generated API test source not found at ${manifest.testSourcePath}. Run codedecay product --target ${target.id} --generate-api-tests first.`,
        notes
      };
    }

    return {
      status: "passed",
      sourcePath: manifest.testSourcePath,
      manifestPath,
      tests: manifest.tests ?? [],
      durationMs: elapsed(startedAt),
      notes
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: "failed",
      manifestPath,
      tests: [],
      durationMs: elapsed(startedAt),
      error: `Could not read generated API test manifest ${manifestPath}: ${message}`,
      notes
    };
  }
}

function resolveProductOpenApiSchema(
  rootDir: string,
  loadedConfig: LoadedCodeDecayConfig
): { ok: true; schema: ResolvedOpenApiSchema } | { ok: false; error: string } {
  const configured = loadedConfig.config.toolAdapters.schemathesis?.schema;
  if (configured) {
    if (/^https?:\/\//i.test(configured)) {
      return {
        ok: false,
        error: "HTTP(S) OpenAPI schema URLs are not fetched by codedecay product yet. Provide a local toolAdapters.schemathesis.schema file for local-first generation."
      };
    }

    const absolutePath = resolve(rootDir, configured);
    if (!existsSync(absolutePath)) {
      return {
        ok: false,
        error: `Configured OpenAPI schema not found at ${configured}.`
      };
    }

    return {
      ok: true,
      schema: {
        schemaPath: relativePathForArtifact(rootDir, absolutePath),
        absolutePath,
        source: "configured"
      }
    };
  }

  for (const candidate of [
    "openapi.yaml",
    "openapi.yml",
    "openapi.json",
    "docs/openapi.yaml",
    "docs/openapi.yml",
    "docs/openapi.json",
    "api/openapi.yaml",
    "api/openapi.yml",
    "api/openapi.json"
  ]) {
    const absolutePath = resolve(rootDir, candidate);
    if (existsSync(absolutePath)) {
      return {
        ok: true,
        schema: {
          schemaPath: candidate,
          absolutePath,
          source: "discovered"
        }
      };
    }
  }

  return {
    ok: false,
    error: "No OpenAPI schema found. Set toolAdapters.schemathesis.schema or add openapi.yaml, openapi.json, docs/openapi.yaml, or api/openapi.yaml."
  };
}

function resolveProductApiBaseUrl(
  loadedConfig: LoadedCodeDecayConfig,
  target: CodeDecayProductTarget,
  health: ProductHealthResult | undefined,
  document: OpenApiDocument | undefined
): string | undefined {
  const configured = target.readiness.effectiveBaseUrl ?? target.baseUrl ?? loadedConfig.config.toolAdapters.schemathesis?.baseUrl;
  if (configured) {
    return normalizeExploreUrl(configured);
  }

  if (health?.url) {
    const resolved = resolveMaybeUrl(health.url, health.url);
    if (resolved) {
      return new URL(resolved).origin;
    }
  }

  const serverUrl = document?.servers?.find((server) => typeof server.url === "string" && /^https?:\/\//i.test(server.url))?.url;
  return serverUrl ? normalizeExploreUrl(serverUrl) : undefined;
}

function createGeneratedProductApiTestCases(
  document: OpenApiDocument,
  baseUrl: string,
  impactedPaths: Set<string>
): ProductGeneratedTestCase[] {
  const tests: ProductGeneratedTestCase[] = [];
  const seen = new Set<string>();
  const paths = document.paths ?? {};

  for (const path of Object.keys(paths).sort((left, right) => left.localeCompare(right))) {
    const pathItem = paths[path];
    if (!pathItem || typeof pathItem !== "object") {
      continue;
    }

    for (const method of PRODUCT_API_METHODS) {
      const operation = pathItem[method.toLowerCase() as Lowercase<ProductHttpMethod>];
      if (!operation || typeof operation !== "object") {
        continue;
      }

      const operationPath = sampleOpenApiOperationPath(path, pathItem, operation);
      const expectedStatuses = openApiExpectedStatuses(operation);
      const destructive = !SAFE_PRODUCT_API_METHODS.has(method);
      const id = generatedTestId("api", method, path, operation.operationId ?? "");
      addGeneratedTestCase(tests, seen, {
        id,
        title: `${method} ${path} returns a documented status`,
        kind: "api-operation",
        pageUrl: new URL(operationPath, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString(),
        method,
        operationPath,
        operationId: operation.operationId,
        expectedStatuses,
        requestBody: destructive ? sampleOpenApiRequestBody(operation) : undefined,
        destructive,
        priority: priorityForPath(path, impactedPaths)
      });
    }
  }

  return tests.sort((left, right) => priorityRank(left.priority) - priorityRank(right.priority) || left.id.localeCompare(right.id));
}

function createConfiguredProductApiTestCases(
  endpoints: CodeDecayProductApiEndpoint[],
  baseUrl: string,
  impactedPaths: Set<string>
): ProductGeneratedTestCase[] {
  const tests: ProductGeneratedTestCase[] = [];
  const seen = new Set<string>();

  for (const endpoint of endpoints) {
    const destructive = !SAFE_PRODUCT_API_METHODS.has(endpoint.method);
    const id = endpoint.id ?? generatedTestId("api", "configured", endpoint.method, endpoint.path);
    addGeneratedTestCase(tests, seen, {
      id,
      title: `${endpoint.method} ${endpoint.path} returns a configured status`,
      kind: "api-operation",
      pageUrl: new URL(endpoint.path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString(),
      method: endpoint.method,
      operationPath: endpoint.path,
      expectedStatuses: endpoint.expectedStatuses,
      headers: endpoint.headers,
      requestBody: endpoint.body,
      destructive,
      priority: priorityForPath(endpoint.path, impactedPaths)
    });
  }

  return tests.sort((left, right) => priorityRank(left.priority) - priorityRank(right.priority) || left.id.localeCompare(right.id));
}

function renderGeneratedProductApiTestSource(
  targetId: string,
  baseUrl: string,
  sourceSchemaPath: string,
  tests: ProductGeneratedTestCase[],
  allowDestructiveActions: boolean
): string {
  const lines = [
    "import { test } from '@playwright/test';",
    "",
    "// @generated by CodeDecay. Review before promoting into your permanent test suite.",
    `// codedecay:source-openapi-schema=${sourceSchemaPath}`,
    `// codedecay:target=${targetId}`,
    "",
    `const CODEDECAY_API_BASE_URL = process.env.CODEDECAY_PRODUCT_BASE_URL ?? ${JSON.stringify(baseUrl)};`,
    "",
    "function apiUrl(path: string): string {",
    "  return new URL(path, CODEDECAY_API_BASE_URL.endsWith('/') ? CODEDECAY_API_BASE_URL : `${CODEDECAY_API_BASE_URL}/`).toString();",
    "}",
    "",
    "async function responseSnippet(response: { text: () => Promise<string> }): Promise<string> {",
    "  try {",
    "    return (await response.text()).replace(/\\s+/g, ' ').trim().slice(0, 500);",
    "  } catch {",
    "    return '';",
    "  }",
    "}",
    "",
    `test.describe(${JSON.stringify(`CodeDecay generated API regression tests (${targetId})`)}, () => {`
  ];

  for (const testCase of tests) {
    const declaration = testCase.destructive && !allowDestructiveActions ? "test.skip" : "test";
    lines.push(
      "",
      `  ${declaration}(${JSON.stringify(testCase.title)}, async ({ request }) => {`,
      `    test.info().annotations.push({ type: 'codedecay.testId', description: ${JSON.stringify(testCase.id)} });`
    );
    appendGeneratedApiTestBody(lines, testCase);
    lines.push("  });");
  }

  lines.push("});", "");
  return lines.join("\n");
}

function appendGeneratedApiTestBody(lines: string[], testCase: ProductGeneratedTestCase): void {
  const method = testCase.method ?? "GET";
  const operationPath = testCase.operationPath ?? new URL(testCase.pageUrl).pathname;
  const expectedStatuses = testCase.expectedStatuses ?? [];
  const requestBody = testCase.requestBody;
  const headers =
    requestBody === undefined
      ? { accept: "application/json", ...(testCase.headers ?? {}) }
      : { accept: "application/json", "content-type": "application/json", ...(testCase.headers ?? {}) };
  lines.push("    const response = await request.fetch(");
  lines.push(`      apiUrl(${JSON.stringify(operationPath)}),`);
  lines.push("      {");
  lines.push(`        method: ${JSON.stringify(method)},`);
  lines.push(`        headers: ${JSON.stringify(headers)}${requestBody === undefined ? "" : ","}`);
  if (requestBody !== undefined) {
    lines.push(`        data: ${JSON.stringify(requestBody, null, 10).replace(/\n/g, "\n        ")}`);
  }
  lines.push("      }");
  lines.push("    );");
  lines.push("    const status = response.status();");
  if (expectedStatuses.length > 0) {
    lines.push(`    const expectedStatuses = ${JSON.stringify(expectedStatuses)};`);
    lines.push("    if (!expectedStatuses.includes(status)) {");
    lines.push("      throw new Error(`Expected documented status ${expectedStatuses.join(', ')} but got ${status}. Body: ${await responseSnippet(response)}`);");
    lines.push("    }");
  } else {
    lines.push("    if (status >= 500) {");
    lines.push("      throw new Error(`Expected a non-5xx API response but got ${status}. Body: ${await responseSnippet(response)}`);");
    lines.push("    }");
  }
}

function sampleOpenApiRequestBody(operation: OpenApiOperation): unknown {
  const content = operation.requestBody?.content;
  const jsonMedia = content?.["application/json"] ?? content?.["application/problem+json"] ?? Object.values(content ?? {}).find(Boolean);
  if (!jsonMedia) {
    return {
      codedecay: "review-before-running"
    };
  }

  if (jsonMedia.example !== undefined) {
    return jsonMedia.example;
  }

  return sampleOpenApiSchemaValue(jsonMedia.schema);
}

function sampleOpenApiSchemaValue(schema: OpenApiSchema | undefined): unknown {
  if (!schema) {
    return {
      codedecay: "review-before-running"
    };
  }

  if (schema.example !== undefined) {
    return schema.example;
  }

  if (schema.default !== undefined) {
    return schema.default;
  }

  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum[0];
  }

  if (schema.type === "array") {
    return [sampleOpenApiSchemaValue(schema.items)];
  }

  if (schema.type === "integer" || schema.type === "number") {
    return 1;
  }

  if (schema.type === "boolean") {
    return true;
  }

  if (schema.type === "string") {
    if (schema.format === "email") {
      return "codedecay@example.com";
    }

    if (schema.format === "uri" || schema.format === "url") {
      return "https://example.com";
    }

    if (schema.format === "uuid") {
      return "00000000-0000-4000-8000-000000000001";
    }

    return "codedecay";
  }

  const properties = schema.properties ?? {};
  const required = new Set(schema.required ?? Object.keys(properties));
  const value: Record<string, unknown> = {};
  for (const [name, property] of Object.entries(properties)) {
    if (!required.has(name)) {
      continue;
    }

    value[name] = sampleOpenApiSchemaValue(property);
  }

  return Object.keys(value).length > 0 ? value : { codedecay: "review-before-running" };
}

function sampleOpenApiOperationPath(path: string, pathItem: OpenApiPathItem, operation: OpenApiOperation): string {
  const parameters = [...(pathItem.parameters ?? []), ...(operation.parameters ?? [])];
  const replacedPath = path.replace(/\{([^}]+)\}/g, (_match, name: string) => encodeURIComponent(String(sampleOpenApiParameterValue(name, parameters))));
  const query = new URLSearchParams();

  for (const parameter of parameters) {
    if (parameter.in !== "query" || !parameter.name || parameter.required !== true) {
      continue;
    }

    query.set(parameter.name, String(sampleOpenApiParameterValue(parameter.name, parameters)));
  }

  const queryString = query.toString();
  return queryString ? `${replacedPath}?${queryString}` : replacedPath;
}

function sampleOpenApiParameterValue(name: string, parameters: OpenApiParameter[]): string | number | boolean {
  const parameter = parameters.find((candidate) => candidate.name === name);
  const schema = parameter?.schema;
  const lowerName = name.toLowerCase();

  if (parameter?.example !== undefined) {
    return primitiveSampleValue(parameter.example);
  }

  if (schema?.example !== undefined) {
    return primitiveSampleValue(schema.example);
  }

  if (schema?.default !== undefined) {
    return primitiveSampleValue(schema.default);
  }

  if (Array.isArray(schema?.enum) && schema.enum.length > 0) {
    return primitiveSampleValue(schema.enum[0]);
  }

  if (schema?.type === "integer" || schema?.type === "number" || /\b(id|count|page|limit|offset)\b/i.test(lowerName)) {
    return 1;
  }

  if (schema?.type === "boolean") {
    return true;
  }

  if (schema?.format === "email" || lowerName.includes("email")) {
    return "codedecay@example.com";
  }

  if (schema?.format === "uuid" || lowerName.includes("uuid")) {
    return "00000000-0000-4000-8000-000000000001";
  }

  return "codedecay";
}

function primitiveSampleValue(value: unknown): string | number | boolean {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (value === null || value === undefined) {
    return "codedecay";
  }

  return JSON.stringify(value);
}

function openApiExpectedStatuses(operation: OpenApiOperation): number[] {
  return Object.keys(operation.responses ?? {})
    .filter((status) => /^\d{3}$/.test(status))
    .map((status) => Number(status))
    .filter((status) => status >= 100 && status < 500)
    .sort((left, right) => left - right);
}

async function runGeneratedProductTests(
  rootDir: string,
  loadedConfig: LoadedCodeDecayConfig,
  target: CodeDecayProductTarget,
  generatedTests: ProductGeneratedTestsResult,
  rerunFlag: "--run-generated-tests" | "--run-generated-api-tests",
  testId: string | undefined
): Promise<ProductGeneratedTestRunResult> {
  const startedAt = Date.now();
  const notes = [
    "Generated tests run only from the local generated-tests artifact path.",
    "Use the rerun command after reviewing or editing the generated test source."
  ];

  if (!generatedTests.sourcePath || generatedTests.tests.length === 0) {
    return {
      status: "blocked",
      durationMs: elapsed(startedAt),
      passed: 0,
      failed: 0,
      skipped: 0,
      failures: [],
      stdout: "",
      stderr: "",
      error: "Generated test source is missing; run --generate-tests first.",
      notes
    };
  }

  if (!loadedConfig.config.safety.allowCommands) {
    return {
      status: "blocked",
      durationMs: elapsed(startedAt),
      passed: 0,
      failed: 0,
      skipped: 0,
      failures: [],
      stdout: "",
      stderr: "Generated test execution is disabled by config safety.allowCommands.",
      error: "Generated test execution requires safety.allowCommands to be true.",
      notes
    };
  }

  const selectedTest = testId ? generatedTests.tests.find((test) => test.id === testId) : undefined;
  if (testId && !selectedTest) {
    return {
      status: "blocked",
      durationMs: elapsed(startedAt),
      passed: 0,
      failed: 0,
      skipped: 0,
      failures: [],
      stdout: "",
      stderr: `Generated test id ${testId} was not found in ${generatedTests.manifestPath ?? "the generated test manifest"}.`,
      error: `Generated test id ${testId} was not found.`,
      notes
    };
  }

  const command = resolveProjectPlaywrightTestCommand(rootDir, generatedTests.sourcePath, selectedTest?.title);
  if (!command.ok) {
    return {
      status: "blocked",
      durationMs: elapsed(startedAt),
      passed: 0,
      failed: 0,
      skipped: 0,
      failures: [],
      stdout: "",
      stderr: command.error,
      error: command.error,
      notes: [...notes, "Install Playwright in the target project; CodeDecay does not install packages or browsers."]
    };
  }

  const execution = await runConfiguredCommand({
    command: command.command,
    cwd: rootDir,
    timeoutMs: target.timeoutMs,
    env: {
      CODEDECAY_PRODUCT_BASE_URL: generatedProductBaseUrl(rootDir, generatedTests)
    },
    safety: {
      allowCommands: loadedConfig.config.safety.allowCommands
    }
  });
  const testSource = readFileSync(join(rootDir, generatedTests.sourcePath), "utf8");
  const parsed = parsePlaywrightTestRun({
    stdout: execution.stdout,
    generatedTests,
    testSource,
    target,
    rootDir,
    rerunFlag
  });
  const failed = parsed.failed > 0 || execution.status !== "passed";
  const fallbackFailures =
    failed && parsed.failures.length === 0
      ? [
          createGeneratedTestFailure({
            title: "Generated Playwright command",
            failingStep: "Run generated Playwright regression tests.",
            error: execution.error ?? (execution.stderr.trim() || `Playwright command exited with status ${execution.status}.`),
            generatedTests,
            testSource,
            target,
            rootDir,
            rerunFlag
          })
        ]
      : parsed.failures;
  const failures = failed
    ? await attachGeneratedFailureRetryEvidence({
        failures: fallbackFailures,
        generatedTests,
        testSource,
        target,
        rootDir,
        loadedConfig,
        rerunFlag
      })
    : fallbackFailures;

  return {
    status: failed ? "failed" : "passed",
    command: command.command,
    durationMs: elapsed(startedAt),
    passed: parsed.passed,
    failed: failed ? Math.max(parsed.failed, failures.length) : parsed.failed,
    skipped: parsed.skipped,
    failures,
    stdout: execution.stdout,
    stderr: execution.stderr,
    exitCode: execution.exitCode,
    error: failed ? execution.error : undefined,
    notes
  };
}

async function attachGeneratedFailureRetryEvidence(input: {
  failures: ProductGeneratedTestFailure[];
  generatedTests: ProductGeneratedTestsResult;
  testSource: string;
  target: CodeDecayProductTarget;
  rootDir: string;
  loadedConfig: LoadedCodeDecayConfig;
  rerunFlag: "--run-generated-tests" | "--run-generated-api-tests";
}): Promise<ProductGeneratedTestFailure[]> {
  const retryLimit = 3;
  const annotated: ProductGeneratedTestFailure[] = [];
  let retried = 0;

  for (const failure of input.failures) {
    const testCase = generatedTestCaseForFailure(input.generatedTests, failure);
    if (!testCase) {
      annotated.push({
        ...failure,
        retryEvidence: {
          attempts: 1,
          passed: 0,
          failed: 1,
          conclusion: "not-rerun",
          error: "No generated test id or title matched this failure."
        }
      });
      continue;
    }

    if (retried >= retryLimit) {
      annotated.push({
        ...failure,
        retryEvidence: {
          attempts: 1,
          passed: 0,
          failed: 1,
          conclusion: "not-rerun",
          error: `Retry evidence cap reached after ${retryLimit} failed generated checks.`
        }
      });
      continue;
    }

    const retryCommand = resolveProjectPlaywrightTestCommand(input.rootDir, input.generatedTests.sourcePath ?? "", testCase.title);
    if (!retryCommand.ok) {
      annotated.push({
        ...failure,
        retryEvidence: {
          attempts: 1,
          passed: 0,
          failed: 1,
          conclusion: "not-rerun",
          error: retryCommand.error
        }
      });
      continue;
    }

    retried += 1;
    const execution = await runConfiguredCommand({
      command: retryCommand.command,
      cwd: input.rootDir,
      timeoutMs: input.target.timeoutMs,
      env: {
        CODEDECAY_PRODUCT_BASE_URL: generatedProductBaseUrl(input.rootDir, input.generatedTests)
      },
      safety: {
        allowCommands: input.loadedConfig.config.safety.allowCommands
      }
    });
    const parsed = parsePlaywrightTestRun({
      stdout: execution.stdout,
      generatedTests: input.generatedTests,
      testSource: input.testSource,
      target: input.target,
      rootDir: input.rootDir,
      rerunFlag: input.rerunFlag
    });
    const rerunPassed = execution.status === "passed" && parsed.failed === 0;
    const rerunError =
      execution.error ??
      parsed.failures[0]?.error ??
      (execution.stderr.trim() || (rerunPassed ? undefined : `Targeted generated test rerun exited with status ${execution.status}.`));

    annotated.push({
      ...failure,
      retryEvidence: {
        attempts: 2,
        passed: rerunPassed ? 1 : 0,
        failed: rerunPassed ? 1 : 2,
        command: retryCommand.command,
        conclusion: rerunPassed ? "passed-on-rerun" : "failed-on-rerun",
        error: rerunError
      }
    });
  }

  return annotated;
}

function generatedTestCaseForFailure(
  generatedTests: ProductGeneratedTestsResult,
  failure: ProductGeneratedTestFailure
): ProductGeneratedTestCase | undefined {
  if (failure.testId) {
    return generatedTests.tests.find((test) => test.id === failure.testId);
  }

  return generatedTests.tests.find((test) => test.title === failure.title || failure.title.includes(test.title));
}

function createGeneratedProductTestCases(flowMap: ProductFlowMap, impactedPaths: Set<string>): ProductGeneratedTestCase[] {
  const tests: ProductGeneratedTestCase[] = [];
  const pages = [...flowMap.pages].sort((left, right) => left.depth - right.depth || left.url.localeCompare(right.url));
  const seen = new Set<string>();

  for (const page of pages) {
    addGeneratedTestCase(tests, seen, {
      id: generatedTestId("route", page.path),
      title: `loads ${page.path || "/"}`,
      kind: "route-load",
      pageUrl: page.url,
      priority: priorityForPath(page.path, impactedPaths)
    });
  }

  for (const page of pages) {
    const links = page.links
      .filter((link) => link.sameOrigin && link.discovered && link.text.trim().length > 0)
      .sort((left, right) => left.href.localeCompare(right.href));

    for (const link of links) {
      addGeneratedTestCase(tests, seen, {
        id: generatedTestId("link", page.path, new URL(link.href).pathname, link.text),
        title: `navigates from ${page.path || "/"} to ${new URL(link.href).pathname || "/"} via ${link.text}`,
        kind: "link-navigation",
        pageUrl: page.url,
        selector: link.selector,
        targetUrl: link.href,
        priority: priorityForPath(new URL(link.href).pathname, impactedPaths)
      });
    }
  }

  for (const page of pages) {
    const inputs = page.interactiveElements
      .filter((element) => element.kind === "input" && !element.blocked && safeInputType(element.inputType))
      .sort((left, right) => left.selector.localeCompare(right.selector));

    for (const input of inputs) {
      addGeneratedTestCase(tests, seen, {
        id: generatedTestId("input", page.path, input.name, input.selector),
        title: `fills ${input.name} on ${page.path || "/"}`,
        kind: "input-state",
        pageUrl: page.url,
        selector: input.selector,
        priority: priorityForPath(page.path, impactedPaths)
      });
    }
  }

  for (const page of pages) {
    const forms = page.interactiveElements
      .filter((element) => element.kind === "form" && !element.blocked)
      .sort((left, right) => left.selector.localeCompare(right.selector));

    for (const form of forms) {
      addGeneratedTestCase(tests, seen, {
        id: generatedTestId("form", page.path, form.name, form.selector),
        title: `shows safe form ${form.name} on ${page.path || "/"}`,
        kind: "form-visibility",
        pageUrl: page.url,
        selector: form.selector,
        priority: priorityForPath(page.path, impactedPaths)
      });
    }
  }

  return tests.sort((left, right) => priorityRank(left.priority) - priorityRank(right.priority) || left.id.localeCompare(right.id));
}

function addGeneratedTestCase(tests: ProductGeneratedTestCase[], seen: Set<string>, test: ProductGeneratedTestCase): void {
  if (seen.has(test.id)) {
    return;
  }

  seen.add(test.id);
  tests.push(test);
}

function renderGeneratedProductTestSource(flowMap: ProductFlowMap, tests: ProductGeneratedTestCase[], sourceFlowMapPath: string): string {
  const lines = [
    "import { test, expect } from '@playwright/test';",
    "",
    "// @generated by CodeDecay. Review before promoting into your permanent test suite.",
    `// codedecay:source-flow-map=${sourceFlowMapPath}`,
    `// codedecay:target=${flowMap.target.id}`,
    "",
    `const CODEDECAY_BASE_URL = process.env.CODEDECAY_PRODUCT_BASE_URL ?? ${JSON.stringify(flowMap.target.baseUrl)};`,
    "",
    "function productUrl(path: string): string {",
    "  return new URL(path, CODEDECAY_BASE_URL.endsWith('/') ? CODEDECAY_BASE_URL : `${CODEDECAY_BASE_URL}/`).toString();",
    "}",
    "",
    `test.describe(${JSON.stringify(`CodeDecay generated product regression tests (${flowMap.target.id})`)}, () => {`
  ];

  for (const testCase of tests) {
    lines.push("", `  test(${JSON.stringify(testCase.title)}, async ({ page }) => {`, `    test.info().annotations.push({ type: 'codedecay.testId', description: ${JSON.stringify(testCase.id)} });`);
    appendGeneratedTestBody(lines, testCase, flowMap);
    lines.push("  });");
  }

  lines.push("});", "");
  return lines.join("\n");
}

function appendGeneratedTestBody(lines: string[], testCase: ProductGeneratedTestCase, flowMap: ProductFlowMap): void {
  const page = findFlowPageForTest(flowMap, testCase.pageUrl);
  const pagePath = new URL(testCase.pageUrl).pathname || "/";

  if (testCase.kind === "route-load") {
    lines.push(`    await page.goto(productUrl(${JSON.stringify(pagePath)}));`);
    lines.push("    await expect(page.locator('body')).toBeVisible();");
    if (page?.title) {
      lines.push(`    await expect(page).toHaveTitle(${regexLiteralForText(page.title)});`);
    }
    return;
  }

  if (testCase.kind === "link-navigation") {
    const link = page?.links.find((candidate) => candidate.href === testCase.targetUrl || candidate.selector === testCase.selector);
    lines.push(`    await page.goto(productUrl(${JSON.stringify(pagePath)}));`);
    lines.push(`    await ${locatorForInteractiveElement("link", link?.text ?? testCase.title, testCase.selector)}.click();`);
    lines.push(`    await expect(page).toHaveURL(productUrl(${JSON.stringify(new URL(testCase.targetUrl ?? testCase.pageUrl).pathname || "/")}));`);
    return;
  }

  if (testCase.kind === "input-state") {
    const element = page?.interactiveElements.find((candidate) => candidate.selector === testCase.selector);
    const sampleValue = sampleValueForInput(element?.inputType, element?.name);
    lines.push(`    await page.goto(productUrl(${JSON.stringify(pagePath)}));`);
    lines.push(`    const field = ${locatorForInteractiveElement("input", element?.name ?? testCase.title, testCase.selector)};`);
    lines.push(`    await field.fill(${JSON.stringify(sampleValue)});`);
    lines.push(`    await expect(field).toHaveValue(${JSON.stringify(sampleValue)});`);
    return;
  }

  const element = page?.interactiveElements.find((candidate) => candidate.selector === testCase.selector);
  lines.push(`    await page.goto(productUrl(${JSON.stringify(pagePath)}));`);
  lines.push(`    await expect(${locatorForInteractiveElement("form", element?.name ?? testCase.title, testCase.selector)}).toBeVisible();`);
}

function locatorForInteractiveElement(kind: "link" | "input" | "form", name: string, selector: string | undefined): string {
  const safeName = normalizeWhitespace(name);
  const fallback = selector ? `.or(page.locator(${JSON.stringify(selector)}))` : "";
  if (kind === "link") {
    return `page.getByRole('link', { name: ${regexLiteralForText(safeName)} }).first()${fallback}`;
  }

  if (kind === "input") {
    return `page.getByLabel(${regexLiteralForText(safeName)}).or(page.getByPlaceholder(${regexLiteralForText(safeName)}))${fallback}.first()`;
  }

  return selector ? `page.locator(${JSON.stringify(selector)}).first()` : `page.getByRole('form', { name: ${regexLiteralForText(safeName)} }).first()`;
}

function findFlowPageForTest(flowMap: ProductFlowMap, url: string): ProductFlowPage | undefined {
  return flowMap.pages.find((page) => page.url === url);
}

function resolveProjectPlaywrightTestCommand(
  rootDir: string,
  sourcePath: string,
  grepTitle?: string | undefined
): { ok: true; command: string } | { ok: false; error: string } {
  const absoluteSourcePath = join(rootDir, sourcePath);
  const grepArgs = grepTitle ? ` --grep ${shellQuote(`^${escapeRegExp(grepTitle)}$`)}` : "";
  const candidates = [
    join(rootDir, "node_modules", "playwright", "cli.js"),
    join(rootDir, "node_modules", "@playwright", "test", "cli.js")
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return {
        ok: true,
        command: `${shellQuote(process.execPath)} ${shellQuote(candidate)} test ${shellQuote(absoluteSourcePath)} --reporter=json${grepArgs}`
      };
    }
  }

  const bin = join(rootDir, "node_modules", ".bin", process.platform === "win32" ? "playwright.cmd" : "playwright");
  if (existsSync(bin)) {
    return {
      ok: true,
      command: `${shellQuote(bin)} test ${shellQuote(absoluteSourcePath)} --reporter=json${grepArgs}`
    };
  }

  return {
    ok: false,
    error: "Could not find a project-local Playwright CLI in node_modules/playwright, node_modules/@playwright/test, or node_modules/.bin."
  };
}

function parsePlaywrightTestRun(input: {
  stdout: string;
  generatedTests: ProductGeneratedTestsResult;
  testSource: string;
  target: CodeDecayProductTarget;
  rootDir: string;
  rerunFlag: "--run-generated-tests" | "--run-generated-api-tests";
}): { passed: number; failed: number; skipped: number; failures: ProductGeneratedTestFailure[] } {
  const parsed = parseJsonFromOutput(input.stdout);
  if (!parsed || typeof parsed !== "object") {
    return {
      passed: 0,
      failed: 0,
      skipped: 0,
      failures: []
    };
  }

  const specs = collectPlaywrightSpecs(parsed);
  if (specs.length === 0) {
    return {
      passed: input.generatedTests.tests.length,
      failed: 0,
      skipped: 0,
      failures: []
    };
  }

  let passed = 0;
  let failed = 0;
  let skipped = 0;
  const failures: ProductGeneratedTestFailure[] = [];

  for (const spec of specs) {
    const title = typeof spec.title === "string" ? spec.title : "Generated Playwright test";
    const matchingTest = input.generatedTests.tests.find((test) => test.title === title || title.includes(test.title));
    const testEntries = Array.isArray(spec.tests) ? spec.tests : [];
    const resultEntries = testEntries.flatMap((testEntry) => (Array.isArray(testEntry.results) ? testEntry.results : []));
    const statuses = resultEntries.map((result) => String(result.status ?? "")).filter(Boolean);
    const hasFailure = statuses.some((status) => ["failed", "timedOut", "interrupted"].includes(status)) || spec.ok === false;
    const hasSkip = statuses.some((status) => status === "skipped") || testEntries.some((testEntry) => testEntry.status === "skipped");

    if (hasFailure) {
      failed += 1;
      const firstFailedResult = resultEntries.find((result) => ["failed", "timedOut", "interrupted"].includes(String(result.status ?? "")));
      failures.push(
        createGeneratedTestFailure({
          testId: matchingTest?.id,
          title,
          failingStep: `Run generated test "${title}".`,
          error: extractPlaywrightError(firstFailedResult) ?? extractPlaywrightError(spec) ?? "Generated Playwright test failed.",
          generatedTests: input.generatedTests,
          testSource: input.testSource,
          target: input.target,
          rootDir: input.rootDir,
          rerunFlag: input.rerunFlag
        })
      );
    } else if (hasSkip) {
      skipped += 1;
    } else {
      passed += 1;
    }
  }

  return {
    passed,
    failed,
    skipped,
    failures
  };
}

function collectPlaywrightSpecs(value: unknown): Array<Record<string, any>> {
  const specs: Array<Record<string, any>> = [];
  visit(value);
  return specs;

  function visit(node: unknown): void {
    if (!node || typeof node !== "object") {
      return;
    }

    const record = node as Record<string, any>;
    if (Array.isArray(record.tests) && typeof record.title === "string") {
      specs.push(record);
    }

    for (const key of ["suites", "specs", "children"]) {
      if (Array.isArray(record[key])) {
        for (const child of record[key]) {
          visit(child);
        }
      }
    }
  }
}

function createGeneratedTestFailure(input: {
  testId?: string | undefined;
  title: string;
  failingStep: string;
  error: string;
  generatedTests: ProductGeneratedTestsResult;
  testSource: string;
  target: CodeDecayProductTarget;
  rootDir: string;
  rerunFlag: "--run-generated-tests" | "--run-generated-api-tests";
}): ProductGeneratedTestFailure {
  const testCase =
    input.testId !== undefined
      ? input.generatedTests.tests.find((candidate) => candidate.id === input.testId)
      : input.generatedTests.tests.find((candidate) => candidate.title === input.title || input.title.includes(candidate.title));
  const impactedFiles = findImpactedProductFiles(input.rootDir);
  const testIdArg = testCase ? ` --test-id ${shellQuote(testCase.id)}` : "";
  return {
    testId: input.testId,
    title: input.title,
    failingStep: input.failingStep,
    error: input.error,
    request:
      testCase?.method && testCase.operationPath
        ? {
            method: testCase.method,
            url: testCase.pageUrl
          }
        : undefined,
    expected: expectedGeneratedTestBehavior(testCase),
    actual: input.error,
    impactedFiles: impactedFiles.length > 0 ? impactedFiles : undefined,
    testSourcePath: input.generatedTests.sourcePath ?? "",
    testSource: input.testSource,
    rerunCommand: `npx codedecay product --target ${input.target.id} ${input.rerunFlag}${testIdArg} --format markdown`
  };
}

function parseJsonFromOutput(output: string): unknown {
  const trimmed = output.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      return undefined;
    }

    try {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    } catch {
      return undefined;
    }
  }
}

function extractPlaywrightError(value: any): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  if (typeof value.error?.message === "string") {
    return value.error.message;
  }

  if (Array.isArray(value.errors) && typeof value.errors[0]?.message === "string") {
    return value.errors[0].message;
  }

  if (typeof value.message === "string") {
    return value.message;
  }

  return undefined;
}

function generatedProductBaseUrl(rootDir: string, generatedTests: ProductGeneratedTestsResult): string | undefined {
  if (!generatedTests.manifestPath || !existsSync(join(rootDir, generatedTests.manifestPath))) {
    return undefined;
  }

  try {
    const manifest = JSON.parse(readFileSync(join(rootDir, generatedTests.manifestPath), "utf8")) as ProductGeneratedTestManifest;
    return manifest.target.baseUrl;
  } catch {
    return undefined;
  }
}

function defaultProductFlowMapPath(targetId: string): string {
  return join(".codedecay", "local", "product-flow-maps", sanitizeArtifactSegment(targetId), "flow-map.json");
}

function defaultProductGeneratedTestManifestPath(targetId: string): string {
  return join(".codedecay", "local", "generated-tests", sanitizeArtifactSegment(targetId), "manifest.json");
}

function defaultProductGeneratedApiTestManifestPath(targetId: string): string {
  return join(".codedecay", "local", "generated-api-tests", sanitizeArtifactSegment(targetId), "manifest.json");
}

function findImpactedProductPaths(rootDir: string): Set<string> {
  try {
    const repoRoot = getRepoRoot(rootDir);
    const analysis = createAnalysisContextForCli(repoRoot, { format: "markdown" });
    return new Set((analysis.report.impactedRoutes ?? []).map((route) => route.route));
  } catch {
    return new Set();
  }
}

function findPrioritizedProductPaths(rootDir: string): Set<string> {
  try {
    const repoRoot = getRepoRoot(rootDir);
    const analysis = createAnalysisContextForCli(repoRoot, { format: "markdown" });
    const paths = new Set((analysis.report.impactedRoutes ?? []).map((route) => normalizeProductPriorityPath(route.route)));
    const changedFiles = analysis.report.changedFiles;
    const impactedAreaKinds = new Set(analysis.report.impactedAreas.map((area) => area.kind));
    const memory = loadCodeDecayMemory(repoRoot).memory;

    for (const regression of memory.regressions) {
      for (const path of regression.productPaths ?? []) {
        paths.add(normalizeProductPriorityPath(path));
      }
    }

    for (const entry of productMemoryEntries(memory)) {
      if (!memoryEntryMatchesProductScope(entry, changedFiles, impactedAreaKinds)) {
        continue;
      }

      for (const path of entry.productPaths ?? []) {
        paths.add(normalizeProductPriorityPath(path));
      }
    }

    return paths;
  } catch {
    return findImpactedProductPaths(rootDir);
  }
}

function productMemoryEntries(memory: CodeDecayMemory): MemoryMatcher[] {
  return [...memory.flows, ...memory.invariants, ...memory.architecture, ...memory.commands];
}

function memoryEntryMatchesProductScope(
  entry: MemoryMatcher,
  changedFiles: CodeDecayReport["changedFiles"],
  impactedAreaKinds: Set<CodeDecayReport["impactedAreas"][number]["kind"]>
): boolean {
  if (entry.areas?.some((area) => impactedAreaKinds.has(area))) {
    return true;
  }

  return changedFiles.some((file) => entry.files?.some((pattern) => matchesProductMemoryPathPattern(file.path, pattern)));
}

function matchesProductMemoryPathPattern(path: string, pattern: string): boolean {
  if (pattern === path) {
    return true;
  }

  if (!pattern.includes("*")) {
    return path.includes(pattern);
  }

  const regex = new RegExp(`^${pattern.split("*").map(escapeRegExp).join(".*")}$`);
  return regex.test(path);
}

function findImpactedProductFiles(rootDir: string): string[] {
  try {
    const repoRoot = getRepoRoot(rootDir);
    return getChangedFilesForCli(repoRoot, { format: "markdown" }).map((change) => change.path).sort((left, right) => left.localeCompare(right));
  } catch {
    return [];
  }
}

function expectedGeneratedTestBehavior(testCase: ProductGeneratedTestCase | undefined): string | undefined {
  if (!testCase) {
    return undefined;
  }

  if (testCase.kind === "api-operation") {
    const statusText =
      testCase.expectedStatuses && testCase.expectedStatuses.length > 0
        ? `one of the documented statuses ${testCase.expectedStatuses.join(", ")}`
        : "a non-5xx response";
    return `${testCase.method ?? "GET"} ${testCase.operationPath ?? testCase.pageUrl} should return ${statusText}.`;
  }

  return `${testCase.title} should pass in the generated product regression suite.`;
}

function relativePathForArtifact(rootDir: string, absolutePath: string): string {
  const artifactPath = relative(rootDir, absolutePath);
  return artifactPath && !artifactPath.startsWith("..") ? artifactPath : absolutePath;
}

function priorityForPath(path: string, impactedPaths: Set<string>): ProductGeneratedTestCase["priority"] {
  const normalized = normalizeProductPriorityPath(path);
  return [...impactedPaths].some((candidate) => productPriorityPathMatches(normalized, candidate)) ? "high" : "medium";
}

function normalizeProductPriorityPath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) {
    return "/";
  }

  try {
    const url = new URL(trimmed);
    return normalizeProductPriorityPath(url.pathname);
  } catch {
    const pathOnly = trimmed.split(/[?#]/, 1)[0] ?? trimmed;
    if (pathOnly === "/") {
      return "/";
    }

    return pathOnly.replace(/\/+$/, "") || "/";
  }
}

function productPriorityPathMatches(path: string, candidate: string): boolean {
  if (path === candidate) {
    return true;
  }

  return productPriorityPathPattern(path).test(candidate) || productPriorityPathPattern(candidate).test(path);
}

function productPriorityPathPattern(path: string): RegExp {
  const segments = normalizeProductPriorityPath(path)
    .split("/")
    .map((segment) => {
      if (/^[:{][^/{}:]+}?$/.test(segment)) {
        return "[^/]+";
      }

      return escapeRegExp(segment);
    });

  return new RegExp(`^${segments.join("/")}$`);
}

function priorityRank(priority: ProductGeneratedTestCase["priority"]): number {
  if (priority === "high") {
    return 0;
  }

  if (priority === "medium") {
    return 1;
  }

  return 2;
}

function safeInputType(inputType: string | undefined): boolean {
  return ["text", "email", "search", "tel", "url", "password", undefined].includes(inputType);
}

function sampleValueForInput(inputType: string | undefined, name: string | undefined): string {
  const normalized = `${inputType ?? ""} ${name ?? ""}`.toLowerCase();
  if (normalized.includes("email")) {
    return "codedecay@example.com";
  }

  if (normalized.includes("phone") || normalized.includes("tel")) {
    return "5550100";
  }

  if (normalized.includes("url")) {
    return "https://example.com";
  }

  if (normalized.includes("password")) {
    return "CodeDecayTest123!";
  }

  return "CodeDecay test";
}

function generatedTestId(...parts: string[]): string {
  return slugifyLowerAscii(parts.join("-"), "generated-test", 96);
}

function regexLiteralForText(value: string): string {
  const escaped = escapeRegExp(normalizeWhitespace(value));
  return `/${escaped}/i`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_/:=.,@%+-]+$/.test(value)) {
    return value;
  }

  return `'${value.replace(/'/g, "'\\''")}'`;
}

function createProductTargetSummary(results: ProductTargetResult[], durationMs: number): ProductTargetSummary {
  const passed = countProductStatus(results, "passed");
  const failed = countProductStatus(results, "failed");
  const skipped = countProductStatus(results, "skipped");
  const blocked = countProductStatus(results, "blocked");
  const timedOut = countProductStatus(results, "timed_out");

  return {
    status: productTargetStatus(results, { failed, blocked, timedOut }),
    total: results.length,
    ready: results.filter((result) => result.readiness.status === "ready" || result.readiness.status === "command-required").length,
    passed,
    failed,
    skipped,
    blocked,
    timedOut,
    durationMs
  };
}

function productTargetStatus(
  results: ProductTargetResult[],
  counts: Pick<ProductTargetSummary, "failed" | "blocked" | "timedOut">
): ProductTargetStatus {
  if (counts.timedOut > 0) {
    return "timed_out";
  }

  if (counts.failed > 0) {
    return "failed";
  }

  if (counts.blocked > 0) {
    return "blocked";
  }

  if (results.length === 0 || results.every((result) => result.status === "skipped")) {
    return "skipped";
  }

  return "passed";
}

function countProductStatus(results: ProductTargetResult[], status: ProductTargetStatus): number {
  return results.filter((result) => result.status === status).length;
}

function productStatusFromRequiredCommand(status: ExecutionStatus): ProductTargetStatus {
  if (status === "passed") {
    return "passed";
  }

  if (status === "timed_out") {
    return "timed_out";
  }

  if (status === "skipped" || status === "blocked") {
    return "blocked";
  }

  return "failed";
}

function commandActuallyExecuted(result: CommandExecutionResult | undefined): boolean {
  return result !== undefined && result.status !== "skipped" && result.status !== "blocked";
}

function isProductTargetFailure(status: ProductTargetStatus): boolean {
  return status === "failed" || status === "blocked" || status === "timed_out";
}

function renderProductTargetReport(report: ProductTargetReport, format: ConfigFormat): string {
  if (format === "json") {
    return `${JSON.stringify(report, null, 2)}\n`;
  }

  return renderProductTargetMarkdown(report);
}

function renderProductTargetMarkdown(report: ProductTargetReport): string {
  const lines = [
    "## CodeDecay Product Target Report",
    "",
    `**Overall status:** ${formatProductStatus(report.summary.status)}`,
    `**Config:** ${report.configSource ? `\`${report.configSource}\`` : "defaults (no config file found)"}`,
    "",
    "| Result | Count |",
    "| --- | ---: |",
    `| Total | ${report.summary.total} |`,
    `| Ready | ${report.summary.ready} |`,
    `| Passed | ${report.summary.passed} |`,
    `| Failed | ${report.summary.failed} |`,
    `| Blocked | ${report.summary.blocked} |`,
    `| Timed out | ${report.summary.timedOut} |`,
    `| Skipped | ${report.summary.skipped} |`,
    `| Duration | ${report.summary.durationMs}ms |`,
    ""
  ];

  if (report.targets.length === 0) {
    lines.push("No product testing targets configured.", "");
    return `${lines.join("\n")}\n`;
  }

  lines.push("### Targets", "");
  for (const target of report.targets) {
    lines.push(`- **${target.id}** ${formatProductStatus(target.status)} in ${target.durationMs}ms`);
    lines.push(`  - Readiness: ${target.readiness.status} (${target.readiness.mode})`);
    lines.push(`  - Base URL: ${target.baseUrl ? `\`${target.baseUrl}\`` : "none"}`);
    lines.push(`  - Health check: ${target.healthCheck ? `\`${target.healthCheck}\`` : "none"}`);

    if (target.setup) {
      lines.push(`  - Setup: ${formatCommandExecutionStatus(target.setup.status)} \`${target.setup.command}\``);
      appendOutputBlock(lines, "setup stdout", target.setup.stdout);
      appendOutputBlock(lines, "setup stderr", target.setup.stderr);
    }

    if (target.start) {
      lines.push(`  - Start: ${formatProductStartStatus(target.start.status)} \`${target.start.command}\``);
      if (target.start.error) {
        lines.push(`  - Start error: ${target.start.error}`);
      }
      appendOutputBlock(lines, "start stdout", target.start.stdout);
      appendOutputBlock(lines, "start stderr", target.start.stderr);
    }

    if (target.health) {
      lines.push(
        `  - Health: ${formatProductStatus(target.health.status)} after ${target.health.attempts} attempt(s) at \`${target.health.url}\``
      );
      if (target.health.httpStatus !== undefined) {
        lines.push(`  - HTTP status: ${target.health.httpStatus}`);
      }
      if (target.health.error) {
        lines.push(`  - Health error: ${target.health.error}`);
      }
    }

    if (target.exploration) {
      lines.push(`  - Exploration: ${formatProductStatus(target.exploration.status)} using ${target.exploration.driver}`);
      lines.push(`  - Flow pages: ${target.exploration.pages}`);
      lines.push(`  - Interactive elements: ${target.exploration.interactiveElements}`);
      lines.push(`  - Blocked actions: ${target.exploration.blockedActions}`);
      lines.push(`  - Skipped actions: ${target.exploration.skippedActions}`);
      if (target.exploration.artifactPath) {
        lines.push(`  - Flow map: \`${target.exploration.artifactPath}\``);
      }
      if (target.exploration.error) {
        lines.push(`  - Exploration error: ${target.exploration.error}`);
      }
      for (const note of target.exploration.notes) {
        lines.push(`  - Exploration note: ${note}`);
      }
    }

    if (target.generatedTests) {
      lines.push(`  - Generated tests: ${formatProductStatus(target.generatedTests.status)} (${target.generatedTests.tests.length} test(s))`);
      if (target.generatedTests.sourcePath) {
        lines.push(`  - Generated test source: \`${target.generatedTests.sourcePath}\``);
      }
      if (target.generatedTests.manifestPath) {
        lines.push(`  - Generated test manifest: \`${target.generatedTests.manifestPath}\``);
      }
      if (target.generatedTests.error) {
        lines.push(`  - Generated test error: ${target.generatedTests.error}`);
      }
      for (const generatedTest of target.generatedTests.tests.slice(0, 8)) {
        lines.push(`  - Test: ${generatedTest.priority} ${generatedTest.kind} \`${generatedTest.id}\` ${generatedTest.title}`);
      }
      for (const note of target.generatedTests.notes) {
        lines.push(`  - Generated test note: ${note}`);
      }
    }

    if (target.generatedTestRun) {
      lines.push(`  - Generated test run: ${formatProductStatus(target.generatedTestRun.status)}`);
      if (target.generatedTestRun.command) {
        lines.push(`  - Generated test command: \`${target.generatedTestRun.command}\``);
      }
      lines.push(`  - Generated test results: ${target.generatedTestRun.passed} passed, ${target.generatedTestRun.failed} failed, ${target.generatedTestRun.skipped} skipped`);
      if (target.generatedTestRun.error) {
        lines.push(`  - Generated test run error: ${target.generatedTestRun.error}`);
      }
      for (const failure of target.generatedTestRun.failures) {
        lines.push(`  - Failure: ${failure.title}`);
        lines.push(`  - Failing step: ${failure.failingStep}`);
        lines.push(`  - Error: ${failure.error}`);
        if (failure.request) {
          lines.push(`  - Request: ${failure.request.method} \`${failure.request.url}\``);
        }
        if (failure.expected) {
          lines.push(`  - Expected: ${failure.expected}`);
        }
        if (failure.actual) {
          lines.push(`  - Actual: ${failure.actual}`);
        }
        appendGeneratedFailureMetadata(lines, failure);
        if (failure.impactedFiles && failure.impactedFiles.length > 0) {
          lines.push(`  - Impacted files: ${failure.impactedFiles.map((file) => `\`${file}\``).join(", ")}`);
        }
        lines.push(`  - Rerun: \`${failure.rerunCommand}\``);
        lines.push(`  - Test source path: \`${failure.testSourcePath}\``);
        appendCodeBlock(lines, "ts", failure.testSource);
      }
      for (const note of target.generatedTestRun.notes) {
        lines.push(`  - Generated test run note: ${note}`);
      }
    }

    if (target.generatedApiTests) {
      lines.push(`  - Generated API tests: ${formatProductStatus(target.generatedApiTests.status)} (${target.generatedApiTests.tests.length} test(s))`);
      if (target.generatedApiTests.sourcePath) {
        lines.push(`  - Generated API test source: \`${target.generatedApiTests.sourcePath}\``);
      }
      if (target.generatedApiTests.manifestPath) {
        lines.push(`  - Generated API test manifest: \`${target.generatedApiTests.manifestPath}\``);
      }
      if (target.generatedApiTests.error) {
        lines.push(`  - Generated API test error: ${target.generatedApiTests.error}`);
      }
      for (const generatedTest of target.generatedApiTests.tests.slice(0, 8)) {
        const method = generatedTest.method ? `${generatedTest.method} ` : "";
        lines.push(`  - API test: ${generatedTest.priority} ${method}\`${generatedTest.operationPath ?? generatedTest.pageUrl}\` ${generatedTest.title}`);
      }
      for (const note of target.generatedApiTests.notes) {
        lines.push(`  - Generated API test note: ${note}`);
      }
    }

    if (target.generatedApiTestRun) {
      lines.push(`  - Generated API test run: ${formatProductStatus(target.generatedApiTestRun.status)}`);
      if (target.generatedApiTestRun.command) {
        lines.push(`  - Generated API test command: \`${target.generatedApiTestRun.command}\``);
      }
      lines.push(`  - Generated API test results: ${target.generatedApiTestRun.passed} passed, ${target.generatedApiTestRun.failed} failed, ${target.generatedApiTestRun.skipped} skipped`);
      if (target.generatedApiTestRun.error) {
        lines.push(`  - Generated API test run error: ${target.generatedApiTestRun.error}`);
      }
      for (const failure of target.generatedApiTestRun.failures) {
        lines.push(`  - API failure: ${failure.title}`);
        lines.push(`  - Failing step: ${failure.failingStep}`);
        lines.push(`  - Error: ${failure.error}`);
        if (failure.request) {
          lines.push(`  - Request: ${failure.request.method} \`${failure.request.url}\``);
        }
        if (failure.expected) {
          lines.push(`  - Expected: ${failure.expected}`);
        }
        if (failure.actual) {
          lines.push(`  - Actual: ${failure.actual}`);
        }
        appendGeneratedFailureMetadata(lines, failure);
        if (failure.impactedFiles && failure.impactedFiles.length > 0) {
          lines.push(`  - Impacted files: ${failure.impactedFiles.map((file) => `\`${file}\``).join(", ")}`);
        }
        lines.push(`  - Rerun: \`${failure.rerunCommand}\``);
        lines.push(`  - Test source path: \`${failure.testSourcePath}\``);
        appendCodeBlock(lines, "ts", failure.testSource);
      }
      for (const note of target.generatedApiTestRun.notes) {
        lines.push(`  - Generated API test run note: ${note}`);
      }
    }

    if (target.teardown) {
      lines.push(`  - Teardown: ${formatCommandExecutionStatus(target.teardown.status)} \`${target.teardown.command}\``);
      appendOutputBlock(lines, "teardown stdout", target.teardown.stdout);
      appendOutputBlock(lines, "teardown stderr", target.teardown.stderr);
    }

    for (const note of target.notes) {
      lines.push(`  - Note: ${note}`);
    }
  }

  lines.push(
    "",
    "### Safety",
    "",
    `- Commands executed: ${report.safety.commandsExecuted ? "yes" : "no"}`,
    `- Browser automation ran: ${report.safety.browserAutomationRan ? "yes" : "no"}`,
    `- Generated tests ran: ${report.safety.generatedTestsRan ? "yes" : "no"}`,
    `- Startup commands allowed: ${report.safety.startupCommandsAllowed ? "yes" : "no"}`,
    "- Telemetry sent: no",
    "- Cloud dependency: no",
    ""
  );

  for (const note of report.safety.notes) {
    lines.push(`- ${note}`);
  }
  lines.push("");

  return `${lines.join("\n")}\n`;
}

function appendGeneratedFailureMetadata(lines: string[], failure: ProductGeneratedTestFailure): void {
  if (failure.retryEvidence) {
    lines.push(
      `  - Repeat evidence: ${failure.retryEvidence.conclusion} (${failure.retryEvidence.passed} passed, ${failure.retryEvidence.failed} failed across ${failure.retryEvidence.attempts} attempt(s))`
    );
    if (failure.retryEvidence.error) {
      lines.push(`  - Repeat evidence error: ${failure.retryEvidence.error}`);
    }
  }

  if (failure.classification) {
    const confidence = failure.classificationConfidence !== undefined ? ` (${Math.round(failure.classificationConfidence * 100)}% confidence)` : "";
    lines.push(`  - Classification: ${failure.classification}${confidence}`);
  }

  for (const evidence of failure.classificationEvidence ?? []) {
    lines.push(`  - Classification evidence: ${evidence}`);
  }

  for (const task of failure.suggestedFixTasks ?? []) {
    lines.push(`  - Repair task: ${task}`);
  }
}

function formatProductStatus(status: ProductTargetStatus): string {
  if (status === "timed_out") {
    return "Timed out";
  }

  return `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}

function formatCommandExecutionStatus(status: ExecutionStatus): string {
  if (status === "timed_out") {
    return "Timed out";
  }

  return `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}

function formatProductStartStatus(status: ProductStartResult["status"]): string {
  return `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}

function appendLimitedOutput(existing: string, next: string, limit: number): string {
  const combined = `${existing}${next}`;
  if (combined.length <= limit) {
    return combined;
  }

  return combined.slice(combined.length - limit);
}

async function delay(ms: number): Promise<void> {
  if (ms <= 0) {
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, ms));
}

function getRepoRootForCli(cwd: string, options: { base?: string | undefined; head?: string | undefined; format: string }): string {
  try {
    return getRepoRoot(cwd);
  } catch (error: unknown) {
    throw formatGitErrorForCli(error, cwd, options);
  }
}

function getChangedFilesForCli(rootDir: string, options: { base?: string | undefined; head?: string | undefined; format: string }) {
  try {
    return getGitChangedFiles({
      cwd: rootDir,
      base: options.base,
      head: options.head
    });
  } catch (error: unknown) {
    throw formatGitErrorForCli(error, rootDir, options);
  }
}

function formatGitErrorForCli(
  error: unknown,
  cwd: string,
  options: { base?: string | undefined; head?: string | undefined; format: string }
): Error {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("rev-parse --show-toplevel") && message.includes("not a git repository")) {
    return new Error(`${cwd} is not a git repository. Run from a git repo or pass --cwd <repo>.`);
  }

  const unresolvedRef = findUnresolvedRef(message, options);
  if (unresolvedRef) {
    return new Error(
      `Could not resolve git ref "${unresolvedRef}". Check --base/--head and fetch the ref before running CodeDecay.`
    );
  }

  return error instanceof Error ? error : new Error(message);
}

function findUnresolvedRef(
  message: string,
  options: { base?: string | undefined; head?: string | undefined }
): string | undefined {
  for (const ref of [options.base, options.head]) {
    if (ref && message.includes(ref)) {
      return ref;
    }
  }

  return undefined;
}

function printHelp(runtime: CliRuntime, topic?: string): void {
  if (!topic) {
    writeStdout(
      runtime,
      renderRootHelpDocument({
        docs: HELP_DOCS,
        commandOrder: COMMAND_ORDER,
        utilityCommandOrder: UTILITY_COMMAND_ORDER
      })
    );
    return;
  }

  writeStdout(runtime, renderCommandHelp(resolveHelpTopic(topic)));
}

function printManual(runtime: CliRuntime, topic?: string): void {
  if (!topic) {
    writeStdout(
      runtime,
      renderRootManualDocument({
        docs: HELP_DOCS,
        commandOrder: COMMAND_ORDER,
        utilityCommandOrder: UTILITY_COMMAND_ORDER
      })
    );
    return;
  }

  writeStdout(runtime, renderCommandManual(resolveHelpTopic(topic)));
}

function resolveHelpTopic(topic: string): CommandDoc {
  const doc = HELP_DOCS[topic];
  if (doc) {
    return doc;
  }

  throwUnknownCommand(topic);
}

function isDirectRun(): boolean {
  const entrypoint = process.argv[1];
  return Boolean(entrypoint && realPathOrResolve(entrypoint) === realPathOrResolve(fileURLToPath(import.meta.url)));
}

function realPathOrResolve(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

function elapsed(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt);
}
