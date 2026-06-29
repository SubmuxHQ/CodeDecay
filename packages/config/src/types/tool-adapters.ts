export interface CodeDecayToolAdapters {
  agentProcess?: CodeDecayAgentProcessToolAdapter | undefined;
  playwright?: CodeDecayCommandToolAdapter | undefined;
  stryker?: CodeDecayStrykerToolAdapter | undefined;
  schemathesis?: CodeDecaySchemathesisToolAdapter | undefined;
  pact?: CodeDecayCommandToolAdapter | undefined;
  semgrep?: CodeDecaySemgrepToolAdapter | undefined;
  coverage?: CodeDecayCoverageToolAdapter | undefined;
}

export interface CodeDecayCommandToolAdapter {
  enabled: boolean;
  command?: string | undefined;
  timeoutMs?: number | undefined;
}

export type CodeDecayAgentProfile = "generic" | "codex" | "claude-code" | "cursor" | "pi" | "opencode" | "desktop";
export type CodeDecayAgentBundleFormat = "markdown" | "json";

export interface CodeDecayAgentProcessToolAdapter extends CodeDecayCommandToolAdapter {
  profile?: CodeDecayAgentProfile | undefined;
  bundleFormat?: CodeDecayAgentBundleFormat | undefined;
}

export interface CodeDecaySchemathesisToolAdapter extends CodeDecayCommandToolAdapter {
  schema?: string | undefined;
  baseUrl?: string | undefined;
}

export interface CodeDecayStrykerToolAdapter extends CodeDecayCommandToolAdapter {
  reportPath?: string | undefined;
}

export type CodeDecayToolSeverity = "low" | "medium" | "high";

export interface CodeDecaySemgrepToolAdapter extends CodeDecayCommandToolAdapter {
  config?: string | undefined;
  reportPath?: string | undefined;
  failOnSeverity?: CodeDecayToolSeverity | undefined;
}

export type CodeDecayCoverageFailOn = "none" | "uncovered";

export interface CodeDecayCoverageToolAdapter extends CodeDecayCommandToolAdapter {
  reportPaths?: string[] | undefined;
  failOn?: CodeDecayCoverageFailOn | undefined;
}
