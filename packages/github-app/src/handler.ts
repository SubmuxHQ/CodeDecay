import { checkSummaryForReport } from "./github.js";
import { isSupportedPullRequestAction } from "./handler/actions.js";
import { defaultDependencies, type HandlerDependencies } from "./handler/dependencies.js";
import { sanitizeError } from "./handler/errors.js";
import { getPullRequestTarget } from "./handler/target.js";
import type { CheckConclusion, GitHubAppContext, HandlerResult } from "./types.js";

export async function handlePullRequestEvent(
  context: GitHubAppContext,
  dependencies: Partial<HandlerDependencies> = {}
): Promise<HandlerResult> {
  const deps = { ...defaultDependencies, ...dependencies };
  const payload = context.payload;

  if (!isSupportedPullRequestAction(payload.action)) {
    return { status: "ignored" };
  }

  const target = getPullRequestTarget(payload);
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

function conclusionForCompletedAnalysis(): CheckConclusion {
  return "success";
}
