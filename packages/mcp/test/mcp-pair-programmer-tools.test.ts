import { describe, expect, it } from "vitest";
import {
  runDesignContractCheckTool,
  runFixTasksTool,
  runRegressionSurfaceTool,
  runScopeCheckTool,
  runWhatDidIMissTool
} from "../src/index";
import {
  createRepo,
  createWeakTestRepo,
  writeFile
} from "./helpers/mcp";

describe("CodeDecay MCP pair-programmer tools", () => {
  it("returns an out-of-scope verdict for active design contract fences", () => {
    const repo = createRepo({
      "codedecay.contract.json": JSON.stringify(
        {
          version: 1,
          activeScopeFence: "api-task",
          scopeFences: [
            {
              id: "api-task",
              allowedFiles: ["src/api/**"],
              allowedAreas: ["api"],
              severity: "high"
            }
          ]
        },
        null,
        2
      ),
      "docs/guide.md": "Original docs.\n",
      "src/api/users.ts": "export function listUsers() { return []; }\n"
    });
    writeFile(repo, "src/api/users.ts", "export function listUsers() { return [{ id: 'admin' }]; }\n");
    writeFile(repo, "docs/guide.md", "Changed docs.\n");

    const output = JSON.parse(runScopeCheckTool({ cwd: repo }, { task: "api task" }));

    expect(output.status).toBe("out_of_scope");
    expect(output.fence.id).toBe("api-task");
    expect(output.violations).toEqual([
      expect.objectContaining({
        file: "docs/guide.md",
        ruleId: "contract-scope-fence",
        severity: "high"
      })
    ]);
    expect(output.safety).toMatchObject({
      commandsExecuted: false,
      llmCalled: false,
      telemetrySent: false,
      cloudDependency: false
    });
  });

  it("returns design contract violations as structured findings", () => {
    const repo = createRepo({
      "codedecay.contract.json": JSON.stringify(
        {
          version: 1,
          bannedApis: [
            {
              id: "no-eval",
              files: ["src/**"],
              apis: ["eval("],
              severity: "high"
            }
          ]
        },
        null,
        2
      ),
      "src/api/users.ts": "export function listUsers() { return []; }\n"
    });
    writeFile(repo, "src/api/users.ts", "export function listUsers(input: string) { return eval(input); }\n");

    const output = JSON.parse(runDesignContractCheckTool({ cwd: repo }, {}));

    expect(output.status).toBe("fail");
    expect(output.findings).toEqual([
      expect.objectContaining({
        ruleId: "contract-banned-api",
        file: "src/api/users.ts",
        severity: "high"
      })
    ]);
    expect(output.safety.llmCalled).toBe(false);
  });

  it("returns filtered deterministic fix tasks", () => {
    const repo = createWeakTestRepo();

    const output = JSON.parse(runFixTasksTool({ cwd: repo }, { source: "weak-test", priority: "medium" }));

    expect(output.totalTasks).toBeGreaterThan(output.matchedTasks);
    expect(output.matchedTasks).toBeGreaterThan(0);
    expect(output.tasks.every((task: { source: string; priority: string }) => task.source === "weak-test" && task.priority === "medium")).toBe(
      true
    );
    expect(output.safety.commandsExecuted).toBe(false);
  });

  it("returns deterministic missed-risk evidence", () => {
    const repo = createWeakTestRepo();

    const output = JSON.parse(runWhatDidIMissTool({ cwd: repo }, {}));

    expect(output.status).toBe("gaps_found");
    expect(output.summary.weakTests).toBeGreaterThan(0);
    expect(output.gaps.weakTestFindings.map((finding: { ruleId: string }) => finding.ruleId)).toContain(
      "test-without-assertions"
    );
    expect(output.safety.telemetrySent).toBe(false);
  });

  it("returns memory-backed regression surfaces", () => {
    const repo = createRepo({
      ".codedecay/memory.json": JSON.stringify(
        {
          version: 1,
          flows: [
            {
              name: "Users API",
              files: ["src/api/users.ts"],
              checks: ["Call GET /api/users through the real route."]
            }
          ],
          commands: [
            {
              name: "Users API tests",
              command: "pnpm test users-api",
              files: ["src/api/users.ts"]
            }
          ],
          invariants: [
            {
              name: "Users API fails closed",
              description: "Missing users must not become admins.",
              files: ["src/api/users.ts"],
              severity: "high"
            }
          ],
          architecture: [
            {
              title: "API boundary",
              note: "Users API changes need route-level coverage.",
              areas: ["api"]
            }
          ],
          regressions: [
            {
              title: "Users API broke dashboard",
              description: "A users API response shape change previously broke dashboard rendering.",
              files: ["src/api/users.ts"],
              check: "Run dashboard against GET /api/users.",
              severity: "high"
            }
          ]
        },
        null,
        2
      ),
      "src/api/users.ts": "export function listUsers() { return []; }\n"
    });
    writeFile(repo, "src/api/users.ts", "export function listUsers() { return [{ id: 'admin' }]; }\n");

    const output = JSON.parse(runRegressionSurfaceTool({ cwd: repo }, {}));

    expect(output.status).toBe("regression_surface_found");
    expect(output.surfaces.invariants[0]).toMatchObject({
      matchingFile: "src/api/users.ts",
      item: { name: "Users API fails closed" }
    });
    expect(output.surfaces.regressions[0]).toMatchObject({
      matchingFile: "src/api/users.ts",
      item: { title: "Users API broke dashboard" }
    });
    expect(output.recommendedChecks).toEqual(
      expect.arrayContaining(["Run dashboard against GET /api/users.", "Call GET /api/users through the real route."])
    );
    expect(output.safety.llmCalled).toBe(false);
  });
});
