import { describe, expect, it } from "vitest";
import { learnCodeDecayMemory } from "../src/index";

describe("CodeDecay product memory learning", () => {
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
