import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { analyzeJsProject } from "@submuxhq/codedecay-analyzer-js";
import { createAnalysisReport, type CodeDecayReport, type ImpactedArea } from "@submuxhq/codedecay-core";
import { getGitChangedFiles, getRepoRoot } from "@submuxhq/codedecay-git";
import { renderMarkdownReport } from "@submuxhq/codedecay-report";

export interface StartMcpServerOptions {
  cwd: string;
}

export interface McpToolInput {
  cwd?: string | undefined;
  base?: string | undefined;
  head?: string | undefined;
}

export interface AnalyzePrToolInput extends McpToolInput {
  format?: "markdown" | "json" | undefined;
}

const WEAK_TEST_RULES = new Set([
  "test-without-assertions",
  "snapshot-only-test",
  "mocked-changed-source",
  "unrelated-test-change",
  "copied-implementation-in-test",
  "happy-path-only-test",
  "heavy-mocking",
  "test-bloat"
]);

export async function startMcpServer(options: StartMcpServerOptions): Promise<void> {
  const server = createCodeDecayMcpServer(options);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

export function createCodeDecayMcpServer(options: StartMcpServerOptions): McpServer {
  const server = new McpServer({
    name: "codedecay",
    version: "0.1.2"
  });

  server.tool(
    "analyze_pr",
    "Analyze a pull request or working tree for regression risk and maintainability decay.",
    {
      cwd: z.string().optional().describe("Repository working directory. Defaults to the server cwd."),
      base: z.string().optional().describe("Base git ref or SHA."),
      head: z.string().optional().describe("Head git ref or SHA."),
      format: z.enum(["markdown", "json"]).optional().describe("Response format.")
    },
    async (input) => textResult(runAnalyzePrTool(options, input))
  );

  server.tool(
    "impact_map",
    "Return changed files and likely impacted product/system areas for the PR.",
    {
      cwd: z.string().optional().describe("Repository working directory. Defaults to the server cwd."),
      base: z.string().optional().describe("Base git ref or SHA."),
      head: z.string().optional().describe("Head git ref or SHA.")
    },
    async (input) => textResult(runImpactMapTool(options, input))
  );

  server.tool(
    "audit_tests",
    "Return weak-test findings such as no assertions, snapshot-only tests, mocked changed source, unrelated tests, and copied implementation logic.",
    {
      cwd: z.string().optional().describe("Repository working directory. Defaults to the server cwd."),
      base: z.string().optional().describe("Base git ref or SHA."),
      head: z.string().optional().describe("Head git ref or SHA.")
    },
    async (input) => textResult(runAuditTestsTool(options, input))
  );

  server.tool(
    "suggest_edge_cases",
    "Return deterministic edge-case and real-check suggestions for impacted areas. This does not call an LLM.",
    {
      cwd: z.string().optional().describe("Repository working directory. Defaults to the server cwd."),
      base: z.string().optional().describe("Base git ref or SHA."),
      head: z.string().optional().describe("Head git ref or SHA.")
    },
    async (input) => textResult(runSuggestEdgeCasesTool(options, input))
  );

  return server;
}

export function runAnalyzePrTool(serverOptions: StartMcpServerOptions, input: AnalyzePrToolInput): string {
  const report = createReport(serverOptions, input);
  if (input.format === "json") {
    return JSON.stringify(report, null, 2);
  }

  return renderMarkdownReport(report);
}

export function runImpactMapTool(serverOptions: StartMcpServerOptions, input: McpToolInput): string {
  const report = createReport(serverOptions, input);
  return JSON.stringify(
    {
      changedFiles: report.changedFiles,
      impactedAreas: report.impactedAreas
    },
    null,
    2
  );
}

export function runAuditTestsTool(serverOptions: StartMcpServerOptions, input: McpToolInput): string {
  const report = createReport(serverOptions, input);
  const findings = report.findings.filter((finding) => WEAK_TEST_RULES.has(finding.ruleId));
  return JSON.stringify(
    {
      findings,
      recommendedChecks: report.recommendedTests.filter((check) => isTestAuditRecommendation(check))
    },
    null,
    2
  );
}

export function runSuggestEdgeCasesTool(serverOptions: StartMcpServerOptions, input: McpToolInput): string {
  const report = createReport(serverOptions, input);
  return JSON.stringify(
    {
      recommendedChecks: report.recommendedTests,
      edgeCases: suggestEdgeCases(report.impactedAreas)
    },
    null,
    2
  );
}

function createReport(serverOptions: StartMcpServerOptions, input: McpToolInput): CodeDecayReport {
  const cwd = input.cwd ?? serverOptions.cwd;
  const rootDir = getRepoRoot(cwd);
  const changedFiles = getGitChangedFiles({
    cwd: rootDir,
    base: input.base,
    head: input.head
  });

  const analyzerResult = analyzeJsProject({
    rootDir,
    changedFiles
  });

  return createAnalysisReport({
    base: input.base,
    head: input.head,
    changedFiles,
    analyzerResult
  });
}

function suggestEdgeCases(areas: ImpactedArea[]): string[] {
  const suggestions = new Set<string>();

  for (const area of areas) {
    if (area.kind === "api") {
      suggestions.add("Exercise the real API route with malformed, missing, and boundary-value payloads.");
      suggestions.add("Check auth, validation, and downstream consumers through the route, not only helper functions.");
    }

    if (area.kind === "auth") {
      suggestions.add("Check missing, expired, malformed, and privilege-escalation credentials.");
      suggestions.add("Verify denied paths fail closed and do not silently return privileged defaults.");
    }

    if (area.kind === "database") {
      suggestions.add("Check migration/schema compatibility with existing records and null/default values.");
      suggestions.add("Verify read and write paths that depend on changed schema fields.");
    }

    if (area.kind === "ui") {
      suggestions.add("Check loading, empty, error, and permission-denied UI states.");
      suggestions.add("Exercise the real route through browser or component integration tests.");
    }

    if (area.kind === "config") {
      suggestions.add("Run build/start commands in a clean environment to catch config or packaging regressions.");
      suggestions.add("Verify CI and production-like environment variables still resolve correctly.");
    }
  }

  if (suggestions.size === 0) {
    suggestions.add("Run the relevant unit, integration, and smoke checks for changed packages.");
  }

  return [...suggestions].sort((left, right) => left.localeCompare(right));
}

function isTestAuditRecommendation(check: string): boolean {
  return /assertion|snapshot|integration|real-module|public API|negative|edge-case|exercise/i.test(check);
}

async function textResult(value: string | Promise<string>): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  return {
    content: [
      {
        type: "text",
        text: await value
      }
    ]
  };
}
