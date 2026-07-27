import { describe, expect, it } from "vitest";
import { runAgentPreflightTool } from "../src/index";
import { createTempDir, git, writeFile } from "./helpers/mcp";

describe("MCP agent preflight requirement context", () => {
  it("accepts structured local context with provenance without executing tools", () => {
    const repo = createTempDir();
    git(repo, ["init"]);
    writeFile(repo, "src/billing/export.ts", "export const exportBilling = () => [];\n");
    git(repo, ["add", "."]);

    const output = JSON.parse(
      runAgentPreflightTool(
        { cwd: repo },
        {
          task: "Add billing export API",
          format: "json",
          requirements: {
            sources: [
              {
                id: "issue-663",
                kind: "issue",
                label: "Issue #663",
                location: "https://github.com/SubMux-HQ/CodeDecay/issues/663"
              }
            ],
            acceptanceCriteria: [
              {
                id: "AC-1",
                text: "Return billing rows as CSV.",
                sourceIds: ["issue-663"]
              }
            ],
            affectedFlows: [{ name: "Billing export", kind: "api" }]
          }
        }
      )
    );

    expect(output.requirements).toMatchObject({
      acceptanceCriteria: [
        {
          id: "AC-1",
          text: "Return billing rows as CSV.",
          sourceIds: ["issue-663"]
        }
      ]
    });
    expect(output.requirements.sources).toContainEqual(
      expect.objectContaining({
        id: "issue-663",
        kind: "issue"
      })
    );
    expect(output.requirements.sources).toContainEqual(
      expect.objectContaining({
        id: "mcp-input",
        kind: "integration"
      })
    );
    expect(output.safety).toMatchObject({
      commandsExecuted: false,
      llmCalled: false,
      telemetrySent: false
    });
  });
});
