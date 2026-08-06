import type {
  CodeDecayAgentBundleFormat,
  CodeDecayAgentProfile,
  CodeDecayCoverageFailOn,
  CodeDecayToolSeverity,
} from "@submuxhq/codedecay-config";
import type { CapabilityPolicy } from "@submuxhq/codedecay-execution";
import type { CodeDecayHarness } from "@submuxhq/codedecay-harness";

export type {
  CodeDecayAgentBundleFormat,
  CodeDecayAgentProcessToolAdapter,
  CodeDecayAgentProfile,
  CodeDecayCoverageFailOn,
  CodeDecayCoverageToolAdapter,
  CodeDecayCommandToolAdapter,
  CodeDecayConfig,
  CodeDecaySchemathesisToolAdapter,
  CodeDecaySemgrepToolAdapter,
  CodeDecayToolSeverity,
  CodeDecayStrykerToolAdapter
} from "@submuxhq/codedecay-config";

export interface ToolAdapterExecutionSafety {
  allowCommands?: boolean | undefined;
  allowUnsafeCommands?: boolean | undefined;
  capabilityPolicy?: CapabilityPolicy | undefined;
  outputLimit?: number | undefined;
}

export interface PlaywrightHarnessOptions extends ToolAdapterExecutionSafety {
  command?: string | undefined;
  timeoutMs?: number | undefined;
}

export interface StrykerHarnessOptions extends ToolAdapterExecutionSafety {
  command?: string | undefined;
  reportPath?: string | undefined;
  timeoutMs?: number | undefined;
}

export interface SchemathesisHarnessOptions extends ToolAdapterExecutionSafety {
  command?: string | undefined;
  schema?: string | undefined;
  baseUrl?: string | undefined;
  timeoutMs?: number | undefined;
}

export interface PactHarnessOptions extends ToolAdapterExecutionSafety {
  command?: string | undefined;
  timeoutMs?: number | undefined;
}

export interface SemgrepHarnessOptions extends ToolAdapterExecutionSafety {
  command?: string | undefined;
  config?: string | undefined;
  reportPath?: string | undefined;
  failOnSeverity?: CodeDecayToolSeverity | undefined;
  timeoutMs?: number | undefined;
}

export interface CoverageHarnessOptions extends ToolAdapterExecutionSafety {
  command?: string | undefined;
  reportPaths?: string[] | undefined;
  failOn?: CodeDecayCoverageFailOn | undefined;
  timeoutMs?: number | undefined;
}

export interface AgentProcessHarnessOptions extends ToolAdapterExecutionSafety {
  command?: string | undefined;
  profile?: CodeDecayAgentProfile | undefined;
  bundleFormat?: CodeDecayAgentBundleFormat | undefined;
  timeoutMs?: number | undefined;
}

export type ConfiguredToolAdapterKind =
  | "agent-process"
  | "playwright"
  | "stryker"
  | "schemathesis"
  | "pact"
  | "semgrep"
  | "coverage";

export interface ConfiguredToolHarness {
  kind: ConfiguredToolAdapterKind;
  name: string;
  command: string;
  timeoutMs?: number | undefined;
  context?: Record<string, unknown> | undefined;
  harness: CodeDecayHarness;
}
