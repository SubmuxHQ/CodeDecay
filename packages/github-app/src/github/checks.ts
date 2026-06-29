import type { CodeDecayReport } from "@submuxhq/codedecay-core";
import type { CheckConclusion, GitHubClient } from "../types.js";
import type { GitHubTarget } from "./target.js";
import { truncate } from "./text.js";

const CHECK_NAME = "CodeDecay";

export async function createAnalysisCheck(octokit: GitHubClient, target: GitHubTarget): Promise<number> {
  const response = await octokit.rest.checks.create({
    owner: target.owner,
    repo: target.repo,
    name: CHECK_NAME,
    head_sha: target.headSha,
    status: "in_progress",
    started_at: new Date().toISOString(),
    output: {
      title: "CodeDecay analysis started",
      summary: "CodeDecay is analyzing this pull request."
    }
  });

  return response.data.id;
}

export async function completeAnalysisCheck(options: {
  octokit: GitHubClient;
  target: GitHubTarget;
  checkRunId: number;
  conclusion: CheckConclusion;
  title: string;
  summary: string;
}): Promise<void> {
  await options.octokit.rest.checks.update({
    owner: options.target.owner,
    repo: options.target.repo,
    check_run_id: options.checkRunId,
    status: "completed",
    conclusion: options.conclusion,
    completed_at: new Date().toISOString(),
    output: {
      title: truncate(options.title, 255),
      summary: truncate(options.summary, 65_000)
    }
  });
}

export function checkSummaryForReport(report: CodeDecayReport): string {
  return [
    `Overall risk: ${report.summary.riskLevel}`,
    `Merge risk: ${report.summary.mergeRiskScore}/100`,
    `Decay risk: ${report.summary.decayScore}/100`,
    `Findings: ${report.summary.findingCounts.high} high, ${report.summary.findingCounts.medium} medium, ${report.summary.findingCounts.low} low`
  ].join("\n");
}
