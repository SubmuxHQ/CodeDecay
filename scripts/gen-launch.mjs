#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const benchmark = args.benchmarkJson
  ? readBenchmarkJson(resolve(repoRoot, args.benchmarkJson))
  : runBenchmark();
const readmePath = resolve(repoRoot, args.readme ?? "README.md");
const launchPostPath = resolve(repoRoot, args.launchPost ?? "docs/launch-post.md");
const readmeBlock = renderReadmeBenchmarkBlock(benchmark);
const launchPost = renderLaunchPost(benchmark);

writeFileSync(readmePath, replaceBenchmarkBlock(readFileSync(readmePath, "utf8"), readmeBlock), "utf8");
writeFileSync(launchPostPath, launchPost, "utf8");

console.log(`Updated ${relativeFromRepo(readmePath)}`);
console.log(`Updated ${relativeFromRepo(launchPostPath)}`);

function parseArgs(argv) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--benchmark-json" && next) {
      parsed.benchmarkJson = next;
      index += 1;
      continue;
    }

    if (arg === "--readme" && next) {
      parsed.readme = next;
      index += 1;
      continue;
    }

    if (arg === "--launch-post" && next) {
      parsed.launchPost = next;
      index += 1;
      continue;
    }

    throw new Error(`Unknown or incomplete option: ${arg}`);
  }

  return parsed;
}

function runBenchmark() {
  const cliPath = join(repoRoot, "packages/cli/dist/index.js");
  if (!existsSync(cliPath)) {
    throw new Error("CodeDecay CLI build not found. Run `pnpm build:packages` before `pnpm gen:launch`.");
  }

  const output = execFileSync(process.execPath, [cliPath, "benchmark", "--format", "json"], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  return JSON.parse(output);
}

function readBenchmarkJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function renderReadmeBenchmarkBlock(benchmark) {
  const summary = benchmark.summary;
  const caught = `${summary.totalMatched}/${summary.totalExpected}`;

  return [
    "## Catch what your AI coding agent missed — free, in CI, before merge.",
    "",
    `Latest reproducible benchmark: **${caught} planted issues caught (${percent(summary.overallRecall)} recall)**, **${percent(summary.falsePositiveRate)} false-positive rate** on clean decoys, **${money(summary.costUsd)} cost**, LLM called: **${yesNo(summary.llmCalled)}**, telemetry sent: **${yesNo(summary.telemetrySent)}**.`,
    "",
    "```bash",
    "npx codedecay analyze",
    "```",
    "",
    "Generated from `codedecay benchmark --format json` by `pnpm gen:launch`."
  ].join("\n");
}

function renderLaunchPost(benchmark) {
  const summary = benchmark.summary;
  const caught = `${summary.totalMatched}/${summary.totalExpected}`;

  return `${[
    "# Show HN: CodeDecay - catch what your AI coding agent missed before merge",
    "",
    "CodeDecay is an open-source, local-first CLI and GitHub Action for AI-assisted PR safety.",
    "",
    `It asks: what could this PR break, and are the tests actually proving it will not?`,
    "",
    `Latest reproducible benchmark: ${caught} planted issues caught (${percent(summary.overallRecall)} recall), ${percent(summary.falsePositiveRate)} false-positive rate on clean decoys, ${money(summary.costUsd)} cost, LLM called: ${yesNo(summary.llmCalled)}, telemetry sent: ${yesNo(summary.telemetrySent)}.`,
    "",
    "Install and run:",
    "",
    "```bash",
    "npm install -D @submuxhq/codedecay",
    "npx codedecay analyze",
    "```",
    "",
    "It stays deterministic by default: no required API keys, no required LLM calls, no telemetry, and no CodeDecayCloud dependency.",
    "",
    "GitHub: https://github.com/SubmuxHQ/CodeDecay",
    "npm: https://www.npmjs.com/package/@submuxhq/codedecay"
  ].join("\n")}\n`;
}

function replaceBenchmarkBlock(markdown, block) {
  const start = "<!-- BENCHMARK:START -->";
  const end = "<!-- BENCHMARK:END -->";
  const startIndex = markdown.indexOf(start);
  const endIndex = markdown.indexOf(end);

  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    throw new Error("README benchmark markers are missing or out of order.");
  }

  return `${markdown.slice(0, startIndex + start.length)}\n${block}\n${markdown.slice(endIndex)}`;
}

function percent(value) {
  const number = Number(value);
  return `${(number * 100).toFixed(number === 1 ? 1 : 2)}%`;
}

function money(value) {
  return `$${Number(value).toFixed(2)}`;
}

function yesNo(value) {
  return value ? "yes" : "no";
}

function relativeFromRepo(path) {
  return path.startsWith(repoRoot) ? path.slice(repoRoot.length + 1) : path;
}
