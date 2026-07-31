import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { CodeDecayReport, ImpactGraph } from "@submuxhq/codedecay-core";
import type { CodeDecayMemory } from "@submuxhq/codedecay-memory";
import {
  createEngineeringTaskContext,
  persistEngineeringTaskContext
} from "../src/index";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("task-scoped engineering context retrieval", () => {
  it("retrieves bounded route, job, test, ADR, owner, and regression context while rejecting decoys", () => {
    const context = createEngineeringTaskContext({
      rootDir: createTempDir(),
      sourceRevision: "abc123",
      task: "allow finance admins to retry a failed payout",
      report: billingReport(),
      requirements: billingReport().requirements,
      impactGraph: billingImpactGraph(),
      memory: billingMemory(),
      repoFiles: [
        "src/billing/payouts.ts",
        "src/app/api/billing/payouts/retry/route.ts",
        "src/jobs/payout-retry-worker.ts",
        "tests/payout-retry.test.ts",
        "docs/adr/0004-payout-retry.md",
        "docs/api-tooling.md",
        ".github/CODEOWNERS",
        "package.json"
      ],
      documents: [
        {
          path: "docs/adr/0004-payout-retry.md",
          content: [
            "# ADR 0004: Finance admin payout retry",
            "",
            "Retry requests enqueue the payout retry worker and must stay idempotent."
          ].join("\n")
        },
        {
          path: "docs/api-tooling.md",
          content: "# API tooling retry guide\n\nGeneric API retry documentation for internal tooling."
        },
        {
          path: "docs/adr/0001-payout-retry-v1.md",
          content: "# Deprecated payout retry v1\n\nSuperseded by ADR 0004 and conflicting with current idempotency rules."
        }
      ],
      codeowners: [
        {
          path: ".github/CODEOWNERS",
          line: 3,
          pattern: "/src/billing/",
          owners: ["@submuxhq/finance-platform"]
        }
      ],
      packages: [{ path: "package.json", name: "billing-demo", scripts: ["test", "build"] }],
      generatedAt: "2026-07-31T00:00:00.000Z",
      maxNodes: 24
    });

    const nodes = context.graph.nodes;
    const nodeIds = nodes.map((node) => node.id);
    const labels = nodes.map((node) => node.label).join("\n");

    expect(context.schemaVersion).toBe(1);
    expect(context.query.tokens).toEqual(expect.arrayContaining(["finance", "admins", "retry", "failed", "payout"]));
    expect(context.safety).toEqual({
      llmCalled: false,
      commandsExecuted: false,
      telemetrySent: false,
      cloudDependency: false,
      memoryTrustedAsFact: false
    });
    expect(nodeIds).toEqual(
      expect.arrayContaining([
        "route:post:/api/billing/payouts/retry",
        "file:src/jobs/payout-retry-worker.ts",
        "file:tests/payout-retry.test.ts",
        "document:docs/adr/0004-payout-retry.md",
        "owner:/src/billing/",
        "memory:regression:duplicate-payout-retry-transfer"
      ])
    );
    expect(labels).toContain("Payout retry worker");
    expect(labels).toContain("Admin payout retry must be idempotent");
    expect(nodeIds).not.toContain("document:docs/api-tooling.md");
    expect(context.summary.rejectedDecoys).toBeGreaterThan(0);
    expect(context.graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: "file:src/app/api/billing/payouts/retry/route.ts",
          to: "route:post:/api/billing/payouts/retry",
          kind: "serves"
        }),
        expect.objectContaining({
          from: "file:tests/payout-retry.test.ts",
          to: "symbol:src/billing/payouts.ts#settlepayoutretry",
          kind: "tests"
        })
      ])
    );

    const staleNode = nodes.find((node) => node.id === "document:docs/adr/0001-payout-retry-v1.md");
    expect(staleNode).toMatchObject({
      trustClass: "stale-context",
      confidence: "heuristic"
    });
    expect(staleNode?.limitations.join(" ")).toMatch(/historical context/i);
  });

  it("adds downstream consumers when a shared symbol is connected through graph evidence", () => {
    const context = createEngineeringTaskContext({
      rootDir: createTempDir(),
      sourceRevision: "def456",
      task: "change payout retry formatting",
      report: {
        ...billingReport(),
        changedFiles: [
          {
            path: "src/billing/format.ts",
            status: "modified",
            additions: 2,
            deletions: 1,
            addedLines: [{ line: 3, content: "return formatRetryStatus(status);" }]
          }
        ],
        symbolImpacts: [
          {
            file: "src/billing/format.ts",
            symbol: "formatRetryStatus",
            exportKind: "named",
            line: 1,
            importerFiles: ["src/app/api/billing/payouts/retry/route.ts", "src/jobs/payout-retry-worker.ts"],
            routeFiles: ["src/app/api/billing/payouts/retry/route.ts"],
            likelyTests: ["tests/payout-retry.test.ts"],
            reasons: ["Changed export is imported by payout retry API and worker."]
          }
        ]
      },
      impactGraph: billingImpactGraph(),
      memory: billingMemory(),
      generatedAt: "2026-07-31T00:00:00.000Z",
      maxNodes: 10
    });

    expect(context.graph.nodes.map((node) => node.id)).toEqual(
      expect.arrayContaining([
        "file:src/app/api/billing/payouts/retry/route.ts",
        "file:src/jobs/payout-retry-worker.ts",
        "file:tests/payout-retry.test.ts",
        "symbol:src/billing/format.ts#formatretrystatus"
      ])
    );
    expect(context.selected.find((item) => item.nodeId === "file:src/app/api/billing/payouts/retry/route.ts")?.reasons.join(" ")).toMatch(
      /Connected to selected/i
    );
  });

  it("keeps one evidence family from crowding out other task surfaces", () => {
    const context = createEngineeringTaskContext({
      rootDir: createTempDir(),
      sourceRevision: "diverse123",
      task: "implement scoped engineering knowledge graph retrieval for cli and mcp",
      report: crowdedProofReport(),
      generatedAt: "2026-07-31T00:00:00.000Z",
      maxNodes: 8
    });

    const nodeIds = context.graph.nodes.map((node) => node.id);
    const selectedKinds = context.graph.nodes.map((node) => node.kind);

    expect(nodeIds).toEqual(
      expect.arrayContaining([
        "file:packages/cli/src/commands/context.ts",
        "file:packages/mcp/src/handlers/analysis.ts"
      ])
    );
    expect(selectedKinds.filter((kind) => kind === "verification-evidence")).toHaveLength(3);
    expect(context.summary.selectedNodes).toBe(8);
  });

  it("persists an inspectable local artifact", () => {
    const rootDir = createTempDir();
    const context = createEngineeringTaskContext({
      rootDir,
      sourceRevision: "abc123",
      task: "allow finance admins to retry a failed payout",
      report: billingReport(),
      impactGraph: billingImpactGraph()
    });

    const artifactPath = persistEngineeringTaskContext(rootDir, context);

    expect(artifactPath).toBe(".codedecay/local/task-context.json");
    const persisted = JSON.parse(readFileSync(join(rootDir, artifactPath ?? ""), "utf8")) as {
      query: { task: string };
      safety: { llmCalled: boolean; commandsExecuted: boolean };
    };
    expect(persisted.query.task).toBe("allow finance admins to retry a failed payout");
    expect(persisted.safety.llmCalled).toBe(false);
    expect(persisted.safety.commandsExecuted).toBe(false);
  });
});

function createTempDir(): string {
  const root = mkdtempSync(join(tmpdir(), "codedecay-context-"));
  tempRoots.push(root);
  return root;
}

function billingReport(): CodeDecayReport {
  return {
    tool: "CodeDecay",
    version: "0.4.1",
    generatedAt: "2026-07-31T00:00:00.000Z",
    summary: {
      mergeRiskScore: 60,
      decayScore: 20,
      securityScore: 0,
      riskLevel: "medium",
      findingCounts: { low: 0, medium: 1, high: 0 }
    },
    changedFiles: [
      {
        path: "src/billing/payouts.ts",
        status: "modified",
        additions: 4,
        deletions: 1,
        addedLines: [{ line: 12, content: "return settlePayoutRetry(request);" }]
      }
    ],
    impactedAreas: [
      {
        kind: "api",
        name: "API behavior",
        risk: "medium",
        files: ["src/app/api/billing/payouts/retry/route.ts"]
      },
      {
        kind: "source",
        name: "Shared source behavior",
        risk: "medium",
        files: ["src/billing/payouts.ts"]
      }
    ],
    impactedRoutes: [
      {
        framework: "nextjs",
        kind: "api-route",
        route: "/api/billing/payouts/retry",
        methods: ["POST"],
        files: ["src/app/api/billing/payouts/retry/route.ts"],
        risk: "high",
        reasons: ["Payout retry route reaches changed billing service."],
        recommendedTests: ["Add API-level idempotency test."]
      }
    ],
    symbolImpacts: [
      {
        file: "src/billing/payouts.ts",
        symbol: "settlePayoutRetry",
        exportKind: "named",
        line: 10,
        importerFiles: ["src/app/api/billing/payouts/retry/route.ts", "src/jobs/payout-retry-worker.ts"],
        routeFiles: ["src/app/api/billing/payouts/retry/route.ts"],
        likelyTests: ["tests/payout-retry.test.ts"],
        reasons: ["Changed export is imported by payout retry API and worker."]
      }
    ],
    findings: [],
    recommendedTests: ["Add API-level idempotency test."],
    testProofMap: {
      summary: {
        total: 1,
        provenByRuntimeCoverage: 0,
        referencedOnlyStatically: 1,
        weakenedByMocking: 0,
        unproven: 0
      },
      entries: [
        {
          file: "src/billing/payouts.ts",
          symbol: "settlePayoutRetry",
          line: 10,
          status: "referenced_only_statically",
          evidence: "static-reference",
          proof: "deterministic",
          staticReferences: ["tests/payout-retry.test.ts"],
          routeFiles: ["src/app/api/billing/payouts/retry/route.ts"],
          weakenedByMocks: [],
          reasons: ["Test imports the changed payout retry symbol."],
          repairTask: "Add integration proof for duplicate retry prevention."
        }
      ]
    },
    requirements: {
      schemaVersion: 1,
      confidence: "high",
      sources: [{ id: "task", kind: "task", label: "Task" }],
      task: { text: "allow finance admins to retry a failed payout", sourceIds: ["task"] },
      currentBehavior: [],
      expectedBehavior: [{ text: "Finance admins can retry failed payouts without duplicate transfers.", sourceIds: ["task"] }],
      acceptanceCriteria: [
        {
          id: "AC-1",
          text: "Finance admin retry calls the payout retry API and enqueues exactly one worker job.",
          requiredProof: ["API integration test", "worker idempotency test"],
          sourceIds: ["task"]
        }
      ],
      nonGoals: [],
      affectedFlows: [
        {
          name: "Finance admin payout retry",
          kind: "api",
          description: "Admin submits retry for a failed payout.",
          sourceIds: ["task"]
        }
      ],
      invariants: [],
      architectureConstraints: [],
      unresolvedQuestions: []
    }
  };
}

function crowdedProofReport(): CodeDecayReport {
  return {
    ...billingReport(),
    changedFiles: [
      {
        path: "packages/knowledge/src/context.ts",
        status: "modified",
        additions: 20,
        deletions: 1,
        addedLines: [{ line: 12, content: "return createEngineeringTaskContext(options);" }]
      },
      {
        path: "packages/cli/src/commands/context.ts",
        status: "added",
        additions: 80,
        deletions: 0,
        addedLines: [{ line: 18, content: "export function runContextCommand() {}" }]
      },
      {
        path: "packages/mcp/src/handlers/analysis.ts",
        status: "modified",
        additions: 30,
        deletions: 1,
        addedLines: [{ line: 250, content: "export function runTaskContextTool() {}" }]
      }
    ],
    impactedAreas: [
      {
        kind: "source",
        name: "Task context retrieval",
        risk: "medium",
        files: [
          "packages/knowledge/src/context.ts",
          "packages/cli/src/commands/context.ts",
          "packages/mcp/src/handlers/analysis.ts"
        ]
      }
    ],
    impactedRoutes: [],
    symbolImpacts: [],
    testProofMap: {
      summary: {
        total: 10,
        provenByRuntimeCoverage: 0,
        referencedOnlyStatically: 10,
        weakenedByMocking: 0,
        unproven: 0
      },
      entries: Array.from({ length: 10 }, (_, index) => ({
        file: "packages/knowledge/src/context.ts",
        symbol: `EngineeringKnowledgeGraphCliMcpRetrieval${index}`,
        line: 20 + index,
        status: "referenced_only_statically" as const,
        evidence: "static-reference",
        proof: "deterministic" as const,
        staticReferences: ["packages/knowledge/test/context-retrieval.test.ts"],
        routeFiles: [],
        weakenedByMocks: [],
        reasons: ["Test references scoped engineering knowledge graph retrieval for CLI and MCP."],
        repairTask: "Keep CLI and MCP context surfaces visible in bounded retrieval output."
      }))
    }
  };
}

function billingImpactGraph(): ImpactGraph {
  return {
    schemaVersion: 1,
    artifactPath: ".codedecay/local/impact-graph.json",
    adapters: [],
    limitations: [],
    nodes: [
      impactNode("file:route", "file", "src/app/api/billing/payouts/retry/route.ts", "src/app/api/billing/payouts/retry/route.ts"),
      impactNode("route:retry", "route", "POST /api/billing/payouts/retry", "src/app/api/billing/payouts/retry/route.ts"),
      impactNode("symbol:settle", "symbol", "settlePayoutRetry", "src/billing/payouts.ts"),
      impactNode("symbol:format", "symbol", "formatRetryStatus", "src/billing/format.ts"),
      impactNode("file:worker", "file", "src/jobs/payout-retry-worker.ts", "src/jobs/payout-retry-worker.ts"),
      impactNode("job:worker", "job", "Payout retry worker"),
      impactNode("file:test", "test", "tests/payout-retry.test.ts", "tests/payout-retry.test.ts"),
      impactNode("file:decoy", "file", "src/api/tooling/retry-playground.ts", "src/api/tooling/retry-playground.ts")
    ],
    edges: [
      impactEdge("serves-route", "file:route", "route:retry", "serves", "Route file serves payout retry API."),
      impactEdge("route-imports-settle", "file:route", "symbol:settle", "imports", "Retry API imports payout settlement."),
      impactEdge("worker-consumes-settle", "file:worker", "symbol:settle", "consumes", "Worker consumes payout settlement."),
      impactEdge("worker-serves-job", "file:worker", "job:worker", "serves", "Worker file serves payout retry job."),
      impactEdge("test-proves-settle", "file:test", "symbol:settle", "tests", "Payout retry test references changed symbol."),
      impactEdge("route-imports-format", "file:route", "symbol:format", "imports", "Retry API formats payout retry status."),
      impactEdge("worker-imports-format", "file:worker", "symbol:format", "imports", "Worker formats payout retry status.")
    ]
  };
}

function impactNode(id: string, kind: ImpactGraph["nodes"][number]["kind"], label: string, file?: string): ImpactGraph["nodes"][number] {
  return {
    id,
    kind,
    label,
    ...(file ? { location: { file } } : {}),
    adapterId: "fixture",
    adapterVersion: "1",
    sourceTool: "fixture"
  };
}

function impactEdge(
  id: string,
  from: string,
  to: string,
  kind: ImpactGraph["edges"][number]["kind"],
  evidence: string
): ImpactGraph["edges"][number] {
  return {
    id,
    from,
    to,
    kind,
    confidence: "direct",
    evidence,
    sourceTool: "fixture",
    adapterId: "fixture",
    adapterVersion: "1",
    limitations: []
  };
}

function billingMemory(): CodeDecayMemory {
  return {
    version: 1,
    flows: [
      {
        name: "Finance admin payout retry",
        description: "Finance admins retry failed payouts from the admin console.",
        productPaths: ["/api/billing/payouts/retry"]
      },
      {
        name: "API tooling retry playground",
        description: "Internal API tooling unrelated to payouts.",
        files: ["src/api/tooling/retry-playground.ts"]
      }
    ],
    commands: [
      {
        name: "Payout retry integration test",
        command: "pnpm test tests/payout-retry.test.ts",
        description: "Runs payout retry API and worker coverage.",
        files: ["tests/payout-retry.test.ts"]
      }
    ],
    invariants: [
      {
        name: "Admin payout retry must be idempotent",
        description: "A repeated retry must not enqueue duplicate transfers.",
        severity: "high",
        productPaths: ["/api/billing/payouts/retry"]
      }
    ],
    architecture: [
      {
        title: "Deprecated payout retry queue naming",
        note: "Deprecated and superseded by ADR 0004; this conflicts with the current retry worker naming.",
        files: ["src/jobs/legacy-payout-retry.ts"]
      }
    ],
    regressions: [
      {
        title: "Duplicate payout retry transfer",
        description: "A previous retry path enqueued two transfer jobs when a request was retried.",
        check: "tests/payout-retry.test.ts",
        severity: "high",
        files: ["src/billing/payouts.ts"]
      }
    ]
  };
}
