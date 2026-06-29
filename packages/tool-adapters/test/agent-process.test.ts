import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createAgentProcessHarness } from "../src/index";
import { createTempDir, writeFile } from "./helpers";

describe("createAgentProcessHarness", () => {
  it("plans a local agent process check", async () => {
    const harness = createAgentProcessHarness({ command: "node local-agent.js", profile: "codex" });
    const plan = await harness.plan({
      cwd: createTempDir(),
      evidence: []
    });

    expect(harness.name).toBe("agent-process");
    expect(harness.capabilities).toEqual(["agent-reasoning", "execution"]);
    expect(plan).toMatchObject({
      harnessName: "agent-process",
      requiresApproval: true
    });
    expect(plan.steps[0]?.description).toContain("profile codex");
    expect(plan.steps[1]?.description).toContain("CODEDECAY_AGENT_BUNDLE_PATH");
  });

  it("skips when no local agent command is configured", async () => {
    const harness = createAgentProcessHarness({ allowCommands: true, timeoutMs: 1000 });
    const repo = createTempDir();
    const plan = await harness.plan({ cwd: repo, evidence: [] });
    const result = await harness.run(plan, { cwd: repo });

    expect(result.status).toBe("skipped");
    expect(result.failure?.mode).toBe("missing-config");
    expect(result.evidence[0]).toMatchObject({
      kind: "agent-suggestion",
      severity: "info",
      trusted: false
    });
  });

  it("skips by default when command execution is not explicitly allowed", async () => {
    const repo = createTempDir();
    const harness = createAgentProcessHarness({ command: "node local-agent.js", timeoutMs: 1000 });
    const plan = await harness.plan({ cwd: repo, evidence: [] });
    const result = await harness.run(plan, { cwd: repo });

    expect(result.status).toBe("skipped");
    expect(result.failure?.mode).toBe("command-denied");
    expect(result.evidence[0]).toMatchObject({
      kind: "agent-suggestion",
      severity: "info",
      trusted: false,
      command: "node local-agent.js"
    });
  });

  it("writes an agent bundle and captures local agent output as untrusted evidence", async () => {
    const repo = createTempDir();
    const harness = createAgentProcessHarness({
      command: "node local-agent.js",
      profile: "pi",
      bundleFormat: "markdown",
      allowCommands: true,
      timeoutMs: 1000
    });
    writeFile(
      repo,
      "local-agent.js",
      [
        "const fs = require('node:fs');",
        "const bundle = fs.readFileSync(process.env.CODEDECAY_AGENT_BUNDLE_PATH, 'utf8');",
        "console.log(`profile=${process.env.CODEDECAY_AGENT_PROFILE}`);",
        "console.log(`bundle=${bundle.includes('real behavior path')}`);"
      ].join("\n")
    );

    const plan = await harness.plan({ cwd: repo, evidence: [], context: { agentBundle: "real behavior path" } });
    const result = await harness.run(plan, {
      cwd: repo,
      context: {
        agentBundle: "real behavior path",
        agentBundleFormat: "markdown"
      }
    });

    expect(result.status).toBe("passed");
    expect(result.artifacts).toEqual([
      {
        path: ".codedecay/local/agent-process/bundle.md",
        description: "CodeDecay agent task bundle passed to the local agent process."
      }
    ]);
    expect(readFileSync(join(repo, ".codedecay/local/agent-process/bundle.md"), "utf8")).toContain("real behavior path");
    expect(result.evidence[0]).toMatchObject({
      kind: "agent-suggestion",
      severity: "low",
      trusted: false,
      artifactPath: ".codedecay/local/agent-process/bundle.md",
      metadata: expect.objectContaining({
        profile: "pi",
        bundleFormat: "markdown",
        stdout: expect.stringContaining("profile=pi"),
        untrusted: true
      })
    });
  });

  it("validates configured options", () => {
    expect(() => createAgentProcessHarness({ command: "" })).toThrow("Agent process command is required.");
    expect(() => createAgentProcessHarness({ profile: "robot" as "codex" })).toThrow(
      "Agent process profile must be generic, codex, claude-code, cursor, pi, opencode, or desktop."
    );
    expect(() => createAgentProcessHarness({ bundleFormat: "xml" as "json" })).toThrow(
      "Agent process bundleFormat must be markdown or json."
    );
    expect(() => createAgentProcessHarness({ timeoutMs: 0 })).toThrow("Agent process timeoutMs must be a positive integer.");
  });
});
