import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { LoadedCodeDecayConfig } from "@submuxhq/codedecay-config";
import {
  checkCommandSafety,
  runConfiguredCommand,
  type CommandExecutionResult
} from "@submuxhq/codedecay-execution";
import type { ManagedProductProcess } from "../../types";
import { delay, elapsed } from "./timing";

export async function runProductOneShotCommand(
  rootDir: string,
  loadedConfig: LoadedCodeDecayConfig,
  command: string,
  timeoutMs: number
): Promise<CommandExecutionResult> {
  return await runConfiguredCommand({
    command,
    cwd: rootDir,
    timeoutMs,
    safety: {
      allowCommands: loadedConfig.config.safety.allowCommands
    }
  });
}

export async function startManagedProductProcess(
  rootDir: string,
  loadedConfig: LoadedCodeDecayConfig,
  command: string,
  timeoutMs: number
): Promise<ManagedProductProcess> {
  const startedAt = Date.now();
  if (!loadedConfig.config.safety.allowCommands) {
    return {
      command,
      status: "blocked",
      durationMs: 0,
      stdout: "",
      stderr: "Product target startup is disabled by config safety.allowCommands.",
      blockedReason: "safety.allowCommands is false"
    };
  }

  const safety = checkCommandSafety(command);
  if (!safety.safe) {
    const message = `Command was blocked by CodeDecay safety policy: ${safety.reason}.`;
    return {
      command,
      status: "blocked",
      durationMs: 0,
      stdout: "",
      stderr: message,
      error: message,
      blockedReason: safety.reason
    };
  }

  let stdout = "";
  let stderr = "";
  let spawnError: Error | undefined;
  const child = spawn(command, {
    cwd: rootDir,
    shell: true,
    env: {
      ...process.env,
      CI: process.env.CI ?? "1"
    }
  });

  child.stdout.on("data", (chunk: Buffer) => {
    stdout = appendLimitedOutput(stdout, chunk.toString("utf8"), 16 * 1024);
  });

  child.stderr.on("data", (chunk: Buffer) => {
    stderr = appendLimitedOutput(stderr, chunk.toString("utf8"), 16 * 1024);
  });

  child.on("error", (error) => {
    spawnError = error;
  });

  await delay(Math.min(250, Math.max(50, Math.floor(timeoutMs / 10))));

  if (spawnError) {
    return {
      command,
      status: "error",
      durationMs: elapsed(startedAt),
      stdout,
      stderr,
      error: spawnError.message
    };
  }

  if (child.exitCode !== null) {
    return {
      command,
      status: "error",
      durationMs: elapsed(startedAt),
      stdout,
      stderr,
      error: `Start command exited early with code ${child.exitCode}.`
    };
  }

  return {
    command,
    status: "started",
    durationMs: elapsed(startedAt),
    stdout,
    stderr,
    pid: child.pid,
    child
  };
}

export async function stopManagedProductProcess(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null || child.killed) {
    return;
  }

  await new Promise<void>((resolvePromise) => {
    const timeout = setTimeout(() => {
      if (child.exitCode === null && !child.killed) {
        child.kill("SIGKILL");
      }
      resolvePromise();
    }, 1000);

    child.once("close", () => {
      clearTimeout(timeout);
      resolvePromise();
    });

    child.kill("SIGTERM");
  });
}

function appendLimitedOutput(existing: string, next: string, limit: number): string {
  const combined = `${existing}${next}`;
  if (combined.length <= limit) {
    return combined;
  }

  return combined.slice(combined.length - limit);
}
