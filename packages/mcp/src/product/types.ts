import type { CodeDecayProductTarget } from "@submuxhq/codedecay-config";
import type { ProductFailureBundle } from "@submuxhq/codedecay-core";

export interface McpProductPlanReport {
  tool: "CodeDecay";
  version: string;
  mode: "mcp-product-plan";
  generatedAt: string;
  configSource?: string | undefined;
  latestReportPath: string;
  targets: McpProductPlanTarget[];
  safety: McpProductSafety;
}

export interface McpProductPlanTarget {
  id: string;
  readiness: CodeDecayProductTarget["readiness"];
  baseUrl?: string | undefined;
  healthCheck?: string | undefined;
  timeoutMs: number;
  apiEndpoints: number;
  artifacts: {
    flowMap: string;
    generatedUiTests: string;
    generatedApiTests: string;
  };
  suggestedCommands: string[];
}

export interface McpProductFailuresReport {
  tool: "CodeDecay";
  version: string;
  mode: "mcp-product-failures";
  generatedAt: string;
  reportPath: string;
  reportFound: boolean;
  failures: ProductFailureBundle[];
  error?: string | undefined;
}

export interface McpProductRunReport {
  tool: "CodeDecay";
  version: string;
  mode: "mcp-product-run";
  generatedAt: string;
  executed: boolean;
  reportPath: string;
  command: string[];
  exitCode?: number | undefined;
  stdout: string;
  stderr: string;
  productReport?: unknown;
  failures: ProductFailureBundle[];
  safety: McpProductSafety;
  error?: string | undefined;
}

export interface McpProductSafety {
  confirmExecutionRequired: true;
  confirmExecution: boolean;
  allowCommands: boolean;
  notes: string[];
}
