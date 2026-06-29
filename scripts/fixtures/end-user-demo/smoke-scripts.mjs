export function renderMcpClientSmokeScript(input) {
  return `#!/usr/bin/env node
import { writeFileSync } from "node:fs";
const { Client } = await import(${JSON.stringify(input.clientModuleUrl)});
const { StdioClientTransport } = await import(${JSON.stringify(input.stdioModuleUrl)});

const outputPath = ${JSON.stringify(input.outputPath)};
const cliPath = ${JSON.stringify(input.cliPath)};
const repoRoot = ${JSON.stringify(input.repoRoot)};
const demoRepo = ${JSON.stringify(input.demoRepo)};
const base = ${JSON.stringify(input.base)};
const head = ${JSON.stringify(input.head)};
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
`;
}

export function renderGitHubActionSmokeScript(input) {
  return `#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const outputPath = ${JSON.stringify(input.outputPath)};
const repoRoot = ${JSON.stringify(input.repoRoot)};
const actionPath = join(repoRoot, "packages/github-action");
const actionYmlPath = join(actionPath, "action.yml");
const cliPath = join(repoRoot, "packages/cli/dist/index.js");
const workspace = ${JSON.stringify(input.workspace)};
const base = ${JSON.stringify(input.base)};
const head = ${JSON.stringify(input.head)};
const runnerTemp = ${JSON.stringify(input.runnerTemp)};
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
`;
}
