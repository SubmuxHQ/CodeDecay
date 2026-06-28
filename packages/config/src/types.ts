export interface CodeDecayConfig {
  version: 1;
  commands: CodeDecayCommands;
  probes: CodeDecayProbe[];
  safety: CodeDecaySafety;
  llm: CodeDecayLlmConfig;
  toolAdapters: CodeDecayToolAdapters;
  productTesting: CodeDecayProductTestingConfig;
}

export interface CodeDecayCommands {
  test: string[];
  build: string[];
  start: string[];
}

export interface CodeDecayProbe {
  name: string;
  command: string;
  timeoutMs?: number | undefined;
}

export interface CodeDecaySafety {
  commandTimeoutMs: number;
  allowCommands: boolean;
}

export interface CodeDecayLlmConfig {
  provider: "disabled" | "ollama" | "litellm";
  model?: string | undefined;
  endpoint?: string | undefined;
  apiKeyEnv?: string | undefined;
  timeoutMs: number;
}

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

export interface CodeDecayProductTestingConfig {
  targets: Record<string, CodeDecayProductTarget>;
}

export interface CodeDecayProductTarget {
  id: string;
  baseUrl?: string | undefined;
  startCommand?: string | undefined;
  healthCheck?: string | undefined;
  authSetupCommand?: string | undefined;
  teardownCommand?: string | undefined;
  previewUrlEnv?: string | undefined;
  apiEndpoints: CodeDecayProductApiEndpoint[];
  timeoutMs: number;
  readiness: CodeDecayProductTargetReadiness;
}

export type CodeDecayProductApiMethod = "GET" | "HEAD" | "OPTIONS" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface CodeDecayProductApiEndpoint {
  id?: string | undefined;
  method: CodeDecayProductApiMethod;
  path: string;
  expectedStatuses: number[];
  headers?: Record<string, string> | undefined;
  body?: unknown;
}

export type CodeDecayProductTargetReadinessStatus =
  | "ready"
  | "command-required"
  | "needs-command-approval"
  | "missing-preview-url"
  | "unresolved";

export interface CodeDecayProductTargetReadiness {
  status: CodeDecayProductTargetReadinessStatus;
  mode: "base-url" | "preview-url-env" | "start-command" | "unresolved";
  effectiveBaseUrl?: string | undefined;
  commandsRequired: string[];
  commandsAllowed: boolean;
  willRunCommands: false;
  notes: string[];
}

export interface LoadedCodeDecayConfig {
  config: CodeDecayConfig;
  sourcePath?: string | undefined;
}

export interface LoadCodeDecayConfigOptions {
  cwd: string;
}
