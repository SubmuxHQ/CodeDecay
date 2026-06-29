import { execFileSync, type ExecFileSyncOptionsWithStringEncoding } from "node:child_process";
import { redact } from "./url.js";

export function runGit(
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
