import {
  appendCapabilityAuditEvent,
  authorizeCapability,
  createDefaultCapabilityPolicy,
  detectShellSubstitution
} from "./capability";
import { checkCommandSafety } from "./safety";
import { sanitizeExecutionResult } from "./sanitize-result";
import { spawnCommand } from "./spawn-command";
import type { CommandExecutionResult, RunConfiguredCommandOptions } from "./types";
import { validateRunOptions } from "./validation";

export async function runConfiguredCommand(options: RunConfiguredCommandOptions): Promise<CommandExecutionResult> {
  validateRunOptions(options);

  const intentSource = options.capabilityIntentSource ?? "user-config";
  const policy = options.safety.capabilityPolicy ?? createDefaultCapabilityPolicy();
  const auditEnabled = options.capabilityAudit !== false;

  const substitution = detectShellSubstitution(options.command);
  if (substitution) {
    const reason = `command rejected: ${substitution}`;
    if (auditEnabled) {
      appendCapabilityAuditEvent({
        cwd: options.cwd,
        phase: "denied",
        capability: "command.execute",
        intentSource,
        decision: "deny",
        reason,
        command: options.command
      });
    }

    const message = `Command was blocked by CodeDecay capability policy: ${reason}.`;
    return sanitizeExecutionResult({
      command: options.command,
      status: "blocked",
      durationMs: 0,
      stdout: "",
      stderr: message,
      error: message,
      blockedReason: reason
    });
  }

  if (!options.safety.allowCommands) {
    if (auditEnabled) {
      appendCapabilityAuditEvent({
        cwd: options.cwd,
        phase: "denied",
        capability: "command.execute",
        intentSource,
        decision: "deny",
        reason: "command.execute requires safety.allowCommands user intent",
        command: options.command
      });
    }

    return sanitizeExecutionResult({
      command: options.command,
      status: "skipped",
      durationMs: 0,
      stdout: "",
      stderr: "Command execution is disabled by config safety.allowCommands."
    });
  }

  const authorization = authorizeCapability({
    capability: "command.execute",
    intent: {
      source: intentSource,
      allowCommands: options.safety.allowCommands
    },
    policy,
    command: options.command,
    cwd: options.cwd,
    approval: options.capabilityApproval
  });

  if (auditEnabled) {
    appendCapabilityAuditEvent({
      cwd: options.cwd,
      phase: "requested",
      capability: "command.execute",
      intentSource,
      decision: authorization.allowed ? "allow" : "deny",
      reason: authorization.reason,
      command: options.command
    });
  }

  if (!authorization.allowed) {
    if (auditEnabled) {
      appendCapabilityAuditEvent({
        cwd: options.cwd,
        phase: "denied",
        capability: "command.execute",
        intentSource,
        decision: "deny",
        reason: authorization.reason,
        command: options.command
      });
    }

    const message = `Command was blocked by CodeDecay capability policy: ${authorization.reason}.`;
    return sanitizeExecutionResult({
      command: options.command,
      status: "blocked",
      durationMs: 0,
      stdout: "",
      stderr: message,
      error: message,
      blockedReason: authorization.reason
    });
  }

  if (auditEnabled) {
    appendCapabilityAuditEvent({
      cwd: options.cwd,
      phase: "granted",
      capability: "command.execute",
      intentSource,
      decision: "allow",
      reason: authorization.reason,
      command: options.command
    });
  }

  const safety = checkCommandSafety(options.command);
  if (!safety.safe && !options.safety.allowUnsafeCommands) {
    const message = `Command was blocked by CodeDecay safety policy: ${safety.reason}.`;
    if (auditEnabled) {
      appendCapabilityAuditEvent({
        cwd: options.cwd,
        phase: "denied",
        capability: "command.execute",
        intentSource,
        decision: "deny",
        reason: safety.reason ?? message,
        command: options.command
      });
    }
    return sanitizeExecutionResult({
      command: options.command,
      status: "blocked",
      durationMs: 0,
      stdout: "",
      stderr: message,
      error: message,
      blockedReason: safety.reason
    });
  }

  if (auditEnabled) {
    appendCapabilityAuditEvent({
      cwd: options.cwd,
      phase: "started",
      capability: "command.execute",
      intentSource,
      decision: "allow",
      reason: authorization.reason,
      command: options.command
    });
  }

  const result = sanitizeExecutionResult(await spawnCommand(options));

  if (auditEnabled) {
    const phase =
      result.status === "timed_out"
        ? "timed-out"
        : result.status === "blocked"
          ? "denied"
          : "completed";

    appendCapabilityAuditEvent({
      cwd: options.cwd,
      phase,
      capability: "command.execute",
      intentSource,
      decision: result.status === "blocked" ? "deny" : "allow",
      reason: authorization.reason,
      command: options.command,
      durationMs: result.durationMs,
      status: result.status
    });
  }

  return result;
}
