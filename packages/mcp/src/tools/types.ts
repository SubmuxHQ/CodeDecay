import type { AgentProfileId } from "@submuxhq/codedecay-agent";
import type { ProductCheckKind } from "@submuxhq/codedecay-core";

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
