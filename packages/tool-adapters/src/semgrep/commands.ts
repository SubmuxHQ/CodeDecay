import { existsSync } from "node:fs";
import { join } from "node:path";
import { LOCAL_SEMGREP_CONFIG_CANDIDATES } from "./constants";
import { shellQuote } from "../shared/paths";
import type { SemgrepHarnessOptions } from "../types";

export function resolveSemgrepRunCommand(
  cwd: string,
  options: SemgrepHarnessOptions
): { command?: string | undefined; displayCommand: string } {
  if (options.command) {
    return {
      command: options.command,
      displayCommand: options.command
    };
  }

  const config = options.config ?? discoverLocalSemgrepConfig(cwd);
  const displayCommand = resolveSemgrepDisplayCommand(options);
  if (!config) {
    return {
      displayCommand
    };
  }

  return {
    command: buildSemgrepCommand(config),
    displayCommand
  };
}

export function resolveSemgrepDisplayCommand(options: Pick<SemgrepHarnessOptions, "command" | "config">): string {
  if (options.command) {
    return options.command;
  }

  return buildSemgrepCommand(options.config ?? "<local-config>");
}

function buildSemgrepCommand(config: string): string {
  return `semgrep scan --config ${shellQuote(config)} --json --metrics=off --disable-version-check`;
}

function discoverLocalSemgrepConfig(cwd: string): string | undefined {
  return LOCAL_SEMGREP_CONFIG_CANDIDATES.find((candidate) => existsSync(join(cwd, candidate)));
}
