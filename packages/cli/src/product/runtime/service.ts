import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { LoadedCodeDecayConfig } from "@submuxhq/codedecay-config";
import {
  checkCommandSafety,
  createSafeCommandPolicy,
  detectShellSubstitution,
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
    safety: createSafeCommandPolicy({
      allowCommands: loadedConfig.config.safety.allowCommands,
      capabilityPolicy: loadedConfig.config.safety.capabilityPolicy
    }),
    capabilityIntentSource: "user-config"
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

  const substitution = detectShellSubstitution(command);
  if (substitution) {
    const message = `Command was blocked by CodeDecay capability policy: command rejected: ${substitution}.`;
    return {
      command,
      status: "blocked",
      durationMs: 0,
      stdout: "",
      stderr: message,
      error: message,
      blockedReason: `command rejected: ${substitution}`
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
    detached: process.platform !== "win32",
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
  if (child.exitCode !== null && child.stdout.destroyed && child.stderr.destroyed) {
    return;
  }

  await new Promise<void>((resolvePromise) => {
    let settled = false;
    let forceResolveTimeout: NodeJS.Timeout | undefined;
    const settle = () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(forceKillTimeout);
      if (forceResolveTimeout) {
        clearTimeout(forceResolveTimeout);
      }
      child.stdout.destroy();
      child.stderr.destroy();
      child.stdin.destroy();
      resolvePromise();
    };
    const forceKillTimeout = setTimeout(() => {
      signalManagedProductProcess(child, "SIGKILL");
      forceResolveTimeout = setTimeout(settle, 250);
    }, 1000);

    child.once("close", settle);

    signalManagedProductProcess(child, "SIGTERM");
  });
}

function signalManagedProductProcess(
  child: ChildProcessWithoutNullStreams,
  signal: NodeJS.Signals
): void {
  if (process.platform === "win32" && child.pid) {
    const result = spawnSync(
      "taskkill",
      ["/pid", String(child.pid), "/T", ...(signal === "SIGKILL" ? ["/F"] : [])],
      { stdio: "ignore", windowsHide: true }
    );
    if (result.status === 0) {
      return;
    }
  }

  if (process.platform !== "win32" && child.pid) {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch {
      // Fall back to the direct child when the process group has already exited.
    }
  }

  try {
    child.kill(signal);
  } catch {
    // Process shutdown is best effort after the managed command has completed.
  }
}

function appendLimitedOutput(existing: string, next: string, limit: number): string {
  const combined = `${existing}${next}`;
  if (combined.length <= limit) {
    return combined;
  }

  return combined.slice(combined.length - limit);
}
