#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRunId, readOptionValue } from "./lib/args.mjs";
import { readJsonFile, readTextIfExists, resetDir, sha256, writeJsonFile } from "./lib/files.mjs";
import { runCommand } from "./lib/process.mjs";

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
  recordCommand({
    id: "npm-init",
    description: "Create a fresh package project for the installed CodeDecay CLI.",
    cwd: toolInstallDir,
    command: "npm",
    args: ["init", "-y"],
    expectedExitCodes: [0]
  });
  recordCommand({
    id: "npm-install-codedecay",
    description: "Install the requested published package or tarball.",
    cwd: toolInstallDir,
    command: "npm",
    args: ["install", packageSource.installSpec],
    expectedExitCodes: [0]
  });

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
  recordCommand({
    id: `${exampleName}-materialize-baseline`,
    description: `Materialize the ${commitLabel} baseline files.`,
    cwd: targetDir,
    command: "node",
    args: ["scripts/materialize.mjs", "baseline"],
    expectedExitCodes: [0]
  });
  recordCommand({
    id: `${exampleName}-git-init`,
    description: `Initialize git for the ${commitLabel}.`,
    cwd: targetDir,
    command: "git",
    args: ["init"],
    expectedExitCodes: [0]
  });
  recordCommand({
    id: `${exampleName}-git-name`,
    description: "Set local git user.name.",
    cwd: targetDir,
    command: "git",
    args: ["config", "user.name", "CodeDecay Example"],
    expectedExitCodes: [0]
  });
  recordCommand({
    id: `${exampleName}-git-email`,
    description: "Set local git user.email.",
    cwd: targetDir,
    command: "git",
    args: ["config", "user.email", "codedecay@example.com"],
    expectedExitCodes: [0]
  });
  recordCommand({
    id: `${exampleName}-git-add`,
    description: "Stage the baseline files.",
    cwd: targetDir,
    command: "git",
    args: ["add", "."],
    expectedExitCodes: [0]
  });
  recordCommand({
    id: `${exampleName}-git-commit`,
    description: "Commit the baseline files.",
    cwd: targetDir,
    command: "git",
    args: ["commit", "-m", `baseline ${commitLabel}`],
    expectedExitCodes: [0]
  });
  recordCommand({
    id: `${exampleName}-materialize-risky`,
    description: `Materialize the ${commitLabel} risky PR files.`,
    cwd: targetDir,
    command: "node",
    args: ["scripts/materialize.mjs", "risky"],
    expectedExitCodes: [0]
  });

  mkdirSync(join(targetDir, "codedecay-output"), { recursive: true });
  return targetDir;
}

function runInstalledCliChecks(codedecayBin) {
  recordCommand({
    id: "codedecay-version",
    description: "The installed binary prints its package version.",
    cwd: toolInstallDir,
    command: codedecayBin,
    args: ["version"],
    expectedExitCodes: [0]
  });
  recordCommand({
    id: "codedecay-help",
    description: "The installed binary prints help.",
    cwd: toolInstallDir,
    command: codedecayBin,
    args: ["--help"],
    expectedExitCodes: [0]
  });
  recordCommand({
    id: "codedecay-update-dry-run",
    description: "The installed binary can render an update dry run.",
    cwd: toolInstallDir,
    command: codedecayBin,
    args: ["update", "--cwd", toolInstallDir],
    expectedExitCodes: [0]
  });
  recordCommand({
    id: "codedecay-uninstall-dry-run",
    description: "The installed binary can render an uninstall dry run.",
    cwd: toolInstallDir,
    command: codedecayBin,
    args: ["uninstall", "--cwd", toolInstallDir],
    expectedExitCodes: [0]
  });
}

function runNextExampleChecks(codedecayBin, repoDir) {
  runAnalysisChecks(codedecayBin, repoDir, "nextjs-risk-demo");
  recordCommand({
    id: "nextjs-risk-demo-agent-codex",
    description: "The installed binary writes a Codex handoff bundle for the Next.js demo.",
    cwd: repoDir,
    command: codedecayBin,
    args: ["agent", "--cwd", repoDir, "--profile", "codex", "--format", "markdown", "--output", "codedecay-output/agent-codex.md"],
    expectedExitCodes: [0],
    outputFiles: [{ path: "codedecay-output/agent-codex.md", cwd: repoDir }]
  });
  recordCommand({
    id: "nextjs-risk-demo-fail-on-high",
    description: "The installed binary fails high-risk Next.js changes when fail-on high is set.",
    cwd: repoDir,
    command: codedecayBin,
    args: ["analyze", "--cwd", repoDir, "--fail-on", "high"],
    expectedExitCodes: [1]
  });
}

function runNodeApiExampleChecks(codedecayBin, repoDir) {
  runAnalysisChecks(codedecayBin, repoDir, "node-api-risk-demo");
  recordCommand({
    id: "node-api-risk-demo-agent-codex",
    description: "The installed binary writes a Codex handoff bundle for the Node API demo.",
    cwd: repoDir,
    command: codedecayBin,
    args: ["agent", "--cwd", repoDir, "--profile", "codex", "--format", "markdown", "--output", "codedecay-output/agent-codex.md"],
    expectedExitCodes: [0],
    outputFiles: [{ path: "codedecay-output/agent-codex.md", cwd: repoDir }]
  });
  recordCommand({
    id: "node-api-risk-demo-execute-json",
    description: "The installed binary runs configured Node API checks and reports the expected contract failure.",
    cwd: repoDir,
    command: codedecayBin,
    args: ["execute", "--cwd", repoDir, "--format", "json", "--output", "codedecay-output/execute.json"],
    expectedExitCodes: [1],
    outputFiles: [{ path: "codedecay-output/execute.json", cwd: repoDir, parseJson: true }]
  });
  recordCommand({
    id: "node-api-risk-demo-execute-markdown",
    description: "The installed binary writes markdown for configured Node API checks.",
    cwd: repoDir,
    command: codedecayBin,
    args: ["execute", "--cwd", repoDir, "--format", "markdown", "--output", "codedecay-output/execute.md"],
    expectedExitCodes: [1],
    outputFiles: [{ path: "codedecay-output/execute.md", cwd: repoDir }]
  });
  recordCommand({
    id: "node-api-risk-demo-fail-on-high",
    description: "The installed binary fails high-risk Node API changes when fail-on high is set.",
    cwd: repoDir,
    command: codedecayBin,
    args: ["analyze", "--cwd", repoDir, "--fail-on", "high"],
    expectedExitCodes: [1]
  });
}

function runAnalysisChecks(codedecayBin, repoDir, prefix) {
  recordCommand({
    id: `${prefix}-analyze-json`,
    description: `The installed binary writes JSON analysis for ${prefix}.`,
    cwd: repoDir,
    command: codedecayBin,
    args: ["analyze", "--cwd", repoDir, "--format", "json", "--output", "codedecay-output/analyze.json"],
    expectedExitCodes: [0],
    outputFiles: [{ path: "codedecay-output/analyze.json", cwd: repoDir, parseJson: true }]
  });
  recordCommand({
    id: `${prefix}-analyze-markdown`,
    description: `The installed binary writes Markdown analysis for ${prefix}.`,
    cwd: repoDir,
    command: codedecayBin,
    args: ["analyze", "--cwd", repoDir, "--format", "markdown", "--output", "codedecay-output/analyze.md"],
    expectedExitCodes: [0],
    outputFiles: [{ path: "codedecay-output/analyze.md", cwd: repoDir }]
  });
  recordCommand({
    id: `${prefix}-analyze-sarif`,
    description: `The installed binary writes SARIF analysis for ${prefix}.`,
    cwd: repoDir,
    command: codedecayBin,
    args: ["analyze", "--cwd", repoDir, "--format", "sarif", "--output", "codedecay-output/analyze.sarif"],
    expectedExitCodes: [0],
    outputFiles: [{ path: "codedecay-output/analyze.sarif", cwd: repoDir, parseJson: true }]
  });
  recordCommand({
    id: `${prefix}-redteam-json`,
    description: `The installed binary writes JSON redteam output for ${prefix}.`,
    cwd: repoDir,
    command: codedecayBin,
    args: ["redteam", "--cwd", repoDir, "--format", "json", "--output", "codedecay-output/redteam.json"],
    expectedExitCodes: [0],
    outputFiles: [{ path: "codedecay-output/redteam.json", cwd: repoDir, parseJson: true }]
  });
  recordCommand({
    id: `${prefix}-redteam-markdown`,
    description: `The installed binary writes Markdown redteam output for ${prefix}.`,
    cwd: repoDir,
    command: codedecayBin,
    args: ["redteam", "--cwd", repoDir, "--format", "markdown", "--output", "codedecay-output/redteam.md"],
    expectedExitCodes: [0],
    outputFiles: [{ path: "codedecay-output/redteam.md", cwd: repoDir }]
  });
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
