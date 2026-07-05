import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { FileChange } from "@submuxhq/codedecay-core";
import { analyzeJsProject } from "../src";
import { analyzeSymbolImpacts, SYMBOL_IMPACT_GRAPH_PATH } from "../src/symbols/graph";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("symbol impact graph", () => {
  it("maps changed named exports through re-exports and local package imports to routes and tests", () => {
    const rootDir = createTempProject({
      "packages/auth/package.json": JSON.stringify({ name: "@demo/auth", type: "module" }),
      "packages/auth/src/session.ts": [
        "export function validateSession(token?: string) {",
        "  return Boolean(token);",
        "}",
        ""
      ].join("\n"),
      "packages/auth/src/index.ts": "export { validateSession } from './session';\n",
      "app/api/session/route.ts": [
        "import { validateSession } from '@demo/auth';",
        "export async function GET() {",
        "  return Response.json({ ok: validateSession('token') });",
        "}",
        ""
      ].join("\n"),
      "app/api/session/route.test.ts": "import { validateSession } from '@demo/auth';\nvalidateSession('token');\n"
    });

    const result = analyzeSymbolImpacts(rootDir, [
      change("packages/auth/src/session.ts", 2, "  return token !== undefined;")
    ]);

    const impact = result.impacts.find((item) => item.symbol === "validateSession");
    expect(impact).toMatchObject({
      file: "packages/auth/src/session.ts",
      symbol: "validateSession",
      importerFiles: expect.arrayContaining([
        "packages/auth/src/index.ts",
        "app/api/session/route.ts",
        "app/api/session/route.test.ts"
      ]),
      routeFiles: ["app/api/session/route.ts"],
      likelyTests: ["app/api/session/route.test.ts"]
    });
    expect(result.recommendedTests).toContain(
      "Add or run tests covering app/api/session/route.ts because it imports packages/auth/src/session.ts#validateSession"
    );

    const artifactPath = join(rootDir, SYMBOL_IMPACT_GRAPH_PATH);
    expect(existsSync(artifactPath)).toBe(true);
    const artifact = JSON.parse(readFileSync(artifactPath, "utf8")) as {
      edges: Array<{ sourceFile: string; importerFile: string }>;
      files: Array<{ path: string; calls: Array<{ callee: string }> }>;
    };
    expect(artifact.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceFile: "packages/auth/src/session.ts",
          importerFile: "packages/auth/src/index.ts"
        }),
        expect.objectContaining({
          sourceFile: "packages/auth/src/index.ts",
          importerFile: "app/api/session/route.ts"
        })
      ])
    );
    expect(artifact.files.find((file) => file.path === "app/api/session/route.ts")?.calls).toEqual(
      expect.arrayContaining([expect.objectContaining({ callee: "validateSession" })])
    );
  });

  it("maps changed default exports to direct importing files", () => {
    const rootDir = createTempProject({
      "src/format.ts": [
        "export default function formatName(value: string) {",
        "  return value.trim();",
        "}",
        ""
      ].join("\n"),
      "src/consumer.ts": "import formatName from './format';\nexport const displayName = formatName('Ada');\n"
    });

    const result = analyzeSymbolImpacts(rootDir, [
      change("src/format.ts", 2, "  return value.toUpperCase();")
    ]);

    expect(result.impacts).toEqual([
      expect.objectContaining({
        file: "src/format.ts",
        symbol: "default",
        exportKind: "default",
        importerFiles: ["src/consumer.ts"]
      })
    ]);
  });

  it("includes symbol impacts in analyzer reports", () => {
    const rootDir = createTempProject({
      "src/math.ts": "export function isPositive(value: number) {\n  return value >= 0;\n}\n",
      "src/math.test.ts": "import { isPositive } from './math';\nisPositive(1);\n"
    });

    const result = analyzeJsProject({
      rootDir,
      changedFiles: [change("src/math.ts", 2, "  return value > 0;")]
    });

    expect(result.symbolImpactGraph?.artifactPath).toBe(SYMBOL_IMPACT_GRAPH_PATH);
    expect(result.symbolImpacts).toEqual([
      expect.objectContaining({
        file: "src/math.ts",
        symbol: "isPositive",
        likelyTests: ["src/math.test.ts"]
      })
    ]);
  });
});

function createTempProject(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "codedecay-symbol-graph-"));
  tempRoots.push(root);

  for (const [path, contents] of Object.entries(files)) {
    const fullPath = join(root, path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, contents, "utf8");
  }

  return root;
}

function change(path: string, line: number, content: string): FileChange {
  return {
    path,
    status: "modified",
    additions: 1,
    deletions: 0,
    addedLines: [{ line, content }]
  };
}
