import type { CapabilityPolicy } from "@submuxhq/codedecay-execution";
import { createSafeCommandPolicy } from "@submuxhq/codedecay-execution";
import type { ToolAdapterExecutionSafety } from "./types";

export function toolAdapterSafeCommandPolicy(options: ToolAdapterExecutionSafety) {
  return createSafeCommandPolicy({
    allowCommands: options.allowCommands ?? false,
    capabilityPolicy: options.capabilityPolicy as CapabilityPolicy | undefined,
    allowUnsafeCommands: options.allowUnsafeCommands
  });
}
