export const CAPABILITY_POLICY_VERSION = 1 as const;

export const CAPABILITY_KINDS = [
  "model.call",
  "command.execute",
  "fs.read",
  "fs.write",
  "network",
  "secret.env",
  "package.install",
  "process.start",
  "browser",
  "database",
  "repo.access",
  "git.mutate",
  "artifact.persist"
] as const;

export type CapabilityKind = (typeof CAPABILITY_KINDS)[number];

export type CapabilityIntentSource =
  | "user-config"
  | "cli-flag"
  | "agent"
  | "memory"
  | "mcp"
  | "generated-experiment"
  | "model";

export interface CapabilityAllowRule {
  capability: CapabilityKind;
  paths?: string[] | undefined;
  commands?: string[] | undefined;
  secrets?: string[] | undefined;
  hosts?: string[] | undefined;
}

export interface CapabilityPolicy {
  version: typeof CAPABILITY_POLICY_VERSION;
  allow: CapabilityAllowRule[];
}

export interface CapabilityIntent {
  source: CapabilityIntentSource;
  /** Trusted user intent for command.execute (maps from safety.allowCommands). */
  allowCommands?: boolean | undefined;
}

export interface CapabilityRequest {
  capability: CapabilityKind;
  intent: CapabilityIntent;
  policy: CapabilityPolicy;
  command?: string | undefined;
  paths?: string[] | undefined;
  secrets?: string[] | undefined;
  hosts?: string[] | undefined;
  /** Absolute allowed roots for path-scoped capabilities. */
  allowedRoots?: string[] | undefined;
  cwd?: string | undefined;
}

export interface CapabilityAuthorization {
  allowed: boolean;
  reason: string;
  capability: CapabilityKind;
  intentSource: CapabilityIntentSource;
}

export type CapabilityAuditPhase =
  | "requested"
  | "granted"
  | "denied"
  | "started"
  | "completed"
  | "timed-out"
  | "cancelled";

export interface CapabilityAuditEvent {
  id: string;
  at: string;
  phase: CapabilityAuditPhase;
  capability: CapabilityKind;
  intentSource: CapabilityIntentSource;
  decision: "allow" | "deny";
  reason: string;
  command?: string | undefined;
  paths?: string[] | undefined;
  durationMs?: number | undefined;
  status?: string | undefined;
}

export function createDefaultCapabilityPolicy(): CapabilityPolicy {
  return {
    version: CAPABILITY_POLICY_VERSION,
    allow: []
  };
}
