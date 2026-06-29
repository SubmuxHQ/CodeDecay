import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AnalyzerResult, FileChange, ImpactedArea } from "@submuxhq/codedecay-core";
import {
  applyMemoryContext,
  createLocalMemoryProvider,
  createMemoryProviderRegistry,
  importCodeDecayMemory,
  learnCodeDecayMemory,
  loadCodeDecayMemory,
  loadCodeDecayMemoryFromProvider,
  writeCodeDecayMemory,
  type MemoryProvider
} from "../src/index";
import { createTempDir, fakeProvider, writeJson, writeText } from "./helpers/memory";

describe("CodeDecay memory import and learning", () => {
  it("imports structured learnings and merges duplicate entries", () => {
    const result = importCodeDecayMemory(
      {
        version: 1,
        flows: [{ name: "Checkout", checks: ["existing smoke"], areas: ["api"] }],
        commands: [],
        invariants: [{ name: "Auth fails closed", description: "Existing invariant.", areas: ["auth"], severity: "medium" }],
        architecture: [],
        regressions: [{ title: "Anonymous admin", description: "Existing regression.", areas: ["auth"], severity: "medium" }]
      },
      {
        version: 1,
        flows: [{ name: "Checkout", checks: ["failed card retry"], areas: ["ui"] }],
        incidents: [{ title: "Anonymous admin", description: "Tokenless request became admin.", check: "request protected route without token", areas: ["auth"] }],
        pullRequests: [
          {
            title: "Billing rollout",
            description: "Merged rollout changed invoice flow.",
            checks: ["invoice retry path"],
            command: "pnpm test billing",
            areas: ["api", "ui"]
          }
        ]
      },
      "import.json"
    );

    expect(result.added).toMatchObject({
      flows: 1,
      commands: 1,
      architecture: 1
    });
    expect(result.merged).toMatchObject({
      flows: 1,
      regressions: 1
    });
    expect(result.memory.flows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Checkout", checks: ["existing smoke", "failed card retry"] }),
        expect.objectContaining({ name: "Billing rollout", checks: ["invoice retry path"] })
      ])
    );
    expect(result.memory.regressions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: "Anonymous admin", check: "request protected route without token", severity: "high" }),
        expect.objectContaining({ title: "Billing rollout", check: "invoice retry path" })
      ])
    );
  });

  it("writes merged memory back to .codedecay/memory.json", () => {
    const root = createTempDir();
    const sourcePath = writeCodeDecayMemory(root, {
      version: 1,
      flows: [{ name: "Checkout", checks: ["existing smoke"], areas: ["api"] }],
      commands: [],
      invariants: [],
      architecture: [],
      regressions: []
    });
    const loaded = loadCodeDecayMemory(root);

    expect(sourcePath).toBe(join(root, ".codedecay/memory.json"));
    expect(loaded.memory.flows[0]?.name).toBe("Checkout");
  });

  it("learns local memory from CI failures, PR text, and CodeDecay reports", () => {
    const result = learnCodeDecayMemory(
      {
        version: 1,
        flows: [],
        commands: [],
        invariants: [],
        architecture: [],
        regressions: []
      },
      {
        ciFailures: [
          {
            title: "Auth smoke failed",
            message: "Token refresh returned 401 after deploy.",
            command: "pnpm test auth",
            files: ["src/auth/session.ts"]
          }
        ],
        pullRequests: [
          {
            title: "fix: auth token not refreshing on 401",
            body: "Restores session refresh for expired access tokens.",
            commits: ["fix auth retry path"],
            changedFiles: ["src/app/api/session/route.ts"],
            checks: ["expired token refresh"]
          }
        ],
        reports: [
          {
            tool: "CodeDecay",
            findings: [
              {
                ruleId: "missing-nearby-tests",
                title: "Risky source changes without changed tests",
                description: "Auth source changed without a test update.",
                severity: "high",
                file: "src/auth/session.ts"
              }
            ],
            impactedAreas: [{ kind: "auth" }],
            recommendedTests: ["Add missing-token auth regression test"]
          }
        ]
      },
      "learn.json"
    );

    expect(result.learned).toMatchObject({
      flows: 1,
      commands: 1,
      architecture: 1,
      regressions: 3
    });
    expect(result.memory.commands).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Auth smoke failed check", command: "pnpm test auth" })])
    );
    expect(result.memory.flows).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "fix: auth token not refreshing on 401" })])
    );
    expect(result.memory.regressions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: "Auth smoke failed", severity: "high", areas: expect.arrayContaining(["auth"]) }),
        expect.objectContaining({ title: "fix: auth token not refreshing on 401", severity: "medium" }),
        expect.objectContaining({ title: "CodeDecay: Risky source changes without changed tests", severity: "high" })
      ])
    );
  });

  it("skips self-referential CodeDecay gate findings without concrete evidence", () => {
    const result = learnCodeDecayMemory(
      {
        version: 1,
        flows: [],
        commands: [],
        invariants: [],
        architecture: [],
        regressions: []
      },
      {
        tool: "CodeDecay",
        findings: [{ severity: "high" }]
      },
      "codedecay-gate.json"
    );

    expect(result.learned.regressions).toBe(0);
    expect(result.memory.regressions).toEqual([]);
  });

  it("keeps unrelated same-title CI failures as separate regressions", () => {
    const result = learnCodeDecayMemory(
      {
        version: 1,
        flows: [],
        commands: [],
        invariants: [],
        architecture: [],
        regressions: []
      },
      {
        ciFailures: [
          {
            title: "pytest failed",
            message: "Billing refund flow returned 500 after gateway timeout.",
            command: "pytest tests/billing/test_refunds.py"
          },
          {
            title: "pytest failed",
            message: "Auth refresh accepted an expired token after clock skew.",
            command: "pytest tests/auth/test_refresh.py"
          }
        ]
      },
      "ci-failures.json"
    );

    expect(result.learned.regressions).toBe(2);
    expect(result.added.regressions).toBe(2);
    expect(result.memory.regressions).toHaveLength(2);
    expect(result.memory.regressions.map((regression) => regression.description)).toEqual(
      expect.arrayContaining([
        "Billing refund flow returned 500 after gateway timeout.",
        "Auth refresh accepted an expired token after clock skew."
      ])
    );
  });

  it("learns product memory from failed and passing generated product checks", () => {
    const result = learnCodeDecayMemory(
      {
        version: 1,
        flows: [],
        commands: [],
        invariants: [],
        architecture: [],
        regressions: []
      },
      {
        tool: "CodeDecay",
        targets: [
          {
            id: "web",
            status: "failed",
            baseUrl: "http://127.0.0.1:3000?token=secret",
            generatedTests: {
              status: "passed",
              tests: [
                {
                  id: "route-dashboard",
                  title: "loads /dashboard",
                  kind: "route-load",
                  pageUrl: "http://127.0.0.1:3000/dashboard/?token=secret",
                  priority: "medium"
                }
              ]
            },
            generatedTestRun: {
              status: "passed",
              passed: 1,
              failed: 0,
              skipped: 0,
              failures: []
            },
            generatedApiTests: {
              status: "passed",
              tests: [
                {
                  id: "api-get-users",
                  title: "GET /api/users returns a documented status",
                  kind: "api-operation",
                  pageUrl: "http://127.0.0.1:3000/api/users/?token=secret",
                  method: "GET",
                  operationPath: "/api/users/?token=secret",
                  headers: { authorization: "Bearer secret" },
                  requestBody: { password: "secret" },
                  priority: "medium"
                }
              ]
            },
            generatedApiTestRun: {
              status: "failed",
              passed: 0,
              failed: 1,
              skipped: 0,
              failures: [
                {
                  testId: "api-get-users",
                  title: "GET /api/users returns a documented status",
                  failingStep: "Run generated API check",
                  error: "Bearer supersecret leaked for user@example.com token=abc123",
                  request: {
                    method: "GET",
                    url: "http://127.0.0.1:3000/api/users/?token=abc123"
                  },
                  impactedFiles: ["src/app/api/users/route.ts"],
                  testSourcePath: ".codedecay/local/generated-api-tests/api/api.generated.spec.ts",
                  testSource: "raw test source should not be stored",
                  rerunCommand: "npx codedecay product --target web --run-generated-api-tests --test-id api-get-users --format markdown"
                }
              ]
            }
          }
        ]
      },
      "product-report.json"
    );

    expect(result.learned).toMatchObject({
      flows: 1,
      regressions: 1
    });
    expect(result.memory.flows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Product check: web: loads /dashboard",
          areas: ["ui"],
          productPaths: ["/dashboard"],
          checks: ["npx codedecay product --target web --run-generated-tests --test-id route-dashboard --format markdown"]
        })
      ])
    );
    expect(result.memory.regressions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Product regression: web: GET /api/users returns a documented status",
          files: ["src/app/api/users/route.ts"],
          productPaths: ["/api/users"],
          severity: "high"
        })
      ])
    );
    expect(JSON.stringify(result.memory)).not.toContain("supersecret");
    expect(JSON.stringify(result.memory)).not.toContain("user@example.com");
    expect(JSON.stringify(result.memory)).not.toContain("raw test source");
    expect(JSON.stringify(result.memory)).not.toContain("token=abc123");
  });
});
