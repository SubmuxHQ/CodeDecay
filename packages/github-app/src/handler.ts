import { analyzePullRequest } from "./analyze.js";
import { getInstallationToken } from "./auth.js";
import { checkoutPullRequest, cleanupCheckout } from "./git.js";
import {
  checkSummaryForReport,
  completeAnalysisCheck,
  createAnalysisCheck,
  upsertPullRequestComment,
  type GitHubTarget
} from "./github.js";
import type {
  AnalyzePullRequestOptions,
  AnalyzePullRequestResult,
  CheckConclusion,
  GitHubAppContext,
  HandlerResult
} from "./types.js";

const SUPPORTED_PULL_REQUEST_ACTIONS = new Set(["opened", "synchronize", "reopened", "ready_for_review"]);

export interface HandlerDependencies {
  getToken: typeof getInstallationToken;
  checkout: typeof checkoutPullRequest;
  cleanup: typeof cleanupCheckout;
  analyze: (options: AnalyzePullRequestOptions) => AnalyzePullRequestResult;
  createCheck: typeof createAnalysisCheck;
  completeCheck: typeof completeAnalysisCheck;
  upsertComment: typeof upsertPullRequestComment;
}

const defaultDependencies: HandlerDependencies = {
  getToken: getInstallationToken,
  checkout: checkoutPullRequest,
  cleanup: cleanupCheckout,
  analyze: analyzePullRequest,
  createCheck: createAnalysisCheck,
  completeCheck: completeAnalysisCheck,
  upsertComment: upsertPullRequestComment
};

export async function handlePullRequestEvent(
  context: GitHubAppContext,
  dependencies: Partial<HandlerDependencies> = {}
): Promise<HandlerResult> {
  const deps = { ...defaultDependencies, ...dependencies };
  const payload = context.payload;

  if (!SUPPORTED_PULL_REQUEST_ACTIONS.has(payload.action)) {
    return { status: "ignored" };
  }

  const target = getTarget(payload);
  const checkRunId = await deps.createCheck(context.octokit, target);
  let checkoutDir: string | undefined;

  try {
    const token = await deps.getToken(context.octokit);
    checkoutDir = deps.checkout({
      baseRepoFullName: payload.pull_request.base.repo?.full_name ?? payload.repository.full_name,
      headRepoFullName: payload.pull_request.head.repo?.full_name ?? payload.repository.full_name,
      headSha: payload.pull_request.head.sha,
      token
    });

    const analysis = deps.analyze({
      cwd: checkoutDir,
      base: payload.pull_request.base.sha,
      head: payload.pull_request.head.sha
    });

    await deps.upsertComment({
      octokit: context.octokit,
      target,
      markdown: analysis.markdown
    });

    await deps.completeCheck({
      octokit: context.octokit,
      target,
      checkRunId,
      conclusion: conclusionForCompletedAnalysis(),
      title: `CodeDecay risk: ${analysis.report.summary.riskLevel}`,
      summary: checkSummaryForReport(analysis.report)
    });

    return {
      status: "completed",
      report: analysis.report
    };
  } catch (error: unknown) {
    const message = sanitizeError(error);
    context.log?.error?.({ repo: payload.repository.full_name, pull: payload.pull_request.number, error: message }, "CodeDecay GitHub App analysis failed");

    await deps.completeCheck({
      octokit: context.octokit,
      target,
      checkRunId,
      conclusion: "failure",
      title: "CodeDecay analysis failed",
      summary: message
    });

    return {
      status: "failed",
      message
    };
  } finally {
    if (checkoutDir) {
      deps.cleanup(checkoutDir);
    }
  }
}

function getTarget(payload: GitHubAppContext["payload"]): GitHubTarget {
  return {
    owner: payload.repository.owner.login,
    repo: payload.repository.name,
    pullNumber: payload.pull_request.number,
    headSha: payload.pull_request.head.sha
  };
}

function conclusionForCompletedAnalysis(): CheckConclusion {
  return "success";
}

function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/x-access-token:[^@\s]+@github\.com/g, "x-access-token:[redacted]@github.com");
}
