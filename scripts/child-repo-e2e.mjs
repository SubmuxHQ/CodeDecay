#!/usr/bin/env node
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRunId, readOptionValue } from "./lib/args.mjs";
import { initFixtureGitRepo } from "./lib/git.mjs";
import { parseJson, resetDir, writeFiles } from "./lib/files.mjs";
import { runCommand } from "./lib/process.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const options = parseArgs(process.argv.slice(2));
const runId = options.runId ?? createRunId();
const outputRoot = resolve(repoRoot, options.outputDir ?? ".codedecay/local/child-repo-e2e");
const runDir = join(outputRoot, runId);
const logsDir = join(runDir, "logs");
const packDir = join(runDir, "package");
const childRepo = join(runDir, "child-repo");
const endUserOutput = join(runDir, "end-user-demo");
const playwrightVersion = options.playwrightVersion ?? process.env.CODEDECAY_E2E_PLAYWRIGHT_VERSION ?? "1.55.0";
const cliPackageDir = join(repoRoot, "packages", "cli");
const builtCliPath = join(cliPackageDir, "dist", "index.js");

const runLog = {
  schemaVersion: 1,
  tool: "CodeDecay child-repository E2E harness",
  startedAt: new Date().toISOString(),
  finishedAt: undefined,
  status: "running",
  runId,
  runDir,
  playwrightVersion,
  commands: [],
  assertions: [],
  issues: [],
  artifacts: {
    childRepo,
    endUserOutput,
    runLog: join(runDir, "run.json"),
    summary: join(runDir, "summary.md")
  }
};

await main();

async function main() {
  resetDir(runDir);
  mkdirSync(logsDir, { recursive: true });
  mkdirSync(packDir, { recursive: true });

  try {
    assert(existsSync(builtCliPath), "built-cli-exists", `Built CLI is available at ${builtCliPath}.`);

    const port = await reservePort();
    createBrowserChildRepo(childRepo, port);
    const tarballPath = packCli();
    installChildDependencies(tarballPath);
    installChromium();
    initFixtureGitRepo(childRepo, {
      userName: "CodeDecay Child E2E",
      commitMessage: "baseline child application"
    });
    createRiskyChildChange(childRepo);

    const cliBin = resolveInstalledCli(childRepo);
    runLog.artifacts.tarball = tarballPath;
    runLog.artifacts.cliBin = cliBin;

    const initialRedteam = recordCommand({
      id: "installed-redteam-with-checks",
      description: "Installed CLI analyzes the child repository and runs its real test command.",
      command: cliBin,
      args: ["redteam", "--cwd", childRepo, "--with-checks", "--format", "json"],
      cwd: childRepo,
      expectedExitCodes: [0],
      parseStdoutJson: true,
      timeoutMs: 120_000
    });
    assertInitialRedteam(initialRedteam);

    const product = recordCommand({
      id: "installed-product-real-browser",
      description: "Installed CLI starts the child app, explores it in Chromium, and runs generated Playwright tests.",
      command: cliBin,
      args: [
        "product",
        "--cwd",
        childRepo,
        "--target",
        "web",
        "--explore",
        "--generate-tests",
        "--run-generated-tests",
        "--max-pages",
        "5",
        "--format",
        "json"
      ],
      cwd: childRepo,
      expectedExitCodes: [0],
      parseStdoutJson: true,
      timeoutMs: 180_000
    });
    assertRealBrowserProductRun(product);

    const endUser = recordCommand({
      id: "installed-end-user-workflows",
      description: "Installed CLI completes reports, execution, differential, MCP, Action simulation, and repair-loop workflows.",
      command: process.execPath,
      args: [
        join(repoRoot, "scripts", "end-user-demo.mjs"),
        "--cli",
        cliBin,
        "--output-dir",
        endUserOutput,
        "--run-id",
        "installed-package"
      ],
      cwd: repoRoot,
      expectedExitCodes: [0],
      timeoutMs: 240_000
    });
    assertInstalledEndUserRun(endUser, cliBin);

    runLog.status = runLog.issues.length === 0 ? "passed" : "failed";
  } catch (error) {
    runLog.status = "failed";
    runLog.issues.push({
      title: "Child-repository harness crashed",
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

function packCli() {
  const packed = recordCommand({
    id: "pack-cli",
    description: "Pack the built CLI exactly as an npm consumer receives it.",
    command: "npm",
    args: ["pack", "--json", "--pack-destination", packDir],
    cwd: cliPackageDir,
    expectedExitCodes: [0],
    parseStdoutJson: true,
    timeoutMs: 120_000
  });
  const result = packed.parsedStdout?.ok ? packed.parsedStdout.value : undefined;
  const packageEntry = Array.isArray(result)
    ? result[0]
    : result && typeof result === "object"
      ? Object.values(result)[0]
      : undefined;
  const filename = packageEntry?.filename;
  if (typeof filename !== "string" || !filename) {
    throw new Error(`npm pack did not report a tarball filename: ${packed.stdout}`);
  }

  const tarballPath = join(packDir, basename(filename));
  assert(existsSync(tarballPath), "packed-tarball-exists", `Packed tarball is missing: ${tarballPath}`);
  return tarballPath;
}

function installChildDependencies(tarballPath) {
  recordCommand({
    id: "install-child-dependencies",
    description: "Install the packed CodeDecay CLI and Playwright in the independent child repository.",
    command: "npm",
    args: [
      "install",
      "--no-audit",
      "--no-fund",
      "--save-dev",
      tarballPath,
      `@playwright/test@${playwrightVersion}`
    ],
    cwd: childRepo,
    expectedExitCodes: [0],
    timeoutMs: 180_000
  });
}

function installChromium() {
  if (options.skipBrowserInstall) {
    runLog.assertions.push({ id: "chromium-install", status: "skipped", detail: "Skipped by --skip-browser-install." });
    return;
  }

  const playwrightCli = join(childRepo, "node_modules", "playwright", "cli.js");
  const args = [playwrightCli, "install"];
  if (process.platform === "linux" && process.env.CI) {
    args.push("--with-deps");
  }
  args.push("chromium");
  recordCommand({
    id: "install-chromium",
    description: "Install a real Chromium binary for product-flow verification.",
    command: process.execPath,
    args,
    cwd: childRepo,
    expectedExitCodes: [0],
    timeoutMs: 300_000
  });
}

function createBrowserChildRepo(root, port) {
  resetDir(root);
  const origin = `http://127.0.0.1:${port}`;
  writeFiles(root, {
    ".gitignore": ["node_modules/", ".codedecay/local/", ""].join("\n"),
    "package.json": JSON.stringify(
      {
        name: "codedecay-child-repo-e2e",
        private: true,
        type: "module",
        scripts: {
          test: "node --test test/checkout.test.js",
          start: "node scripts/server.mjs"
        }
      },
      null,
      2
    ),
    ".codedecay/config.yml": [
      "version: 1",
      "commands:",
      "  test:",
      "    - npm test",
      "productTesting:",
      "  targets:",
      "    web:",
      `      baseUrl: ${origin}`,
      `      healthCheck: ${origin}/health`,
      "      startCommand: npm start",
      "      timeoutMs: 120000",
      "safety:",
      "  allowCommands: true",
      "  commandTimeoutMs: 120000",
      ""
    ].join("\n"),
    "src/tests/checkout.js": "export function calculateTotal(amount, tax) { return amount + tax; }\n",
    "test/checkout.test.js": [
      "import { test } from 'node:test';",
      "import { strictEqual } from 'node:assert/strict';",
      "import { calculateTotal } from '../src/tests/checkout.js';",
      "",
      "test('calculates a checkout total', () => {",
      "  strictEqual(calculateTotal(100, 8), 108);",
      "});",
      ""
    ].join("\n"),
    "scripts/server.mjs": renderChildServer(port)
  });
}

function createRiskyChildChange(root) {
  writeFiles(root, {
    "src/tests/checkout.js": [
      "export function calculateTotal(amount, tax) {",
      "  if (amount < 0) throw new Error('amount must be positive');",
      "  return amount + tax;",
      "}",
      ""
    ].join("\n"),
    "test/checkout.test.js": [
      "import { calculateTotal } from '../src/tests/checkout.js';",
      "const total = calculateTotal(100, 8);",
      "console.log('checkout smoke', total);",
      ""
    ].join("\n")
  });
}

function renderChildServer(port) {
  return [
    "import { createServer } from 'node:http';",
    `const port = ${port};`,
    "const server = createServer((request, response) => {",
    "  const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;",
    "  if (path === '/health') {",
    "    response.writeHead(200, { 'content-type': 'application/json' });",
    "    response.end(JSON.stringify({ ok: true }));",
    "    return;",
    "  }",
    "  response.setHeader('content-type', 'text/html; charset=utf-8');",
    "  if (path === '/') {",
    "    response.end([",
    "      '<!doctype html><html><head><title>Checkout Home</title></head><body>',",
    "      '<main><h1>Checkout</h1><a href=\"/settings\">Settings</a>',",
    "      '<form method=\"post\" action=\"/account/delete\" aria-label=\"Delete account\">',",
    "      '<button type=\"submit\">Delete account</button></form></main></body></html>'",
    "    ].join(''));",
    "    return;",
    "  }",
    "  if (path === '/settings') {",
    "    response.end([",
    "      '<!doctype html><html><head><title>Checkout Settings</title></head><body>',",
    "      '<main><h1>Settings</h1><a href=\"/\">Checkout</a>',",
    "      '<label>Email <input name=\"email\" type=\"email\" placeholder=\"Email address\"></label>',",
    "      '</main></body></html>'",
    "    ].join(''));",
    "    return;",
    "  }",
    "  response.writeHead(404);",
    "  response.end('<!doctype html><title>Not found</title>');",
    "});",
    "server.listen(port, '127.0.0.1');",
    "for (const signal of ['SIGINT', 'SIGTERM']) {",
    "  process.on(signal, () => server.close(() => process.exit(0)));",
    "}",
    ""
  ].join("\n");
}

function assertInitialRedteam(command) {
  const report = command.parsedStdout?.ok ? command.parsedStdout.value : undefined;
  const productionSourcePath = "src/tests/checkout.js";
  const impactGraphSummary = report?.analysis?.impactGraph;
  const impactGraphPath = join(
    childRepo,
    impactGraphSummary?.artifactPath ?? ".codedecay/local/impact-graph.json"
  );
  const impactGraph = existsSync(impactGraphPath)
    ? JSON.parse(readFileSync(impactGraphPath, "utf8"))
    : undefined;
  const topLevelSmokeFinding = report?.weakTestFindings?.find(
    (finding) => finding.ruleId === "test-without-assertions" && finding.file === "test/checkout.test.js"
  );
  const sourceMisclassifiedAsTest = report?.weakTestFindings?.some(
    (finding) => finding.file === productionSourcePath
  );
  assert(command.status === "pass", "initial-redteam-command", "Installed redteam command did not complete.");
  assert(report?.testAudit?.changedSourceFiles?.includes(productionSourcePath), "src-tests-is-source", "Installed CLI did not classify production code under src/tests as changed source.");
  assert(report?.analysis?.securityAnalysis?.scannedFiles?.includes(productionSourcePath), "src-tests-scanned-as-source", "Installed CLI excluded production code under src/tests from source analysis.");
  assert(!sourceMisclassifiedAsTest, "src-tests-no-weak-test-finding", "Installed CLI emitted a weak-test finding for production code under src/tests.");
  assert(Boolean(topLevelSmokeFinding), "top-level-smoke-detected", "Installed CLI did not flag the assertion-free top-level smoke test.");
  assert(report?.summary?.testProofStatus === "weak", "top-level-smoke-proof-weak", "Assertion-free top-level smoke test was not classified as weak proof.");
  assert(topLevelSmokeFinding?.description?.includes("may only prove the file runs"), "top-level-smoke-actionable", "Top-level smoke finding did not explain that execution without assertions is insufficient proof.");
  assert(report?.summary?.verificationStatus === "verified", "real-check-executed", "Child repository test command did not pass through CodeDecay execution.");
  assert(report?.safety?.commandsExecuted === true, "execution-recorded", "Redteam report did not record configured command execution.");
  assert(
    impactGraphSummary?.adapters?.some(
      (adapter) =>
        adapter.id === "codedecay-js-babel-symbols" &&
        adapter.sourceTool === "@babel/parser" &&
        adapter.status === "available"
    ),
    "impact-adapter-provenance",
    "Installed CLI did not expose the normalized Babel impact adapter provenance."
  );
  assert(existsSync(impactGraphPath), "impact-graph-artifact", `Normalized impact graph is missing: ${impactGraphPath}`);
  assert(
    impactGraph?.nodes?.some(
      (node) =>
        node.id ===
          "codedecay-js-babel-symbols::symbol:src/tests/checkout.js#calculateTotal" &&
        node.kind === "symbol"
    ),
    "impact-graph-symbol",
    "Packed CLI did not persist the changed production symbol in the normalized impact graph."
  );
  assert(
    impactGraph?.edges?.some(
      (edge) =>
        edge.from === "codedecay-js-babel-symbols::file:test/checkout.test.js" &&
        edge.to ===
          "codedecay-js-babel-symbols::symbol:src/tests/checkout.js#calculateTotal" &&
        edge.kind === "tests" &&
        edge.confidence === "direct" &&
        edge.sourceTool === "@babel/parser" &&
        edge.limitations?.includes(
          "A static test import does not prove the symbol executed or that assertions cover its behavior."
        )
    ),
    "impact-graph-test-edge",
    "Packed CLI did not preserve direct test-to-production symbol provenance."
  );
}

function assertRealBrowserProductRun(command) {
  const report = command.parsedStdout?.ok ? command.parsedStdout.value : undefined;
  const target = report?.targets?.[0];
  assert(command.status === "pass", "product-command", "Installed product command did not complete successfully.");
  assert(target?.start?.status === "started", "child-app-started", "CodeDecay did not start the child application.");
  assert(target?.health?.status === "passed", "child-app-healthy", "Child application health check did not pass.");
  assert(target?.exploration?.status === "passed" && target.exploration.pages >= 2, "real-browser-crawl", "Real browser exploration did not crawl both child application pages.");
  assert(target?.exploration?.blockedActions >= 1, "destructive-action-blocked", "Product exploration did not block the destructive account action.");
  assert(target?.generatedTestRun?.status === "passed" && target.generatedTestRun.passed > 0, "generated-tests-passed", "Generated Playwright tests did not pass in Chromium.");
  assert(report?.safety?.browserAutomationRan === true, "browser-recorded", "Product report did not record browser automation.");
  assert(report?.safety?.generatedTestsRan === true, "generated-run-recorded", "Product report did not record generated test execution.");

  const flowMapPath = join(childRepo, ".codedecay", "local", "product-flow-maps", "web", "flow-map.json");
  assert(existsSync(flowMapPath), "flow-map-exists", `Flow map was not written: ${flowMapPath}`);
  const flowMap = JSON.parse(readFileSync(flowMapPath, "utf8"));
  const screenshotPaths = flowMap.pages?.map((page) => page.screenshotPath).filter(Boolean) ?? [];
  assert(screenshotPaths.length >= 2, "screenshots-recorded", "Real browser crawl did not record page screenshots.");
  const screenshotContents = new Set();
  for (const screenshotPath of screenshotPaths) {
    const absolutePath = join(childRepo, screenshotPath);
    const bytes = existsSync(absolutePath) ? readFileSync(absolutePath) : Buffer.alloc(0);
    const isPng = bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    assert(isPng, `png-screenshot:${screenshotPath}`, `Screenshot is missing or not a real PNG: ${absolutePath}`);
    const width = isPng && bytes.length >= 24 ? bytes.readUInt32BE(16) : 0;
    const height = isPng && bytes.length >= 24 ? bytes.readUInt32BE(20) : 0;
    assert(
      bytes.length > 1_024 && width >= 640 && height >= 480,
      `meaningful-screenshot:${screenshotPath}`,
      `Screenshot is too small or malformed: ${absolutePath}`
    );
    screenshotContents.add(bytes.toString("base64"));
  }
  assert(screenshotContents.size >= 2, "distinct-page-screenshots", "Browser evidence did not capture distinct page states.");
}

function assertInstalledEndUserRun(command, cliBin) {
  const endUserRunDir = join(endUserOutput, "installed-package");
  const endUserRunPath = join(endUserRunDir, "run.json");
  assert(command.status === "pass", "end-user-command", "Installed end-user harness did not complete successfully.");
  assert(existsSync(endUserRunPath), "end-user-run-log", `End-user run log is missing: ${endUserRunPath}`);
  const endUserRun = JSON.parse(readFileSync(endUserRunPath, "utf8"));
  assert(endUserRun.status === "passed", "end-user-status", "Installed end-user harness did not report passed.");
  assert(endUserRun.cliCommand?.[0] === cliBin, "installed-cli-selected", "End-user harness did not retain the installed CLI command.");
  assert(endUserRun.commands?.some((item) => item.id === "loop-real-edit-convergence" && item.status === "pass"), "loop-converged", "Installed CLI repair loop did not converge.");
  assert(endUserRun.commands?.some((item) => item.id === "mcp-client-smoke" && item.status === "pass"), "mcp-passed", "Installed CLI MCP workflow did not pass.");
  assert(endUserRun.commands?.some((item) => item.id === "github-action-runtime-smoke" && item.status === "pass"), "action-passed", "Installed CLI Action runtime simulation did not pass.");

  const mcpScript = readFileSync(join(endUserRunDir, "mcp-client-smoke.mjs"), "utf8");
  const actionScript = readFileSync(join(endUserRunDir, "github-action-smoke.mjs"), "utf8");
  assert(mcpScript.includes(JSON.stringify(cliBin)), "mcp-installed-cli", "MCP smoke script did not launch the installed CLI.");
  assert(actionScript.includes(JSON.stringify(cliBin)), "action-installed-cli", "Action smoke script did not launch the installed CLI.");
}

function recordCommand(input) {
  const result = runCommand(input.command, input.args, {
    cwd: input.cwd,
    timeoutMs: input.timeoutMs,
    maxBuffer: 30 * 1024 * 1024,
    env: {
      ...process.env,
      CI: process.env.CI ?? "1",
      NO_COLOR: "1",
      npm_config_audit: "false",
      npm_config_fund: "false"
    }
  });
  const stdoutPath = join(logsDir, `${input.id}.stdout.txt`);
  const stderrPath = join(logsDir, `${input.id}.stderr.txt`);
  writeFileSync(stdoutPath, result.stdout, "utf8");
  writeFileSync(stderrPath, result.stderr, "utf8");
  const parsedStdout = input.parseStdoutJson ? parseJson(result.stdout) : undefined;
  const status = input.expectedExitCodes.includes(result.exitCode) && !result.error ? "pass" : "fail";
  const commandLog = {
    id: input.id,
    description: input.description,
    command: [input.command, ...input.args],
    cwd: input.cwd,
    status,
    expectedExitCodes: input.expectedExitCodes,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    signal: result.signal,
    error: result.error,
    stdout: result.stdout,
    stderr: result.stderr,
    stdoutPath: relative(runDir, stdoutPath),
    stderrPath: relative(runDir, stderrPath),
    parsedStdout
  };
  runLog.commands.push(commandLog);
  if (status === "fail") {
    runLog.issues.push({
      commandId: input.id,
      title: `${input.id} did not match its expected exit code`,
      detail: `Expected ${input.expectedExitCodes.join(", ")}, received ${result.exitCode}. ${result.error ?? result.stderr.slice(0, 1000)}`
    });
  }
  writeRunLog();
  return commandLog;
}

function assert(condition, id, detail) {
  const status = condition ? "passed" : "failed";
  runLog.assertions.push({ id, status, ...(condition ? {} : { detail }) });
  if (!condition) {
    runLog.issues.push({ title: `Assertion failed: ${id}`, detail });
  }
}

function resolveInstalledCli(root) {
  const binary = process.platform === "win32" ? "codedecay.cmd" : "codedecay";
  const cliBin = join(root, "node_modules", ".bin", binary);
  assert(existsSync(cliBin), "installed-cli-exists", `Installed CodeDecay binary is missing: ${cliBin}`);
  return cliBin;
}

async function reservePort() {
  return await new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not reserve a loopback port for the child application."));
        return;
      }
      server.close((error) => error ? reject(error) : resolvePort(address.port));
    });
  });
}

function writeRunLog() {
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, "run.json"), `${JSON.stringify(runLog, null, 2)}\n`, "utf8");
}

function writeSummary() {
  const lines = [
    "# CodeDecay Child-Repository E2E",
    "",
    `- Run: \`${runId}\``,
    `- Status: **${runLog.status}**`,
    `- Commands: ${runLog.commands.length}`,
    `- Assertions: ${runLog.assertions.filter((item) => item.status === "passed").length} passed, ${runLog.assertions.filter((item) => item.status === "skipped").length} skipped, ${runLog.assertions.filter((item) => item.status === "failed").length} failed`,
    `- Issues: ${runLog.issues.length}`,
    "",
    "## Acceptance Targets",
    "",
    "- Packed npm artifact installed in an independent git repository",
    "- Production code under src/tests remained source while the root test file remained a test",
    "- Real assertion-free top-level smoke command passed but was classified as weak proof",
    "- Real Chromium crawl, screenshots, and generated Playwright regression tests",
    "- Analyze, redteam, agent, execute, differential, MCP, and Action simulation",
    "- Normalized impact graph provenance and full artifact from the packed CLI",
    "- Deterministic agent edit loop converged and final real test passed",
    "",
    "## Commands",
    "",
    "| Command | Status | Exit | Duration |",
    "| --- | ---: | ---: | ---: |",
    ...runLog.commands.map((item) => `| \`${item.id}\` | ${item.status} | ${item.exitCode} | ${item.durationMs}ms |`),
    "",
    "## Issues",
    "",
    ...(runLog.issues.length === 0
      ? ["No E2E issues detected."]
      : runLog.issues.map((issue) => `- **${issue.title}**: ${String(issue.detail).replace(/\s+/g, " ").trim()}`)),
    ""
  ];
  writeFileSync(join(runDir, "summary.md"), lines.join("\n"), "utf8");
}

function printResult() {
  console.log(`CodeDecay child-repository E2E ${runLog.status}.`);
  console.log(`Run log: ${join(runDir, "run.json")}`);
  console.log(`Summary: ${join(runDir, "summary.md")}`);
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") {
      continue;
    }
    if (arg === "--run-id") {
      parsed.runId = readOptionValue(args, ++index, arg, "Missing value for");
      continue;
    }
    if (arg?.startsWith("--run-id=")) {
      parsed.runId = arg.slice("--run-id=".length);
      continue;
    }
    if (arg === "--output-dir") {
      parsed.outputDir = readOptionValue(args, ++index, arg, "Missing value for");
      continue;
    }
    if (arg?.startsWith("--output-dir=")) {
      parsed.outputDir = arg.slice("--output-dir=".length);
      continue;
    }
    if (arg === "--playwright-version") {
      parsed.playwrightVersion = readOptionValue(args, ++index, arg, "Missing value for");
      continue;
    }
    if (arg?.startsWith("--playwright-version=")) {
      parsed.playwrightVersion = arg.slice("--playwright-version=".length);
      continue;
    }
    if (arg === "--skip-browser-install") {
      parsed.skipBrowserInstall = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      console.log([
        "Usage: node scripts/child-repo-e2e.mjs [options]",
        "",
        "Packs CodeDecay, installs it into an independent git repository, and proves",
        "real execution, browser, MCP, Action, differential, and repair-loop paths.",
        "",
        "Options:",
        "  --run-id <id>                 stable artifact directory name",
        "  --output-dir <path>           defaults to .codedecay/local/child-repo-e2e",
        "  --playwright-version <value>  defaults to 1.55.0",
        "  --skip-browser-install        reuse an already installed Chromium binary",
        "  -h, --help                    show this help"
      ].join("\n"));
      process.exit(0);
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return parsed;
}
