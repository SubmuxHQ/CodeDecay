import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runGit } from "./git/exec.js";
import { authRepoUrl } from "./git/url.js";

export interface CheckoutPullRequestOptions {
  baseRepoFullName: string;
  headRepoFullName: string;
  headSha: string;
  token: string;
}

export function checkoutPullRequest(options: CheckoutPullRequestOptions): string {
  const checkoutDir = mkdtempSync(join(tmpdir(), "codedecay-github-app-"));

  try {
    runGit(["clone", "--no-tags", authRepoUrl(options.baseRepoFullName, options.token), checkoutDir], {
      redactedToken: options.token
    });

    if (options.headRepoFullName !== options.baseRepoFullName) {
      runGit(["remote", "add", "pr-head", authRepoUrl(options.headRepoFullName, options.token)], {
        cwd: checkoutDir,
        redactedToken: options.token
      });
      runGit(["fetch", "--no-tags", "pr-head", options.headSha], {
        cwd: checkoutDir,
        redactedToken: options.token
      });
    } else {
      runGit(["fetch", "--no-tags", "origin", options.headSha], {
        cwd: checkoutDir,
        redactedToken: options.token
      });
    }

    runGit(["checkout", "--detach", options.headSha], {
      cwd: checkoutDir,
      redactedToken: options.token
    });

    return checkoutDir;
  } catch (error: unknown) {
    cleanupCheckout(checkoutDir);
    throw error;
  }
}

export function cleanupCheckout(path: string): void {
  rmSync(path, { recursive: true, force: true });
}
