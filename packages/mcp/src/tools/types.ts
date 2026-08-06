import type { AgentProfileId, AgentSessionCheckpointKind } from "@submuxhq/codedecay-agent";
import type {
  ImpactedArea,
  ProductCheckKind,
  RequirementContextInput,
  RiskLevel
} from "@submuxhq/codedecay-core";
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

export interface AgentInvestigationToolInput extends AgentTaskBundleToolInput {
  confirmInvestigation?: boolean | undefined;
}

export interface AgentPreflightToolInput {
  cwd?: string | undefined;
  task: string;
  requirements?: RequirementContextInput | undefined;
  format?: "markdown" | "json" | undefined;
}

export interface TaskContextToolInput extends McpToolInput {
  task: string;
  requirements?: RequirementContextInput | undefined;
  format?: "markdown" | "json" | undefined;
  maxNodes?: number | undefined;
}

export interface ContextServiceToolInput {
  cwd?: string | undefined;
  operation?: "health" | "query" | "rebuild" | "start" | undefined;
  sessionId?: string | undefined;
  task?: string | undefined;
  waitBudgetMs?: number | undefined;
}

export interface ServiceTopologyToolInput {
  cwd?: string | undefined;
  format?: "markdown" | "json" | undefined;
  manifest?: string | undefined;
  openapi?: string[] | undefined;
  asyncapi?: string[] | undefined;
  localGraph?: string | undefined;
  changed?: string[] | undefined;
  invalidate?: string[] | undefined;
  repositoryId?: string | undefined;
  revision?: string | undefined;
  producerServiceId?: string | undefined;
  publisherServiceId?: string | undefined;
  subscriberServiceId?: string | undefined;
}

export interface RuntimeEvidenceToolInput {
  cwd?: string | undefined;
  format?: "markdown" | "json" | undefined;
  telemetry?: string | undefined;
  errors?: string | undefined;
  topology?: string | undefined;
  headRevision?: string | undefined;
  environment?: string | undefined;
}

export interface MigrationSafetyToolInput {
  cwd?: string | undefined;
  format?: "markdown" | "json" | undefined;
  files?: string[] | undefined;
  rollbackFiles?: string[] | undefined;
  targetKind?: "unspecified" | "disposable-local" | "remote-unapproved" | "production-like" | undefined;
  connectionUrl?: string | undefined;
  connectionHost?: string | undefined;
  databaseUrlEnv?: string | undefined;
  cleanupPlan?: string | undefined;
  rollbackFailed?: boolean | undefined;
}

export interface ConcurrencySafetyToolInput {
  cwd?: string | undefined;
  format?: "markdown" | "json" | undefined;
  experimentFile?: string | undefined;
  surfaceFiles?: string[] | undefined;
  targetKind?: "unspecified" | "fixture-local" | "disposable-local" | "remote-unapproved" | "production-like" | undefined;
  cleanupPlan?: string | undefined;
}

export interface AgentSessionToolInput {
  cwd?: string | undefined;
  operation: "start" | "context" | "checkpoint" | "finish";
  sessionId?: string | undefined;
  task?: string | undefined;
  requirements?: RequirementContextInput | undefined;
  format?: "markdown" | "json" | undefined;
  profile?: AgentProfileId | undefined;
  maxNodes?: number | undefined;
  maxPromptChars?: number | undefined;
  checkpointKind?: Exclude<AgentSessionCheckpointKind, "finish"> | undefined;
  summary?: string | undefined;
  agentOutput?: string | undefined;
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
