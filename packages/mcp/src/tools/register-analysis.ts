import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CodeDecayMcpToolHandlers } from "./registry";
import { textResult } from "./result";
import {
  agentPreflightToolSchema,
  agentInvestigationToolSchema,
  agentSessionToolSchema,
  agentTaskBundleToolSchema,
  analyzePrToolSchema,
  designContractCheckToolSchema,
  fixTasksToolSchema,
  gitContextToolSchema,
  scopeCheckToolSchema,
  taskContextToolSchema,
  contextServiceToolSchema,
  serviceTopologyToolSchema,
  runtimeEvidenceToolSchema,
  migrationSafetyToolSchema,
  concurrencySafetyToolSchema
} from "./schemas";
import type {
  AgentPreflightToolInput,
  AgentInvestigationToolInput,
  AgentSessionToolInput,
  AgentTaskBundleToolInput,
  AnalyzePrToolInput,
  DesignContractCheckToolInput,
  FixTasksToolInput,
  McpToolInput,
  RegressionSurfaceToolInput,
  ScopeCheckToolInput,
  TaskContextToolInput,
  WhatDidIMissToolInput,
  ContextServiceToolInput,
  ServiceTopologyToolInput,
  RuntimeEvidenceToolInput,
  MigrationSafetyToolInput,
  ConcurrencySafetyToolInput
} from "./types";

export function registerAnalysisMcpTools(server: McpServer, handlers: CodeDecayMcpToolHandlers): void {
  server.tool(
    "analyze_pr",
    "Analyze a pull request or working tree for regression risk and maintainability decay.",
    analyzePrToolSchema,
    async (input) => textResult(handlers.analyzePr(input as AnalyzePrToolInput))
  );

  server.tool(
    "impact_map",
    "Return changed files, likely impacted product/system areas, and concrete route/API impacts for the PR.",
    gitContextToolSchema,
    async (input) => textResult(handlers.impactMap(input as McpToolInput))
  );

  server.tool(
    "audit_tests",
    "Return missing-test and weak-test proof findings such as no changed tests, no assertions, snapshot-only tests, mocked changed source, unrelated tests, and copied implementation logic.",
    gitContextToolSchema,
    async (input) => textResult(handlers.auditTests(input as McpToolInput))
  );

  server.tool(
    "suggest_edge_cases",
    "Return structured, ranked behavior scenarios plus recommended checks for impacted surfaces. This does not call an LLM.",
    gitContextToolSchema,
    async (input) => textResult(handlers.suggestEdgeCases(input as McpToolInput))
  );

  server.tool(
    "tool_recommendations",
    "Return local OSS tool recommendations for this repository shape. Does not install tools, execute commands, call models, or use network access.",
    analyzePrToolSchema,
    async (input) => textResult(handlers.toolRecommendations(input as AnalyzePrToolInput))
  );

  server.tool(
    "pattern_search",
    "Return local pattern-pack matches for changed areas so user-owned agents can consider known edge cases and weak-test traps.",
    gitContextToolSchema,
    async (input) => textResult(handlers.patternSearch(input as McpToolInput))
  );

  server.tool(
    "redteam_report",
    "Return a deterministic CodeDecay redteam report for an MCP-compatible agent. Report-only: does not execute commands or call models.",
    analyzePrToolSchema,
    async (input) => textResult(handlers.redteamReport(input as AnalyzePrToolInput))
  );

  server.tool(
    "agent_task_bundle",
    "Return a deterministic CodeDecay task bundle that user-owned coding agents can use to fix PR risks. Report-only: does not execute commands or call models.",
    agentTaskBundleToolSchema,
    async (input) => textResult(handlers.agentTaskBundle(input as AgentTaskBundleToolInput))
  );

  server.tool(
    "agent_investigation",
    "Explicitly call the configured user-owned provider with grounded CodeDecay evidence. Suggestions remain untrusted.",
    agentInvestigationToolSchema,
    async (input) => textResult(handlers.agentInvestigation(input as AgentInvestigationToolInput))
  );

  server.tool(
    "agent_preflight",
    "Return deterministic before-coding guidance for a user-owned coding agent from repo paths, local config, design contracts, and memory. Does not require a git diff, execute commands, or call models.",
    agentPreflightToolSchema,
    async (input) => textResult(handlers.agentPreflight(input as AgentPreflightToolInput))
  );

  server.tool(
    "agent_session",
    "Run a durable CodeDecay before-during-after guidance session operation: start, context, checkpoint, or finish. Does not execute commands, call models, send telemetry, commit, or push.",
    agentSessionToolSchema,
    async (input) => textResult(handlers.agentSession(input as AgentSessionToolInput))
  );

  server.tool(
    "task_context",
    "Return bounded task-scoped engineering context with stable evidence IDs, provenance, trust class, freshness, and relevance explanations. Does not execute commands, call models, or use network access.",
    taskContextToolSchema,
    async (input) => textResult(handlers.taskContext(input as TaskContextToolInput))
  );

  server.tool(
    "context_service",
    "Query the local incremental context service (health/query/rebuild/start). Local-only; no model, network, telemetry, or project-command calls.",
    contextServiceToolSchema,
    async (input) => textResult(handlers.contextService(input as ContextServiceToolInput))
  );

  server.tool(
    "service_topology",
    "Build cross-repository service topology impact from local manifests and OpenAPI/AsyncAPI contracts. Local-only; no clone, network, model, or telemetry calls.",
    serviceTopologyToolSchema,
    async (input) => textResult(handlers.serviceTopology(input as ServiceTopologyToolInput))
  );

  server.tool(
    "runtime_evidence",
    "Ingest local OpenTelemetry/error exports as redacted runtime evidence. Local-only; historical evidence cannot prove the current tree.",
    runtimeEvidenceToolSchema,
    async (input) => textResult(handlers.runtimeEvidence(input as RuntimeEvidenceToolInput))
  );

  server.tool(
    "migration_safety",
    "Plan-only PostgreSQL migration safety analysis with mixed-version matrix, target gates, and cleanup obligations. Does not connect to a database.",
    migrationSafetyToolSchema,
    async (input) => textResult(handlers.migrationSafety(input as MigrationSafetyToolInput))
  );

  server.tool(
    "concurrency_safety",
    "Evaluate deterministic concurrency/idempotency experiment fixtures with bounds gates and state oracles. Does not spawn schedulers or contact production queues.",
    concurrencySafetyToolSchema,
    async (input) => textResult(handlers.concurrencySafety(input as ConcurrencySafetyToolInput))
  );

  server.tool(
    "scope_check",
    "Return a deterministic in-scope/out-of-scope verdict for the current PR or working tree.",
    scopeCheckToolSchema,
    async (input) => textResult(handlers.scopeCheck(input as ScopeCheckToolInput))
  );

  server.tool(
    "design_contract_check",
    "Return deterministic design contract violations for layering, scope, dependency, banned API, and pattern rules.",
    designContractCheckToolSchema,
    async (input) => textResult(handlers.designContractCheck(input as DesignContractCheckToolInput))
  );

  server.tool(
    "fix_tasks",
    "Return deterministic fix tasks for user-owned coding agents, optionally filtered by source, priority, or file.",
    fixTasksToolSchema,
    async (input) => textResult(handlers.fixTasks(input as FixTasksToolInput))
  );

  server.tool(
    "what_did_i_miss",
    "Return deterministic missed-risk evidence: weak tests, missing tests, edge cases, impacted routes, product failures, and contract violations.",
    gitContextToolSchema,
    async (input) => textResult(handlers.whatDidIMiss(input as WhatDidIMissToolInput))
  );

  server.tool(
    "regression_surface",
    "Return deterministic repo-memory surfaces touched by this PR, including invariants and past regressions.",
    gitContextToolSchema,
    async (input) => textResult(handlers.regressionSurface(input as RegressionSurfaceToolInput))
  );
}
