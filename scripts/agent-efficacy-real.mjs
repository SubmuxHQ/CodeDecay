#!/usr/bin/env node
/**
 * Opt-in real-agent efficacy entrypoint (#764).
 *
 * Default is dry-run (no spawn). Pass --opt-in to execute a user-owned agent CLI.
 * Example:
 *   node scripts/agent-efficacy-real.mjs --dry-run
 *   node scripts/agent-efficacy-real.mjs --opt-in --command 'codex exec --sandbox workspace-write'
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { splitCommand } from "./lib/args.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const knowledgeEntry = resolve(repoRoot, "packages/knowledge/dist/index.js");

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run") || !args.includes("--opt-in");
  const optIn = args.includes("--opt-in");
  const published = args.includes("--published");
  const commandValue = readFlag(args, "--command") ?? process.env.CODEDECAY_EFFICACY_AGENT_COMMAND;
  if (!commandValue && optIn && !dryRun) {
    throw new Error("Pass --command '...' or set CODEDECAY_EFFICACY_AGENT_COMMAND for --opt-in runs.");
  }
  const command = splitCommand(commandValue ?? "codex exec");
  const timeoutMs = Number(readFlag(args, "--timeout-ms") ?? 120_000);
  const providerLabel = readFlag(args, "--provider") ?? command[0] ?? "external-cli";
  const runId =
    readFlag(args, "--run-id") ??
    (dryRun ? "real-agent-dry-run" : `real-agent-${providerLabel}`);

  const mod = await import(pathToFileURL(knowledgeEntry).href);
  const report = mod.runRealAgentEfficacyEval({
    scenarios: mod.defaultEfficacyScenarios(),
    runId,
    publishedPackageTreatment: published,
    optIn: optIn || dryRun,
    dryRun,
    providerLabel,
    controlInvocation: { command, timeoutMs, cwd: repoRoot },
    treatmentInvocation: { command, timeoutMs, cwd: repoRoot }
  });

  const outDir = resolve(repoRoot, ".codedecay/local/evals", report.runId);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "summary.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(outDir, "summary.md"), mod.renderAgentEfficacyMarkdown(report));
  process.stdout.write(mod.renderAgentEfficacyMarkdown(report));
  process.stdout.write(
    `\nArtifacts: ${outDir}\noptIn=${optIn} dryRun=${dryRun} provider=${providerLabel}\n`
  );
}

function readFlag(args, flag) {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Expected value after ${flag}`);
  }
  return value;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
