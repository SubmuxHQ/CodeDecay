import { readdirSync, readFileSync } from "node:fs";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

describe("GitHub repository metadata", () => {
  it("labels orchestration package changes", () => {
    const labeler = parse(readFileSync(".github/labeler.yml", "utf8")) as Record<string, unknown>;

    const expectedMappings: Record<string, string[]> = {
      "type: ci": [".github/workflows/**", ".github/labeler.yml"],
      "area: config": ["packages/config/**"],
      "area: adapters": ["packages/adapters/**", "packages/tool-adapters/**"],
      "area: llm": ["packages/llm/**"],
      "area: test-audit": ["packages/test-audit/**"],
      "area: mcp": ["packages/mcp/**"],
      "area: execution": ["packages/execution/**"],
      "area: memory": ["packages/memory/**"],
      "area: github-app": ["packages/github-app/**"],
      "area: harness": ["packages/harness/**"],
      "area: redteam": ["packages/redteam/**"],
      "area: agent": ["packages/agent/**"],
      examples: ["examples/**"],
      "area: dev-experience": [".agents/**", ".codedecay/**", ".codex/**", ".cursor/**", "AGENTS.md", "DEVELOPMENT.md"]
    };

    for (const [label, globs] of Object.entries(expectedMappings)) {
      expect(labeler[label], `${label} mapping should exist`).toBeDefined();

      const labelJson = JSON.stringify(labeler[label]);
      for (const glob of globs) {
        expect(labelJson, `${label} should include ${glob}`).toContain(glob);
      }
    }
  });

  it("does not use legacy duplicate area label names", () => {
    const labeler = parse(readFileSync(".github/labeler.yml", "utf8")) as Record<string, unknown>;

    expect(Object.keys(labeler)).not.toEqual(expect.arrayContaining(["area:agent", "area:mcp", "area:report"]));
  });

  it("uses structured issue forms without duplicate legacy markdown templates", () => {
    const issueTemplates = readdirSync(".github/ISSUE_TEMPLATE").sort();

    expect(issueTemplates).toEqual([
      "bug_report.yml",
      "config.yml",
      "documentation.yml",
      "feature_request.yml",
      "question.yml"
    ]);
    expect(issueTemplates).not.toEqual(expect.arrayContaining(["bug_report.md", "feature_request.md"]));
  });
});
