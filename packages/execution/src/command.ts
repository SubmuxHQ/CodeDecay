import { checkCommandSafety } from "./safety";
import { spawnCommand } from "./spawn-command";
import type { CommandExecutionResult, RunConfiguredCommandOptions } from "./types";
import { validateRunOptions } from "./validation";

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
