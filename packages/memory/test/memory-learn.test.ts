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
            number: 42,
            title: "fix: auth token not refreshing on 401",
            body: "Restores session refresh for expired access tokens.",
            labels: [{ name: "area: auth" }, { name: "regression" }],
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
      "learn.json",
      { timestamp: "2026-01-02T03:04:05.000Z" }
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
    expect(result.proposals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          section: "regressions",
          title: "Auth smoke failed",
          confidence: "high",
          timestamp: "2026-01-02T03:04:05.000Z",
          source: expect.objectContaining({
            type: "ci-failure",
            path: "learn.json"
          }),
          why: expect.stringContaining("CI failure")
        }),
        expect.objectContaining({
          section: "architecture",
          title: "fix: auth token not refreshing on 401",
          source: expect.objectContaining({
            type: "pull-request",
            id: "42",
            labels: ["area: auth", "regression"]
          })
        }),
        expect.objectContaining({
          section: "regressions",
          title: "CodeDecay: Risky source changes without changed tests",
          source: expect.objectContaining({ type: "codedecay-report" })
        })
      ])
    );
  });

  it("learns incident markdown as reviewable invariant and regression proposals", () => {
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
        incidentMarkdowns: [
          {
            path: "incidents/auth-cache-outage.md",
            markdown: [
              "# Auth cache outage",
              "",
              "Incident: stale auth cache allowed a forbidden session after deploy.",
              "Prevention: auth cache invalidation must be verified after session changes."
            ].join("\n"),
            files: ["src/auth/session.ts"]
          }
        ]
      },
      "learn-incidents.json",
      { timestamp: "2026-01-03T00:00:00.000Z" }
    );

    expect(result.learned).toMatchObject({
      invariants: 1,
      regressions: 1
    });
    expect(result.memory.invariants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Auth cache outage",
          severity: "high",
          files: ["src/auth/session.ts"]
        })
      ])
    );
    expect(result.proposals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          section: "invariants",
          title: "Auth cache outage",
          source: expect.objectContaining({
            type: "incident-markdown",
            path: "incidents/auth-cache-outage.md"
          }),
          why: expect.stringContaining("durable rule")
        })
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

  it("deduplicates duplicate learned memory entries while preserving one proposal", () => {
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
          },
          {
            title: "Auth smoke failed",
            message: "Token refresh returned 401 after deploy.",
            command: "pnpm test auth",
            files: ["src/auth/session.ts"]
          }
        ]
      },
      "duplicate-ci.json",
      { timestamp: "2026-01-04T00:00:00.000Z" }
    );

    expect(result.learned.regressions).toBe(2);
    expect(result.added.regressions).toBe(1);
    expect(result.merged.regressions).toBe(1);
    expect(result.memory.regressions).toHaveLength(1);
    expect(result.proposals.filter((proposal) => proposal.section === "regressions")).toHaveLength(1);
  });
});
