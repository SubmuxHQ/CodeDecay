#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const options = parseArgs(process.argv.slice(2));
const runId = options.runId ?? new Date().toISOString().replaceAll(":", "-").replace(/\.\d{3}Z$/, "Z");
const outputRoot = resolve(repoRoot, options.outputDir ?? ".codedecay/local/end-user-demo");
const runDir = resolve(outputRoot, runId);
const logsDir = join(runDir, "logs");
const reposDir = join(runDir, "repos");
const demoRepo = join(reposDir, "pr-safety-demo");
const lowRepo = join(reposDir, "low-risk-demo");
const mediumRepo = join(reposDir, "medium-risk-demo");
const mcpClientScriptPath = join(runDir, "mcp-client-smoke.mjs");
const mcpClientReportPath = join(runDir, "mcp-client-smoke.json");
const actionSmokeScriptPath = join(runDir, "github-action-smoke.mjs");
const actionSmokeReportPath = join(runDir, "github-action-smoke.json");
const externalDir = mkdtempSync(join(tmpdir(), `codedecay-end-user-demo-${runId}-`));
const nonGitDir = join(externalDir, "not-a-git-repo");
const usesDefaultCli = !options.cli;
const cliCommand = options.cli
  ? splitCommand(options.cli)
  : ["node", join(repoRoot, "packages/cli/dist/index.js")];

const runLog = {
  schemaVersion: 1,
  tool: "CodeDecay end-user demo harness",
  startedAt: new Date().toISOString(),
  finishedAt: undefined,
  status: "running",
  repoRoot,
  runId,
  runDir,
  demoRepo,
  cliCommand,
  environment: {
    node: process.version,
    platform: process.platform,
    arch: process.arch
  },
  setup: [],
  commands: [],
  observations: [],
  issues: [],
  artifacts: {}
};

main();

function main() {
  mkdirSync(logsDir, { recursive: true });
  mkdirSync(reposDir, { recursive: true });

  if (usesDefaultCli && !existsSync(cliCommand[1])) {
    failHarness(
      `CLI entrypoint not found: ${cliCommand.join(" ")}. Run pnpm build:packages or pass --cli "<command>".`
    );
  }

  try {
    createLowRiskRepo(lowRepo);
    createMediumRiskRepo(mediumRepo);
    const { base, head } = createPrSafetyDemoRepo(demoRepo);
    mkdirSync(nonGitDir, { recursive: true });

    runLog.artifacts = {
      lowRepo,
      mediumRepo,
      demoRepo,
      nonGitDir,
      base,
      head,
      mcpClientReport: mcpClientReportPath,
      githubActionSmokeReport: actionSmokeReportPath
    };
    writeRunLog();

    runThresholdChecks();
    runBasicOutputChecks();
    runReportModeChecks();
    runAgentProfileChecks();
    runExecutionChecks();
    runBaseHeadChecks(base, head);
    runErrorChecks();
    runMcpChecks(base, head);
    runGitHubActionChecks(base, head);

    runLog.status = runLog.issues.length === 0 ? "passed" : "failed";
  } catch (error) {
    runLog.status = "failed";
    runLog.issues.push({
      severity: "error",
      title: "Harness crashed",
      detail: error instanceof Error ? error.stack ?? error.message : String(error)
    });
  } finally {
    runLog.finishedAt = new Date().toISOString();
    writeRunLog();
    writeSummary();
    printResult();
  }

  process.exitCode = runLog.status === "passed" ? 0 : 1;
}

function runThresholdChecks() {
  recordCommand({
    id: "low-fail-on-high",
    description: "Low-risk docs-only change should pass fail-on high.",
    cwd: lowRepo,
    args: ["analyze", "--cwd", lowRepo, "--fail-on", "high"],
    expectedExitCodes: [0]
  });
  recordCommand({
    id: "low-fail-on-medium",
    description: "Low-risk docs-only change should pass fail-on medium.",
    cwd: lowRepo,
    args: ["analyze", "--cwd", lowRepo, "--fail-on", "medium"],
    expectedExitCodes: [0]
  });
  recordCommand({
    id: "low-fail-on-low",
    description: "Low-risk docs-only change should fail fail-on low.",
    cwd: lowRepo,
    args: ["analyze", "--cwd", lowRepo, "--fail-on", "low"],
    expectedExitCodes: [1]
  });
  recordCommand({
    id: "medium-fail-on-high",
    description: "Medium-risk UI change should pass fail-on high.",
    cwd: mediumRepo,
    args: ["analyze", "--cwd", mediumRepo, "--fail-on", "high"],
    expectedExitCodes: [0]
  });
  recordCommand({
    id: "medium-fail-on-medium",
    description: "Medium-risk UI change should fail fail-on medium.",
    cwd: mediumRepo,
    args: ["analyze", "--cwd", mediumRepo, "--fail-on", "medium"],
    expectedExitCodes: [1]
  });
  recordCommand({
    id: "medium-fail-on-low",
    description: "Medium-risk UI change should fail fail-on low.",
    cwd: mediumRepo,
    args: ["analyze", "--cwd", mediumRepo, "--fail-on", "low"],
    expectedExitCodes: [1]
  });
  recordCommand({
    id: "high-fail-on-high",
    description: "High-risk API/auth/db/config change should fail fail-on high.",
    cwd: demoRepo,
    args: ["analyze", "--cwd", demoRepo, "--fail-on", "high"],
    expectedExitCodes: [1]
  });
  recordCommand({
    id: "high-fail-on-medium",
    description: "High-risk API/auth/db/config change should fail fail-on medium.",
    cwd: demoRepo,
    args: ["analyze", "--cwd", demoRepo, "--fail-on", "medium"],
    expectedExitCodes: [1]
  });
  recordCommand({
    id: "high-fail-on-low",
    description: "High-risk API/auth/db/config change should fail fail-on low.",
    cwd: demoRepo,
    args: ["analyze", "--cwd", demoRepo, "--fail-on", "low"],
    expectedExitCodes: [1]
  });
}

function runBasicOutputChecks() {
  recordCommand({
    id: "help",
    description: "End-user help renders available commands and flags.",
    cwd: demoRepo,
    args: ["--help"],
    expectedExitCodes: [0]
  });
  recordCommand({
    id: "config-json",
    description: "Config command loads repo-local config as JSON.",
    cwd: demoRepo,
    args: ["config", "--cwd", demoRepo, "--format", "json"],
    expectedExitCodes: [0],
    parseStdoutJson: true
  });
  recordCommand({
    id: "config-markdown",
    description: "Config command renders markdown for humans.",
    cwd: demoRepo,
    args: ["config", "--cwd", demoRepo, "--format", "markdown"],
    expectedExitCodes: [0]
  });
  recordCommand({
    id: "memory-json",
    description: "Memory command loads repo-local memory as JSON.",
    cwd: demoRepo,
    args: ["memory", "--cwd", demoRepo, "--format", "json"],
    expectedExitCodes: [0],
    parseStdoutJson: true
  });
  recordCommand({
    id: "memory-markdown",
    description: "Memory command renders local memory context for humans.",
    cwd: demoRepo,
    args: ["memory", "--cwd", demoRepo, "--format", "markdown"],
    expectedExitCodes: [0]
  });
}

function runReportModeChecks() {
  recordCommand({
    id: "analyze-json",
    description: "Analyze command emits machine-readable JSON.",
    cwd: demoRepo,
    args: ["analyze", "--cwd", demoRepo, "--format", "json"],
    expectedExitCodes: [0],
    parseStdoutJson: true
  });
  recordCommand({
    id: "analyze-markdown",
    description: "Analyze command emits PR-comment markdown.",
    cwd: demoRepo,
    args: ["analyze", "--cwd", demoRepo, "--format", "markdown"],
    expectedExitCodes: [0]
  });
  recordCommand({
    id: "analyze-json-output",
    description: "Analyze writes relative JSON output from --cwd.",
    cwd: demoRepo,
    args: ["analyze", "--cwd", demoRepo, "--format", "json", "--output", "codedecay-output/analyze.json"],
    expectedExitCodes: [0],
    outputFiles: [{ path: "codedecay-output/analyze.json", cwd: demoRepo, parseJson: true }]
  });
  recordCommand({
    id: "analyze-sarif-output",
    description: "Analyze writes minimal SARIF output for code scanning workflows.",
    cwd: demoRepo,
    args: ["analyze", "--cwd", demoRepo, "--format", "sarif", "--output", "codedecay-output/analyze.sarif"],
    expectedExitCodes: [0],
    outputFiles: [{ path: "codedecay-output/analyze.sarif", cwd: demoRepo, parseJson: true }]
  });
  recordCommand({
    id: "redteam-json",
    description: "Redteam command emits deterministic JSON without executing commands or models.",
    cwd: demoRepo,
    args: ["redteam", "--cwd", demoRepo, "--format", "json"],
    expectedExitCodes: [0],
    parseStdoutJson: true
  });
  recordCommand({
    id: "redteam-markdown",
    description: "Redteam command emits markdown for PR review.",
    cwd: demoRepo,
    args: ["redteam", "--cwd", demoRepo, "--format", "markdown"],
    expectedExitCodes: [0]
  });
  recordCommand({
    id: "redteam-fail-on-high",
    description: "Redteam honors fail-on high for high-risk changes.",
    cwd: demoRepo,
    args: ["redteam", "--cwd", demoRepo, "--fail-on", "high"],
    expectedExitCodes: [1]
  });
}

function runAgentProfileChecks() {
  for (const profile of ["generic", "codex", "claude-code", "cursor", "pi", "opencode", "desktop"]) {
    recordCommand({
      id: `agent-${profile}`,
      description: `Agent command emits a ${profile} handoff bundle.`,
      cwd: demoRepo,
      args: ["agent", "--cwd", demoRepo, "--profile", profile, "--format", "json"],
      expectedExitCodes: [0],
      parseStdoutJson: true
    });
  }
}

function runExecutionChecks() {
  recordCommand({
    id: "execute-json",
    description: "Execute runs explicitly configured commands and tool adapters.",
    cwd: demoRepo,
    args: ["execute", "--cwd", demoRepo, "--format", "json"],
    expectedExitCodes: [1],
    parseStdoutJson: true
  });
  recordCommand({
    id: "execute-markdown-output",
    description: "Execute writes markdown output when configured checks fail.",
    cwd: demoRepo,
    args: ["execute", "--cwd", demoRepo, "--format", "markdown", "--output", "codedecay-output/execute.md"],
    expectedExitCodes: [1],
    outputFiles: [{ path: "codedecay-output/execute.md", cwd: demoRepo }]
  });
}

function runBaseHeadChecks(base, head) {
  recordCommand({
    id: "analyze-base-head-json",
    description: "Analyze compares explicit base/head refs.",
    cwd: demoRepo,
    args: ["analyze", "--cwd", demoRepo, "--base", base, "--head", head, "--format", "json"],
    expectedExitCodes: [0],
    parseStdoutJson: true
  });
  recordCommand({
    id: "redteam-base-head-json",
    description: "Redteam compares explicit base/head refs.",
    cwd: demoRepo,
    args: ["redteam", "--cwd", demoRepo, "--base", base, "--head", head, "--format", "json"],
    expectedExitCodes: [0],
    parseStdoutJson: true
  });
  recordCommand({
    id: "agent-base-head-codex",
    description: "Agent task bundle works with explicit refs.",
    cwd: demoRepo,
    args: ["agent", "--cwd", demoRepo, "--base", base, "--head", head, "--profile", "codex", "--format", "json"],
    expectedExitCodes: [0],
    parseStdoutJson: true
  });
  recordCommand({
    id: "differential-json",
    description: "Differential detects changed behavior between base and head worktrees.",
    cwd: demoRepo,
    args: ["differential", "--cwd", demoRepo, "--base", base, "--head", head, "--format", "json"],
    expectedExitCodes: [1],
    parseStdoutJson: true
  });
  recordCommand({
    id: "differential-markdown-output",
    description: "Differential writes markdown output for changed behavior.",
    cwd: demoRepo,
    args: [
      "differential",
      "--cwd",
      demoRepo,
      "--base",
      base,
      "--head",
      head,
      "--format",
      "markdown",
      "--output",
      "codedecay-output/differential.md"
    ],
    expectedExitCodes: [1],
    outputFiles: [{ path: "codedecay-output/differential.md", cwd: demoRepo }]
  });
}

function runErrorChecks() {
  recordCommand({
    id: "invalid-base-ref",
    description: "Invalid refs exit 2 and do not emit a fake low-risk report.",
    cwd: demoRepo,
    args: ["analyze", "--cwd", demoRepo, "--base", "does-not-exist", "--head", "HEAD", "--format", "json"],
    expectedExitCodes: [2],
    expectStdoutEmpty: true
  });
  recordCommand({
    id: "non-git-cwd",
    description: "Non-git directories exit 2 and do not emit a fake low-risk report.",
    cwd: nonGitDir,
    args: ["analyze", "--cwd", nonGitDir, "--format", "json"],
    expectedExitCodes: [2],
    expectStdoutEmpty: true
  });
}

function runMcpChecks(base, head) {
  recordCommand({
    id: "mcp-help",
    description: "MCP command exposes CLI help without starting a long-running server.",
    cwd: demoRepo,
    args: ["mcp", "--help"],
    expectedExitCodes: [0]
  });
  writeMcpClientSmokeScript({ base, head });
  recordProcess({
    id: "mcp-client-smoke",
    description: "MCP client starts CodeDecay MCP and calls analysis, impact, audit, redteam, agent, and execution tools.",
    cwd: repoRoot,
    command: ["node", mcpClientScriptPath],
    expectedExitCodes: [0],
    outputFiles: [{ path: mcpClientReportPath, parseJson: true }]
  });
}

function runGitHubActionChecks(base, head) {
  writeGitHubActionSmokeScript({ base, head });
  recordProcess({
    id: "github-action-runtime-smoke",
    description: "Simulate the composite GitHub Action runtime with step summary, fail-on behavior, and SARIF output.",
    cwd: repoRoot,
    command: ["node", actionSmokeScriptPath],
    expectedExitCodes: [0],
    outputFiles: [{ path: actionSmokeReportPath, parseJson: true }]
  });
}

function recordCommand(input) {
  recordProcess({
    ...input,
    command: [...cliCommand, ...input.args]
  });
}

function recordProcess(input) {
  const startedAt = Date.now();
  const command = input.command;
  const result = spawnSync(command[0], command.slice(1), {
    cwd: input.cwd,
    encoding: "utf8",
    timeout: input.timeoutMs ?? 120_000,
    env: {
      ...process.env,
      NO_COLOR: "1"
    }
  });
  const durationMs = Date.now() - startedAt;
  const exitCode = typeof result.status === "number" ? result.status : result.signal ? 1 : 2;
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  const stdoutPath = join(logsDir, `${input.id}.stdout.txt`);
  const stderrPath = join(logsDir, `${input.id}.stderr.txt`);
  writeFileSync(stdoutPath, stdout, "utf8");
  writeFileSync(stderrPath, stderr, "utf8");

  const parsedStdout = input.parseStdoutJson ? parseJson(stdout) : undefined;
  const outputFiles = (input.outputFiles ?? []).map((file) => inspectOutputFile(file));
  const expectedExit = input.expectedExitCodes.includes(exitCode);
  const stdoutEmptyOk = !input.expectStdoutEmpty || stdout.trim().length === 0;
  const outputsOk = outputFiles.every((file) => file.exists && (!file.parseJson || file.parsedJsonOk));
  const status = expectedExit && stdoutEmptyOk && outputsOk && !result.error ? "pass" : "fail";

  const commandLog = {
    id: input.id,
    description: input.description,
    status,
    command,
    commandText: command.map(shellQuote).join(" "),
    cwd: input.cwd,
    expectedExitCodes: input.expectedExitCodes,
    exitCode,
    signal: result.signal ?? undefined,
    durationMs,
    stdout,
    stderr,
    stdoutPath: relative(runDir, stdoutPath),
    stderrPath: relative(runDir, stderrPath),
    parsedStdout,
    outputFiles,
    error: result.error ? String(result.error) : undefined
  };

  runLog.commands.push(commandLog);
  addObservation(commandLog);

  if (status === "fail") {
    runLog.issues.push({
      severity: "error",
      commandId: input.id,
      title: `${input.id} did not match expected behavior`,
      expectedExitCodes: input.expectedExitCodes,
      exitCode,
      stdoutEmptyOk,
      outputsOk,
      stderr: firstLines(stderr, 12)
    });
  }

  writeRunLog();
}

function addObservation(commandLog) {
  const parsed = commandLog.parsedStdout?.ok ? commandLog.parsedStdout.value : undefined;
  const summary = parsed && typeof parsed === "object" && "summary" in parsed ? parsed.summary : undefined;
  const mode = parsed && typeof parsed === "object" && "mode" in parsed ? parsed.mode : undefined;

  runLog.observations.push({
    commandId: commandLog.id,
    status: commandLog.status,
    exitCode: commandLog.exitCode,
    durationMs: commandLog.durationMs,
    summary,
    mode,
    stdoutBytes: Buffer.byteLength(commandLog.stdout),
    stderrBytes: Buffer.byteLength(commandLog.stderr),
    outputFiles: commandLog.outputFiles.map((file) => ({
      path: file.path,
      exists: file.exists,
      size: file.size,
      parsedJsonOk: file.parsedJsonOk
    }))
  });
}

function inspectOutputFile(file) {
  const cwd = file.cwd ?? demoRepo;
  const absolutePath = isAbsolute(file.path) ? file.path : resolve(cwd, file.path);
  const exists = existsSync(absolutePath);
  const result = {
    path: file.path,
    absolutePath,
    relativePath: exists ? relative(runDir, absolutePath) : undefined,
    exists,
    size: exists ? statSync(absolutePath).size : 0,
    sha256: exists ? sha256(readFileSync(absolutePath)) : undefined,
    parseJson: Boolean(file.parseJson),
    parsedJsonOk: undefined,
    parsedJson: undefined,
    parseError: undefined
  };

  if (exists && file.parseJson) {
    const parsed = parseJson(readFileSync(absolutePath, "utf8"));
    result.parsedJsonOk = parsed.ok;
    result.parsedJson = parsed.ok ? parsed.value : undefined;
    result.parseError = parsed.ok ? undefined : parsed.error;
  }

  return result;
}

function writeMcpClientSmokeScript({ base, head }) {
  writeFileSync(
    mcpClientScriptPath,
    `#!/usr/bin/env node
import { writeFileSync } from "node:fs";
const { Client } = await import(${JSON.stringify(
      pathToFileURL(join(repoRoot, "packages/mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js")).href
    )});
const { StdioClientTransport } = await import(${JSON.stringify(
      pathToFileURL(join(repoRoot, "packages/mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js")).href
    )});

const outputPath = ${JSON.stringify(mcpClientReportPath)};
const cliPath = ${JSON.stringify(join(repoRoot, "packages/cli/dist/index.js"))};
const repoRoot = ${JSON.stringify(repoRoot)};
const demoRepo = ${JSON.stringify(demoRepo)};
const base = ${JSON.stringify(base)};
const head = ${JSON.stringify(head)};
const requiredTools = [
  "analyze_pr",
  "impact_map",
  "audit_tests",
  "redteam_report",
  "agent_task_bundle",
  "execute_configured_checks"
];
const calls = [];
let stderr = "";

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [cliPath, "mcp", "--cwd", demoRepo],
  cwd: repoRoot,
  stderr: "pipe",
  env: {
    ...process.env,
    NO_COLOR: "1"
  }
});
transport.stderr?.on("data", (chunk) => {
  stderr += String(chunk);
});

const client = new Client({ name: "codedecay-end-user-demo", version: "0.0.0" });

try {
  await client.connect(transport);
  const listed = await client.listTools();
  const toolNames = listed.tools.map((tool) => tool.name).sort();
  const missingTools = requiredTools.filter((tool) => !toolNames.includes(tool));

  async function call(name, args = {}) {
    const startedAt = Date.now();
    const result = await client.callTool({ name, arguments: args });
    const text = result.content?.find((item) => item.type === "text")?.text ?? "";
    const parsed = parseJson(text);
    const callRecord = {
      name,
      args,
      durationMs: Date.now() - startedAt,
      isError: Boolean(result.isError),
      contentTypes: result.content?.map((item) => item.type) ?? [],
      textBytes: Buffer.byteLength(text),
      textPreview: text.slice(0, 500),
      parsed
    };
    calls.push(callRecord);
    return callRecord;
  }

  await call("analyze_pr", { cwd: demoRepo, base, head, format: "json" });
  await call("impact_map", { cwd: demoRepo, base, head });
  await call("audit_tests", { cwd: demoRepo, base, head });
  await call("suggest_edge_cases", { cwd: demoRepo, base, head });
  await call("redteam_report", { cwd: demoRepo, base, head, format: "json" });
  await call("agent_task_bundle", { cwd: demoRepo, base, head, format: "json", profile: "codex" });
  const executeUnconfirmed = await call("execute_configured_checks", { cwd: demoRepo, format: "json", confirmExecution: false });
  const executeConfirmed = await call("execute_configured_checks", { cwd: demoRepo, format: "json", confirmExecution: true });

  const report = {
    status: "passed",
    serverVersion: client.getServerVersion(),
    serverCapabilities: client.getServerCapabilities(),
    toolNames,
    missingTools,
    calls,
    stderr
  };

  assert(missingTools.length === 0, "Missing MCP tools: " + missingTools.join(", "));
  assert(executeUnconfirmed.parsed.value?.executed === false, "execute_configured_checks should not execute without confirmation.");
  assert(executeConfirmed.parsed.value?.executed === true, "execute_configured_checks should execute with confirmation.");
  assert(executeConfirmed.parsed.value?.summary?.total > 0, "confirmed MCP execution should report configured checks.");
  assert(calls.every((call) => !call.isError), "MCP tool call returned isError=true.");

  writeFileSync(outputPath, JSON.stringify(report, null, 2), "utf8");
} catch (error) {
  writeFileSync(
    outputPath,
    JSON.stringify(
      {
        status: "failed",
        error: error instanceof Error ? error.stack ?? error.message : String(error),
        calls,
        stderr
      },
      null,
      2
    ),
    "utf8"
  );
  process.exitCode = 1;
} finally {
  await client.close().catch(() => {});
}

function parseJson(value) {
  try {
    return { ok: true, value: JSON.parse(value) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
`,
    "utf8"
  );
}

function writeGitHubActionSmokeScript({ base, head }) {
  writeFileSync(
    actionSmokeScriptPath,
    `#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const outputPath = ${JSON.stringify(actionSmokeReportPath)};
const repoRoot = ${JSON.stringify(repoRoot)};
const actionPath = join(repoRoot, "packages/github-action");
const actionYmlPath = join(actionPath, "action.yml");
const cliPath = join(repoRoot, "packages/cli/dist/index.js");
const workspace = ${JSON.stringify(demoRepo)};
const base = ${JSON.stringify(base)};
const head = ${JSON.stringify(head)};
const runnerTemp = ${JSON.stringify(join(runDir, "github-action-temp"))};
const stepSummaryPath = join(runnerTemp, "step-summary.md");
const sarifPath = join(workspace, "codedecay-output", "github-action-analyze.sarif");
const actionYml = readFileSync(actionYmlPath, "utf8");
const requiredInputs = ["mode:", "base:", "head:", "cwd:", "format:", "output:", "fail-on:"];
const missingInputs = requiredInputs.filter((input) => !actionYml.includes(input));
const commands = [];

mkdirSync(runnerTemp, { recursive: true });
mkdirSync(dirname(sarifPath), { recursive: true });

function run(id, args, expectedExitCodes) {
  const startedAt = Date.now();
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: workspace,
    encoding: "utf8",
    env: {
      ...process.env,
      GITHUB_ACTION_PATH: actionPath,
      GITHUB_WORKSPACE: workspace,
      GITHUB_STEP_SUMMARY: stepSummaryPath,
      RUNNER_TEMP: runnerTemp,
      NO_COLOR: "1"
    }
  });
  const exitCode = typeof result.status === "number" ? result.status : 2;
  const record = {
    id,
    args,
    expectedExitCodes,
    exitCode,
    status: expectedExitCodes.includes(exitCode) ? "pass" : "fail",
    durationMs: Date.now() - startedAt,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? ""
  };
  commands.push(record);
  return record;
}

const summary = run("write-summary", ["redteam", "--cwd", ".", "--base", base, "--head", head, "--format", "markdown"], [0]);
writeFileSync(stepSummaryPath, summary.stdout, "utf8");
const redteamGate = run("run-redteam-fail-on-high", ["redteam", "--cwd", ".", "--base", base, "--head", head, "--format", "markdown", "--fail-on", "high"], [1]);
const sarif = run("run-analyze-sarif-output", ["analyze", "--cwd", ".", "--base", base, "--head", head, "--format", "sarif", "--output", sarifPath], [0]);
const sarifParsed = parseJson(readFileSync(sarifPath, "utf8"));
const stepSummary = readFileSync(stepSummaryPath, "utf8");
const report = {
  status: "passed",
  actionPath,
  actionYmlPath,
  missingInputs,
  workspace,
  base,
  head,
  commands,
  stepSummary: {
    path: stepSummaryPath,
    bytes: Buffer.byteLength(stepSummary),
    containsRedteamReport: stepSummary.includes("CodeDecay Redteam Report")
  },
  sarif: {
    path: sarifPath,
    parsed: sarifParsed
  }
};

assert(missingInputs.length === 0, "action.yml missing expected inputs: " + missingInputs.join(", "));
assert(commands.every((command) => command.status === "pass"), "action runtime command did not match expected exit code.");
assert(stepSummary.includes("CodeDecay Redteam Report"), "step summary did not include redteam report.");
assert(sarifParsed.ok && sarifParsed.value.version === "2.1.0", "SARIF output was not parseable SARIF JSON.");

writeFileSync(outputPath, JSON.stringify(report, null, 2), "utf8");

function parseJson(value) {
  try {
    return { ok: true, value: JSON.parse(value) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function assert(condition, message) {
  if (!condition) {
    reportFailure(message);
    throw new Error(message);
  }
}

function reportFailure(message) {
  writeFileSync(
    outputPath,
    JSON.stringify(
      {
        status: "failed",
        error: message,
        missingInputs,
        commands,
        stepSummaryPath,
        sarifPath
      },
      null,
      2
    ),
    "utf8"
  );
}
`,
    "utf8"
  );
}

function createLowRiskRepo(root) {
  resetDir(root);
  writeFiles(root, {
    "README.md": "# Low risk demo\n",
    ".gitignore": "codedecay-output/\n"
  });
  initGitRepo(root);
  writeFile(root, "README.md", "# Low risk demo\n\nDocs-only change.\n");
}

function createMediumRiskRepo(root) {
  resetDir(root);
  writeFiles(root, {
    "src/app/dashboard/page.tsx": "export default function Page() { return <main>Dashboard</main>; }\n",
    "src/app/settings/page.tsx": "export default function Page() { return <main>Settings</main>; }\n",
    ".gitignore": "codedecay-output/\n"
  });
  initGitRepo(root);
  writeFile(
    root,
    "src/app/dashboard/page.tsx",
    "export default function Page() { return <main>Dashboard changed</main>; }\n"
  );
  writeFile(
    root,
    "src/app/settings/page.tsx",
    "export default function Page() { return <main>Settings changed</main>; }\n"
  );
}

function createPrSafetyDemoRepo(root) {
  resetDir(root);
  writeFiles(root, baselineFiles());
  initGitRepo(root);
  const base = gitOutput(root, ["rev-parse", "HEAD"]).trim();

  writeFiles(root, riskyFiles());
  const workingTreeStatus = gitOutput(root, ["status", "--short"]);
  runLog.setup.push({
    step: "risky-working-tree",
    status: "created",
    changedFiles: workingTreeStatus.trim().split(/\r?\n/).filter(Boolean)
  });

  git(root, ["add", "."]);
  git(root, ["commit", "-m", "risky pr change"]);
  const head = gitOutput(root, ["rev-parse", "HEAD"]).trim();
  git(root, ["branch", "risky-head", head]);
  git(root, ["reset", "--mixed", base]);
  runLog.setup.push({ step: "commit-risky-head", status: "created", base, head, ref: "risky-head" });

  return { base, head };
}

function baselineFiles() {
  return {
    ".gitignore": "codedecay-output/\n",
    "README.md": "# PR safety demo\n\nA local demo repo for CodeDecay end-user testing.\n",
    "package.json": JSON.stringify(
      {
        name: "codedecay-pr-safety-demo",
        private: true,
        type: "module",
        scripts: {
          test: "node scripts/unit-smoke.mjs",
          build: "node scripts/build-smoke.mjs",
          start: "node scripts/start-smoke.mjs",
          "probe:behavior": "node scripts/probe-behavior.mjs"
        }
      },
      null,
      2
    ),
    ".codedecay/config.yml": [
      "version: 1",
      "",
      "commands:",
      "  test:",
      "    - node scripts/unit-smoke.mjs",
      "  build:",
      "    - node scripts/build-smoke.mjs",
      "  start:",
      "    - node scripts/start-smoke.mjs",
      "",
      "probes:",
      "  - name: behavior probe",
      "    command: node scripts/probe-behavior.mjs",
      "    timeoutMs: 5000",
      "",
      "toolAdapters:",
      "  playwright:",
      "    command: node scripts/user-flow-smoke.mjs",
      "  stryker:",
      "    command: node scripts/mutation-smoke.mjs",
      "  schemathesis:",
      "    command: node scripts/api-fuzz-smoke.mjs",
      "  pact:",
      "    command: node scripts/pact-verify.mjs",
      "",
      "safety:",
      "  commandTimeoutMs: 5000",
      "  allowCommands: true",
      "",
      "llm:",
      "  provider: disabled",
      "  timeoutMs: 30000",
      ""
    ].join("\n"),
    ".codedecay/memory.json": JSON.stringify(
      {
        version: 1,
        flows: [
          {
            name: "Admin user lookup",
            areas: ["api", "auth", "database"],
            checks: ["anonymous request", "missing role", "deleted user"]
          }
        ],
        commands: [
          {
            name: "Behavior probe",
            command: "node scripts/probe-behavior.mjs",
            areas: ["api", "auth"]
          }
        ],
        invariants: [
          {
            name: "Auth fails closed",
            description: "Missing or malformed credentials must never become admin users.",
            areas: ["auth"],
            severity: "high"
          }
        ],
        architecture: [
          {
            title: "API route owns validation",
            note: "Route handlers must validate request shape before touching persistence.",
            areas: ["api"]
          }
        ],
        regressions: [
          {
            title: "Anonymous admin fallback",
            description: "A previous auth fallback allowed anonymous admin access.",
            areas: ["auth", "api"],
            check: "Request users API without a token",
            severity: "high"
          }
        ]
      },
      null,
      2
    ),
    ".agents/skills/pr-red-team/SKILL.md": "# PR Red-Team Skill\n\nFind missed user-facing regressions before merge.\n",
    ".agents/skills/test-quality-review/SKILL.md": "# Test Quality Review Skill\n\nQuestion tests that only prove mocks.\n",
    "src/lib/behavior-state.json": JSON.stringify(
      {
        mode: "baseline",
        allowsAnonymousAdmin: false,
        usersApiValidatesInput: true,
        mutationScore: 91
      },
      null,
      2
    ),
    "src/lib/auth/session.ts": [
      "export function requireSession(token?: string) {",
      "  if (!token) return null;",
      "  return { userId: 'u_123', role: 'user' };",
      "}",
      ""
    ].join("\n"),
    "src/app/api/users/route.ts": [
      "import { requireSession } from '../../../lib/auth/session';",
      "",
      "export async function GET(request: Request) {",
      "  const session = requireSession(request.headers.get('authorization') ?? undefined);",
      "  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });",
      "  return Response.json([{ id: 'u_123', role: session.role }]);",
      "}",
      ""
    ].join("\n"),
    "src/app/dashboard/page.tsx": "export default function Page() { return <main>Dashboard</main>; }\n",
    "src/lib/formatUser.ts": "export function formatUser(user: { id: string }) { return user.id.trim(); }\n",
    "src/lib/formatUser.test.ts": [
      "import { formatUser } from './formatUser';",
      "test('formats user ids', () => {",
      "  expect(formatUser({ id: ' u_123 ' })).toBe('u_123');",
      "});",
      ""
    ].join("\n"),
    "prisma/schema.prisma": [
      "model User {",
      "  id String @id",
      "  email String @unique",
      "}",
      ""
    ].join("\n"),
    "next.config.js": "export default { reactStrictMode: true };\n",
    "scripts/probe-behavior.mjs": scriptReadBehavior("console.log(JSON.stringify(state));"),
    "scripts/unit-smoke.mjs": scriptReadBehavior(
      "console.log(JSON.stringify({ check: 'unit-smoke', passed: true, mode: state.mode }));"
    ),
    "scripts/build-smoke.mjs": "console.log(JSON.stringify({ check: 'build-smoke', passed: true }));\n",
    "scripts/start-smoke.mjs": "console.log(JSON.stringify({ check: 'start-smoke', passed: true }));\n",
    "scripts/user-flow-smoke.mjs": scriptReadBehavior([
      "if (state.allowsAnonymousAdmin) {",
      "  console.error('browser flow detected anonymous admin access');",
      "  process.exit(1);",
      "}",
      "console.log(JSON.stringify({ check: 'browser-flow', passed: true }));"
    ].join("\n")),
    "scripts/mutation-smoke.mjs": scriptReadBehavior([
      "if (state.mutationScore < 60) {",
      "  console.error(`mutation score too low: ${state.mutationScore}`);",
      "  process.exit(1);",
      "}",
      "console.log(JSON.stringify({ check: 'mutation', score: state.mutationScore }));"
    ].join("\n")),
    "scripts/api-fuzz-smoke.mjs": scriptReadBehavior([
      "if (!state.usersApiValidatesInput) {",
      "  console.error('api fuzz check found missing input validation');",
      "  process.exit(1);",
      "}",
      "console.log(JSON.stringify({ check: 'api-fuzz', passed: true }));"
    ].join("\n")),
    "scripts/pact-verify.mjs": "console.log(JSON.stringify({ check: 'contract', passed: true }));\n"
  };
}

function riskyFiles() {
  return {
    "src/lib/behavior-state.json": JSON.stringify(
      {
        mode: "risky",
        allowsAnonymousAdmin: true,
        usersApiValidatesInput: false,
        mutationScore: 38
      },
      null,
      2
    ),
    "src/lib/auth/session.ts": [
      "export function requireSession(token?: string) {",
      "  if (!token) return { userId: 'anonymous', role: 'admin' };",
      "  return { userId: 'u_123', role: 'admin' };",
      "}",
      ""
    ].join("\n"),
    "src/app/api/users/route.ts": [
      "import { requireSession } from '../../../lib/auth/session';",
      "",
      "export async function GET(request: Request) {",
      "  const session = requireSession(request.headers.get('authorization') ?? undefined);",
      "  return Response.json([{ id: session?.userId ?? 'anonymous', role: session?.role ?? 'admin' }]);",
      "}",
      "",
      "export async function POST(request: Request) {",
      "  const body = await request.json();",
      "  return Response.json({ id: body.id, role: body.role ?? 'admin' });",
      "}",
      ""
    ].join("\n"),
    "src/app/dashboard/page.tsx": "export default function Page() { return <main>Admin dashboard changed</main>; }\n",
    "src/lib/auth/session.test.ts": [
      "import { requireSession } from './session';",
      "test('creates a fallback session', () => {",
      "  requireSession(undefined);",
      "});",
      ""
    ].join("\n"),
    "prisma/schema.prisma": [
      "model User {",
      "  id String @id",
      "  email String @unique",
      "  role String @default(\"admin\")",
      "}",
      ""
    ].join("\n"),
    "next.config.js": "export default { reactStrictMode: false, experimental: { serverActions: true } };\n"
  };
}

function scriptReadBehavior(body) {
  return [
    "import { readFileSync } from 'node:fs';",
    "const state = JSON.parse(readFileSync(new URL('../src/lib/behavior-state.json', import.meta.url), 'utf8'));",
    body,
    ""
  ].join("\n");
}

function initGitRepo(root) {
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.email", "codedecay@example.com"]);
  git(root, ["config", "user.name", "CodeDecay Demo"]);
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "baseline"]);
  runLog.setup.push({ step: "init-git-repo", root });
}

function git(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8"
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed in ${root}: ${result.stderr || result.stdout}`);
  }
}

function gitOutput(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8"
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed in ${root}: ${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

function writeFiles(root, files) {
  for (const [path, contents] of Object.entries(files)) {
    writeFile(root, path, contents);
  }
}

function writeFile(root, path, contents) {
  const fullPath = join(root, path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, contents, "utf8");
}

function resetDir(path) {
  rmSync(path, { recursive: true, force: true });
  mkdirSync(path, { recursive: true });
}

function writeRunLog() {
  writeFileSync(join(runDir, "run.json"), JSON.stringify(runLog, null, 2), "utf8");
}

function writeSummary() {
  const lines = [
    "# CodeDecay End-User Demo Run",
    "",
    `- Run ID: \`${runId}\``,
    `- Status: **${capitalize(runLog.status)}**`,
    `- Demo repo: \`${relative(repoRoot, demoRepo)}\``,
    `- JSON log: \`${relative(repoRoot, join(runDir, "run.json"))}\``,
    `- Commands: ${runLog.commands.length}`,
    `- Issues: ${runLog.issues.length}`,
    "",
    "## Command Results",
    "",
    "| Command | Status | Exit | Duration | Notes |",
    "| --- | ---: | ---: | ---: | --- |"
  ];

  for (const command of runLog.commands) {
    const summary = command.parsedStdout?.ok && command.parsedStdout.value?.summary
      ? `summary: \`${JSON.stringify(command.parsedStdout.value.summary)}\``
      : "";
    lines.push(
      `| \`${command.id}\` | ${command.status} | ${command.exitCode} | ${command.durationMs}ms | ${escapeTable(summary || command.description)} |`
    );
  }

  lines.push("", "## Issues");
  if (runLog.issues.length === 0) {
    lines.push("", "No harness issues detected.");
  } else {
    for (const issue of runLog.issues) {
      lines.push("", `- **${issue.severity}: ${issue.title}**`);
      if (issue.commandId) {
        lines.push(`  - Command: \`${issue.commandId}\``);
      }
      if (issue.detail) {
        lines.push(`  - Detail: ${issue.detail}`);
      }
      if (issue.stderr) {
        lines.push(`  - stderr: \`${issue.stderr.replaceAll("`", "'")}\``);
      }
    }
  }

  lines.push("", "## Follow-Up");
  lines.push("", "- Use `run.json` for exact command logs, stdout, stderr, exit codes, parsed JSON, and output file metadata.");
  lines.push("- Create focused bug issues for any command marked `fail`.");

  writeFileSync(join(runDir, "summary.md"), `${lines.join("\n")}\n`, "utf8");
}

function printResult() {
  console.log(`CodeDecay end-user demo ${runLog.status}.`);
  console.log(`JSON log: ${join(runDir, "run.json")}`);
  console.log(`Summary: ${join(runDir, "summary.md")}`);
}

function parseJson(value) {
  try {
    return { ok: true, value: JSON.parse(value) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function firstLines(value, count) {
  return value.split(/\r?\n/).slice(0, count).join("\n");
}

function shellQuote(value) {
  if (/^[A-Za-z0-9_./:=@-]+$/.test(value)) {
    return value;
  }

  return `'${value.replaceAll("'", "'\\''")}'`;
}

function escapeTable(value) {
  return String(value).replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
}

function splitCommand(value) {
  return value.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)?.map((part) => part.replace(/^["']|["']$/g, "")) ?? [];
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--output-dir") {
      parsed.outputDir = args[++index];
      continue;
    }
    if (arg?.startsWith("--output-dir=")) {
      parsed.outputDir = arg.slice("--output-dir=".length);
      continue;
    }
    if (arg === "--run-id") {
      parsed.runId = args[++index];
      continue;
    }
    if (arg?.startsWith("--run-id=")) {
      parsed.runId = arg.slice("--run-id=".length);
      continue;
    }
    if (arg === "--cli") {
      parsed.cli = args[++index];
      continue;
    }
    if (arg?.startsWith("--cli=")) {
      parsed.cli = arg.slice("--cli=".length);
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      console.log("Usage: node scripts/end-user-demo.mjs [--output-dir <path>] [--run-id <id>] [--cli <command>]");
      process.exit(0);
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  return parsed;
}

function failHarness(message) {
  runLog.status = "failed";
  runLog.issues.push({ severity: "error", title: "Harness setup failed", detail: message });
  writeRunLog();
  writeSummary();
  console.error(message);
  process.exit(2);
}
