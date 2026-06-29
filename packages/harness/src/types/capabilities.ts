export type HarnessCapability =
  | "agent-reasoning"
  | "test-execution"
  | "browser-flow"
  | "api-fuzzing"
  | "static-analysis"
  | "mutation-testing"
  | "contract-testing"
  | "coverage"
  | "memory"
  | "impact-map"
  | "execution";

export type HarnessFailureMode =
  | "missing-tool"
  | "missing-config"
  | "command-denied"
  | "timeout"
  | "nonzero-exit"
  | "network-required"
  | "unsafe-command"
  | "model-unavailable"
  | "tool-finding"
  | "no-evidence"
  | "internal-error";

export type HarnessRunStatus = "passed" | "failed" | "skipped" | "error" | "timed_out";

export interface ConfigRequirement {
  key: string;
  description: string;
  required: boolean;
}
