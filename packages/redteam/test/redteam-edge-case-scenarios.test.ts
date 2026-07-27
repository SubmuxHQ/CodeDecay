import {
  createAnalysisReport,
  normalizeRequirementContext,
  type CodeDecayReport,
  type FileChange,
  type ImpactedArea,
  type ImpactedRoute,
  type SymbolImpact
} from "@submuxhq/codedecay-core";
import type { CodeDecayMemory } from "@submuxhq/codedecay-memory";
import { describe, expect, it } from "vitest";
import { createEdgeCasePlan } from "../src/edge-cases";
import { createFixTasks } from "../src/fix-tasks";
import { matchPatternIntelligence } from "../src/patterns";
import type {
  RedteamEdgeCase,
  RedteamInvestigation,
  RedteamPatternInsight
} from "../src/types";
import { createEmptyMemory } from "./helpers/redteam";

describe("behavior-specific edge-case scenarios", () => {
  it("grounds API and auth scenarios in routes, symbols, requirements, memory, and agent provenance", () => {
    const report = reportFor({
      files: [
        change("src/auth/session.ts", "return session?.role === 'admin';"),
        change("src/auth/session.test.ts", "expect(validateSession(token)).toBe(true);")
      ],
      areas: [
        area("auth", "high", ["src/auth/session.ts"]),
        area("api", "high", ["src/auth/session.ts"]),
        area("test", "medium", ["src/auth/session.test.ts"])
      ],
      routes: [
        {
          framework: "nextjs",
          kind: "api-route",
          route: "/api/session",
          methods: ["GET"],
          files: ["src/auth/session.ts"],
          risk: "high",
          reasons: ["Protected session route changed"],
          recommendedTests: ["Add an API-level session regression test"]
        }
      ],
      symbols: [
        {
          file: "src/auth/session.ts",
          symbol: "validateSession",
          exportKind: "named",
          line: 2,
          importerFiles: ["src/dashboard/session.ts"],
          routeFiles: ["src/auth/session.ts"],
          likelyTests: ["src/auth/session.test.ts"],
          reasons: ["Session validation reaches the protected API route"]
        }
      ],
      recommendedTests: [
        "Add an API-level session regression test",
        "Run or strengthen src/auth/session.test.ts"
      ]
    });
    const requirements = normalizeRequirementContext({
      task: "Keep session authorization safe.",
      source: { id: "issue-666", kind: "issue", label: "Issue #666" },
      context: {
        acceptanceCriteria: [
          {
            id: "AC-AUTH",
            text: "Anonymous and member users receive 403 from the session endpoint.",
            requiredProof: ["API integration test"]
          }
        ],
        affectedFlows: [
          {
            name: "Session authorization",
            kind: "api",
            description: "A user opens a protected session-backed screen."
          }
        ],
        invariants: ["Only administrators can access privileged session data."]
      }
    });
    const memory: CodeDecayMemory = {
      ...createEmptyMemory(),
      flows: [
        {
          name: "Protected session flow",
          description: "Members must not inherit administrator access.",
          checks: ["request the protected route as a member"],
          areas: ["auth"]
        }
      ],
      invariants: [
        {
          name: "Auth fails closed",
          description: "Missing or lower-privilege credentials never receive admin data.",
          severity: "high",
          areas: ["auth"]
        }
      ]
    };
    const patterns = matchPatternIntelligence(report);
    const investigation = investigationFor({
      title: "Denied session path",
      detail: "A member must receive 403 without privileged session data.",
      affectedFlows: ["Session authorization"],
      edgeCases: ["Use missing, expired, malformed, and lower-privilege credentials on /api/session."],
      proposedProof: ["Call the real GET /api/session route."]
    });

    const plan = createEdgeCasePlan({
      report,
      patterns,
      memory,
      requirements,
      investigation
    });

    expect(plan.ranked.map((scenario) => scenario.id)).toEqual(
      expect.arrayContaining(["auth-fail-closed", "api-invalid-input"])
    );
    const auth = plan.ranked.find((scenario) => scenario.id === "auth-fail-closed");
    expect(auth).toMatchObject({
      confidence: "high",
      derivation: "mixed",
      scope: {
        areas: expect.arrayContaining(["auth"]),
        files: ["src/auth/session.ts"],
        symbols: ["src/auth/session.ts#validateSession"],
        routes: ["GET /api/session"],
        flows: expect.arrayContaining(["Protected session flow", "Session authorization"]),
        requirementIds: ["AC-AUTH"]
      },
      proof: {
        kind: "api-integration"
      }
    });
    expect(auth?.trigger).toMatch(/missing.*expired.*lower-privilege/i);
    expect(auth?.expectedBehavior).toMatch(/401|403/);
    expect(auth?.userVisibleFailure).toMatch(/unauthorized|privileged/i);
    expect(auth?.downstreamConsumers).toContain("src/dashboard/session.ts");
    expect(auth?.downstreamConsumers).not.toContain("src/auth/session.test.ts");
    expect(auth?.sources.map((source) => source.kind)).toEqual(
      expect.arrayContaining(["area-rule", "route-impact", "symbol-impact", "requirement", "memory", "pattern-pack", "agent-investigation"])
    );
    expect(plan.all.filter((scenario) => scenario.id === "auth-fail-closed")).toHaveLength(1);
    const sourceKeys = auth?.sources.map((source) => `${source.kind}:${source.id}`) ?? [];
    expect(new Set(sourceKeys).size).toBe(sourceKeys.length);
    expect(plan.all.every((scenario) => typeof scenario !== "string")).toBe(true);
    expect(plan.all.map((scenario) => scenario.title).join("\n")).not.toMatch(/\b(?:add|run|strengthen) tests?\b/i);
  });

  it.each([
    {
      name: "API input boundary",
      report: reportFor({
        files: [change("src/api/payouts.ts", "return createPayout(input);")],
        areas: [area("api", "high", ["src/api/payouts.ts"])],
        routes: [
          {
            framework: "express",
            kind: "route-handler",
            route: "/api/payouts",
            methods: ["POST"],
            files: ["src/api/payouts.ts"],
            risk: "high",
            reasons: ["Payout mutation changed"],
            recommendedTests: []
          }
        ]
      }),
      expectedId: "api-invalid-input",
      trigger: /missing.*malformed.*zero/i,
      failure: /500.*false success.*partially written/i,
      proofKind: "api-integration"
    },
    {
      name: "API retry",
      report: reportFor({
        files: [change("src/api/payouts.ts", "return createPayout(input);")],
        areas: [area("api", "high", ["src/api/payouts.ts"])],
        routes: [
          {
            framework: "express",
            kind: "route-handler",
            route: "/api/payouts",
            methods: ["POST"],
            files: ["src/api/payouts.ts"],
            risk: "high",
            reasons: ["Payout mutation changed"],
            recommendedTests: []
          }
        ]
      }),
      expectedId: "api-retry-idempotency",
      trigger: /retries.*timeout.*duplicate/i,
      failure: /duplicate.*charge.*job/i,
      proofKind: "api-integration"
    },
    {
      name: "database",
      report: reportFor({
        files: [change("src/db/schema.prisma", "role String? @default(\"member\")")],
        areas: [area("database", "high", ["src/db/schema.prisma"])],
        symbols: [
          {
            file: "src/db/schema.prisma",
            symbol: "User.role",
            exportKind: "named",
            line: 3,
            importerFiles: ["src/api/users.ts", "src/jobs/user-sync.ts"],
            routeFiles: ["src/api/users.ts"],
            likelyTests: [],
            reasons: ["User role schema affects API reads and sync jobs"]
          }
        ]
      }),
      expectedId: "database-legacy-data",
      trigger: /null.*legacy|legacy.*null/i,
      failure: /API|job|record/i,
      proofKind: "database-integration"
    },
    {
      name: "UI",
      report: reportFor({
        files: [change("src/app/dashboard/page.tsx", "return <Dashboard users={users} />;")],
        areas: [area("ui", "high", ["src/app/dashboard/page.tsx"])],
        routes: [
          {
            framework: "nextjs",
            kind: "ui-route",
            route: "/dashboard",
            methods: ["GET"],
            files: ["src/app/dashboard/page.tsx"],
            risk: "high",
            reasons: ["Dashboard route changed"],
            recommendedTests: ["Run a browser test for /dashboard"]
          }
        ]
      }),
      expectedId: "ui-empty-error-permission",
      trigger: /empty.*error.*permission/i,
      failure: /blank|stale|privileged|crash/i,
      proofKind: "browser"
    }
  ])("creates a concrete $name scenario", ({ report, expectedId, trigger, failure, proofKind }) => {
    const plan = createEdgeCasePlan({
      report,
      patterns: matchPatternIntelligence(report),
      memory: createEmptyMemory()
    });
    const scenario = plan.ranked.find((candidate) => candidate.id === expectedId);

    expect(scenario).toBeDefined();
    expect(scenario?.scope.files.length).toBeGreaterThan(0);
    expect(scenario?.trigger).toMatch(trigger);
    expect(scenario?.userVisibleFailure).toMatch(failure);
    expect(scenario?.proof.kind).toBe(proofKind);
    expect(scenario?.proof.recommendation).toMatch(/real|integration|browser/i);
  });

  it("does not suggest mutation retry checks for a read-only API route", () => {
    const report = reportFor({
      files: [change("src/api/users.ts", "return Response.json(users);")],
      areas: [area("api", "high", ["src/api/users.ts"])],
      routes: [
        {
          framework: "express",
          kind: "route-handler",
          route: "/api/users",
          methods: ["GET"],
          files: ["src/api/users.ts"],
          risk: "high",
          reasons: ["User listing changed"],
          recommendedTests: []
        }
      ]
    });
    const plan = createEdgeCasePlan({
      report,
      patterns: matchPatternIntelligence(report),
      memory: createEmptyMemory()
    });

    expect(plan.all.map((scenario) => scenario.id)).not.toContain("api-retry-idempotency");
  });

  it("targets only mutating methods when one route exports reads and writes", () => {
    const report = reportFor({
      files: [change("src/app/api/payouts/route.ts", "export async function POST() {}")],
      areas: [area("api", "high", ["src/app/api/payouts/route.ts"])],
      routes: [
        {
          framework: "nextjs",
          kind: "api-route",
          route: "/api/payouts",
          methods: ["GET", "POST"],
          files: ["src/app/api/payouts/route.ts"],
          risk: "high",
          reasons: ["Payout mutation changed"],
          recommendedTests: []
        }
      ]
    });
    const plan = createEdgeCasePlan({
      report,
      patterns: matchPatternIntelligence(report),
      memory: createEmptyMemory()
    });
    const retry = plan.all.find((scenario) => scenario.id === "api-retry-idempotency");
    const input = plan.all.find((scenario) => scenario.id === "api-invalid-input");

    expect(retry?.scope.routes).toEqual(["GET|POST /api/payouts"]);
    expect(retry?.title).toContain("POST /api/payouts");
    expect(retry?.proof.recommendation).toContain("twice to POST /api/payouts");
    expect(retry?.title).not.toContain("GET|POST");
    expect(input?.title).toContain("POST /api/payouts");
    expect(input?.proof.recommendation).toContain("requests to POST /api/payouts");
  });

  it("recommends a real integration boundary when no concrete HTTP route was detected", () => {
    const report = reportFor({
      files: [change("src/api/export.ts", "return exportDiagnostics(input);")],
      areas: [area("api", "high", ["src/api/export.ts"])],
      symbols: [
        {
          file: "src/api/export.ts",
          symbol: "exportDiagnostics",
          exportKind: "named",
          line: 2,
          importerFiles: ["src/jobs/export-worker.ts", "src/api/export.test.ts"],
          routeFiles: [],
          likelyTests: ["src/api/export.test.ts"],
          reasons: ["Export behavior changed"]
        }
      ]
    });
    const plan = createEdgeCasePlan({
      report,
      patterns: matchPatternIntelligence(report),
      memory: createEmptyMemory()
    });
    const scenario = plan.all.find((candidate) => candidate.id === "api-invalid-input");

    expect(scenario?.proof.recommendation).toContain(
      "through its real router or API integration boundary"
    );
    expect(scenario?.proof.recommendation).not.toMatch(
      /HTTP requests to .*#exportDiagnostics/
    );
    expect(scenario?.downstreamConsumers).toEqual(["src/jobs/export-worker.ts"]);
  });

  it("does not attach JWT knowledge or auth scenarios to an unrelated API change", () => {
    const report = reportFor({
      files: [change("src/api/users.ts", "return Response.json(users);")],
      areas: [area("api", "high", ["src/api/users.ts"])],
      routes: [
        {
          framework: "express",
          kind: "route-handler",
          route: "/api/users",
          methods: ["GET"],
          files: ["src/api/users.ts"],
          risk: "high",
          reasons: ["User listing changed"],
          recommendedTests: ["Add a route-level users test"]
        }
      ]
    });
    const patterns = matchPatternIntelligence(report);
    const plan = createEdgeCasePlan({ report, patterns, memory: createEmptyMemory() });

    expect(patterns.map((pattern) => pattern.id)).not.toContain("knowledge-jwt-auth");
    expect(plan.all.map((scenario) => scenario.id)).toContain("api-invalid-input");
    expect(plan.all.map((scenario) => scenario.id)).not.toContain("auth-fail-closed");
    expect(plan.all.some((scenario) => scenario.id.startsWith("jwt-"))).toBe(false);
  });

  it("does not infer a JWT failure mode from an auth filename alone", () => {
    const report = reportFor({
      files: [change("src/auth/decodeJwt.ts", "return cachedSession;")],
      areas: [area("auth", "high", ["src/auth/decodeJwt.ts"])]
    });
    const plan = createEdgeCasePlan({
      report,
      patterns: matchPatternIntelligence(report),
      memory: createEmptyMemory()
    });

    expect(plan.all.map((scenario) => scenario.id)).toContain("auth-fail-closed");
    expect(plan.all.some((scenario) => scenario.id.startsWith("jwt-"))).toBe(false);
  });

  it("does not attach an unrelated changed API route to an auth helper scenario", () => {
    const report = reportFor({
      files: [
        change("src/auth/session.ts", "return session?.role === 'admin';"),
        change("src/api/public-users.ts", "return Response.json(users);")
      ],
      areas: [
        area("auth", "high", ["src/auth/session.ts"]),
        area("api", "high", ["src/api/public-users.ts"])
      ],
      routes: [
        {
          framework: "nextjs",
          kind: "api-route",
          route: "/api/public-users",
          methods: ["GET"],
          files: ["src/api/public-users.ts"],
          risk: "high",
          reasons: ["Public user listing changed"],
          recommendedTests: []
        }
      ]
    });
    const plan = createEdgeCasePlan({
      report,
      patterns: matchPatternIntelligence(report),
      memory: createEmptyMemory()
    });
    const auth = plan.all.find((scenario) => scenario.id === "auth-fail-closed");

    expect(auth?.scope.files).toEqual(["src/auth/session.ts"]);
    expect(auth?.scope.routes).toEqual([]);
    expect(auth?.proof.recommendation).toContain(
      "through its real authorization integration boundary"
    );
  });

  it("adds a JWT scenario only when the changed auth code matches its concrete failure mode", () => {
    const report = reportFor({
      files: [
        change(
          "src/auth/token.ts",
          "const claims = jwt.decode(token); return claims.role === 'admin';"
        )
      ],
      areas: [
        area("auth", "high", ["src/auth/token.ts"]),
        area("api", "high", ["src/auth/token.ts"])
      ],
      routes: [
        {
          framework: "express",
          kind: "route-handler",
          route: "/api/admin",
          methods: ["GET"],
          files: ["src/auth/token.ts"],
          risk: "high",
          reasons: ["Admin authorization reads decoded token claims"],
          recommendedTests: []
        }
      ]
    });
    const plan = createEdgeCasePlan({
      report,
      patterns: matchPatternIntelligence(report),
      memory: createEmptyMemory()
    });
    const jwtScenario = plan.all.find(
      (scenario) => scenario.id === "jwt-decode-without-verify"
    );

    expect(jwtScenario).toMatchObject({
      confidence: "medium",
      derivation: "deterministic",
      scope: {
        areas: ["auth"],
        files: ["src/auth/token.ts"],
        routes: ["GET /api/admin"]
      },
      proof: {
        kind: "api-integration"
      }
    });
    expect(jwtScenario?.trigger).toMatch(/decode helper.*authenticated/i);
    expect(jwtScenario?.userVisibleFailure).toMatch(/forged token/i);
    expect(jwtScenario?.sources).toContainEqual(
      expect.objectContaining({
        kind: "pattern-pack",
        id: "knowledge:jwt-decode-without-verify"
      })
    );
    expect(
      plan.all.filter((scenario) => scenario.id.startsWith("jwt-")).map((scenario) => scenario.id)
    ).toEqual(["jwt-decode-without-verify"]);
  });

  it("keeps only the top eight scenarios visible and retains ranked overflow in JSON detail", () => {
    const report = reportFor({
      files: [change("src/api/jobs.ts", "return runJob(input);")],
      areas: [area("api", "high", ["src/api/jobs.ts"])],
      routes: [
        {
          framework: "express",
          kind: "route-handler",
          route: "/api/jobs",
          methods: ["POST"],
          files: ["src/api/jobs.ts"],
          risk: "high",
          reasons: ["Job route changed"],
          recommendedTests: []
        }
      ]
    });
    const affectedFlows = Array.from({ length: 10 }, (_, index) => ({
      name: `Special workflow ${index + 1}`,
      kind: "job" as const,
      description: `Workflow ${index + 1} handles a distinct customer transition.`
    }));
    const requirements = normalizeRequirementContext({
      task: "Preserve special workflows.",
      source: { id: "task", kind: "task", label: "Task" },
      context: { affectedFlows }
    });
    const investigation: RedteamInvestigation = {
      status: "completed",
      provider: {
        configuredProvider: "ollama",
        id: "ollama",
        model: "local",
        timeoutMs: 30000
      },
      suggestions: affectedFlows.map((flow, index) => ({
        title: `Preserve ${flow.name}`,
        detail: `${flow.name} must preserve transition ${index + 1}.`,
        affectedFlows: [flow.name],
        edgeCases: [`When transition ${index + 1} is interrupted, ${flow.name} must return its prior state.`],
        proposedProof: [`Run integration proof for ${flow.name}.`]
      })),
      limitations: [],
      untrusted: true,
      llmCalled: true
    };

    const plan = createEdgeCasePlan({
      report,
      patterns: matchPatternIntelligence(report),
      memory: createEmptyMemory(),
      requirements,
      investigation
    });

    expect(plan.ranked).toHaveLength(8);
    expect(plan.overflow.length).toBeGreaterThan(0);
    expect(plan.all).toEqual([...plan.ranked, ...plan.overflow]);
    expect(plan.all.map((scenario) => scenario.score)).toEqual(
      [...plan.all.map((scenario) => scenario.score)].sort((left, right) => right - left)
    );
    expect(plan.ranked.map((scenario) => scenario.id)).toContain("api-invalid-input");
    expect(plan.overflow.every((scenario) => scenario.derivation === "agent-suggestion")).toBe(true);
  });

  it("reserves high-impact scenario tasks and moves generic recommendations into proof tasks", () => {
    const report = reportFor({
      files: [change("src/auth/session.ts", "return session?.role === 'admin';")],
      areas: [
        area("auth", "high", ["src/auth/session.ts"]),
        area("api", "high", ["src/auth/session.ts"])
      ],
      routes: [
        {
          framework: "nextjs",
          kind: "api-route",
          route: "/api/session",
          methods: ["GET"],
          files: ["src/auth/session.ts"],
          risk: "high",
          reasons: ["Protected session route changed"],
          recommendedTests: []
        }
      ],
      recommendedTests: Array.from({ length: 24 }, (_, index) => `Add or run proof check ${index + 1}`)
    });
    report.findings = Array.from({ length: 24 }, (_, index) => ({
      ruleId: `risk-${index + 1}`,
      title: `High risk ${index + 1}`,
      description: `Investigate high-risk behavior ${index + 1}.`,
      severity: "high" as const,
      category: "regression" as const,
      file: "src/auth/session.ts",
      line: index + 1
    }));
    const plan = createEdgeCasePlan({
      report,
      patterns: matchPatternIntelligence(report),
      memory: createEmptyMemory()
    });

    const tasks = createFixTasks({
      analysisReport: report,
      weakTestFindings: [],
      edgeCases: plan.ranked,
      configuredChecks: [],
      toolAdapterPlans: [],
      patternInsights: [],
      memory: createEmptyMemory(),
      skills: []
    });

    expect(tasks).toHaveLength(20);
    expect(tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Keep GET /api/session closed to unauthorized credentials",
          source: "edge-case",
          priority: "high"
        }),
        expect.objectContaining({
          source: "test-proof",
          detail: "Add or run proof check 1"
        })
      ])
    );
    expect(plan.all.map((scenario) => scenario.title)).not.toContain("Add or run proof check 1");
  });

  it("preserves every high-impact ranked scenario when generic tasks fill the cap", () => {
    const report = reportFor({
      files: [change("src/auth/session.ts", "return session?.role === 'admin';")],
      areas: [area("auth", "high", ["src/auth/session.ts"])],
      recommendedTests: Array.from({ length: 24 }, (_, index) => `Run proof command ${index + 1}`)
    });
    report.findings = Array.from({ length: 24 }, (_, index) => ({
      ruleId: `risk-${index + 1}`,
      title: `High risk ${index + 1}`,
      description: `Investigate high-risk behavior ${index + 1}.`,
      severity: "high" as const,
      category: "regression" as const,
      file: "src/auth/session.ts",
      line: index + 1
    }));
    const seed = createEdgeCasePlan({
      report,
      patterns: matchPatternIntelligence(report),
      memory: createEmptyMemory()
    }).ranked[0];
    if (!seed) {
      throw new Error("Expected an auth scenario fixture.");
    }
    const scenarios: RedteamEdgeCase[] = Array.from({ length: 6 }, (_, index) => ({
      ...seed,
      id: `high-impact-${index + 1}`,
      title: `High-impact behavior scenario ${index + 1}`
    }));

    const tasks = createFixTasks({
      analysisReport: report,
      weakTestFindings: [],
      edgeCases: scenarios,
      configuredChecks: [],
      toolAdapterPlans: [],
      patternInsights: [],
      memory: createEmptyMemory(),
      skills: []
    });

    expect(tasks).toHaveLength(20);
    expect(
      tasks.filter((task) => task.source === "edge-case").map((task) => task.title)
    ).toEqual(scenarios.map((scenario) => scenario.title));
  });

  it("deduplicates changed-path proof and recommended-test tasks for the same file", () => {
    const report = reportFor({
      files: [change("src/api/payouts.ts", "return createPayout(input);")],
      areas: [area("api", "high", ["src/api/payouts.ts"])],
      recommendedTests: ["src/api/payouts.ts"]
    });
    report.testProofMap = {
      summary: {
        total: 1,
        provenByRuntimeCoverage: 0,
        referencedOnlyStatically: 0,
        weakenedByMocking: 0,
        unproven: 1
      },
      entries: [
        {
          file: "src/api/payouts.ts",
          line: 2,
          status: "unproven",
          evidence: "missing-proof",
          proof: "heuristic",
          staticReferences: [],
          routeFiles: [],
          weakenedByMocks: [],
          reasons: ["No runtime coverage or static reference proves the changed path."],
          repairTask: "Add an API integration test for src/api/payouts.ts."
        }
      ]
    };

    const tasks = createFixTasks({
      analysisReport: report,
      weakTestFindings: [],
      edgeCases: [],
      configuredChecks: [],
      toolAdapterPlans: [],
      patternInsights: [],
      memory: createEmptyMemory(),
      skills: []
    });
    const proofTasks = tasks.filter(
      (task) => task.title === "Prove changed path: src/api/payouts.ts"
    );

    expect(proofTasks).toHaveLength(1);
    expect(proofTasks[0]?.detail).toContain(
      "No runtime coverage or static reference proves the changed path."
    );
  });
});

function reportFor(input: {
  files: FileChange[];
  areas: ImpactedArea[];
  routes?: ImpactedRoute[];
  symbols?: SymbolImpact[];
  recommendedTests?: string[];
}): CodeDecayReport {
  return createAnalysisReport({
    changedFiles: input.files,
    analyzerResult: {
      impactedAreas: input.areas,
      impactedRoutes: input.routes ?? [],
      symbolImpacts: input.symbols ?? [],
      findings: [],
      recommendedTests: input.recommendedTests ?? []
    },
    generatedAt: "2026-07-27T00:00:00.000Z"
  });
}

function change(path: string, content: string): FileChange {
  return {
    path,
    status: "modified",
    additions: 1,
    deletions: 1,
    addedLines: [{ line: 2, content }]
  };
}

function area(kind: ImpactedArea["kind"], risk: ImpactedArea["risk"], files: string[]): ImpactedArea {
  return {
    name: `${kind} surface`,
    kind,
    risk,
    files
  };
}

function investigationFor(
  suggestion: RedteamInvestigation["suggestions"][number]
): RedteamInvestigation {
  return {
    status: "completed",
    provider: {
      configuredProvider: "ollama",
      id: "ollama",
      model: "local",
      timeoutMs: 30000
    },
    suggestions: [suggestion],
    limitations: [],
    untrusted: true,
    llmCalled: true
  };
}

export function pattern(
  id: string,
  areas: RedteamPatternInsight["areas"]
): RedteamPatternInsight {
  return {
    id,
    title: id,
    areas,
    edgeCases: [],
    weakTestSigns: [],
    suggestedChecks: [],
    citations: [],
    trust: "pattern-pack",
    proof: "suggestion"
  };
}
