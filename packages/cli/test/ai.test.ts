import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createLowRiskRepo, createMediumRiskRepo, run, writeExecutionConfig } from "./helpers";

describe("codedecay ai CLI contract", () => {
  it("defaults to a Codex-ready agent bundle without running checks", async () => {
    const repo = createMediumRiskRepo();
    writeExecutionConfig(repo, {
      allowCommands: true,
      testCommand: "node -e \"require('fs').writeFileSync('codedecay-ai-ran.txt','yes')\""
    });

    const result = await run(["ai", "--format", "json"], repo);
    const bundle = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(bundle).toMatchObject({
      tool: "CodeDecay",
      mode: "agent-task-bundle",
      agentProfile: {
        id: "codex",
        name: "Codex"
      },
      safety: {
        llmCalled: false,
        commandsExecuted: false,
        telemetrySent: false,
        cloudDependency: false,
        agentOutputTrusted: false
      }
    });
    expect(bundle.prompt).toContain("Target agent profile: Codex");
    expect(bundle.suggestedChecks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "configured-command",
          command: "node -e \"require('fs').writeFileSync('codedecay-ai-ran.txt','yes')\"",
          willRun: false
        })
      ])
    );
    expect(existsSync(join(repo, "codedecay-ai-ran.txt"))).toBe(false);
  });

  it("supports Claude Code handoff wording", async () => {
    const repo = createMediumRiskRepo();

    const result = await run(["ai", "--profile", "claude-code", "--format", "markdown"], repo);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("## CodeDecay Agent Task Bundle");
    expect(result.stdout).toContain("Claude Code");
  });

  it("runs configured checks only when --with-checks is requested", async () => {
    const repo = createLowRiskRepo();
    writeExecutionConfig(repo, {
      allowCommands: true,
      testCommand: "node -e \"require('fs').writeFileSync('codedecay-ai-ran.txt','yes'); console.log('checked')\""
    });

    const result = await run(["ai", "--with-checks", "--format", "json"], repo);
    const bundle = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(bundle.safety.commandsExecuted).toBe(true);
    expect(readFileSync(join(repo, "codedecay-ai-ran.txt"), "utf8")).toBe("yes");
  });

  it("exits non-zero after writing a bundle when verification is blocked", async () => {
    const repo = createLowRiskRepo();
    writeExecutionConfig(repo, {
      allowCommands: true,
      testCommand: "rm -rf ./dist"
    });

    const result = await run(["ai", "--with-checks", "--format", "json"], repo);
    const bundle = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(1);
    expect(bundle.safety.commandsExecuted).toBe(false);
    expect(bundle.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Resolve blocked proof check: Test command 1",
          source: "configured-check",
          proof: "missing-proof"
        })
      ])
    );
  });

  it("supports preflight before code generation", async () => {
    const repo = createLowRiskRepo();

    const result = await run(["ai", "preflight", "--task", "Add a billing export API", "--format", "json"], repo);
    const preflight = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(preflight).toMatchObject({
      tool: "CodeDecay",
      mode: "agent-preflight",
      task: "Add a billing export API",
      safety: {
        llmCalled: false,
        commandsExecuted: false,
        telemetrySent: false
      }
    });
  });
});
