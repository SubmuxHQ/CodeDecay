import type { GitHubTarget } from "../github.js";
import type { GitHubAppContext } from "../types.js";

export function getPullRequestTarget(payload: GitHubAppContext["payload"]): GitHubTarget {
  return {
    owner: payload.repository.owner.login,
    repo: payload.repository.name,
    pullNumber: payload.pull_request.number,
    headSha: payload.pull_request.head.sha
  };
}
