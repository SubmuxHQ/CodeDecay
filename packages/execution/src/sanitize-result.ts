import { redactSecretsFromText, redactSecretsFromUnknown } from "./capability/redact";
import type { CommandExecutionResult } from "./types";

export function sanitizeExecutionResult(result: CommandExecutionResult): CommandExecutionResult {
  const sanitized: CommandExecutionResult = {
    command: redactSecretsFromText(result.command),
    status: result.status,
    durationMs: result.durationMs,
    stdout: redactSecretsFromText(result.stdout),
    stderr: redactSecretsFromText(result.stderr)
  };

  const error = redactSecretsFromUnknown(result.error);
  if (error !== undefined) {
    sanitized.error = error;
  }

  const blockedReason = redactSecretsFromUnknown(result.blockedReason);
  if (blockedReason !== undefined) {
    sanitized.blockedReason = blockedReason;
  }

  if (result.exitCode !== undefined) {
    sanitized.exitCode = result.exitCode;
  }

  return sanitized;
}
