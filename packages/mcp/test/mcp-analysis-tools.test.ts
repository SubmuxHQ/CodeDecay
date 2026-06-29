import { describe, expect, it } from "vitest";
import {
  createCodeDecayMcpServer,
  runAnalyzePrTool,
  runAgentTaskBundleTool,
  runAuditTestsTool,
  runExecuteConfiguredChecksTool,
  runImpactMapTool,
  runProductFailuresTool,
  runProductPlanTool,
  runProductRerunTool,
  runProductRunTool,
  runRedteamReportTool,
  runSuggestEdgeCasesTool
} from "../src/index";
import {
  createExecutionRepo,
  createMissingTestRepo,
  createProductRepo,
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

    expect(output.edgeCases).toContain("Check missing, expired, malformed, and privilege-escalation credentials.");
    expect(output.recommendedChecks).toContain("Add real assertions to src/auth/session.test.ts");
  });

  it("includes route/API proof recommendations in MCP edge-case suggestions", () => {
    const repo = createRouteImpactRepo();

    const output = JSON.parse(runSuggestEdgeCasesTool({ cwd: repo }, {}));

    expect(output.edgeCases).toEqual(
      expect.arrayContaining([
        "Add or run tests covering src/app/api/users/route.ts",
        "Add or run tests covering src/app/dashboard/page.tsx",
        "Exercise the real API route with malformed, missing, and boundary-value payloads."
      ])
    );
    expect(output.recommendedChecks).toEqual(
      expect.arrayContaining([
        "Add or run tests covering src/app/api/users/route.ts",
        "Add or run tests covering src/app/dashboard/page.tsx"
      ])
    );
  });
});
