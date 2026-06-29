import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createLowRiskRepo, createTempDir, run, writeFile } from "./helpers";

describe("codedecay config CLI contract", () => {
  it("prints safe defaults when config is missing", async () => {
    const cwd = createTempDir();
    const result = await run(["config"], cwd);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      config: {
        version: 1,
        commands: {
          test: [],
          build: [],
          start: []
        },
        probes: [],
        safety: {
          commandTimeoutMs: 120000,
          allowCommands: false
        },
        llm: {
          provider: "disabled",
          timeoutMs: 30000
        },
        toolAdapters: {},
        productTesting: {
          targets: {}
        }
      }
    });
  });

  it("loads config from --cwd and renders markdown", async () => {
    const repo = createLowRiskRepo();
    const outsideCwd = createTempDir();
    writeFile(
      repo,
      ".codedecay/config.yml",
      [
        "version: 1",
        "commands:",
        "  test: pnpm test",
        "  build: pnpm build",
        "toolAdapters:",
        "  playwright: true",
        "  schemathesis:",
        "    schema: docs/openapi.yaml",
        "    baseUrl: http://127.0.0.1:4000",
        "productTesting:",
        "  targets:",
        "    web:",
        "      baseUrl: http://127.0.0.1:3000",
        "      healthCheck: http://127.0.0.1:3000/api/health",
        "      timeoutMs: 60000",
        "llm:",
        "  provider: litellm",
        "  model: gpt-4.1-mini",
        "  endpoint: http://127.0.0.1:4000/v1",
        "  apiKeyEnv: LITELLM_API_KEY",
        "safety:",
        "  commandTimeoutMs: 45000",
        ""
      ].join("\n")
    );

    const result = await run(["config", "--cwd", repo, "--format", "markdown"], outsideCwd);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("## CodeDecay Config");
    expect(result.stdout).toContain(".codedecay/config.yml");
    expect(result.stdout).toContain("`pnpm test`");
    expect(result.stdout).toContain("45000ms");
    expect(result.stdout).toContain("### LLM");
    expect(result.stdout).toContain("| Provider | litellm |");
    expect(result.stdout).toContain("| API key env | `LITELLM_API_KEY` |");
    expect(result.stdout).toContain("### Tool Adapters");
    expect(result.stdout).toContain("| Playwright | yes | command: default | default |");
    expect(result.stdout).toContain("schema: `docs/openapi.yaml`");
    expect(result.stdout).toContain("### Product Testing Targets");
    expect(result.stdout).toContain("| web | ready (base-url) | `http://127.0.0.1:3000`");
    expect(result.stdout).toContain("Config inspection does not execute product target commands.");
  });

  it("fails clearly for invalid config files", async () => {
    const cwd = createTempDir();
    writeFile(cwd, ".codedecay/config.yml", "version: 2\n");

    const result = await run(["config"], cwd);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("CodeDecay failed: Invalid CodeDecay config");
    expect(result.stderr).toContain("version must be 1");
  });
});
