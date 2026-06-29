import { analyzePullRequest } from "../analyze.js";
import { getInstallationToken } from "../auth.js";
import { checkoutPullRequest, cleanupCheckout } from "../git.js";
import { completeAnalysisCheck, createAnalysisCheck, upsertPullRequestComment } from "../github.js";
import type { AnalyzePullRequestOptions, AnalyzePullRequestResult } from "../types.js";

export interface HandlerDependencies {
  getToken: typeof getInstallationToken;
  checkout: typeof checkoutPullRequest;
  cleanup: typeof cleanupCheckout;
  analyze: (options: AnalyzePullRequestOptions) => AnalyzePullRequestResult;
  createCheck: typeof createAnalysisCheck;
  completeCheck: typeof completeAnalysisCheck;
  upsertComment: typeof upsertPullRequestComment;
}

export const defaultDependencies: HandlerDependencies = {
  getToken: getInstallationToken,
  checkout: checkoutPullRequest,
  cleanup: cleanupCheckout,
  analyze: analyzePullRequest,
  createCheck: createAnalysisCheck,
  completeCheck: completeAnalysisCheck,
  upsertComment: upsertPullRequestComment
};
