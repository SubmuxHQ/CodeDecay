import { spawn } from "node:child_process";

export type ExecutionStatus = "passed" | "failed" | "skipped" | "timed_out" | "error" | "blocked";

export interface SafeCommandPolicy {
  allowCommands: boolean;
  allowUnsafeCommands?: boolean | undefined;
}

export interface RunConfiguredCommandOptions {
  command: string;
  cwd: string;
  timeoutMs: number;
  safety: SafeCommandPolicy;
  env?: Record<string, string | undefined> | undefined;
  outputLimit?: number | undefined;
}

export interface CommandSafetyCheck {
  safe: boolean;
  reason?: string | undefined;
}

export interface CommandExecutionResult {
  command: string;
  status: ExecutionStatus;
  durationMs: number;
  stdout: string;
  stderr: string;
  exitCode?: number | undefined;
  error?: string | undefined;
  blockedReason?: string | undefined;
}

const DEFAULT_OUTPUT_LIMIT = 64 * 1024;
const UNSAFE_COMMAND_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /\brm\s+(?:-[^\s]*[rf][^\s]*|-[^\s]*r[^\s]*\s+-[^\s]*f[^\s]*|-[^\s]*f[^\s]*\s+-[^\s]*r[^\s]*)/i,
    reason: "recursive or forced file deletion"
  },
  {
    pattern: /\bgit\s+reset\s+--hard\b/i,
    reason: "destructive git reset"
  },
  {
    pattern: /\bgit\s+clean\s+-[^\s]*f/i,
    reason: "destructive git clean"
  },
  {
    pattern: /\bgit\s+push\b/i,
    reason: "remote git push"
  },
  {
    pattern: /\b(?:npm|pnpm|yarn|bun)\s+publish\b/i,
    reason: "package publish"
  },
  {
    pattern: /\b(?:vercel|netlify|fly|railway|wrangler)\s+(?:deploy|up)\b/i,
    reason: "production deployment command"
  },
  {
    pattern: /\bkubectl\s+(?:apply|delete|replace|rollout|scale)\b/i,
    reason: "cluster mutation command"
  },
  {
    pattern: /\bterraform\s+(?:apply|destroy)\b/i,
    reason: "infrastructure mutation command"
  },
  {
    pattern: /\bdocker\s+compose\s+down\b.*\s-v\b/i,
    reason: "container volume deletion"
  },
  {
    pattern: /\b(?:prisma|drizzle-kit|supabase)\s+(?:migrate\s+deploy|db\s+push|push)\b/i,
    reason: "database migration or push command"
  },
  {
    pattern: /\bgh\s+release\s+(?:create|delete)\b/i,
    reason: "GitHub release mutation"
  }
];

export async function runConfiguredCommand(options: RunConfiguredCommandOptions): Promise<CommandExecutionResult> {
  validateRunOptions(options);

  if (!options.safety.allowCommands) {
    return {
      command: options.command,
      status: "skipped",
      durationMs: 0,
      stdout: "",
      stderr: "Command execution is disabled by config safety.allowCommands."
    };
  }

  const safety = checkCommandSafety(options.command);
  if (!safety.safe && !options.safety.allowUnsafeCommands) {
    const message = `Command was blocked by CodeDecay safety policy: ${safety.reason}.`;
    return {
      command: options.command,
      status: "blocked",
      durationMs: 0,
      stdout: "",
      stderr: message,
      error: message,
      blockedReason: safety.reason
    };
  }

  return await spawnCommand(options);
}

export function checkCommandSafety(command: string): CommandSafetyCheck {
  validateNonEmptyString(command, "Command");

  for (const unsafe of UNSAFE_COMMAND_PATTERNS) {
    if (unsafe.pattern.test(command)) {
      return {
        safe: false,
        reason: unsafe.reason
      };
    }
  }

  return {
    safe: true
  };
}

async function spawnCommand(options: RunConfiguredCommandOptions): Promise<CommandExecutionResult> {
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

function validateRunOptions(options: RunConfiguredCommandOptions): void {
  validateNonEmptyString(options.command, "Command");
  validateNonEmptyString(options.cwd, "Command cwd");

  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error("Command timeoutMs must be a positive integer.");
  }

  if (options.outputLimit !== undefined && (!Number.isInteger(options.outputLimit) || options.outputLimit <= 0)) {
    throw new Error("Command outputLimit must be a positive integer.");
  }
}

function appendOutput(existing: string, next: string, outputLimit: number): string {
  const combined = `${existing}${next}`;
  if (combined.length <= outputLimit) {
    return combined;
  }

  return combined.slice(combined.length - outputLimit);
}

function elapsed(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt);
}

function validateNonEmptyString(value: string, label: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${label} is required.`);
  }
}
