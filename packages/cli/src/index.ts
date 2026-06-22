import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { analyzeJsProject } from "@submuxhq/codedecay-analyzer-js";
import {
  createAnalysisReport,
  riskLevelFromScore,
  shouldFailForRisk,
  type RiskLevel
} from "@submuxhq/codedecay-core";
import { getGitChangedFiles, getRepoRoot } from "@submuxhq/codedecay-git";
import { renderReport, type ReportFormat } from "@submuxhq/codedecay-report";

interface AnalyzeOptions {
  base?: string | undefined;
  head?: string | undefined;
  cwd?: string | undefined;
  format: ReportFormat;
  output?: string | undefined;
  failOn?: RiskLevel | undefined;
}

interface CliRuntime {
  cwd?: string | undefined;
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
}

const VALID_FORMATS = new Set<ReportFormat>(["json", "markdown", "sarif"]);
const VALID_RISK_LEVELS = new Set<RiskLevel>(["low", "medium", "high"]);

class CliExit extends Error {
  constructor(readonly exitCode: number) {
    super(`Exit ${exitCode}`);
  }
}

class HelpRequested extends Error {}

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

  if (!command || command === "--help" || command === "-h") {
    printHelp(runtime);
    return;
  }

  if (command !== "analyze") {
    throw new Error(`Unknown command: ${command}`);
  }

  const options = parseAnalyzeArgs(commandArgs);
  const runtimeCwd = runtime.cwd ?? process.cwd();
  const cwd = resolve(runtimeCwd, options.cwd ?? ".");
  const rootDir = getRepoRoot(cwd);
  const changedFiles = getGitChangedFiles({
    cwd: rootDir,
    base: options.base,
    head: options.head
  });

  const analyzerResult = analyzeJsProject({
    rootDir,
    changedFiles
  });

  const report = createAnalysisReport({
    base: options.base,
    head: options.head,
    changedFiles,
    analyzerResult
  });

  const rendered = renderReport(report, options.format);
  if (options.output) {
    writeOutput(cwd, options.output, rendered);
  } else {
    write(runtime.stdout, rendered);
  }

  if (options.failOn && shouldFailForRisk(report.summary.riskLevel, options.failOn)) {
    throw new CliExit(1);
  }
}

function parseAnalyzeArgs(args: string[]): AnalyzeOptions {
  const options: AnalyzeOptions = {
    format: "markdown"
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg) {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      throw new HelpRequested();
    }

    if (arg.startsWith("--cwd=")) {
      options.cwd = arg.slice("--cwd=".length);
      continue;
    }

    if (arg === "--cwd") {
      options.cwd = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--format=")) {
      options.format = parseFormat(arg.slice("--format=".length));
      continue;
    }

    if (arg === "--format") {
      options.format = parseFormat(requireValue(args, index, arg));
      index += 1;
      continue;
    }

    if (arg.startsWith("--base=")) {
      options.base = arg.slice("--base=".length);
      continue;
    }

    if (arg === "--base") {
      options.base = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--head=")) {
      options.head = arg.slice("--head=".length);
      continue;
    }

    if (arg === "--head") {
      options.head = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--output=")) {
      options.output = arg.slice("--output=".length);
      continue;
    }

    if (arg === "--output") {
      options.output = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--fail-on=")) {
      options.failOn = parseRiskLevel(arg.slice("--fail-on=".length));
      continue;
    }

    if (arg === "--fail-on") {
      options.failOn = parseRiskLevel(requireValue(args, index, arg));
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

function parseFormat(value: string): ReportFormat {
  if (VALID_FORMATS.has(value as ReportFormat)) {
    return value as ReportFormat;
  }

  throw new Error(`Invalid format "${value}". Expected json, markdown, or sarif.`);
}

function parseRiskLevel(value: string): RiskLevel {
  if (VALID_RISK_LEVELS.has(value as RiskLevel)) {
    return value as RiskLevel;
  }

  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return riskLevelFromScore(numeric);
  }

  throw new Error(`Invalid risk level "${value}". Expected low, medium, or high.`);
}

function requireValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}`);
  }

  return value;
}

function writeOutput(cwd: string, path: string, contents: string): void {
  const outputPath = resolve(cwd, path);
  const outputDir = dirname(outputPath);
  mkdirSync(outputDir, { recursive: true });

  writeFileSync(outputPath, contents, "utf8");
}

function printHelp(runtime: CliRuntime): void {
  writeStdout(runtime, `CodeDecay

Usage:
  codedecay analyze [options]

Options:
  --base <ref>               Base git ref to compare from
  --head <ref>               Head git ref to compare to
  --cwd <path>               Repository working directory (default: current directory)
  --format <format>          json, markdown, or sarif (default: markdown)
  --output <path>            Write report to a file instead of stdout
  --fail-on <level>          Exit non-zero on low, medium, or high risk
  -h, --help                 Show help

Examples:
  codedecay analyze --base main --head HEAD --format markdown
  codedecay analyze --cwd ../my-repo --format json
  codedecay analyze --format sarif --output codedecay.sarif
  codedecay analyze --fail-on high
`);
}

function write(writer: ((text: string) => void) | undefined, text: string): void {
  if (writer) {
    writer(text);
    return;
  }

  process.stdout.write(text);
}

function writeStdout(runtime: CliRuntime, text: string): void {
  write(runtime.stdout, text);
}

function writeStderr(runtime: CliRuntime, text: string): void {
  if (runtime.stderr) {
    runtime.stderr(text);
    return;
  }

  process.stderr.write(text);
}

function isDirectRun(): boolean {
  const entrypoint = process.argv[1];
  return Boolean(entrypoint && import.meta.url === pathToFileURL(entrypoint).href);
}
