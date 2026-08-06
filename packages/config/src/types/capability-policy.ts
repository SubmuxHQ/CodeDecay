export const CODEDECAY_CAPABILITY_POLICY_VERSION = 1 as const;

export const CODEDECAY_CAPABILITY_KINDS = [
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

export type CodeDecayCapabilityKind = (typeof CODEDECAY_CAPABILITY_KINDS)[number];

export interface CodeDecayCapabilityAllowRule {
  capability: CodeDecayCapabilityKind;
  /** Repo-relative or absolute path prefixes for fs/artifact scopes. */
  paths?: string[] | undefined;
  /** Optional command prefixes/exact matches for command.execute. */
  commands?: string[] | undefined;
  /** Allowed environment variable names for secret.env. */
  secrets?: string[] | undefined;
  /** Allowed hostnames for network. */
  hosts?: string[] | undefined;
}

/**
 * Versioned capability policy. Default is deny-all elevated capabilities.
 * `safety.allowCommands` remains separate trusted user intent for command.execute.
 */
export interface CodeDecayCapabilityPolicy {
  version: typeof CODEDECAY_CAPABILITY_POLICY_VERSION;
  allow: CodeDecayCapabilityAllowRule[];
}
