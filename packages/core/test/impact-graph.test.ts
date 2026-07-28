import { describe, expect, it } from "vitest";
import {
  IMPACT_GRAPH_EDGE_KINDS,
  IMPACT_GRAPH_NODE_KINDS,
  createUnavailableImpactGraphFragment,
  normalizeImpactGraphFragments,
  summarizeImpactGraph,
  type ImpactGraphFragment
} from "../src/index";

describe("impact graph adapter contract", () => {
  it("covers the downstream behavior vocabulary required by adapters", () => {
    expect(IMPACT_GRAPH_NODE_KINDS).toEqual(
      expect.arrayContaining([
        "file",
        "route",
        "api",
        "ui",
        "product-flow",
        "symbol",
        "package",
        "persistence",
        "schema",
        "job",
        "event",
        "config",
        "env",
        "test"
      ])
    );
    expect(IMPACT_GRAPH_EDGE_KINDS).toEqual(
      expect.arrayContaining([
        "imports",
        "calls",
        "contains",
        "serves",
        "reads",
        "writes",
        "produces",
        "consumes",
        "configures",
        "tests",
        "flows-to"
      ])
    );
  });

  it("namespaces adapters and normalizes equivalent input in stable order", () => {
    const first = fragment({
      adapterId: "framework-b",
      sourceTool: "framework-b-parser",
      confidence: "inferred"
    });
    const second = fragment({
      adapterId: "language-a",
      sourceTool: "language-a-parser",
      confidence: "direct"
    });

    const left = normalizeImpactGraphFragments([first, second]);
    const right = normalizeImpactGraphFragments([second, first]);

    expect(left).toEqual(right);
    expect(JSON.stringify(left)).toBe(JSON.stringify(right));
    expect(left.nodes.map((node) => node.id)).toEqual([
      "framework-b::entry",
      "framework-b::target",
      "language-a::entry",
      "language-a::target"
    ]);
    expect(left.edges).toEqual([
      expect.objectContaining({
        id: "framework-b::edge",
        from: "framework-b::entry",
        to: "framework-b::target",
        adapterId: "framework-b",
        adapterVersion: "1.0.0",
        sourceTool: "framework-b-parser",
        confidence: "inferred",
        evidence: "The adapter resolved the route to the imported symbol.",
        location: {
          file: "src/routes/users.ts",
          line: 4,
          column: 2
        },
        limitations: ["Dynamic dependency injection is not resolved."]
      }),
      expect.objectContaining({
        id: "language-a::edge",
        adapterId: "language-a",
        sourceTool: "language-a-parser",
        confidence: "direct"
      })
    ]);

    expect(summarizeImpactGraph(left)).toMatchObject({
      schemaVersion: 1,
      adapterCount: 2,
      nodeCount: 4,
      edgeCount: 2,
      confidenceCounts: {
        direct: 1,
        inferred: 1,
        heuristic: 0
      }
    });
  });

  it.each([
    {
      name: "duplicate node ids",
      mutate: (input: ImpactGraphFragment) => {
        input.nodes.push({ ...input.nodes[0]! });
      },
      message: /duplicate node id/i
    },
    {
      name: "duplicate edge ids",
      mutate: (input: ImpactGraphFragment) => {
        input.edges.push({ ...input.edges[0]! });
      },
      message: /duplicate edge id/i
    },
    {
      name: "dangling edge endpoints",
      mutate: (input: ImpactGraphFragment) => {
        input.edges[0] = { ...input.edges[0]!, to: "missing" };
      },
      message: /unknown node/i
    },
    {
      name: "invalid source lines",
      mutate: (input: ImpactGraphFragment) => {
        input.edges[0] = {
          ...input.edges[0]!,
          location: { file: "src/routes/users.ts", line: 0 }
        };
      },
      message: /line/i
    },
    {
      name: "absolute source paths",
      mutate: (input: ImpactGraphFragment) => {
        input.edges[0] = {
          ...input.edges[0]!,
          location: { file: "/tmp/secrets.ts", line: 1 }
        };
      },
      message: /relative repository path/i
    },
    {
      name: "missing source paths",
      mutate: (input: ImpactGraphFragment) => {
        input.edges[0] = {
          ...input.edges[0]!,
          location: {} as { file: string }
        };
      },
      message: /relative repository path/i
    },
    {
      name: "unsupported schema versions",
      mutate: (input: ImpactGraphFragment) => {
        (input as { schemaVersion: number }).schemaVersion = 2;
      },
      message: /schema version/i
    }
  ])("rejects $name", ({ mutate, message }) => {
    const input = fragment({
      adapterId: "language-a",
      sourceTool: "language-a-parser",
      confidence: "direct"
    });
    mutate(input);

    expect(() => normalizeImpactGraphFragments([input])).toThrow(message);
  });

  it("rejects duplicate adapter namespaces", () => {
    const first = fragment({
      adapterId: "language-a",
      sourceTool: "language-a-parser",
      confidence: "direct"
    });
    const second = fragment({
      adapterId: "language-a",
      sourceTool: "another-parser",
      confidence: "inferred"
    });

    expect(() => normalizeImpactGraphFragments([first, second])).toThrow(/duplicate impact adapter id/i);
  });

  it.each([
    {
      name: "undeclared node capabilities",
      mutate: (input: ImpactGraphFragment) => {
        input.adapter.capabilities.nodeKinds = ["route"];
      },
      message: /does not declare node kind "symbol"/i
    },
    {
      name: "undeclared edge capabilities",
      mutate: (input: ImpactGraphFragment) => {
        input.adapter.capabilities.edgeKinds = ["calls"];
      },
      message: /does not declare edge kind "imports"/i
    }
  ])("rejects $name", ({ mutate, message }) => {
    const input = fragment({
      adapterId: "language-a",
      sourceTool: "language-a-parser",
      confidence: "direct"
    });
    mutate(input);

    expect(() => normalizeImpactGraphFragments([input])).toThrow(message);
  });

  it("returns a contract error for structurally malformed runtime input", () => {
    const malformed = {
      schemaVersion: 1,
      nodes: [],
      edges: [],
      limitations: []
    } as unknown as ImpactGraphFragment;

    expect(() => normalizeImpactGraphFragments([malformed])).toThrow(/adapter descriptor/i);
  });

  it("represents an unavailable optional adapter without executing it", () => {
    const unavailable = createUnavailableImpactGraphFragment({
      adapterId: "python-tree-sitter",
      adapterVersion: "0.1.0",
      sourceTool: "tree-sitter-python",
      capabilities: {
        nodeKinds: ["route", "symbol", "job", "test"],
        edgeKinds: ["contains", "calls", "tests"]
      },
      limitations: [
        "The optional parser is not installed.",
        "No command, install, network, model, or telemetry action was attempted."
      ]
    });

    const graph = normalizeImpactGraphFragments([unavailable]);

    expect(graph.nodes).toEqual([]);
    expect(graph.edges).toEqual([]);
    expect(graph.adapters).toEqual([
      expect.objectContaining({
        id: "python-tree-sitter",
        status: "unavailable",
        sourceTool: "tree-sitter-python",
        limitations: unavailable.limitations
      })
    ]);
    expect(graph.limitations).toEqual(unavailable.limitations);
  });
});

function fragment(input: {
  adapterId: string;
  sourceTool: string;
  confidence: "direct" | "inferred" | "heuristic";
}): ImpactGraphFragment {
  return {
    schemaVersion: 1,
    adapter: {
      id: input.adapterId,
      version: "1.0.0",
      sourceTool: input.sourceTool,
      status: "available",
      capabilities: {
        nodeKinds: ["route", "symbol"],
        edgeKinds: ["imports"]
      },
      limitations: ["Dynamic dependency injection is not resolved."]
    },
    nodes: [
      {
        id: "entry",
        kind: "route",
        label: "GET /users",
        location: {
          file: "src/routes/users.ts",
          line: 1
        }
      },
      {
        id: "target",
        kind: "symbol",
        label: "listUsers",
        location: {
          file: "src/services/users.ts",
          line: 2
        }
      }
    ],
    edges: [
      {
        id: "edge",
        from: "entry",
        to: "target",
        kind: "imports",
        confidence: input.confidence,
        evidence: "The adapter resolved the route to the imported symbol.",
        sourceTool: input.sourceTool,
        location: {
          file: "src/routes/users.ts",
          line: 4,
          column: 2
        },
        limitations: ["Dynamic dependency injection is not resolved."]
      }
    ],
    limitations: []
  };
}
