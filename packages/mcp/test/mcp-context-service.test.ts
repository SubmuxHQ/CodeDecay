import { describe, expect, it } from "vitest";
import { createCodeDecayMcpServer, runContextServiceTool } from "../src/index";
import { createRepo, createTempDir } from "./helpers/mcp";

describe("MCP context_service tool", () => {
  it("registers context_service on the MCP server", () => {
    const server = createCodeDecayMcpServer({ cwd: createTempDir() });
    expect(server).toBeTruthy();
  });

  it("returns shared health/query decisions for a local repo", async () => {
    const repo = createRepo({
      "src/index.ts": "export const ok = true;\n",
      "README.md": "# fixture\n"
    });
    const health = JSON.parse(await runContextServiceTool({ cwd: repo }, { operation: "health" })) as {
      repositoryId: string;
      freshness: string;
    };
    const query = JSON.parse(
      await runContextServiceTool(
        { cwd: repo },
        { operation: "query", sessionId: "mcp-a", task: "index check", waitBudgetMs: 50 }
      )
    ) as { repositoryId: string; task?: string; freshness: string };

    expect(health.repositoryId).toBe(query.repositoryId);
    expect(query.task).toBe("index check");
    expect(["current", "refreshing", "stale"]).toContain(query.freshness);
  });
});
