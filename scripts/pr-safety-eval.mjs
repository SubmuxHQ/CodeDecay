#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const options = parseArgs(process.argv.slice(2));
const runId = options.runId ?? new Date().toISOString().replaceAll(":", "-").replace(/\.\d{3}Z$/, "Z");
const outputRoot = resolve(repoRoot, options.outputDir ?? ".codedecay/local/evals");
const runDir = resolve(outputRoot, runId);
const reposDir = join(runDir, "repos");
const logsDir = join(runDir, "logs");
const reportsDir = join(runDir, "reports");
const usesDefaultCli = !options.cli;
const cliCommand = options.cli ? splitCommand(options.cli) : ["node", join(repoRoot, "packages/cli/dist/index.js")];

const evalReport = {
  schemaVersion: 1,
  tool: "CodeDecay PR safety efficacy eval",
  startedAt: new Date().toISOString(),
  finishedAt: undefined,
  status: "running",
  runId,
  runDir,
  repoRoot,
  cliCommand,
  scenarios: [],
  issues: []
};

const scenarios = [
  {
    id: "api-auth-weak-tests",
    title: "API/auth regression hidden by copied implementation tests",
    whyItMatters:
      "A coding agent can add tests that mirror the changed implementation while missing the real API authorization regression.",
    baselineFiles: {
      "package.json": JSON.stringify({ type: "module", scripts: { test: "node --test" } }, null, 2),
      "src/auth/session.js": [
        "export function canExportDiagnostics(session) {",
        "  if (!session?.userId) {",
        "    return false;",
        "  }",
        "",
        "  return session.role === \"admin\";",
        "}",
        "",
        "export function exportScope(session) {",
        "  return canExportDiagnostics(session) ? \"full\" : \"none\";",
        "}",
        ""
      ].join("\n"),
      "src/routes/export.js": [
        "import { canExportDiagnostics } from \"../auth/session.js\";",
        "",
        "export function exportDiagnostics(session, payload) {",
        "  if (!canExportDiagnostics(session)) {",
        "    return { status: 403, body: { error: \"forbidden\" } };",
        "  }",
        "",
        "  return { status: 200, body: { exported: true, deviceId: payload.deviceId } };",
        "}",
        ""
      ].join("\n"),
      "test/export.test.mjs": [
        "import { strictEqual } from \"node:assert\";",
        "import test from \"node:test\";",
        "import { exportDiagnostics } from \"../src/routes/export.js\";",
        "",
        "test(\"allows admins to export diagnostics\", () => {",
        "  const result = exportDiagnostics({ userId: \"u1\", role: \"admin\" }, { deviceId: \"imu-1\" });",
        "  strictEqual(result.status, 200);",
        "});",
        ""
      ].join("\n"),
      "scripts/probe-export.mjs": [
        "import { strictEqual } from \"node:assert\";",
        "import { exportDiagnostics } from \"../src/routes/export.js\";",
        "",
        "const result = exportDiagnostics({ userId: \"u2\", role: \"member\" }, { deviceId: \"imu-1\" });",
        "strictEqual(result.status, 403, \"member users must not export diagnostics\");",
        ""
      ].join("\n")
    },
    riskyFiles: {
      "src/auth/session.js": [
        "export function canExportDiagnostics(session) {",
        "  const hasUser = Boolean(session?.userId);",
        "  const hasAnyRole = Boolean(session?.role);",
        "  const safeMode = session?.flags?.includes(\"safe-mode\") ?? false;",
        "",
        "  return hasUser && (hasAnyRole || safeMode);",
        "}",
        "",
        "export function exportScope(session) {",
        "  return canExportDiagnostics(session) ? \"full\" : \"none\";",
        "}",
        ""
      ].join("\n"),
      "src/routes/export.js": [
        "import { canExportDiagnostics } from \"../auth/session.js\";",
        "",
        "export function exportDiagnostics(session, payload) {",
        "  if (!canExportDiagnostics(session)) {",
        "    return { status: 403, body: { error: \"forbidden\" } };",
        "  }",
        "",
        "  return { status: 200, body: { exported: true, deviceId: payload.deviceId, scope: \"full\" } };",
        "}",
        ""
      ].join("\n"),
      "test/export.test.mjs": [
        "import { strictEqual } from \"node:assert\";",
        "import test from \"node:test\";",
        "import { canExportDiagnostics } from \"../src/auth/session.js\";",
        "import { exportDiagnostics } from \"../src/routes/export.js\";",
        "",
        "function expectedCanExportDiagnostics(session) {",
        "  const hasUser = Boolean(session?.userId);",
        "  const hasAnyRole = Boolean(session?.role);",
        "  const safeMode = session?.flags?.includes(\"safe-mode\") ?? false;",
        "",
        "  return hasUser && (hasAnyRole || safeMode);",
        "}",
        "",
        "test(\"allows admins to export diagnostics\", () => {",
        "  const session = { userId: \"u1\", role: \"admin\" };",
        "  strictEqual(canExportDiagnostics(session), expectedCanExportDiagnostics(session));",
        "  strictEqual(exportDiagnostics(session, { deviceId: \"imu-1\" }).status, 200);",
        "});",
        ""
      ].join("\n")
    },
    weakTestCommand: ["node", "--test", "test/export.test.mjs"],
    probeCommand: ["node", "scripts/probe-export.mjs"],
    expected: {
      riskLevel: "high",
      impactedAreaKinds: ["api", "auth", "test"],
      findingRuleIds: [
        "risky-api-change",
        "risky-auth-change",
        "copied-implementation-in-test",
        "happy-path-only-test"
      ],
      redteamTestProofStatus: "weak",
      weakTestFindingsAtLeast: 1,
      missingTestFindingsAtLeast: 0
    }
  },
  {
    id: "config-db-runtime-regression",
    title: "Config/database runtime regression missed by normal tests",
    whyItMatters:
      "A PR can pass a narrow unit test while changing runtime defaults and database semantics that affect production behavior.",
    baselineFiles: {
      "package.json": JSON.stringify({ type: "module", scripts: { test: "node --test" } }, null, 2),
      "next.config.js": [
        "export function loadRuntimeConfig(env) {",
        "  if (!env.DATABASE_URL) {",
        "    throw new Error(\"DATABASE_URL is required\");",
        "  }",
        "",
        "  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 16) {",
        "    throw new Error(\"SESSION_SECRET must be at least 16 characters\");",
        "  }",
        "",
        "  return {",
        "    databaseUrl: env.DATABASE_URL,",
        "    sessionSecret: env.SESSION_SECRET,",
        "    requireSsl: env.NODE_ENV === \"production\"",
        "  };",
        "}",
        ""
      ].join("\n"),
      "src/db/schema.js": [
        "export const userDefaults = {",
        "  role: \"member\",",
        "  isActive: true",
        "};",
        "",
        "export function createUserRecord(input) {",
        "  return {",
        "    id: input.id,",
        "    email: input.email,",
        "    role: input.role ?? userDefaults.role,",
        "    isActive: input.isActive ?? userDefaults.isActive",
        "  };",
        "}",
        ""
      ].join("\n"),
      "test/config.test.mjs": [
        "import { strictEqual } from \"node:assert\";",
        "import test from \"node:test\";",
        "import { loadRuntimeConfig } from \"../next.config.js\";",
        "",
        "test(\"loads configured database url\", () => {",
        "  const config = loadRuntimeConfig({",
        "    DATABASE_URL: \"postgres://local\",",
        "    SESSION_SECRET: \"0123456789abcdef\",",
        "    NODE_ENV: \"test\"",
        "  });",
        "  strictEqual(config.databaseUrl, \"postgres://local\");",
        "});",
        ""
      ].join("\n"),
      "scripts/probe-runtime.mjs": [
        "import { strictEqual, throws } from \"node:assert\";",
        "import { loadRuntimeConfig } from \"../next.config.js\";",
        "import { createUserRecord } from \"../src/db/schema.js\";",
        "",
        "throws(() => loadRuntimeConfig({ DATABASE_URL: \"postgres://local\" }), /SESSION_SECRET/);",
        "strictEqual(createUserRecord({ id: \"u1\", email: \"a@example.com\" }).role, \"member\");",
        ""
      ].join("\n")
    },
    riskyFiles: {
      "next.config.js": [
        "export function loadRuntimeConfig(env) {",
        "  const databaseUrl = env.DATABASE_URL ?? \"postgres://localhost/dev\";",
        "  const sessionSecret = env.SESSION_SECRET ?? \"dev-secret\";",
        "",
        "  return {",
        "    databaseUrl,",
        "    sessionSecret,",
        "    requireSsl: false",
        "  };",
        "}",
        ""
      ].join("\n"),
      "src/db/schema.js": [
        "export const userDefaults = {",
        "  role: \"admin\",",
        "  isActive: true",
        "};",
        "",
        "export function createUserRecord(input) {",
        "  return {",
        "    id: input.id,",
        "    email: input.email,",
        "    role: input.role ?? userDefaults.role,",
        "    isActive: input.isActive ?? userDefaults.isActive",
        "  };",
        "}",
        ""
      ].join("\n")
    },
    weakTestCommand: ["node", "--test", "test/config.test.mjs"],
    probeCommand: ["node", "scripts/probe-runtime.mjs"],
    expected: {
      riskLevel: "high",
      impactedAreaKinds: ["config", "database"],
      findingRuleIds: ["risky-config-change", "risky-database-change", "missing-nearby-tests"],
      redteamTestProofStatus: "missing",
      weakTestFindingsAtLeast: 0,
      missingTestFindingsAtLeast: 1
    }
  }
];

main();

function main() {
  mkdirSync(reposDir, { recursive: true });
  mkdirSync(logsDir, { recursive: true });
  mkdirSync(reportsDir, { recursive: true });

  if (usesDefaultCli && !existsSync(cliCommand[1])) {
    failHarness(
      `CLI entrypoint not found: ${cliCommand.join(" ")}. Run pnpm build:packages or pass --cli "<command>".`
    );
  }

  try {
    for (const scenario of scenarios) {
      evalReport.scenarios.push(runScenario(scenario));
    }

    evalReport.status = evalReport.issues.length === 0 ? "passed" : "failed";
  } catch (error) {
    evalReport.status = "failed";
    evalReport.issues.push({
      severity: "error",
      title: "Benchmark crashed",
      detail: error instanceof Error ? error.stack ?? error.message : String(error)
    });
  } finally {
    evalReport.finishedAt = new Date().toISOString();
    writeJson(join(runDir, "summary.json"), evalReport);

    if (options.updateDocs) {
      writeDocsReport(evalReport);
    }

    printResult(evalReport);
  }

  process.exitCode = evalReport.status === "passed" ? 0 : 1;
}

function runScenario(scenario) {
  const scenarioDir = join(reposDir, scenario.id);
  const scenarioReportsDir = join(reportsDir, scenario.id);
  rmSync(scenarioDir, { recursive: true, force: true });
  mkdirSync(scenarioDir, { recursive: true });
  mkdirSync(scenarioReportsDir, { recursive: true });

  writeFiles(scenarioDir, scenario.baselineFiles);
  git(scenarioDir, ["init"]);
  git(scenarioDir, ["config", "user.email", "codedecay-eval@example.com"]);
  git(scenarioDir, ["config", "user.name", "CodeDecay Eval"]);
  git(scenarioDir, ["add", "."]);
  git(scenarioDir, ["commit", "-m", "baseline"]);
  const baseSha = git(scenarioDir, ["rev-parse", "HEAD"]).stdout.trim();

  const baselineTest = runLoggedCommand({
    id: `${scenario.id}-baseline-tests`,
    cwd: scenarioDir,
    command: scenario.weakTestCommand[0],
    args: scenario.weakTestCommand.slice(1),
    expectedExitCodes: [0]
  });
  const baselineProbe = runLoggedCommand({
    id: `${scenario.id}-baseline-probe`,
    cwd: scenarioDir,
    command: scenario.probeCommand[0],
    args: scenario.probeCommand.slice(1),
    expectedExitCodes: [0]
  });

  writeFiles(scenarioDir, scenario.riskyFiles);

  const riskyTest = runLoggedCommand({
    id: `${scenario.id}-risky-tests`,
    cwd: scenarioDir,
    command: scenario.weakTestCommand[0],
    args: scenario.weakTestCommand.slice(1),
    expectedExitCodes: [0]
  });
  const riskyProbe = runLoggedCommand({
    id: `${scenario.id}-risky-probe`,
    cwd: scenarioDir,
    command: scenario.probeCommand[0],
    args: scenario.probeCommand.slice(1),
    expectedExitCodes: [1]
  });

  runLoggedCommand({
    id: `${scenario.id}-codedecay-analyze`,
    cwd: scenarioDir,
    command: cliCommand[0],
    args: [
      ...cliCommand.slice(1),
      "analyze",
      "--cwd",
      scenarioDir,
      "--format",
      "json",
      "--output",
      join(scenarioReportsDir, "analyze.json")
    ],
    expectedExitCodes: [0]
  });

  runLoggedCommand({
    id: `${scenario.id}-codedecay-redteam`,
    cwd: scenarioDir,
    command: cliCommand[0],
    args: [
      ...cliCommand.slice(1),
      "redteam",
      "--cwd",
      scenarioDir,
      "--format",
      "json",
      "--output",
      join(scenarioReportsDir, "redteam.json")
    ],
    expectedExitCodes: [0]
  });

  const analysis = readJson(join(scenarioReportsDir, "analyze.json"));
  const redteam = readJson(join(scenarioReportsDir, "redteam.json"));
  const assertions = evaluateScenario(scenario, analysis, redteam, {
    baselineTest,
    baselineProbe,
    riskyTest,
    riskyProbe
  });
  const result = {
    id: scenario.id,
    title: scenario.title,
    whyItMatters: scenario.whyItMatters,
    status: assertions.every((assertion) => assertion.passed) ? "passed" : "failed",
    repo: scenarioDir,
    baseSha,
    reports: {
      analysis: join(scenarioReportsDir, "analyze.json"),
      redteam: join(scenarioReportsDir, "redteam.json")
    },
    commands: {
      baselineTest,
      baselineProbe,
      riskyTest,
      riskyProbe
    },
    codeDecay: {
      riskLevel: analysis.summary.riskLevel,
      mergeRiskScore: analysis.summary.mergeRiskScore,
      decayScore: analysis.summary.decayScore,
      findingRuleIds: uniqueSorted(analysis.findings.map((finding) => finding.ruleId)),
      impactedAreaKinds: uniqueSorted(analysis.impactedAreas.map((area) => area.kind)),
      impactedRoutes: analysis.impactedRoutes ?? [],
      recommendedTests: analysis.recommendedTests,
      testProofStatus: redteam.summary.testProofStatus,
      weakTestFindings: redteam.summary.weakTestFindings,
      missingTestFindings: redteam.summary.missingTestFindings,
      edgeCases: redteam.edgeCases,
      fixTasks: redteam.fixTasks
    },
    assertions
  };

  writeJson(join(scenarioReportsDir, "scenario-result.json"), result);

  for (const assertion of assertions) {
    if (!assertion.passed) {
      evalReport.issues.push({
        severity: "error",
        title: `${scenario.id}: ${assertion.name}`,
        detail: assertion.detail
      });
    }
  }

  return result;
}

function evaluateScenario(scenario, analysis, redteam, commands) {
  return [
    assertCondition({
      name: "baseline tests pass",
      passed: commands.baselineTest.exitCode === 0,
      detail: "The baseline fixture should start from passing tests."
    }),
    assertCondition({
      name: "baseline behavior probe passes",
      passed: commands.baselineProbe.exitCode === 0,
      detail: "The baseline behavior probe should encode the intended behavior."
    }),
    assertCondition({
      name: "risky weak tests still pass",
      passed: commands.riskyTest.exitCode === 0,
      detail: "The risky change should demonstrate tests that pass while missing the regression."
    }),
    assertCondition({
      name: "risky behavior probe catches regression",
      passed: commands.riskyProbe.exitCode !== 0,
      detail: "The real behavior probe must fail on the seeded regression."
    }),
    assertCondition({
      name: "CodeDecay reports high risk",
      passed: analysis.summary.riskLevel === scenario.expected.riskLevel,
      detail: `Expected ${scenario.expected.riskLevel}, got ${analysis.summary.riskLevel}.`
    }),
    assertIncludesAll({
      name: "CodeDecay reports expected impacted areas",
      actual: analysis.impactedAreas.map((area) => area.kind),
      expected: scenario.expected.impactedAreaKinds
    }),
    assertIncludesAll({
      name: "CodeDecay reports expected finding rules",
      actual: analysis.findings.map((finding) => finding.ruleId),
      expected: scenario.expected.findingRuleIds
    }),
    assertCondition({
      name: "Redteam report classifies test proof correctly",
      passed: redteam.summary.testProofStatus === scenario.expected.redteamTestProofStatus,
      detail: `Expected ${scenario.expected.redteamTestProofStatus}, got ${redteam.summary.testProofStatus}.`
    }),
    assertCondition({
      name: "Redteam report contains expected weak-test evidence",
      passed: redteam.summary.weakTestFindings >= scenario.expected.weakTestFindingsAtLeast,
      detail: `Expected at least ${scenario.expected.weakTestFindingsAtLeast}, got ${redteam.summary.weakTestFindings}.`
    }),
    assertCondition({
      name: "Redteam report contains expected missing-test evidence",
      passed: redteam.summary.missingTestFindings >= scenario.expected.missingTestFindingsAtLeast,
      detail: `Expected at least ${scenario.expected.missingTestFindingsAtLeast}, got ${redteam.summary.missingTestFindings}.`
    }),
    assertCondition({
      name: "Redteam report suggests edge cases",
      passed: Array.isArray(redteam.edgeCases) && redteam.edgeCases.length > 0,
      detail: "Expected deterministic edge cases for impacted areas."
    }),
    assertCondition({
      name: "Redteam edge cases are actionable",
      passed: redteam.edgeCases.every((edgeCase) => !isBarePathOnly(edgeCase) && hasActionVerb(edgeCase)),
      detail: "Expected edge cases to describe behavior to run, verify, exercise, check, add, or strengthen."
    }),
    assertCondition({
      name: "Redteam report creates fix tasks",
      passed: Array.isArray(redteam.fixTasks) && redteam.fixTasks.length > 0,
      detail: "Expected fix tasks that a user-owned agent can act on."
    }),
    assertCondition({
      name: "Redteam fix tasks are actionable",
      passed: redteam.fixTasks
        .filter((task) => task.source === "edge-case")
        .every((task) => task.title !== "Add or run an edge-case check" && hasActionVerb(task.detail)),
      detail: "Expected edge-case fix tasks to have specific titles and action-oriented details."
    })
  ];
}

function isBarePathOnly(value) {
  return /^[a-z0-9._/-]+\.[a-z0-9]+$/i.test(value.trim()) && !/\s/.test(value.trim()) && /[/\\]/.test(value);
}

function hasActionVerb(value) {
  return /\b(add|check|exercise|run|verify|strengthen|replace|confirm)\b/i.test(value);
}

function assertIncludesAll({ name, actual, expected }) {
  const actualSet = new Set(actual);
  const missing = expected.filter((value) => !actualSet.has(value));

  return assertCondition({
    name,
    passed: missing.length === 0,
    detail: missing.length === 0 ? "All expected values were present." : `Missing: ${missing.join(", ")}. Actual: ${uniqueSorted(actual).join(", ")}.`
  });
}

function assertCondition({ name, passed, detail }) {
  return { name, passed, detail };
}

function writeFiles(root, files) {
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = join(root, relativePath);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, content, "utf8");
  }
}

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed in ${cwd}\n${result.stderr}`);
  }

  return result;
}

function runLoggedCommand({ id, cwd, command, args, expectedExitCodes }) {
  const startedAt = Date.now();
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  const durationMs = Date.now() - startedAt;
  const exitCode = typeof result.status === "number" ? result.status : 1;
  const record = {
    id,
    cwd,
    command: [command, ...args].join(" "),
    exitCode,
    expectedExitCodes,
    passed: expectedExitCodes.includes(exitCode),
    durationMs,
    stdoutLog: join(logsDir, `${id}.stdout.log`),
    stderrLog: join(logsDir, `${id}.stderr.log`)
  };

  writeFileSync(record.stdoutLog, result.stdout ?? "", "utf8");
  writeFileSync(record.stderrLog, result.stderr ?? "", "utf8");

  if (!record.passed) {
    evalReport.issues.push({
      severity: "error",
      title: `${id} exited ${exitCode}`,
      detail: `Expected ${expectedExitCodes.join(", ")}. See ${record.stderrLog}.`
    });
  }

  return record;
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeDocsReport(report) {
  const target = join(repoRoot, "docs/evals/first-efficacy-report.md");
  const lines = [
    "# First PR Safety Efficacy Benchmark",
    "",
    "This benchmark is a small, deterministic proof that CodeDecay can catch seeded PR risks that ordinary passing tests miss.",
    "",
    "It is not a claim that CodeDecay makes every PR safe. It is a regression harness for the product promise: find what a coding agent may have missed before merge.",
    "",
    "## How to run",
    "",
    "```bash",
    "pnpm eval:pr-safety -- --run-id local-pr-safety-eval",
    "```",
    "",
    "Artifacts are written under `.codedecay/local/evals/<run-id>/`.",
    "",
    "## Current benchmark result",
    "",
    `- Status: ${report.status}`,
    `- Scenarios: ${report.scenarios.length}`,
    `- Issues: ${report.issues.length}`,
    "",
    "## Scenarios",
    ""
  ];

  for (const scenario of report.scenarios) {
    lines.push(`### ${scenario.title}`, "");
    lines.push(scenario.whyItMatters, "");
    lines.push("| Signal | Result |");
    lines.push("| --- | --- |");
    lines.push(`| Scenario status | ${scenario.status} |`);
    lines.push(`| Baseline tests | exit ${scenario.commands.baselineTest.exitCode} |`);
    lines.push(`| Baseline behavior probe | exit ${scenario.commands.baselineProbe.exitCode} |`);
    lines.push(`| Risky weak tests | exit ${scenario.commands.riskyTest.exitCode} |`);
    lines.push(`| Risky behavior probe | exit ${scenario.commands.riskyProbe.exitCode} |`);
    lines.push(`| CodeDecay risk | ${scenario.codeDecay.riskLevel} (${scenario.codeDecay.mergeRiskScore}/100 merge, ${scenario.codeDecay.decayScore}/100 decay) |`);
    lines.push(`| Test proof status | ${scenario.codeDecay.testProofStatus} |`);
    lines.push(`| Weak-test findings | ${scenario.codeDecay.weakTestFindings} |`);
    lines.push(`| Missing-test findings | ${scenario.codeDecay.missingTestFindings} |`);
    lines.push("", "Expected evidence:", "");
    for (const assertion of scenario.assertions) {
      lines.push(`- ${assertion.passed ? "Pass" : "Fail"}: ${assertion.name}`);
    }
    lines.push("");
  }

  lines.push(
    "## Safety boundaries",
    "",
    "- No telemetry.",
    "- No cloud dependency.",
    "- No API keys.",
    "- No LLM/model calls.",
    "- Fixtures run inside local temporary git repositories.",
    "",
    "The benchmark uses deterministic CodeDecay reports plus explicit behavior probes. AI or agent suggestions should be evaluated separately from this tool evidence.",
    ""
  );

  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${lines.join("\n").trim()}\n`, "utf8");
}

function printResult(report) {
  const passedScenarios = report.scenarios.filter((scenario) => scenario.status === "passed").length;
  console.log(`CodeDecay PR safety eval: ${report.status}`);
  console.log(`Run directory: ${runDir}`);
  console.log(`Scenarios: ${passedScenarios}/${report.scenarios.length} passed`);

  if (report.issues.length > 0) {
    console.log("Issues:");
    for (const issue of report.issues) {
      console.log(`- ${issue.title}: ${issue.detail}`);
    }
  }
}

function parseArgs(args) {
  const parsed = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") {
      continue;
    }
    if (arg === "--output-dir") {
      parsed.outputDir = readValue(args, ++index, arg);
      continue;
    }
    if (arg?.startsWith("--output-dir=")) {
      parsed.outputDir = arg.slice("--output-dir=".length);
      continue;
    }
    if (arg === "--run-id") {
      parsed.runId = readValue(args, ++index, arg);
      continue;
    }
    if (arg?.startsWith("--run-id=")) {
      parsed.runId = arg.slice("--run-id=".length);
      continue;
    }
    if (arg === "--cli") {
      parsed.cli = readValue(args, ++index, arg);
      continue;
    }
    if (arg?.startsWith("--cli=")) {
      parsed.cli = arg.slice("--cli=".length);
      continue;
    }
    if (arg === "--update-docs") {
      parsed.updateDocs = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      console.log(
        [
          "Usage: node scripts/pr-safety-eval.mjs [options]",
          "",
          "Options:",
          "  --output-dir <path>  output directory, defaults to .codedecay/local/evals",
          "  --run-id <id>        stable run id for artifact paths",
          "  --cli <command>      CodeDecay CLI command, defaults to packages/cli/dist/index.js",
          "  --update-docs        update docs/evals/first-efficacy-report.md from this run",
          "  -h, --help           show this help"
        ].join("\n")
      );
      process.exit(0);
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  return parsed;
}

function readValue(args, index, flag) {
  const value = args[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`Expected value after ${flag}`);
  }

  return value;
}

function splitCommand(command) {
  return command.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((part) => part.replace(/^"|"$/g, "")) ?? [command];
}

function failHarness(message) {
  evalReport.status = "failed";
  evalReport.issues.push({ severity: "error", title: "Harness setup failed", detail: message });
  writeJson(join(runDir, "summary.json"), evalReport);
  console.error(message);
  process.exit(2);
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
