import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createCodeDecayMcpServer,
  runAnalyzePrTool,
  runAgentSessionTool,
  runAgentTaskBundleTool,
  runAuditTestsTool,
  runExecuteConfiguredChecksTool,
  runImpactMapTool,
  runPatternSearchTool,
  runProductFailuresTool,
  runProductPlanTool,
  runProductRerunTool,
  runProductRunTool,
  runRedteamReportTool,
  runSuggestEdgeCasesTool,
  runTaskContextTool,
  runToolRecommendationsTool
} from "../src/index";
import {
  createExecutionRepo,
  createMissingTestRepo,
  createProductRepo,
  createRepo,
  createRouteImpactRepo,
  createTempDir,
  createWeakTestRepo,
  marker,
  productMarker,
  writeFakeProductCli,
  writeFile
} from "./helpers/mcp";

describe("CodeDecay MCP analysis tools", () => {
  it("creates an MCP server", () => {
    const server = createCodeDecayMcpServer({ cwd: createTempDir() });

    expect(server).toBeTruthy();
  });

  it("returns a markdown PR analysis", () => {
    const repo = createWeakTestRepo();

    const output = runAnalyzePrTool({ cwd: repo }, { format: "markdown" });

    expect(output).toContain("## CodeDecay Report");
    expect(output).toContain("Changed test has no assertions");
  });

  it("returns an impact map", () => {
    const repo = createRouteImpactRepo();

    const output = JSON.parse(runImpactMapTool({ cwd: repo }, {}));
    const analysis = JSON.parse(runAnalyzePrTool({ cwd: repo }, { format: "json" }));

    expect(output.impactedAreas.map((area: { kind: string }) => area.kind)).toEqual(
      expect.arrayContaining(["api", "ui"])
    );
    expect(output.changedFiles.map((file: { path: string }) => file.path)).toEqual(
      expect.arrayContaining(["src/app/api/users/route.ts", "src/app/dashboard/page.tsx"])
    );
    expect(output.impactedRoutes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          framework: "nextjs",
          kind: "api-route",
          route: "/api/users",
          methods: ["GET", "POST"],
          risk: "high"
        }),
        expect.objectContaining({
          framework: "nextjs",
          kind: "ui-route",
          route: "/dashboard",
          methods: [],
          risk: "medium"
        })
      ])
    );
    expect(output.impactGraph).toMatchObject({
      schemaVersion: 1,
      artifactPath: ".codedecay/local/impact-graph.json",
      adapterCount: 1,
      adapters: [
        expect.objectContaining({
          id: "codedecay-js-babel-symbols",
          sourceTool: "@babel/parser",
          status: "available"
        })
      ]
    });
    expect(output.impactGraph).toEqual(analysis.impactGraph);
  });

  it("returns task-scoped context with provenance, trust, and persisted artifact", () => {
    const repo = createRouteImpactRepo();

    const output = JSON.parse(runTaskContextTool({ cwd: repo }, {
      task: "update users API and dashboard context",
      format: "json",
      maxNodes: 12
    }));

    expect(output.safety).toMatchObject({
      llmCalled: false,
      commandsExecuted: false,
      telemetrySent: false,
      cloudDependency: false,
      memoryTrustedAsFact: false
    });
    expect(output.graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "route:get|post:/api/users",
          kind: "api",
          trustClass: "current-revision-fact",
          provenance: expect.arrayContaining([
            expect.objectContaining({ kind: expect.stringMatching(/tool-evidence|impact-graph/) })
          ])
        }),
        expect.objectContaining({
          id: "file:src/app/dashboard/page.tsx",
          kind: "file"
        })
      ])
    );
    expect(output.selected[0]).toMatchObject({
      rank: 1,
      reasons: expect.arrayContaining([expect.stringMatching(/Matched task term/i)])
    });
    expect(existsSync(join(repo, ".codedecay/local/task-context.json"))).toBe(true);
  });

  it("runs agent session lifecycle operations without model or command execution", () => {
    const repo = createRepo({
      "src/app/api/billing/payouts/retry/route.ts": [
        "export async function POST() {",
        "  return Response.json({ status: 'queued' });",
        "}",
        ""
      ].join("\n"),
      "src/billing/payouts.ts": "export function retryPayout(id: string) { return { id, status: 'queued' }; }\n",
      ".codedecay/config.yml": [
        "version: 1",
        "commands:",
        "  test: pnpm test",
        "safety:",
        "  allowCommands: false",
        ""
      ].join("\n")
    });

    const started = JSON.parse(runAgentSessionTool({ cwd: repo }, {
      operation: "start",
      sessionId: "mcp-session",
      task: "Allow payout retries with api_key=sk-mcp-secret",
      format: "json",
      requirements: {
        acceptanceCriteria: [
          {
            id: "AC-1",
            text: "Retry payouts are idempotent",
            requiredProof: ["integration test"]
          }
        ]
      }
    }));

    expect(started.session).toMatchObject({
      id: "mcp-session",
      status: "active",
      safety: {
        llmCalled: false,
        commandsExecuted: false,
        telemetrySent: false,
        cloudDependency: false,
        agentOutputTrusted: false
      }
    });
    expect(JSON.stringify(started)).not.toContain("sk-mcp-secret");

    writeFile(
      repo,
      "src/billing/payouts.ts",
      "export function retryPayout(id: string) { return { id, status: 'queued', retryCount: 1 }; }\n"
    );

    const refreshed = JSON.parse(runAgentSessionTool({ cwd: repo }, {
      operation: "context",
      sessionId: "mcp-session",
      format: "json",
      maxNodes: 8
    }));

    expect(refreshed.stale).toBe(true);
    expect(refreshed.session.status).toBe("stale");
    expect(refreshed.session.evidenceRefs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "task-context", artifactPath: ".codedecay/local/task-context.json" })
      ])
    );
    expect(existsSync(join(repo, ".codedecay/local/task-context.json"))).toBe(true);

    const checkpointed = JSON.parse(runAgentSessionTool({ cwd: repo }, {
      operation: "checkpoint",
      sessionId: "mcp-session",
      checkpointKind: "diff",
      summary: "Retry count added",
      agentOutput: "agent saw token=must-redact",
      format: "json"
    }));

    expect(checkpointed.session.status).toBe("active");
    expect(checkpointed.session.checkpoints[0]).toMatchObject({
      kind: "diff",
      agentOutputTrusted: false
    });
    expect(JSON.stringify(checkpointed)).not.toContain("must-redact");

    const finished = JSON.parse(runAgentSessionTool({ cwd: repo }, {
      operation: "finish",
      sessionId: "mcp-session",
      format: "json"
    }));

    expect(finished.session.status).toBe("needs-verification");
    expect(finished.verification.allowedChecks).toContain("test: pnpm test");
    expect(finished.verification.commandsExecuted).toBe(false);
  });

  it("returns weak-test audit findings", () => {
    const repo = createWeakTestRepo();

    const output = JSON.parse(runAuditTestsTool({ cwd: repo }, {}));

    expect(output.status).toBe("weak");
    expect(output.missingTestFindings).toEqual([]);
    expect(output.weakTestFindings.map((finding: { ruleId: string }) => finding.ruleId)).toContain(
      "test-without-assertions"
    );
    expect(output.findings.map((finding: { ruleId: string }) => finding.ruleId)).toContain("test-without-assertions");
    expect(output.recommendedChecks).toContain("Add meaningful assertions to src/auth/session.test.ts.");
  });

  it("returns missing-test audit findings", () => {
    const repo = createMissingTestRepo();

    const output = JSON.parse(runAuditTestsTool({ cwd: repo }, {}));

    expect(output.status).toBe("missing");
    expect(output.missingTestFindings.map((finding: { ruleId: string }) => finding.ruleId)).toContain(
      "missing-nearby-tests"
    );
    expect(output.weakTestFindings).toEqual([]);
    expect(output.findings.map((finding: { ruleId: string }) => finding.ruleId)).toContain("missing-nearby-tests");
    expect(output.recommendedChecks).toEqual(
      expect.arrayContaining([
        "Add or run tests that exercise src/api/users.ts through its public behavior path.",
        "Add or run tests covering src/api/users.ts"
      ])
    );
  });

  it("returns deterministic edge-case suggestions", () => {
    const repo = createWeakTestRepo();

    const output = JSON.parse(runSuggestEdgeCasesTool({ cwd: repo }, {}));

    expect(output.edgeCases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "auth-fail-closed",
          trigger: expect.stringMatching(/missing.*expired.*lower-privilege/i),
          scope: expect.objectContaining({
            files: ["src/auth/session.ts"]
          })
        })
      ])
    );
    expect(output.recommendedChecks).toContain("Add real assertions to src/auth/session.test.ts");
  });

  it("includes route/API proof recommendations in MCP edge-case suggestions", () => {
    const repo = createRouteImpactRepo();

    const output = JSON.parse(runSuggestEdgeCasesTool({ cwd: repo }, {}));

    expect(output.edgeCases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "api-invalid-input",
          scope: expect.objectContaining({
            routes: ["GET|POST /api/users"]
          }),
          proof: expect.objectContaining({ kind: "api-integration" })
        }),
        expect.objectContaining({
          id: "ui-empty-error-permission",
          scope: expect.objectContaining({
            routes: ["/dashboard"]
          }),
          proof: expect.objectContaining({ kind: "browser" })
        })
      ])
    );
    expect(output.edgeCases.map((scenario: { title: string }) => scenario.title).join("\n")).not.toContain(
      "Add or run tests covering"
    );
    expect(output.recommendedChecks).toEqual(
      expect.arrayContaining([
        "Add or run tests covering src/app/api/users/route.ts",
        "Add or run tests covering src/app/dashboard/page.tsx"
      ])
    );
  });

  it("returns OSS tool recommendations and pattern-pack matches", () => {
    const repo = createRouteImpactRepo();
    writeFile(
      repo,
      "package.json",
      JSON.stringify(
        {
          packageManager: "pnpm@11.8.0",
          scripts: { test: "vitest run" },
          dependencies: {
            next: "15.0.0",
            react: "19.0.0"
          },
          devDependencies: {
            vitest: "3.0.0"
          }
        },
        null,
        2
      )
    );
    writeFile(repo, "docs/openapi.yaml", "openapi: 3.1.0\ninfo:\n  title: Demo\n  version: 1.0.0\npaths: {}\n");

    const recommendations = JSON.parse(runToolRecommendationsTool({ cwd: repo }, { format: "json" }));
    expect(recommendations.safety.commandsExecuted).toBe(false);
    expect(recommendations.recommendations.map((recommendation: { tool: { id: string } }) => recommendation.tool.id)).toEqual(
      expect.arrayContaining(["playwright", "schemathesis", "semgrep"])
    );

    const patterns = JSON.parse(runPatternSearchTool({ cwd: repo }, {}));
    expect(patterns.patterns.map((pattern: { id: string }) => pattern.id)).toContain("api-schema-fuzz-boundaries");
  });
});
