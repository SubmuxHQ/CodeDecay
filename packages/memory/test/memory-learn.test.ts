import { describe, expect, it } from "vitest";
import { learnCodeDecayMemory } from "../src/index";

describe("CodeDecay memory learning", () => {
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
});
