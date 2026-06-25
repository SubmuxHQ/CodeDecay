import type { CodeDecayConfig } from "@submuxhq/codedecay-config";
import type { FileChange, Finding } from "@submuxhq/codedecay-core";
import { runConfiguredCommand, type CommandExecutionResult } from "@submuxhq/codedecay-execution";

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
  const result = await runConfiguredCommand({
    command: options.command,
    cwd: context.rootDir,
    timeoutMs: options.timeoutMs ?? context.config.safety.commandTimeoutMs,
    safety: {
      allowCommands: options.requiresCommandAllowlist ? context.config.safety.allowCommands : true
    }
  });

  return adapterResultFromExecution(options, result);
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

function adapterResultFromExecution(options: CommandAdapterOptions, result: CommandExecutionResult): AdapterResult {
  return createResult({
    id: options.id,
    name: options.name,
    status: result.status === "blocked" ? "skipped" : result.status,
    durationMs: result.durationMs,
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    error: result.error
  });
}

function createResult(input: Omit<AdapterResult, "findings"> & { findings?: Finding[] | undefined }): AdapterResult {
  const { findings, ...rest } = input;

  return {
    ...rest,
    findings: findings ?? []
  };
}

function isIdentifier(value: string): boolean {
  return value.trim().length > 0;
}

function slugify(value: string, fallbackIndex: number): string {
  const slugParts: string[] = [];
  let previousWasSeparator = true;

  for (const char of value.trim().toLowerCase()) {
    if (isAsciiLetterOrDigit(char)) {
      slugParts.push(char);
      previousWasSeparator = false;
      continue;
    }

    if (!previousWasSeparator) {
      slugParts.push("-");
      previousWasSeparator = true;
    }
  }

  if (slugParts.at(-1) === "-") {
    slugParts.pop();
  }

  const slug = slugParts.join("");

  return slug || String(fallbackIndex);
}

function isAsciiLetterOrDigit(value: string): boolean {
  const code = value.charCodeAt(0);
  return (code >= 48 && code <= 57) || (code >= 97 && code <= 122);
}
