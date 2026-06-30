import { spawn } from "node:child_process";
import { appendOutput, DEFAULT_OUTPUT_LIMIT, elapsed } from "./output";
import type { CommandExecutionResult, RunConfiguredCommandOptions } from "./types";

export async function spawnCommand(options: RunConfiguredCommandOptions): Promise<CommandExecutionResult> {
  const startedAt = Date.now();
  const outputLimit = options.outputLimit ?? DEFAULT_OUTPUT_LIMIT;

  return await new Promise<CommandExecutionResult>((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;

    const child = spawn(options.command, {
      cwd: options.cwd,
      shell: true,
      env: {
        ...process.env,
        ...options.env,
        CI: options.env?.CI ?? process.env.CI ?? "1"
      }
    });

    if (options.stdin !== undefined) {
      child.stdin?.end(options.stdin);
    } else {
      child.stdin?.end();
    }

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, options.timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout = appendOutput(stdout, chunk.toString("utf8"), outputLimit);
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = appendOutput(stderr, chunk.toString("utf8"), outputLimit);
    });

    child.on("error", (error) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      resolve({
        command: options.command,
        status: "error",
        durationMs: elapsed(startedAt),
        stdout,
        stderr,
        error: error.message
      });
    });

    child.on("close", (exitCode) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      resolve({
        command: options.command,
        status: timedOut ? "timed_out" : exitCode === 0 ? "passed" : "failed",
        durationMs: elapsed(startedAt),
        stdout,
        stderr,
        exitCode: exitCode ?? undefined,
        error: timedOut ? `Command timed out after ${options.timeoutMs}ms.` : undefined
      });
    });
  });
}
