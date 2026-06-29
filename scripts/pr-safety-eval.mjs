#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRunId, readOptionValue, splitCommand } from "./lib/args.mjs";
import { readJsonFile, resetDir, writeFiles, writeJsonFile } from "./lib/files.mjs";
import { initFixtureGitRepo } from "./lib/git.mjs";
import { runCommand } from "./lib/process.mjs";
import { scenarios } from "./fixtures/pr-safety-eval/scenarios.mjs";
import { writePrSafetyDocsReport } from "./fixtures/pr-safety-eval/docs-report.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const options = parseArgs(process.argv.slice(2));
const runId = options.runId ?? createRunId();
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
    writeJsonFile(join(runDir, "summary.json"), evalReport);

    if (options.updateDocs) {
      writePrSafetyDocsReport(repoRoot, evalReport);
    }

    printResult(evalReport);
  }

  process.exitCode = evalReport.status === "passed" ? 0 : 1;
}

function runScenario(scenario) {
  const scenarioDir = join(reposDir, scenario.id);
  const scenarioReportsDir = join(reportsDir, scenario.id);
  resetDir(scenarioDir);
  mkdirSync(scenarioReportsDir, { recursive: true });

  writeFiles(scenarioDir, scenario.baselineFiles);
  const baseSha = initFixtureGitRepo(scenarioDir, {
    initialBranch: null,
    userEmail: "codedecay-eval@example.com",
    userName: "CodeDecay Eval"
  });

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

  const analysis = readJsonFile(join(scenarioReportsDir, "analyze.json"));
  const redteam = readJsonFile(join(scenarioReportsDir, "redteam.json"));
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

  writeJsonFile(join(scenarioReportsDir, "scenario-result.json"), result);

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

function runLoggedCommand({ id, cwd, command, args, expectedExitCodes }) {
  const { durationMs, exitCode, stdout, stderr } = runCommand(command, args, { cwd });
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

  writeFileSync(record.stdoutLog, stdout, "utf8");
  writeFileSync(record.stderrLog, stderr, "utf8");

  if (!record.passed) {
    evalReport.issues.push({
      severity: "error",
      title: `${id} exited ${exitCode}`,
      detail: `Expected ${expectedExitCodes.join(", ")}. See ${record.stderrLog}.`
    });
  }

  return record;
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
      parsed.outputDir = readOptionValue(args, ++index, arg);
      continue;
    }
    if (arg?.startsWith("--output-dir=")) {
      parsed.outputDir = arg.slice("--output-dir=".length);
      continue;
    }
    if (arg === "--run-id") {
      parsed.runId = readOptionValue(args, ++index, arg);
      continue;
    }
    if (arg?.startsWith("--run-id=")) {
      parsed.runId = arg.slice("--run-id=".length);
      continue;
    }
    if (arg === "--cli") {
      parsed.cli = readOptionValue(args, ++index, arg);
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

function failHarness(message) {
  evalReport.status = "failed";
  evalReport.issues.push({ severity: "error", title: "Harness setup failed", detail: message });
  writeJsonFile(join(runDir, "summary.json"), evalReport);
  console.error(message);
  process.exit(2);
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
