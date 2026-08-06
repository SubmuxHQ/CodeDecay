import { createDefaultCapabilityPolicy } from "./capability";
import type { CapabilityPolicy } from "./capability";
import type { SafeCommandPolicy } from "./types";

export function createSafeCommandPolicy(input: {
  allowCommands: boolean;
  capabilityPolicy?: CapabilityPolicy | undefined;
  allowUnsafeCommands?: boolean | undefined;
}): SafeCommandPolicy {
  const policy: SafeCommandPolicy = {
    allowCommands: input.allowCommands,
    capabilityPolicy: input.capabilityPolicy ?? createDefaultCapabilityPolicy()
  };

  if (input.allowUnsafeCommands !== undefined) {
    policy.allowUnsafeCommands = input.allowUnsafeCommands;
  }

  return policy;
}
