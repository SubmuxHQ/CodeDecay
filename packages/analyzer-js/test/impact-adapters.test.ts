import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeJsProject } from "../src";
import { change, createTempProject } from "./helpers/integration";

describe("framework and language impact adapters", () => {
  it("maps Python service changes through FastAPI routes and Python tests", () => {
    const rootDir = createTempProject({
      "services/payments.py": [
        "def settle_payout(payload):",
        "    return {\"id\": payload[\"id\"], \"status\": \"settled\"}",
        ""
      ].join("\n"),
      "api/routes.py": [
        "from fastapi import APIRouter",
        "from services.payments import settle_payout",
        "",
        "router = APIRouter()",
        "",
        "@router.post(\"/payouts/retry\")",
        "def retry_payout(request):",
        "    return settle_payout(request.json())",
        ""
      ].join("\n"),
      "tests/test_payments.py": [
        "from services.payments import settle_payout",
        "",
        "def test_settle_payout():",
        "    assert settle_payout({\"id\": \"pay_1\"})[\"status\"] == \"settled\"",
        ""
      ].join("\n"),
      "docs/python-route-notes.py": [
        "# @router.post(\"/fake\") is documentation text, not a route.",
        "example = \"@app.get('/fake')\"",
        ""
      ].join("\n")
    });

    const result = analyzeJsProject({
      rootDir,
      changedFiles: [change("services/payments.py", "def settle_payout(payload):")]
    });

    expect(result.languageAnalysis?.limitedFiles).toEqual(["services/payments.py"]);
    expect(result.symbolImpacts).toEqual([
      expect.objectContaining({
        file: "services/payments.py",
        symbol: "settle_payout",
        importerFiles: expect.arrayContaining(["api/routes.py", "tests/test_payments.py"]),
        routeFiles: ["api/routes.py"],
        likelyTests: ["tests/test_payments.py"]
      })
    ]);
    expect(result.recommendedTests).toContain(
      "Add or run tests covering api/routes.py because it imports services/payments.py#settle_payout"
    );
    expect(result.recommendedTests).toContain(
      "Re-run likely impacted test tests/test_payments.py for services/payments.py#settle_payout"
    );

    const graph = JSON.parse(readFileSync(join(rootDir, ".codedecay/local/impact-graph.json"), "utf8")) as {
      adapters: Array<{ id: string; sourceTool: string; status: string }>;
      nodes: Array<{ id: string; kind: string; label: string }>;
      edges: Array<{
        from: string;
        to: string;
        kind: string;
        confidence: string;
        sourceTool: string;
        evidence: string;
      }>;
    };

    expect(graph.adapters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "codedecay-python-lezer",
          sourceTool: "@lezer/python",
          status: "available"
        })
      ])
    );
    expect(graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "codedecay-python-lezer::symbol:services/payments.py#settle_payout",
          kind: "symbol"
        }),
        expect.objectContaining({
          id: "codedecay-python-lezer::file:api/routes.py",
          kind: "api"
        }),
        expect.objectContaining({
          id: "codedecay-python-lezer::route:api/routes.py#POST /payouts/retry",
          kind: "route"
        }),
        expect.objectContaining({
          id: "codedecay-python-lezer::file:tests/test_payments.py",
          kind: "test"
        })
      ])
    );
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: "codedecay-python-lezer::file:api/routes.py",
          to: "codedecay-python-lezer::symbol:services/payments.py#settle_payout",
          kind: "imports",
          confidence: "direct",
          sourceTool: "@lezer/python"
        }),
        expect.objectContaining({
          from: "codedecay-python-lezer::file:api/routes.py",
          to: "codedecay-python-lezer::route:api/routes.py#POST /payouts/retry",
          kind: "serves",
          confidence: "direct"
        }),
        expect.objectContaining({
          from: "codedecay-python-lezer::file:tests/test_payments.py",
          to: "codedecay-python-lezer::symbol:services/payments.py#settle_payout",
          kind: "tests",
          confidence: "direct"
        })
      ])
    );
    expect(graph.nodes.map((node) => node.id).join("\n")).not.toContain("docs/python-route-notes.py");
  });

  it("maps Remix file routes as impacted routes and adapter graph evidence", () => {
    const rootDir = createTempProject({
      "app/routes/payouts.$payoutId.tsx": [
        "export async function loader() {",
        "  return { ok: true };",
        "}",
        "",
        "export async function action() {",
        "  return { retried: true };",
        "}",
        "",
        "export default function PayoutRoute() {",
        "  return <main>Payout</main>;",
        "}",
        ""
      ].join("\n"),
      "app/not-routes/payouts.$payoutId.tsx": "export default function Decoy() { return <main />; }\n"
    });

    const result = analyzeJsProject({
      rootDir,
      changedFiles: [change("app/routes/payouts.$payoutId.tsx", "  return { retried: true };")]
    });

    expect(result.impactedRoutes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          framework: "remix",
          kind: "ui-route",
          route: "/payouts/:payoutId",
          methods: ["GET", "POST"],
          files: ["app/routes/payouts.$payoutId.tsx"]
        })
      ])
    );
    expect(result.impactedRoutes ?? []).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          files: ["app/not-routes/payouts.$payoutId.tsx"]
        })
      ])
    );

    const graph = JSON.parse(readFileSync(join(rootDir, ".codedecay/local/impact-graph.json"), "utf8")) as {
      adapters: Array<{ id: string; sourceTool: string; status: string }>;
      nodes: Array<{ id: string; kind: string; label: string }>;
      edges: Array<{ from: string; to: string; kind: string; confidence: string; sourceTool: string }>;
    };

    expect(graph.adapters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "codedecay-remix-file-routes",
          sourceTool: "remix-route-conventions",
          status: "available"
        })
      ])
    );
    expect(graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "codedecay-remix-file-routes::file:app/routes/payouts.$payoutId.tsx",
          kind: "ui"
        }),
        expect.objectContaining({
          id: "codedecay-remix-file-routes::route:app/routes/payouts.$payoutId.tsx#/payouts/:payoutId",
          kind: "route"
        })
      ])
    );
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: "codedecay-remix-file-routes::file:app/routes/payouts.$payoutId.tsx",
          to: "codedecay-remix-file-routes::route:app/routes/payouts.$payoutId.tsx#/payouts/:payoutId",
          kind: "serves",
          confidence: "direct",
          sourceTool: "remix-route-conventions"
        })
      ])
    );
    expect(
      graph.nodes
        .map((node) => node.id)
        .filter((id) => id.startsWith("codedecay-remix-file-routes::"))
        .join("\n")
    ).not.toContain("app/not-routes");
  });

  it("does not promote comments, strings, dynamic decorators, or non-route folders into route proof", () => {
    const rootDir = createTempProject({
      "api/dynamic.py": [
        "from fastapi import APIRouter",
        "",
        "router = APIRouter()",
        "ROUTE = \"/dynamic\"",
        "",
        "@router.get(ROUTE)",
        "def dynamic_route(request):",
        "    return {\"ok\": True}",
        ""
      ].join("\n"),
      "docs/python-route-notes.py": [
        "# @router.post(\"/fake\") is documentation text, not a route.",
        "example = \"@app.get('/fake')\"",
        ""
      ].join("\n"),
      "app/not-routes/admin.$id.tsx": [
        "export async function loader() {",
        "  return { ok: true };",
        "}",
        ""
      ].join("\n")
    });

    const result = analyzeJsProject({
      rootDir,
      changedFiles: [change("api/dynamic.py", "    return {\"ok\": True}")]
    });

    expect(result.impactedRoutes ?? []).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          framework: "fastapi"
        }),
        expect.objectContaining({
          framework: "remix"
        })
      ])
    );

    const graph = JSON.parse(readFileSync(join(rootDir, ".codedecay/local/impact-graph.json"), "utf8")) as {
      nodes: Array<{ id: string; kind: string; label: string }>;
    };
    const nodeIds = graph.nodes.map((node) => node.id).join("\n");
    expect(nodeIds).not.toContain("docs/python-route-notes.py");
    expect(nodeIds).not.toContain("codedecay-python-lezer::route:api/dynamic.py#GET /dynamic");
    expect(
      graph.nodes
        .map((node) => node.id)
        .filter((id) => id.startsWith("codedecay-remix-file-routes::"))
        .join("\n")
    ).not.toContain("app/not-routes");
  });
});
