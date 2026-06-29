import type { Finding } from "@submuxhq/codedecay-core";
import { runConfiguredCommand, type CommandExecutionResult } from "@submuxhq/codedecay-execution";
import type { AdapterContext, AdapterResult, CodeDecayAdapter, CommandAdapterOptions } from "./types";
import { validateCommandAdapterOptions } from "./validation";

export function createCommandAdapter(options: CommandAdapterOptions): CodeDecayAdapter {
  validateCommandAdapterOptions(options);

  return {
    id: options.id,
    name: options.name,
    run: (context) => runCommandAdapter(options, context)
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
