import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { readJsonFile } from "../../lib/files.mjs";

export function assertPublishedPackageDemoOutputs(nextRepo, nodeApiRepo) {
  const issues = [];
  const nextAnalyze = readJsonFile(join(nextRepo, "codedecay-output", "analyze.json"));
  const nodeAnalyze = readJsonFile(join(nodeApiRepo, "codedecay-output", "analyze.json"));
  const nextSarif = readJsonFile(join(nextRepo, "codedecay-output", "analyze.sarif"));
  const nodeSarif = readJsonFile(join(nodeApiRepo, "codedecay-output", "analyze.sarif"));
  const nodeExecute = readJsonFile(join(nodeApiRepo, "codedecay-output", "execute.json"));

  assertCondition(issues, "Next.js demo should be high risk.", nextAnalyze.summary?.riskLevel === "high");
  assertCondition(issues, "Node API demo should be high risk.", nodeAnalyze.summary?.riskLevel === "high");
  assertCondition(issues, "Next.js SARIF should have one run.", Array.isArray(nextSarif.runs) && nextSarif.runs.length === 1);
  assertCondition(issues, "Node API SARIF should have one run.", Array.isArray(nodeSarif.runs) && nodeSarif.runs.length === 1);
  assertCondition(issues, "Node API execute should fail because the demo contract check catches the risky change.", nodeExecute.summary?.status === "failed");

  return issues;
}

export function summarizePublishedPackageExample(repoDir) {
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

export function renderPublishedPackageDemoSummary(summary, context) {
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
    `- Run log: \`${relative(context.repoRoot, join(context.runDir, "run.json"))}\``,
    `- Summary JSON: \`${relative(context.repoRoot, join(context.runDir, "summary.json"))}\``,
    `- Logs: \`${relative(context.repoRoot, context.logsDir)}\``
  ];

  if (context.issues.length > 0) {
    lines.push("", "## Issues", "");
    for (const issue of context.issues) {
      lines.push(`- **${issue.title}**: ${issue.detail}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function assertCondition(issues, title, condition) {
  if (condition) {
    return;
  }

  issues.push({ severity: "error", title, detail: "Output assertion failed." });
}
