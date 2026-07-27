import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createLowRiskRepo,
  createMediumRiskRepo,
  createRepo,
  run,
  writeExecutionConfig,
  writeFile
} from "./helpers";

describe("codedecay ai CLI contract", () => {
  it("defaults to a Codex-ready bundle without running configured checks", async () => {
    const repo = createMediumRiskRepo();
    const marker = join(repo, "codedecay-ai-ran.txt");
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
      }
    });
    expect(bundle.safety.llmCalled).toBe(false);
    expect(bundle.safety.commandsExecuted).toBe(false);
    expect(bundle.safety.telemetrySent).toBe(false);
    expect(bundle.safety.cloudDependency).toBe(false);
    expect(bundle.safety.agentOutputTrusted).toBe(false);
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
    expect(existsSync(marker)).toBe(false);
  });

  it("supports alternate profiles while preserving the lower-level agent default", async () => {
    const repo = createMediumRiskRepo();

    const claude = await run(["ai", "--profile", "claude-code", "--format", "markdown"], repo);
    expect(claude.exitCode).toBe(0);
    expect(claude.stdout).toContain("## CodeDecay Agent Task Bundle");
    expect(claude.stdout).toContain("Claude Code");

    const agent = await run(["agent", "--format", "json"], repo);
    expect(agent.exitCode).toBe(0);
    expect(JSON.parse(agent.stdout).agentProfile).toMatchObject({
      id: "generic",
      name: "Generic user-owned agent"
    });
  });

  it("supports grounded preflight and explicit investigation before code generation", async () => {
    const repo = createRepo({
      "src/billing/export.ts": "export function exportBilling() { return []; }\n",
      "requirements.json": JSON.stringify({
        task: "Add billing export API",
        acceptanceCriteria: [{ id: "AC-1", text: "Only finance admins may export billing data." }],
        affectedFlows: [{ name: "Billing export", kind: "api" }]
      }),
      ".codedecay/config.yml": [
        "version: 1",
        "llm:",
        "  provider: litellm",
        "  model: unavailable-test-provider",
        ""
      ].join("\n")
    });

    const deterministic = await run(
      [
        "ai",
        "preflight",
        "--task",
        "Add billing export API",
        "--requirements",
        "requirements.json",
        "--format",
        "json"
      ],
      repo
    );
    const preflight = JSON.parse(deterministic.stdout);

    expect(deterministic.exitCode).toBe(0);
    expect(preflight).toMatchObject({
      mode: "agent-preflight",
      task: "Add billing export API",
      safety: {
        llmCalled: false,
        commandsExecuted: false
      }
    });
    expect(preflight.requirements.acceptanceCriteria[0]).toMatchObject({ id: "AC-1" });
    expect(preflight.investigation).toBeUndefined();

    const investigated = await run(
      [
        "ai",
        "preflight",
        "--investigate",
        "--task",
        "Add billing export API",
        "--requirements",
        "requirements.json",
        "--format",
        "json"
      ],
      repo
    );
    const investigatedPreflight = JSON.parse(investigated.stdout);

    expect(investigated.exitCode).toBe(0);
    expect(investigatedPreflight.investigation).toMatchObject({
      status: "failed",
      llmCalled: false,
      untrusted: true
    });
    expect(investigatedPreflight.safety.llmCalled).toBe(false);
  });

  it("executes passing configured checks only with explicit --with-checks", async () => {
    const repo = createLowRiskRepo();
    writeExecutionConfig(repo, {
      allowCommands: true,
      testCommand: "node -e \"require('fs').writeFileSync('codedecay-ai-ran.txt','yes'); console.log('checked')\""
    });

    const result = await run(["ai", "--with-checks", "--format", "json"], repo);
    const bundle = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(bundle.summary.verificationStatus).toBe("verified");
    expect(bundle.verification).toMatchObject({
      status: "verified",
      passed: 1
    });
    expect(bundle.safety.commandsExecuted).toBe(true);
    expect(bundle.prompt).toContain("executed explicitly configured local checks");
    expect(readFileSync(join(repo, "codedecay-ai-ran.txt"), "utf8")).toBe("yes");
  });

  it("keeps skipped checks unverified without pretending they ran", async () => {
    const repo = createLowRiskRepo();
    writeExecutionConfig(repo, {
      allowCommands: false,
      testCommand: "node -e \"require('fs').writeFileSync('codedecay-ai-ran.txt','yes')\""
    });

    const result = await run(["ai", "--with-checks", "--format", "json"], repo);
    const bundle = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(bundle.summary.verificationStatus).toBe("unverified");
    expect(bundle.safety.commandsExecuted).toBe(false);
    expect(bundle.verification).toMatchObject({
      status: "unverified",
      skipped: 1
    });
    expect(existsSync(join(repo, "codedecay-ai-ran.txt"))).toBe(false);
  });

  it("writes a complete bundle before failed or blocked verification exits", async () => {
    const failedRepo = createLowRiskRepo();
    writeExecutionConfig(failedRepo, {
      allowCommands: true,
      testCommand: "node -e \"console.error('failing proof'); process.exit(1)\""
    });

    const failed = await run(["ai", "--with-checks", "--format", "json"], failedRepo);
    const failedBundle = JSON.parse(failed.stdout);

    expect(failed.exitCode).toBe(1);
    expect(failedBundle.summary.verificationStatus).toBe("failed");
    expect(failedBundle.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "configured-check",
          proof: "tool-evidence"
        })
      ])
    );

    const blockedRepo = createLowRiskRepo();
    writeExecutionConfig(blockedRepo, {
      allowCommands: true,
      testCommand: "rm -rf ./dist"
    });

    const blocked = await run(["ai", "--with-checks", "--format", "json"], blockedRepo);
    const blockedBundle = JSON.parse(blocked.stdout);

    expect(blocked.exitCode).toBe(1);
    expect(blockedBundle.summary.verificationStatus).toBe("blocked");
    expect(blockedBundle.safety.commandsExecuted).toBe(false);
    expect(blockedBundle.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Resolve blocked proof check: Test command 1",
          source: "configured-check",
          proof: "missing-proof"
        })
      ])
    );
  });

  it("writes output before risk and requirement gates exit non-zero", async () => {
    const riskRepo = createMediumRiskRepo();
    const riskOutput = join(riskRepo, "codedecay-ai-risk.json");

    const risk = await run(
      ["ai", "--fail-on", "medium", "--format", "json", "--output", "codedecay-ai-risk.json"],
      riskRepo
    );

    expect(risk.exitCode).toBe(1);
    expect(risk.stdout).toBe("");
    expect(JSON.parse(readFileSync(riskOutput, "utf8")).agentProfile.id).toBe("codex");

    const requirementRepo = createMediumRiskRepo();
    writeFile(
      requirementRepo,
      "test/smoke.cjs",
      "console.log('codedecay-user tests passed');\n"
    );
    writeExecutionConfig(requirementRepo, {
      allowCommands: true,
      testCommand: "node test/smoke.cjs"
    });
    writeFile(
      requirementRepo,
      "requirements.json",
      JSON.stringify({
        task: "Keep users API authorized",
        acceptanceCriteria: [{
          id: "AC-1",
          text: "An anonymous user cannot call the users API.",
          requiredProof: ["Call the real users path as an anonymous user."]
        }]
      })
    );
    const requirementOutput = join(requirementRepo, "codedecay-ai-requirements.json");
    const requirements = await run(
      [
        "ai",
        "--task",
        "Keep users API authorized",
        "--requirements",
        "requirements.json",
        "--with-checks",
        "--fail-on-requirements",
        "--format",
        "json",
        "--output",
        "codedecay-ai-requirements.json"
      ],
      requirementRepo
    );

    expect(requirements.exitCode).toBe(1);
    expect(requirements.stdout).toBe("");
    const requirementBundle = JSON.parse(readFileSync(requirementOutput, "utf8"));
    expect(requirementBundle.summary.verificationStatus).toBe("verified");
    expect(requirementBundle.safety.commandsExecuted).toBe(true);
    expect(requirementBundle.requirementTrace.summary.blockingRequirementIds).toContain("AC-1");
  });

  it("returns ai-specific errors for invalid preflight combinations", async () => {
    const repo = createLowRiskRepo();

    const missingTask = await run(["ai", "preflight", "--format", "json"], repo);
    expect(missingTask.exitCode).toBe(2);
    expect(missingTask.stdout).toBe("");
    expect(missingTask.stderr).toContain("ai preflight requires --task <description>.");

    const withChecks = await run(
      ["ai", "preflight", "--task", "Update docs", "--with-checks"],
      repo
    );
    expect(withChecks.exitCode).toBe(2);
    expect(withChecks.stderr).toContain("ai preflight does not support --with-checks");

    const typo = await run(["ai", "--with-cheks"], repo);
    expect(typo.exitCode).toBe(2);
    expect(typo.stderr).toContain("Unknown option for codedecay ai: --with-cheks");
  });
});
