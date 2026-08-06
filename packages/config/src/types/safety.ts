import type { CodeDecayCapabilityPolicy } from "./capability-policy";

export interface CodeDecaySafety {
  commandTimeoutMs: number;
  allowCommands: boolean;
  /**
   * Versioned capability policy. Defaults to deny-all elevated capabilities.
   * Does not replace allowCommands; both are required for command.execute.
   */
  capabilityPolicy: CodeDecayCapabilityPolicy;
}
