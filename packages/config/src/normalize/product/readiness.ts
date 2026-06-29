import type {
  CodeDecayProductTarget,
  CodeDecayProductTargetReadiness,
  CodeDecaySafety
} from "../../types";
import { normalizeRuntimeUrl } from "../primitives";

export function createProductTargetReadiness(
  target: Omit<CodeDecayProductTarget, "readiness">,
  safety: CodeDecaySafety
): CodeDecayProductTargetReadiness {
  const commandsRequired = [
    target.authSetupCommand,
    target.startCommand,
    target.teardownCommand
  ].filter((command): command is string => command !== undefined);
  const resolvedPreviewUrl = target.previewUrlEnv ? process.env[target.previewUrlEnv] : undefined;
  const effectiveBaseUrl = target.baseUrl ?? (resolvedPreviewUrl ? normalizeRuntimeUrl(resolvedPreviewUrl) : undefined);
  const notes: string[] = ["Config loading never executes product target commands."];

  if (effectiveBaseUrl) {
    if (target.baseUrl) {
      notes.push("Target can use an already-running app at baseUrl.");
    } else if (target.previewUrlEnv) {
      notes.push(`Target resolved preview URL from ${target.previewUrlEnv}.`);
    }

    return {
      status: "ready",
      mode: target.baseUrl ? "base-url" : "preview-url-env",
      effectiveBaseUrl,
      commandsRequired,
      commandsAllowed: safety.allowCommands,
      willRunCommands: false,
      notes
    };
  }

  if (target.previewUrlEnv) {
    notes.push(`Environment variable ${target.previewUrlEnv} is not set or is not a valid URL.`);
    return {
      status: "missing-preview-url",
      mode: "preview-url-env",
      commandsRequired,
      commandsAllowed: safety.allowCommands,
      willRunCommands: false,
      notes
    };
  }

  if (target.startCommand) {
    notes.push(
      safety.allowCommands
        ? "Target requires explicit execution to start the app before verification."
        : "Target start command is configured but safety.allowCommands is false."
    );
    return {
      status: safety.allowCommands ? "command-required" : "needs-command-approval",
      mode: "start-command",
      commandsRequired,
      commandsAllowed: safety.allowCommands,
      willRunCommands: false,
      notes
    };
  }

  notes.push("Target needs baseUrl, previewUrlEnv, or startCommand before product verification can run.");
  return {
    status: "unresolved",
    mode: "unresolved",
    commandsRequired,
    commandsAllowed: safety.allowCommands,
    willRunCommands: false,
    notes
  };
}
