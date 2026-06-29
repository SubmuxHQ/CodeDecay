import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export function writePrSafetyDocsReport(repoRoot, report) {
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
