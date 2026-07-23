import { describe, expect, it } from "vitest";
import { createAgentPreflightReport } from "../src/index";

describe("agent preflight structured requirements UAT", () => {
  it("ranks domain evidence above generic API decoys and preserves acceptance criteria", () => {
    const report = createAgentPreflightReport({
      task: "Add a billing export API",
      requirements: {
        schemaVersion: 1,
        confidence: "high",
        sources: [
          {
            id: "issue-663",
            kind: "issue",
            label: "Issue #663",
            location: "https://github.com/SubMux-HQ/CodeDecay/issues/663"
          }
        ],
        task: {
          text: "Add a billing export API",
          sourceIds: ["issue-663"]
        },
        acceptanceCriteria: [
          {
            id: "AC-1",
            text: "Authorized users can export billing records as CSV.",
            requiredProof: ["Call the real billing export route and validate the CSV response."],
            sourceIds: ["issue-663"]
          }
        ],
        currentBehavior: [],
        expectedBehavior: [],
        nonGoals: [],
        affectedFlows: [
          {
            name: "Billing export",
            kind: "api",
            sourceIds: ["issue-663"]
          }
        ],
        invariants: [],
        architectureConstraints: [],
        unresolvedQuestions: []
      },
      rootDir: "/repo",
      repoFiles: [
        "src/billing/export.ts",
        "src/billing/export.test.ts",
        "packages/tool-adapters/src/openapi.ts",
        "packages/analyzer-js/src/routes/api.ts"
      ],
      config: {
        productTesting: {
          targets: {
            api: {
              apiEndpoints: [
                { id: "users-list", method: "GET", path: "/api/users" },
                { id: "billing-export", method: "GET", path: "/api/billing/export" }
              ]
            }
          }
        }
      },
      generatedAt: "2026-07-23T00:00:00.000Z"
    });

    expect(report.requirements.acceptanceCriteria).toEqual([
      expect.objectContaining({
        id: "AC-1",
        sourceIds: ["issue-663"]
      })
    ]);
    expect(report.deterministicEvidence.candidateFiles.map((file) => file.path)).toEqual([
      "src/billing/export.ts",
      "src/billing/export.test.ts"
    ]);
    expect(report.deterministicEvidence.candidateRoutes.map((route) => route.route)).toEqual([
      "/api/billing/export"
    ]);
    expect(report.summary.confidence).toBe("high");
  });

  it("reports honest uncertainty when no repo evidence supports the requirement", () => {
    const report = createAgentPreflightReport({
      task: "Add a billing export API",
      rootDir: "/repo",
      repoFiles: ["src/users/profile.ts", "packages/tool-adapters/src/openapi.ts"],
      generatedAt: "2026-07-23T00:00:00.000Z"
    });

    expect(report.summary.confidence).toBe("low");
    expect(report.summary.insufficientContext).toBe(true);
    expect(report.deterministicEvidence.candidateFiles).toEqual([]);
    expect(report.requirements.unresolvedQuestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          text: expect.stringContaining("billing")
        })
      ])
    );
  });
});
