#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const CLI_PATH = join(REPO_ROOT, "packages/cli/dist/index.js");
const DEFAULT_NODE_PACKAGES = [
  "@playwright/test",
  "@pact-foundation/pact",
  "@stryker-mutator/core",
  "c8"
];
const DEFAULT_SEMGREP_VERSION = "1.136.0";
const DEFAULT_SCHEMATHESIS_VERSION = "4.4.4";

async function main() {
  const args = normalizeArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  if (!existsSync(CLI_PATH)) {
    throw new Error(`Built CLI not found at ${CLI_PATH}. Run pnpm build:packages first.`);
  }

  const workspace = mkdtempSync(join(tmpdir(), "codedecay-real-oss-adapters-"));
  const fixture = join(workspace, "fixture");
  const semgrepVenv = join(workspace, "venv-semgrep");
  const schemathesisVenv = join(workspace, "venv-schemathesis");
  const python = process.env.PYTHON ?? "python3";
  const nodePackages = parsePackageList(process.env.CODEDECAY_REAL_OSS_NODE_PACKAGES) ?? DEFAULT_NODE_PACKAGES;
  const semgrepVersion = process.env.CODEDECAY_REAL_OSS_SEMGREP_VERSION ?? DEFAULT_SEMGREP_VERSION;
  const schemathesisVersion = process.env.CODEDECAY_REAL_OSS_SCHEMATHESIS_VERSION ?? DEFAULT_SCHEMATHESIS_VERSION;

  try {
    log(`workspace: ${workspace}`);
    createFixtureRepo(fixture);

    installNodeTools(fixture, nodePackages);
    installPythonTool(python, semgrepVenv, `semgrep==${semgrepVersion}`);
    installPythonTool(python, schemathesisVenv, `schemathesis==${schemathesisVersion}`);

    writeToolPathModule(fixture, {
      semgrepBin: existingExecutablePath(semgrepVenv, ["semgrep"]),
      schemathesisBin: existingExecutablePath(schemathesisVenv, ["st", "schemathesis"])
    });

    setFixtureMode(fixture, "weak");
    const weak = runExecute(fixture, { expectExitCode: 1 });
    assertAdapterStatus(weak.report, "stryker", "failed");
    assertEvidenceIncludes(weak.report, "stryker", "surviving or no-coverage mutant");
    assertAdapterStatus(weak.report, "schemathesis", "failed");
    assertEvidenceKind(weak.report, "schemathesis", "api-fuzz", "high");
    for (const adapter of ["playwright", "pact", "semgrep", "coverage"]) {
      assertAdapterStatus(weak.report, adapter, "passed");
    }

    setFixtureMode(fixture, "strong");
    const strong = runExecute(fixture, { expectExitCode: 0 });
    if (strong.report.summary.status !== "passed") {
      throw new Error(`Expected strengthened fixture summary status passed, got ${strong.report.summary.status}.`);
    }
    for (const adapter of ["playwright", "stryker", "schemathesis", "pact", "semgrep", "coverage"]) {
      assertAdapterStatus(strong.report, adapter, "passed");
    }

    const summary = {
      workspace,
      fixture,
      nodePackages,
      pythonTools: {
        semgrep: semgrepVersion,
        schemathesis: schemathesisVersion
      },
      weak: compactReportSummary(weak.report),
      strong: compactReportSummary(strong.report)
    };

    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } finally {
    if (args.keepTemp) {
      log(`kept workspace: ${workspace}`);
    } else {
      rmSync(workspace, { recursive: true, force: true });
    }
  }
}

function printHelp() {
  process.stdout.write(
    [
      "Usage: node scripts/real-oss-adapter-e2e.mjs [--keep-temp]",
      "",
      "Creates a disposable repo, installs real OSS adapter tools, and runs:",
      "- Playwright",
      "- StrykerJS",
      "- Schemathesis",
      "- Pact",
      "- Semgrep",
      "- c8/Istanbul coverage",
      "",
      "The harness first verifies failing mutation/API-fuzz evidence, then",
      "strengthens the fixture and verifies all adapters pass.",
      "",
      "This is opt-in because it downloads packages and creates Python virtualenvs.",
      "",
      "Environment overrides:",
      "- PYTHON=python3.12",
      "- CODEDECAY_REAL_OSS_NODE_PACKAGES='@playwright/test @pact-foundation/pact @stryker-mutator/core c8'",
      "- CODEDECAY_REAL_OSS_SEMGREP_VERSION=1.136.0",
      "- CODEDECAY_REAL_OSS_SCHEMATHESIS_VERSION=4.4.4",
      ""
    ].join("\n")
  );
}

function normalizeArgs(rawArgs) {
  const args = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;
  return {
    help: args.includes("--help") || args.includes("-h"),
    keepTemp: args.includes("--keep-temp")
  };
}

function createFixtureRepo(root) {
  mkdirSync(root, { recursive: true });
  write(root, "package.json", JSON.stringify(createFixturePackageJson(), null, 2));
  write(root, "src/math.mjs", [
    "export function isPositive(value) {",
    "  return value >= 0;",
    "}",
    ""
  ].join("\n"));
  write(root, "test/math.test.mjs", [
    "import assert from 'node:assert/strict';",
    "import { readFileSync } from 'node:fs';",
    "import { isPositive } from '../src/math.mjs';",
    "",
    "const mode = readFileSync('.codedecay/local/real-oss-mode.txt', 'utf8').trim();",
    "assert.equal(isPositive(1), true);",
    "if (mode === 'strong') {",
    "  assert.equal(isPositive(0), true);",
    "  assert.equal(isPositive(-1), false);",
    "}",
    ""
  ].join("\n"));
  write(root, "tests/playwright.spec.mjs", [
    "import { test, expect } from '@playwright/test';",
    "import { isPositive } from '../src/math.mjs';",
    "",
    "test('real Playwright runner reaches fixture code', async () => {",
    "  expect(isPositive(1)).toBe(true);",
    "});",
    ""
  ].join("\n"));
  write(root, "stryker.conf.mjs", [
    "export default {",
    "  mutate: ['src/math.mjs'],",
    "  testRunner: 'command',",
    "  commandRunner: { command: 'node test/math.test.mjs' },",
    "  reporters: ['json'],",
    "  jsonReporter: { fileName: 'reports/mutation/mutation.json' },",
    "  coverageAnalysis: 'off',",
    "  thresholds: { high: 100, low: 0, break: 0 }",
    "};",
    ""
  ].join("\n"));
  write(root, "docs/openapi.yaml", [
    "openapi: 3.1.0",
    "info:",
    "  title: CodeDecay Real OSS Adapter Fixture",
    "  version: 1.0.0",
    "paths:",
    "  /health:",
    "    get:",
    "      responses:",
    "        '200':",
    "          description: healthy",
    "          content:",
    "            application/json:",
    "              schema:",
    "                type: object",
    "                required: [ok]",
    "                properties:",
    "                  ok:",
    "                    type: boolean",
    ""
  ].join("\n"));
  write(root, ".semgrep.yml", [
    "rules:",
    "  - id: no-eval-real-oss-fixture",
    "    message: Avoid eval in the real OSS adapter fixture.",
    "    languages: [javascript]",
    "    severity: WARNING",
    "    pattern: eval(...)",
    ""
  ].join("\n"));
  write(root, "scripts/pact-smoke.mjs", [
    "const pact = await import('@pact-foundation/pact');",
    "const matchers = pact.MatchersV3 ?? pact.default?.MatchersV3;",
    "if (!matchers || typeof matchers.like !== 'function') {",
    "  throw new Error('Pact MatchersV3.like was not available.');",
    "}",
    "matchers.like({ ok: true });",
    "console.log('pact package smoke passed');",
    ""
  ].join("\n"));
  write(root, "scripts/run-semgrep.mjs", [
    "import { spawnSync } from 'node:child_process';",
    "import { mkdirSync, writeFileSync } from 'node:fs';",
    "import { semgrepBin } from './tool-paths.mjs';",
    "",
    "const result = spawnSync(semgrepBin, [",
    "  'scan',",
    "  '--config', '.semgrep.yml',",
    "  '--json',",
    "  '--metrics=off',",
    "  '--disable-version-check',",
    "  '--no-git-ignore'",
    "], { encoding: 'utf8' });",
    "mkdirSync('reports', { recursive: true });",
    "writeFileSync('reports/semgrep.json', result.stdout ?? '', 'utf8');",
    "process.stdout.write(result.stdout ?? '');",
    "process.stderr.write(result.stderr ?? '');",
    "process.exit(result.status ?? 1);",
    ""
  ].join("\n"));
  write(root, "scripts/run-schemathesis.mjs", [
    "import { spawn } from 'node:child_process';",
    "import { readFileSync } from 'node:fs';",
    "import { createServer } from 'node:http';",
    "import { once } from 'node:events';",
    "import { schemathesisBin } from './tool-paths.mjs';",
    "",
    "const mode = readFileSync('.codedecay/local/real-oss-mode.txt', 'utf8').trim();",
    "const server = createServer((request, response) => {",
    "  const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;",
    "  if (pathname === '/health' && request.method === 'GET') {",
    "    if (mode === 'weak') {",
    "      response.writeHead(500, { 'content-type': 'application/json' });",
    "      response.end(JSON.stringify({ error: 'weak fixture' }));",
    "      return;",
    "    }",
    "    response.writeHead(200, { 'content-type': 'application/json' });",
    "    response.end(JSON.stringify({ ok: true }));",
    "    return;",
    "  }",
    "  response.writeHead(405, { allow: 'GET' });",
    "  response.end();",
    "});",
    "",
    "server.listen(0, '127.0.0.1');",
    "await once(server, 'listening');",
    "const address = server.address();",
    "const origin = `http://127.0.0.1:${address.port}`;",
    "try {",
    "  const result = await runSchemathesis([",
    "    'run', 'docs/openapi.yaml',",
    "    '--url', origin,",
    "    '--phases', 'fuzzing',",
    "    '--checks', 'status_code_conformance,response_schema_conformance',",
    "    '--max-examples', '1',",
    "    '--max-failures', '1',",
    "    '--request-timeout', '3',",
    "    '--generation-deterministic',",
    "    '--generation-allow-x00=false'",
    "  ]);",
    "  process.exitCode = result;",
    "} finally {",
    "  server.close();",
    "}",
    "",
    "function runSchemathesis(args) {",
    "  return new Promise((resolve, reject) => {",
    "    const child = spawn(schemathesisBin, args, { stdio: ['ignore', 'pipe', 'pipe'] });",
    "    child.stdout.on('data', (chunk) => process.stdout.write(chunk));",
    "    child.stderr.on('data', (chunk) => process.stderr.write(chunk));",
    "    child.on('error', reject);",
    "    child.on('close', (code) => resolve(code ?? 1));",
    "  });",
    "}",
    ""
  ].join("\n"));
  write(root, ".codedecay/config.yml", createCodeDecayConfig());
}

function createFixturePackageJson() {
  return {
    private: true,
    type: "module",
    scripts: {
      "test:unit": "node test/math.test.mjs",
      "test:coverage": "c8 --reporter=lcov --report-dir coverage node test/math.test.mjs",
      "test:mutation": "stryker run",
      "test:pact": "node scripts/pact-smoke.mjs",
      "test:playwright": "playwright test --reporter=list"
    }
  };
}

function createCodeDecayConfig() {
  return [
    "version: 1",
    "commands: {}",
    "probes: []",
    "toolAdapters:",
    "  playwright:",
    "    command: npm run test:playwright",
    "    timeoutMs: 120000",
    "  stryker:",
    "    command: npm run test:mutation",
    "    reportPath: reports/mutation/mutation.json",
    "    timeoutMs: 300000",
    "  schemathesis:",
    "    command: node scripts/run-schemathesis.mjs",
    "    timeoutMs: 300000",
    "  pact:",
    "    command: npm run test:pact",
    "    timeoutMs: 120000",
    "  semgrep:",
    "    command: node scripts/run-semgrep.mjs",
    "    reportPath: reports/semgrep.json",
    "    failOnSeverity: high",
    "    timeoutMs: 120000",
    "  coverage:",
    "    command: npm run test:coverage",
    "    reportPaths:",
    "      - coverage/lcov.info",
    "    failOn: uncovered",
    "    timeoutMs: 120000",
    "safety:",
    "  allowCommands: true",
    "  commandTimeoutMs: 300000",
    ""
  ].join("\n");
}

function installNodeTools(cwd, packages) {
  log(`installing Node tools: ${packages.join(" ")}`);
  run("npm", ["install", "--no-audit", "--no-fund", "--save-dev", ...packages], { cwd });
}

function installPythonTool(python, venvPath, requirement) {
  log(`creating Python venv for ${requirement}`);
  run(python, ["-m", "venv", venvPath], { cwd: REPO_ROOT });
  const venvPython = executablePath(venvPath, "python");
  run(venvPython, ["-m", "pip", "install", "--upgrade", "pip"], { cwd: REPO_ROOT });
  run(venvPython, ["-m", "pip", "install", requirement], { cwd: REPO_ROOT });
}

function runExecute(cwd, { expectExitCode }) {
  log(`running codedecay execute in ${readFixtureMode(cwd)} mode`);
  const result = spawnSync("node", [CLI_PATH, "execute", "--cwd", cwd, "--format", "json"], {
    cwd,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024
  });

  if (result.status !== expectExitCode) {
    throw new Error(
      [
        `Expected codedecay execute exit ${expectExitCode}, got ${result.status}.`,
        "stdout:",
        result.stdout,
        "stderr:",
        result.stderr
      ].join("\n")
    );
  }

  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`Could not parse codedecay execute JSON stdout: ${error.message}\n${result.stdout}`);
  }

  return { result, report };
}

function run(command, args, options) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    stdio: "inherit",
    env: {
      ...process.env,
      CI: process.env.CI ?? "1"
    }
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit ${result.status}.`);
  }
}

function setFixtureMode(root, mode) {
  write(root, ".codedecay/local/real-oss-mode.txt", `${mode}\n`);
}

function readFixtureMode(root) {
  const modePath = join(root, ".codedecay/local/real-oss-mode.txt");
  return existsSync(modePath)
    ? readFileSync(modePath, "utf8").trim()
    : "unconfigured";
}

function writeToolPathModule(root, paths) {
  write(root, "scripts/tool-paths.mjs", [
    `export const semgrepBin = ${JSON.stringify(paths.semgrepBin)};`,
    `export const schemathesisBin = ${JSON.stringify(paths.schemathesisBin)};`,
    ""
  ].join("\n"));
}

function assertAdapterStatus(report, kind, expectedStatus) {
  const adapter = findAdapter(report, kind);
  if (adapter.status !== expectedStatus) {
    throw new Error(`Expected ${kind} status ${expectedStatus}, got ${adapter.status}.`);
  }
}

function assertEvidenceIncludes(report, kind, text) {
  const adapter = findAdapter(report, kind);
  const found = adapter.evidence?.some((item) => item.summary?.includes(text));
  if (!found) {
    throw new Error(`Expected ${kind} evidence summary to include ${JSON.stringify(text)}.`);
  }
}

function assertEvidenceKind(report, kind, evidenceKind, severity) {
  const adapter = findAdapter(report, kind);
  const found = adapter.evidence?.some((item) => item.kind === evidenceKind && item.severity === severity);
  if (!found) {
    throw new Error(`Expected ${kind} evidence kind ${evidenceKind} with severity ${severity}.`);
  }
}

function findAdapter(report, kind) {
  const adapter = report.toolAdapters?.find((item) => item.kind === kind);
  if (!adapter) {
    throw new Error(`Missing ${kind} adapter result.`);
  }
  return adapter;
}

function compactReportSummary(report) {
  return {
    status: report.summary.status,
    total: report.summary.total,
    passed: report.summary.passed,
    failed: report.summary.failed,
    adapters: Object.fromEntries(report.toolAdapters.map((adapter) => [adapter.kind, adapter.status]))
  };
}

function parsePackageList(value) {
  if (!value?.trim()) {
    return undefined;
  }

  return value.split(/\s+/).filter(Boolean);
}

function executablePath(venvPath, name) {
  if (process.platform === "win32") {
    const suffix = name === "python" ? ".exe" : ".exe";
    return join(venvPath, "Scripts", `${name}${suffix}`);
  }

  return join(venvPath, "bin", name);
}

function existingExecutablePath(venvPath, names) {
  for (const name of names) {
    const candidate = executablePath(venvPath, name);
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`None of these executables were found in ${venvPath}: ${names.join(", ")}`);
}

function write(root, path, contents) {
  const fullPath = join(root, path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, contents, "utf8");
}

function log(message) {
  process.stderr.write(`[real-oss-adapters] ${message}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
