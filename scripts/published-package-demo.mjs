#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRunId, readOptionValue } from "./lib/args.mjs";
import { readJsonFile, readTextIfExists, resetDir, sha256, writeJsonFile } from "./lib/files.mjs";
import { runCommand } from "./lib/process.mjs";
import {
  installPackageCommandSpecs,
  installedCliCommandSpecs,
  nextExampleCommandSpecs,
  nodeApiExampleCommandSpecs,
  prepareExampleRepoCommandSpecs
} from "./fixtures/published-package-demo/command-specs.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const options = parseArgs(process.argv.slice(2));
const runId = options.runId ?? createRunId();
const outputRoot = resolve(repoRoot, options.outputDir ?? ".codedecay/local/published-package-demo");
const runDir = resolve(outputRoot, runId);
const logsDir = join(runDir, "logs");
const workDir = join(runDir, "work");
const toolInstallDir = join(runDir, "tool-install");
const packageSource = resolvePackageSource(options);
const packageManagerEnv = {
  ...process.env,
  npm_config_audit: "false",
  npm_config_fund: "false"
};

const runLog = {
  schemaVersion: 1,
  tool: "CodeDecay published package demo harness",
  startedAt: new Date().toISOString(),
  finishedAt: undefined,
  status: "running",
  repoRoot,
  runId,
  runDir,
  packageSource,
  commands: [],
  issues: [],
  artifacts: {}
};

main();

function main() {
  resetDir(runDir);
  mkdirSync(logsDir, { recursive: true });
  mkdirSync(workDir, { recursive: true });
  mkdirSync(toolInstallDir, { recursive: true });

  try {
    const codedecayBin = installPackage();
    const nextRepo = prepareExampleRepo("nextjs-risk-demo", "Next.js example");
    const nodeApiRepo = prepareExampleRepo("node-api-risk-demo", "Node API example");

    runLog.artifacts = {
      toolInstallDir,
      nextRepo,
      nodeApiRepo,
      summaryJson: join(runDir, "summary.json"),
      summaryMarkdown: join(runDir, "summary.md")
    };
    writeRunLog();

    runInstalledCliChecks(codedecayBin);
    runNextExampleChecks(codedecayBin, nextRepo);
    runNodeApiExampleChecks(codedecayBin, nodeApiRepo);
    assertDemoOutputs(nextRepo, nodeApiRepo);

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

function installPackage() {
  for (const commandSpec of installPackageCommandSpecs({ packageSource, toolInstallDir })) {
    recordCommand(commandSpec);
  }

  const binaryName = process.platform === "win32" ? "codedecay.cmd" : "codedecay";
  const codedecayBin = join(toolInstallDir, "node_modules", ".bin", binaryName);
  if (!existsSync(codedecayBin)) {
    throw new Error(`Installed CodeDecay binary was not found: ${codedecayBin}`);
  }

  return codedecayBin;
}

function prepareExampleRepo(exampleName, commitLabel) {
  const sourceDir = join(repoRoot, "examples", exampleName);
  const targetDir = join(workDir, exampleName);

  cpSync(sourceDir, targetDir, { recursive: true });
  for (const commandSpec of prepareExampleRepoCommandSpecs({ commitLabel, exampleName, targetDir })) {
    recordCommand(commandSpec);
  }

  mkdirSync(join(targetDir, "codedecay-output"), { recursive: true });
  return targetDir;
}

function runInstalledCliChecks(codedecayBin) {
  for (const commandSpec of installedCliCommandSpecs({ codedecayBin, toolInstallDir })) {
    recordCommand(commandSpec);
  }
}

function runNextExampleChecks(codedecayBin, repoDir) {
  for (const commandSpec of nextExampleCommandSpecs({ codedecayBin, repoDir })) {
    recordCommand(commandSpec);
  }
}

function runNodeApiExampleChecks(codedecayBin, repoDir) {
  for (const commandSpec of nodeApiExampleCommandSpecs({ codedecayBin, repoDir })) {
    recordCommand(commandSpec);
  }
}

function assertDemoOutputs(nextRepo, nodeApiRepo) {
  const nextAnalyze = readJsonFile(join(nextRepo, "codedecay-output", "analyze.json"));
  const nodeAnalyze = readJsonFile(join(nodeApiRepo, "codedecay-output", "analyze.json"));
  const nextSarif = readJsonFile(join(nextRepo, "codedecay-output", "analyze.sarif"));
  const nodeSarif = readJsonFile(join(nodeApiRepo, "codedecay-output", "analyze.sarif"));
  const nodeExecute = readJsonFile(join(nodeApiRepo, "codedecay-output", "execute.json"));

  assertCondition("Next.js demo should be high risk.", nextAnalyze.summary?.riskLevel === "high");
  assertCondition("Node API demo should be high risk.", nodeAnalyze.summary?.riskLevel === "high");
  assertCondition("Next.js SARIF should have one run.", Array.isArray(nextSarif.runs) && nextSarif.runs.length === 1);
  assertCondition("Node API SARIF should have one run.", Array.isArray(nodeSarif.runs) && nodeSarif.runs.length === 1);
  assertCondition("Node API execute should fail because the demo contract check catches the risky change.", nodeExecute.summary?.status === "failed");
}

function recordCommand(commandSpec) {
  const { startedAt, finishedAt, exitCode, stdout, stderr } = runCommand(commandSpec.command, commandSpec.args, {
    cwd: commandSpec.cwd,
    env: packageManagerEnv,
    maxBuffer: 10 * 1024 * 1024
  });
  const stdoutPath = join(logsDir, `${commandSpec.id}.stdout.txt`);
  const stderrPath = join(logsDir, `${commandSpec.id}.stderr.txt`);

  writeFileSync(stdoutPath, stdout, "utf8");
  writeFileSync(stderrPath, stderr, "utf8");

  const commandResult = {
    id: commandSpec.id,
    description: commandSpec.description,
    cwd: commandSpec.cwd,
    command: [commandSpec.command, ...commandSpec.args],
    expectedExitCodes: commandSpec.expectedExitCodes,
    exitCode,
    status: commandSpec.expectedExitCodes.includes(exitCode) ? "pass" : "fail",
    startedAt,
    finishedAt,
    stdoutPath,
    stderrPath,
    outputFiles: []
  };

  if (commandSpec.outputFiles) {
    for (const outputFile of commandSpec.outputFiles) {
      commandResult.outputFiles.push(readOutputFile(outputFile));
    }
  }

  if (commandResult.status === "fail") {
    runLog.issues.push({
      severity: "error",
      title: `Unexpected exit code for ${commandSpec.id}`,
      detail: `Expected ${commandSpec.expectedExitCodes.join(", ")} but got ${exitCode}. See ${stdoutPath} and ${stderrPath}.`
    });
  }

  for (const outputFile of commandResult.outputFiles) {
    if (outputFile.error) {
      runLog.issues.push({
        severity: "error",
        title: `Invalid output file for ${commandSpec.id}`,
        detail: `${outputFile.path}: ${outputFile.error}`
      });
    }
  }

  runLog.commands.push(commandResult);
  writeRunLog();
  console.log(`${commandResult.status} ${commandSpec.id} exit=${exitCode}`);
}

function readOutputFile(outputFile) {
  const absolutePath = resolve(outputFile.cwd, outputFile.path);
  const result = {
    path: outputFile.path,
    absolutePath,
    exists: existsSync(absolutePath)
  };

  if (!result.exists) {
    result.error = "File does not exist.";
    return result;
  }

  const contents = readFileSync(absolutePath, "utf8");
  result.bytes = Buffer.byteLength(contents);
  result.sha256 = sha256(contents);

  if (outputFile.parseJson) {
    try {
      JSON.parse(contents);
      result.parseJson = "ok";
    } catch (error) {
      result.parseJson = "error";
      result.error = error instanceof Error ? error.message : String(error);
    }
  }

  return result;
}

function writeSummary() {
  const nextRepo = runLog.artifacts.nextRepo;
  const nodeApiRepo = runLog.artifacts.nodeApiRepo;
  const summary = {
    schemaVersion: 1,
    runId,
    status: runLog.status,
    packageSource,
    packageVersion: readTextIfExists(join(logsDir, "codedecay-version.stdout.txt")).trim(),
    commandCount: runLog.commands.length,
    failedCommands: runLog.commands.filter((command) => command.status !== "pass").map((command) => command.id),
    issueCount: runLog.issues.length,
    artifacts: runLog.artifacts
  };

  if (nextRepo && nodeApiRepo) {
    summary.next = summarizeExample(nextRepo);
    summary.nodeApi = summarizeExample(nodeApiRepo);
    const executePath = join(nodeApiRepo, "codedecay-output", "execute.json");
    if (existsSync(executePath)) {
      summary.nodeApi.execute = readJsonFile(executePath).summary;
    }
  }

  writeFileSync(join(runDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  writeFileSync(join(runDir, "summary.md"), renderMarkdownSummary(summary), "utf8");
}

function summarizeExample(repoDir) {
  const analyze = readJsonFile(join(repoDir, "codedecay-output", "analyze.json"));
  const redteam = readJsonFile(join(repoDir, "codedecay-output", "redteam.json"));

  return {
    analyze: {
      riskLevel: analyze.summary?.riskLevel,
      mergeRiskScore: analyze.summary?.mergeRiskScore,
      decayScore: analyze.summary?.decayScore,
      findingCounts: analyze.summary?.findingCounts
    },
    redteam: redteam.summary,
    outputFiles: ["agent-codex.md", "analyze.json", "analyze.md", "analyze.sarif", "redteam.json", "redteam.md"].filter((file) =>
      existsSync(join(repoDir, "codedecay-output", file))
    )
  };
}

function renderMarkdownSummary(summary) {
  const lines = [
    "# CodeDecay Published Package Demo",
    "",
    `- Run ID: \`${summary.runId}\``,
    `- Status: **${summary.status}**`,
    `- Package: \`${summary.packageSource.installSpec}\``,
    `- Version: \`${summary.packageVersion}\``,
    `- Commands: ${summary.commandCount}`,
    `- Issues: ${summary.issueCount}`,
    "",
    "## Next.js Risk Demo",
    "",
    `- Risk: ${summary.next?.analyze?.riskLevel ?? "unknown"}`,
    `- Merge risk: ${summary.next?.analyze?.mergeRiskScore ?? "unknown"}`,
    `- Decay score: ${summary.next?.analyze?.decayScore ?? "unknown"}`,
    `- Findings: \`${JSON.stringify(summary.next?.analyze?.findingCounts ?? {})}\``,
    "",
    "## Node API Risk Demo",
    "",
    `- Risk: ${summary.nodeApi?.analyze?.riskLevel ?? "unknown"}`,
    `- Merge risk: ${summary.nodeApi?.analyze?.mergeRiskScore ?? "unknown"}`,
    `- Decay score: ${summary.nodeApi?.analyze?.decayScore ?? "unknown"}`,
    `- Findings: \`${JSON.stringify(summary.nodeApi?.analyze?.findingCounts ?? {})}\``,
    `- Execute status: ${summary.nodeApi?.execute?.status ?? "not-run"}`,
    "",
    "## Artifacts",
    "",
    `- Run log: \`${relative(repoRoot, join(runDir, "run.json"))}\``,
    `- Summary JSON: \`${relative(repoRoot, join(runDir, "summary.json"))}\``,
    `- Logs: \`${relative(repoRoot, logsDir)}\``
  ];

  if (runLog.issues.length > 0) {
    lines.push("", "## Issues", "");
    for (const issue of runLog.issues) {
      lines.push(`- **${issue.title}**: ${issue.detail}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function printResult() {
  console.log(`CodeDecay published package demo ${runLog.status}.`);
  console.log(`JSON log: ${join(runDir, "run.json")}`);
  console.log(`Summary: ${join(runDir, "summary.md")}`);
}

function assertCondition(title, condition) {
  if (condition) {
    return;
  }

  runLog.issues.push({ severity: "error", title, detail: "Output assertion failed." });
}

function writeRunLog() {
  mkdirSync(runDir, { recursive: true });
  writeJsonFile(join(runDir, "run.json"), runLog);
}

function resolvePackageSource(parsedOptions) {
  if (parsedOptions.packageSpec && parsedOptions.tarball) {
    throw new Error("Use either --package or --tarball, not both.");
  }

  if (parsedOptions.tarball) {
    const tarballPath = isAbsolute(parsedOptions.tarball)
      ? parsedOptions.tarball
      : resolve(repoRoot, parsedOptions.tarball);
    if (!existsSync(tarballPath)) {
      throw new Error(`Tarball does not exist: ${tarballPath}`);
    }

    return {
      type: "tarball",
      installSpec: tarballPath,
      label: basename(tarballPath)
    };
  }

  const packageSpec = parsedOptions.packageSpec ?? "@submuxhq/codedecay@latest";
  return {
    type: "package",
    installSpec: packageSpec,
    label: packageSpec
  };
}

function parseArgs(args) {
  const parsed = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") {
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
    if (arg === "--run-id") {
      parsed.runId = readOptionValue(args, ++index, arg, "Missing value for");
      continue;
    }
    if (arg?.startsWith("--run-id=")) {
      parsed.runId = arg.slice("--run-id=".length);
      continue;
    }
    if (arg === "--package") {
      parsed.packageSpec = readOptionValue(args, ++index, arg, "Missing value for");
      continue;
    }
    if (arg?.startsWith("--package=")) {
      parsed.packageSpec = arg.slice("--package=".length);
      continue;
    }
    if (arg === "--tarball") {
      parsed.tarball = readOptionValue(args, ++index, arg, "Missing value for");
      continue;
    }
    if (arg?.startsWith("--tarball=")) {
      parsed.tarball = arg.slice("--tarball=".length);
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      console.log(
        [
          "Usage: node scripts/published-package-demo.mjs [options]",
          "",
          "Options:",
          "  --package <specifier>  npm package spec to install, defaults to @submuxhq/codedecay@latest",
          "  --tarball <path>        local packed tarball to install instead of --package",
          "  --output-dir <path>     output directory, defaults to .codedecay/local/published-package-demo",
          "  --run-id <id>           stable run id for artifact paths",
          "  -h, --help              show this help"
        ].join("\n")
      );
      process.exit(0);
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return parsed;
}
