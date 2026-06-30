import type { AgentProfileId } from "@submuxhq/codedecay-agent";
import type { ImpactedArea, ProductCheckKind, RiskLevel } from "@submuxhq/codedecay-core";
import type { RedteamTaskSource } from "@submuxhq/codedecay-redteam";

export interface McpToolInput {
  cwd?: string | undefined;
  base?: string | undefined;
  head?: string | undefined;
}

export interface AnalyzePrToolInput extends McpToolInput {
  format?: "markdown" | "json" | undefined;
}

export interface AgentTaskBundleToolInput extends AnalyzePrToolInput {
  profile?: AgentProfileId | undefined;
}

export interface ScopeCheckToolInput extends McpToolInput {
  task?: string | undefined;
  fence?: string | undefined;
  files?: string[] | undefined;
  areas?: ImpactedArea["kind"][] | undefined;
}

export type DesignContractCheckToolInput = McpToolInput;

export interface FixTasksToolInput extends McpToolInput {
  source?: RedteamTaskSource | undefined;
  priority?: RiskLevel | undefined;
  file?: string | undefined;
}

export type WhatDidIMissToolInput = McpToolInput;

export type RegressionSurfaceToolInput = McpToolInput;

export interface ExecuteConfiguredChecksToolInput {
  cwd?: string | undefined;
  format?: "markdown" | "json" | undefined;
  confirmExecution?: boolean | undefined;
}

export interface ProductToolInput {
  cwd?: string | undefined;
  target?: string | undefined;
  format?: "markdown" | "json" | undefined;
}

export interface ProductRunToolInput extends ProductToolInput {
  confirmExecution?: boolean | undefined;
  explore?: boolean | undefined;
  generateTests?: boolean | undefined;
  runGeneratedTests?: boolean | undefined;
  generateApiTests?: boolean | undefined;
  runGeneratedApiTests?: boolean | undefined;
  allowDestructiveActions?: boolean | undefined;
  maxPages?: number | undefined;
  maxActions?: number | undefined;
  testId?: string | undefined;
}

export interface ProductRerunToolInput extends ProductToolInput {
  confirmExecution?: boolean | undefined;
  testId?: string | undefined;
  checkKind?: ProductCheckKind | undefined;
}
