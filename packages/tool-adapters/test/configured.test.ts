import { describe, expect, it } from "vitest";
import { createConfiguredToolHarnesses } from "../src/index";
import { createConfig, createTempDir } from "./helpers";

describe("createConfiguredToolHarnesses", () => {
  it("creates enabled harnesses from CodeDecay config", async () => {
    const config = createConfig();
    config.safety.allowCommands = false;
    config.toolAdapters = {
      agentProcess: {
        enabled: true,
        command: "node local-agent.js",
        profile: "claude-code",
        bundleFormat: "json",
        timeoutMs: 240000
      },
      playwright: {
        enabled: true
      },
      stryker: {
        enabled: true,
        command: "pnpm exec stryker run --mutate src/**/*.ts",
        timeoutMs: 300000,
        reportPath: "tmp/stryker.json"
      },
      schemathesis: {
        enabled: true,
        schema: "docs/openapi.yaml",
        baseUrl: "http://127.0.0.1:4000"
      },
      pact: {
        enabled: false
      },
      semgrep: {
        enabled: true,
        config: ".semgrep.yml",
        reportPath: "reports/semgrep.json",
        failOnSeverity: "medium"
      },
      coverage: {
        enabled: true,
        command: "pnpm test -- --coverage",
        reportPaths: ["coverage/coverage-final.json"],
        failOn: "uncovered"
      }
    };

    const configured = createConfiguredToolHarnesses(config);

    expect(configured.map((item) => [item.kind, item.name, item.command, item.timeoutMs])).toEqual([
      ["agent-process", "Agent Process", "node local-agent.js", 240000],
      ["playwright", "Playwright", "pnpm exec playwright test", undefined],
      ["stryker", "StrykerJS", "pnpm exec stryker run --mutate src/**/*.ts", 300000],
      ["schemathesis", "Schemathesis", "st run docs/openapi.yaml --url http://127.0.0.1:4000", undefined],
      ["semgrep", "Semgrep", "semgrep scan --config .semgrep.yml --json --metrics=off --disable-version-check", undefined],
      ["coverage", "Coverage", "pnpm test -- --coverage", undefined]
    ]);

    const plan = await configured[0]?.harness.plan({ cwd: createTempDir(), evidence: [] });
    expect(plan?.requiresApproval).toBe(true);
  });

  it("marks harness plans approved when configured commands are allowed", async () => {
    const config = createConfig();
    config.safety.allowCommands = true;
    config.toolAdapters = {
      pact: {
        enabled: true,
        command: "pnpm run pact:verify"
      }
    };

    const [configured] = createConfiguredToolHarnesses(config);

    expect(configured?.kind).toBe("pact");
    expect(configured?.command).toBe("pnpm run pact:verify");
    const plan = await configured?.harness.plan({ cwd: createTempDir(), evidence: [] });
    expect(plan?.requiresApproval).toBe(false);
  });
});
