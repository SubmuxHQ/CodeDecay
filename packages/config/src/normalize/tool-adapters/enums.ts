import type {
  CodeDecayAgentBundleFormat,
  CodeDecayAgentProfile,
  CodeDecayCoverageFailOn,
  CodeDecayToolSeverity
} from "../../types";

export function normalizeToolSeverity(value: unknown, field: string, sourcePath: string): CodeDecayToolSeverity {
  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }

  throw new Error(`Invalid CodeDecay config at ${sourcePath}: ${field} must be low, medium, or high.`);
}

export function normalizeAgentProfile(value: unknown, field: string, sourcePath: string): CodeDecayAgentProfile {
  if (
    value === "generic" ||
    value === "codex" ||
    value === "claude-code" ||
    value === "cursor" ||
    value === "pi" ||
    value === "opencode" ||
    value === "desktop"
  ) {
    return value;
  }

  throw new Error(
    `Invalid CodeDecay config at ${sourcePath}: ${field} must be generic, codex, claude-code, cursor, pi, opencode, or desktop.`
  );
}

export function normalizeAgentBundleFormat(value: unknown, field: string, sourcePath: string): CodeDecayAgentBundleFormat {
  if (value === "markdown" || value === "json") {
    return value;
  }

  throw new Error(`Invalid CodeDecay config at ${sourcePath}: ${field} must be markdown or json.`);
}

export function normalizeCoverageFailOn(value: unknown, field: string, sourcePath: string): CodeDecayCoverageFailOn {
  if (value === "none" || value === "uncovered") {
    return value;
  }

  throw new Error(`Invalid CodeDecay config at ${sourcePath}: ${field} must be none or uncovered.`);
}
