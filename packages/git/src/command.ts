import { execFileSync, type ExecFileSyncOptionsWithStringEncoding } from "node:child_process";

export function runGit(cwd: string, args: string[]): string {
  try {
    const options: ExecFileSyncOptionsWithStringEncoding = {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"]
    };

    return execFileSync("git", ["-C", cwd, ...args], {
      ...options
    });
  } catch (error: unknown) {
    const stderr = getCommandStderr(error);
    const suffix = stderr ? `\n${stderr}` : "";
    throw new Error(`Git command failed: git -C ${cwd} ${args.join(" ")}${suffix}`);
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
