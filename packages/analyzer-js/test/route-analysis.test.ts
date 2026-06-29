import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { FileChange } from "@submuxhq/codedecay-core";
import { analyzeRouteImpacts } from "../src/routes/analysis";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("route impact analysis", () => {
  it("returns direct route impacts for changed route files", () => {
    const rootDir = createTempProject({
      "src/app/api/users/route.ts": "export async function GET() { return Response.json([]); }\n"
    });

    const result = analyzeRouteImpacts(rootDir, [change("src/app/api/users/route.ts")]);

    expect(result.impactedRoutes).toEqual([
      expect.objectContaining({
        framework: "nextjs",
        kind: "api-route",
        route: "/api/users",
        methods: ["GET"],
        files: ["src/app/api/users/route.ts"],
        risk: "high"
      })
    ]);
    expect(result.findings).toEqual([]);
  });

  it("propagates helper changes into importing route boundaries", () => {
    const rootDir = createTempProject({
      "src/lib/users.ts": "export function listUsers() { return []; }\n",
      "src/app/api/users/route.ts": [
        "import { listUsers } from '../../../lib/users';",
        "export async function GET() {",
        "  return Response.json(listUsers());",
        "}",
        ""
      ].join("\n")
    });

    const result = analyzeRouteImpacts(rootDir, [change("src/lib/users.ts")]);

    expect(result.impactedRoutes).toEqual([
      expect.objectContaining({
        route: "/api/users",
        files: ["src/app/api/users/route.ts", "src/lib/users.ts"],
        reasons: expect.arrayContaining([
          "Next.js App Router API route changed",
          "Propagated through local imports: src/lib/users.ts -> src/app/api/users/route.ts"
        ])
      })
    ]);
    expect(result.findings).toEqual([
      expect.objectContaining({
        ruleId: "propagated-route-impact",
        file: "src/lib/users.ts",
        line: 1,
        severity: "high"
      })
    ]);
    expect(result.recommendedTests).toContain(
      "Add or run tests covering src/app/api/users/route.ts because it depends on src/lib/users.ts"
    );
  });
});

function change(path: string): FileChange {
  return {
    path,
    status: "modified",
    additions: 1,
    deletions: 0,
    addedLines: [{ line: 1, content: "export const changed = true;" }]
  };
}

function createTempProject(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "codedecay-route-analysis-"));
  tempRoots.push(root);

  for (const [path, contents] of Object.entries(files)) {
    const fullPath = join(root, path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, contents, "utf8");
  }

  return root;
}
