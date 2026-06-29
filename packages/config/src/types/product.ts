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
