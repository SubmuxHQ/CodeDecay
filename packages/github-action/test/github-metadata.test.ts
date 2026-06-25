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

  it("keeps bug and feature area options aligned with current architecture", () => {
    const expectedOptions = [
      "CLI",
      "Core scoring or rules",
      "JS/TS analyzer",
      "Git integration",
      "Report output",
      "Config",
      "Adapters or tool adapters",
      "Safe execution",
      "Test audit",
      "Redteam reports",
      "Agent task bundles",
      "MCP server",
      "Memory",
      "LLM providers",
      "GitHub Action",
      "GitHub App",
      "Examples",
      "Packaging or release",
      "Documentation",
      "Dev experience",
      "Other"
    ];

    expect(readIssueAreaOptions(".github/ISSUE_TEMPLATE/bug_report.yml")).toEqual(expectedOptions);
    expect(readIssueAreaOptions(".github/ISSUE_TEMPLATE/feature_request.yml")).toEqual(expectedOptions);
  });

  it("keeps the pull request template aligned with current validation and risk areas", () => {
    const template = readFileSync(".github/PULL_REQUEST_TEMPLATE.md", "utf8");

    const expectedRiskAreas = [
      "CLI or npm package behavior",
      "Core scoring, rules, or shared types",
      "JS/TS analyzer, impact map, or test-audit behavior",
      "Git diff, path normalization, or base/head handling",
      "Reports, Markdown, JSON, or SARIF output",
      "Redteam reports, agent bundles, MCP, memory, or LLM provider boundaries",
      "Safe execution, differential checks, or tool adapters",
      "GitHub Action, GitHub App, CI, or repository automation",
      "Docs, examples, contributor setup, or agentic development resources",
      "Packaging, release metadata, or published tarball contents"
    ];
    const expectedValidation = [
      "`pnpm run lint`",
      "`pnpm typecheck`",
      "`pnpm test`",
      "`pnpm eval:pr-safety -- --run-id local-pr-safety-eval`",
      "`pnpm build`",
      "`pnpm --filter @submuxhq/codedecay pack --dry-run`",
      "Added or updated tests for behavior changes",
      "Updated docs for user-facing changes",
      "Included CodeDecay self-check evidence above, or explained why it is not applicable"
    ];

    for (const line of [...expectedRiskAreas, ...expectedValidation]) {
      expect(template).toContain(line);
    }
    expect(template).toContain("Closes #");
  });

  it("runs the full release validation command set in CI", () => {
    const workflow = parse(readFileSync(".github/workflows/ci.yml", "utf8")) as {
      jobs: {
        validate: {
          steps: Array<{ run?: string | undefined }>;
        };
      };
    };

    const commands = workflow.jobs.validate.steps.map((step) => step.run).filter(Boolean);

    expect(commands).toEqual(
      expect.arrayContaining([
        "pnpm install --frozen-lockfile",
        "pnpm run lint",
        "pnpm typecheck",
        "pnpm test",
        "pnpm build",
        "pnpm --filter @submuxhq/codedecay pack --dry-run"
      ])
    );
    expect(commands.indexOf("pnpm --filter @submuxhq/codedecay pack --dry-run")).toBeGreaterThan(
      commands.indexOf("pnpm build")
    );
  });

  it("dogfoods the local action in report-only redteam mode", () => {
    const workflow = parse(readFileSync(".github/workflows/codedecay-dogfood.yml", "utf8")) as {
      jobs: {
        codedecay: {
          steps: Array<{
            uses?: string | undefined;
            with?: Record<string, string> | undefined;
          }>;
        };
      };
    };

    const actionStep = workflow.jobs.codedecay.steps.find((step) => step.uses === "./packages/github-action");

    expect(actionStep?.with).toMatchObject({
      mode: "redteam",
      base: "${{ github.event.pull_request.base.sha }}",
      head: "${{ github.event.pull_request.head.sha }}",
      cwd: ".",
      format: "markdown"
    });
    expect(actionStep?.with).not.toHaveProperty("fail-on");
  });
});

function readIssueAreaOptions(path: string): string[] {
  const template = parse(readFileSync(path, "utf8")) as {
    body: Array<{
      id?: string | undefined;
      attributes?: { options?: string[] | undefined } | undefined;
    }>;
  };

  const areaInput = template.body.find((item) => item.id === "area");
  return areaInput?.attributes?.options ?? [];
}
