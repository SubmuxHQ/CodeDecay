import { spawn } from "node:child_process";
import type { CodeDecayConfig } from "@submuxhq/codedecay-config";
import type { FileChange, Finding } from "@submuxhq/codedecay-core";

export type AdapterStatus = "passed" | "failed" | "skipped" | "timed_out" | "error";
export type ConfiguredCommandKind = "test" | "build" | "start" | "probe";

export interface AdapterContext {
  rootDir: string;
  changedFiles: FileChange[];
  config: CodeDecayConfig;
}

export interface AdapterResult {
  id: string;
  name: string;
  status: AdapterStatus;
  durationMs: number;
  stdout: string;
  stderr: string;
  findings: Finding[];
  exitCode?: number | undefined;
  error?: string | undefined;
}

export interface CodeDecayAdapter {
  id: string;
  name: string;
  run(context: AdapterContext): Promise<AdapterResult>;
}

export interface ConfiguredCommandAdapter {
  kind: ConfiguredCommandKind;
  command: string;
  adapter: CodeDecayAdapter;
}

export interface CommandAdapterOptions {
  id: string;
  name: string;
  command: string;
  timeoutMs?: number | undefined;
  requiresCommandAllowlist?: boolean | undefined;
}

const OUTPUT_LIMIT = 64 * 1024;

export async function runAdapters(
  adapters: CodeDecayAdapter[],
  context: AdapterContext
): Promise<AdapterResult[]> {
  const results: AdapterResult[] = [];

  for (const adapter of adapters) {
    results.push(await adapter.run(context));
  }

  return results;
}

export function createCommandAdapter(options: CommandAdapterOptions): CodeDecayAdapter {
  validateCommandAdapterOptions(options);

  return {
    id: options.id,
    name: options.name,
    run: (context) => runCommandAdapter(options, context)
  };
}

export function createConfiguredCommandAdapters(config: CodeDecayConfig): ConfiguredCommandAdapter[] {
  return [
    ...config.commands.test.map((command, index) =>
      createConfiguredCommandAdapter("test", command, `test-${index + 1}`, `Test command ${index + 1}`)
    ),
    ...config.commands.build.map((command, index) =>
      createConfiguredCommandAdapter("build", command, `build-${index + 1}`, `Build command ${index + 1}`)
    ),
    ...config.commands.start.map((command, index) =>
      createConfiguredCommandAdapter("start", command, `start-${index + 1}`, `Start command ${index + 1}`)
    ),
    ...config.probes.map((probe, index) =>
      createConfiguredCommandAdapter("probe", probe.command, `probe-${slugify(probe.name, index + 1)}`, `Probe: ${probe.name}`, probe.timeoutMs)
    )
  ];
}

function createConfiguredCommandAdapter(
  kind: ConfiguredCommandKind,
  command: string,
  id: string,
  name: string,
  timeoutMs?: number | undefined
): ConfiguredCommandAdapter {
  return {
    kind,
    command,
    adapter: createCommandAdapter({
      id,
      name,
      command,
      timeoutMs,
      requiresCommandAllowlist: true
    })
  };
}

async function runCommandAdapter(
  options: CommandAdapterOptions,
  context: AdapterContext
): Promise<AdapterResult> {
  if (options.requiresCommandAllowlist && !context.config.safety.allowCommands) {
    return createResult({
      id: options.id,
      name: options.name,
      status: "skipped",
      durationMs: 0,
      stdout: "",
      stderr: "Command execution is disabled by config safety.allowCommands."
    });
  }

  const startedAt = Date.now();
  const timeoutMs = options.timeoutMs ?? context.config.safety.commandTimeoutMs;

  return await new Promise<AdapterResult>((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;

    const child = spawn(options.command, {
      cwd: context.rootDir,
      shell: true,
      env: {
        ...process.env,
        CI: process.env.CI ?? "1"
      }
    });

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout = appendOutput(stdout, chunk.toString("utf8"));
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = appendOutput(stderr, chunk.toString("utf8"));
    });

    child.on("error", (error) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      resolve(
        createResult({
          id: options.id,
          name: options.name,
          status: "error",
          durationMs: elapsed(startedAt),
          stdout,
          stderr,
          error: error.message
        })
      );
    });

    child.on("close", (exitCode) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);

      resolve(
        createResult({
          id: options.id,
          name: options.name,
          status: timedOut ? "timed_out" : exitCode === 0 ? "passed" : "failed",
          durationMs: elapsed(startedAt),
          stdout,
          stderr,
          exitCode: exitCode ?? undefined,
          error: timedOut ? `Command timed out after ${timeoutMs}ms.` : undefined
        })
      );
    });
  });
}

function validateCommandAdapterOptions(options: CommandAdapterOptions): void {
  if (!isIdentifier(options.id)) {
    throw new Error("Adapter id is required.");
  }

  if (!isIdentifier(options.name)) {
    throw new Error("Adapter name is required.");
  }

  if (!isIdentifier(options.command)) {
    throw new Error("Adapter command is required.");
  }

  if (options.timeoutMs !== undefined && (!Number.isInteger(options.timeoutMs) || options.timeoutMs <= 0)) {
    throw new Error("Adapter timeoutMs must be a positive integer.");
  }
}

function createResult(input: Omit<AdapterResult, "findings"> & { findings?: Finding[] | undefined }): AdapterResult {
  const { findings, ...rest } = input;

  return {
    ...rest,
    findings: findings ?? []
  };
}

function appendOutput(existing: string, next: string): string {
  const combined = `${existing}${next}`;
  if (combined.length <= OUTPUT_LIMIT) {
    return combined;
  }

  return combined.slice(combined.length - OUTPUT_LIMIT);
}

function elapsed(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt);
}

function isIdentifier(value: string): boolean {
  return value.trim().length > 0;
}

function slugify(value: string, fallbackIndex: number): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || String(fallbackIndex);
}
