const SUPPORTED_PULL_REQUEST_ACTIONS = new Set(["opened", "synchronize", "reopened", "ready_for_review"]);

export function isSupportedPullRequestAction(action: string): boolean {
  return SUPPORTED_PULL_REQUEST_ACTIONS.has(action);
}
