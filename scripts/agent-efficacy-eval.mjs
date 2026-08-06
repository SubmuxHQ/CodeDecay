#!/usr/bin/env node
/**
 * Deterministic agent-efficacy harness entrypoint (fake agents).
 * Real Codex/Claude/BYOK trials are opt-in and out of this script.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const knowledgeEntry = resolve(repoRoot, "packages/knowledge/dist/index.js");

async function main() {
  const mod = await import(pathToFileURL(knowledgeEntry).href);
  const report = mod.runAgentEfficacyEval({
    scenarios: mod.defaultEfficacyScenarios(),
    runId: process.argv.includes("--published") ? "published-package" : "local-dev",
    publishedPackageTreatment: process.argv.includes("--published")
  });
  const outDir = resolve(repoRoot, ".codedecay/local/evals", report.runId);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "summary.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(outDir, "summary.md"), mod.renderAgentEfficacyMarkdown(report));
  process.stdout.write(mod.renderAgentEfficacyMarkdown(report));
  const failed =
    report.integrity.labelSwapDetected ||
    report.integrity.answerLeakDetected ||
    report.summary.contaminationFailures > 0;
  process.exitCode = failed ? 1 : 0;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
