import { execFileSync, type ExecFileSyncOptionsWithStringEncoding } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

function authRepoUrl(fullName: string, token: string): string {
  return `https://x-access-token:${encodeURIComponent(token)}@github.com/${fullName}.git`;
}

function runGit(
  args: string[],
  options: { cwd?: string | undefined; redactedToken: string }
): string {
  try {
    const execOptions: ExecFileSyncOptionsWithStringEncoding = {
      cwd: options.cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 120_000
    };

    return execFileSync("git", args, execOptions);
  } catch (error: unknown) {
    const stderr = redact(getCommandStderr(error), options.redactedToken);
    const command = redact(`git ${args.join(" ")}`, options.redactedToken);
    const suffix = stderr ? `\n${stderr}` : "";
    throw new Error(`GitHub App checkout failed: ${command}${suffix}`);
  }
}

function redact(value: string, token: string): string {
  return value.split(token).join("[redacted]").split(encodeURIComponent(token)).join("[redacted]");
}

function getCommandStderr(error: unknown): string {
  if (!error || typeof error !== "object") {
    return "";
  }

  const stderr = (error as { stderr?: unknown }).stderr;
  if (typeof stderr === "string") {
    return stderr.trim();
  }

  if (Buffer.isBuffer(stderr)) {
    return stderr.toString("utf8").trim();
  }

  return "";
}
