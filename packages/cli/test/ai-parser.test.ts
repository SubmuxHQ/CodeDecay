import { describe, expect, it } from "vitest";
import { parseAiArgs } from "../src/parsers/args";

describe("codedecay ai argument parser", () => {
  it("defaults to a Codex task bundle without optional execution", () => {
    expect(parseAiArgs([])).toEqual({
      mode: "task-bundle",
      format: "markdown",
      profile: "codex"
    });
  });

  it("parses the complete post-diff workflow contract", () => {
    expect(
      parseAiArgs([
        "--cwd",
        "packages/api",
        "--base=main",
        "--head",
        "HEAD",
        "--format=json",
        "--profile",
        "claude-code",
        "--task",
        "Protect billing export",
        "--requirements=requirements.yml",
        "--filter-source",
        "test-proof",
        "--filter-priority=high",
        "--filter-file",
        "src/billing/export.ts",
        "--investigate",
        "--with-checks",
        "--fail-on",
        "medium",
        "--fail-on-requirements",
        "--output",
        "codedecay-ai.json"
      ])
    ).toEqual({
      mode: "task-bundle",
      cwd: "packages/api",
      base: "main",
      head: "HEAD",
      format: "json",
      profile: "claude-code",
      task: "Protect billing export",
      requirements: "requirements.yml",
      filterSource: "test-proof",
      filterPriority: "high",
      filterFile: "src/billing/export.ts",
      investigate: true,
      withChecks: true,
      failOn: "medium",
      failOnRequirements: true,
      output: "codedecay-ai.json"
    });
  });

  it("supports explicit preflight investigation but rejects post-change gates", () => {
    expect(
      parseAiArgs([
        "preflight",
        "--task",
        "Add billing export",
        "--requirements",
        ".codedecay/requirements.yml",
        "--investigate",
        "--format",
        "json"
      ])
    ).toEqual({
      mode: "preflight",
      task: "Add billing export",
      requirements: ".codedecay/requirements.yml",
      investigate: true,
      format: "json",
      profile: "codex"
    });

    expect(() => parseAiArgs(["preflight", "--task", "Add billing export", "--with-checks"])).toThrow(
      "ai preflight does not support --with-checks"
    );
    expect(() => parseAiArgs(["preflight", "--task", "Add billing export", "--fail-on", "high"])).toThrow(
      "ai preflight does not support --fail-on"
    );
    expect(() =>
      parseAiArgs(["preflight", "--task", "Add billing export", "--fail-on-requirements"])
    ).toThrow("ai preflight does not support --fail-on-requirements");
  });

  it("uses ai-specific diagnostics for invalid input", () => {
    expect(() => parseAiArgs(["preflight"])).toThrow("ai preflight requires --task <description>.");
    expect(() => parseAiArgs(["--profile", "unknown"])).toThrow('Invalid agent profile "unknown"');
    expect(() => parseAiArgs(["--filter-source", "guess"])).toThrow('Invalid --filter-source "guess"');
    expect(() => parseAiArgs(["--with-cheks"])).toThrow("Unknown option for codedecay ai: --with-cheks");
  });
});
