import type { Probot } from "probot";
import { handlePullRequestEvent, type HandlerDependencies } from "./handler.js";
import type { GitHubAppContext } from "./types.js";

const PULL_REQUEST_EVENTS = [
  "pull_request.opened",
  "pull_request.synchronize",
  "pull_request.reopened",
  "pull_request.ready_for_review"
] as const;

export function createCodeDecayGithubApp(dependencies: Partial<HandlerDependencies> = {}) {
  return (app: Probot): void => {
    for (const event of PULL_REQUEST_EVENTS) {
      app.on(event, async (context) => {
        await handlePullRequestEvent(context as unknown as GitHubAppContext, dependencies);
      });
    }
  };
}

export default createCodeDecayGithubApp();
