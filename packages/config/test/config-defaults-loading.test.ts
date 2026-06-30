import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadCodeDecayConfig } from "../src/index";
import { EXPECTED_FULL_CONFIG, FULL_CONFIG_YAML } from "./fixtures/full-config";
import { createTempDir, writeFile } from "./helpers/config";

describe("CodeDecay config defaults and loading", () => {
  it("returns safe defaults when config is missing", () => {
    const root = createTempDir();
    const loaded = loadCodeDecayConfig({ cwd: root });

    expect(loaded.sourcePath).toBeUndefined();
    expect(loaded.config).toEqual({
      version: 1,
      commands: {
        test: [],
        build: [],
        start: []
      },
      probes: [],
      safety: {
        commandTimeoutMs: 120_000,
        allowCommands: false
      },
      llm: {
        provider: "disabled",
        timeoutMs: 30_000
      },
      memoryProviders: {
        providers: [
          {
            provider: "local",
            enabled: true
          }
        ]
      },
      toolAdapters: {},
      productTesting: {
        targets: {}
      },
      plugins: {
        enabled: []
      }
    });
  });

  it("returns fresh default config objects for missing config", () => {
    const root = createTempDir();
    const first = loadCodeDecayConfig({ cwd: root });
    first.config.commands.test.push("mutated test command");

    const second = loadCodeDecayConfig({ cwd: root });

    expect(second.config.commands.test).toEqual([]);
  });

  it("loads .codedecay/config.yml from cwd", () => {
    const root = createTempDir();
    writeFile(root, ".codedecay/config.yml", FULL_CONFIG_YAML);

    const loaded = loadCodeDecayConfig({ cwd: root });

    expect(loaded.sourcePath).toBe(join(root, ".codedecay/config.yml"));
    expect(loaded.config).toEqual(EXPECTED_FULL_CONFIG);
  });

  it("discovers codedecay.config.yml from cwd", () => {
    const root = createTempDir();
    writeFile(root, "codedecay.config.yml", "version: 1\ncommands:\n  test: npm test\n");

    const loaded = loadCodeDecayConfig({ cwd: root });

    expect(loaded.sourcePath).toBe(join(root, "codedecay.config.yml"));
    expect(loaded.config.commands.test).toEqual(["npm test"]);
  });

  it("discovers codedecay.config.json from cwd", () => {
    const root = createTempDir();
    writeFile(root, "codedecay.config.json", JSON.stringify({ version: 1, commands: { test: "npm test" } }));

    const loaded = loadCodeDecayConfig({ cwd: root });

    expect(loaded.sourcePath).toBe(join(root, "codedecay.config.json"));
    expect(loaded.config.commands.test).toEqual(["npm test"]);
  });

  it("discovers .codedecay/config.yaml from cwd", () => {
    const root = createTempDir();
    writeFile(root, ".codedecay/config.yaml", "version: 1\ncommands:\n  build: npm run build\n");

    const loaded = loadCodeDecayConfig({ cwd: root });

    expect(loaded.sourcePath).toBe(join(root, ".codedecay/config.yaml"));
    expect(loaded.config.commands.build).toEqual(["npm run build"]);
  });

  it("loads LiteLLM BYOK provider config without storing literal keys", () => {
    const root = createTempDir();
    writeFile(
      root,
      ".codedecay/config.yml",
      [
        "version: 1",
        "llm:",
        "  provider: litellm",
        "  model: gpt-4.1-mini",
        "  endpoint: http://127.0.0.1:4000/v1",
        "  apiKeyEnv: LITELLM_API_KEY",
        "  timeoutMs: 15000",
        ""
      ].join("\n")
    );

    const loaded = loadCodeDecayConfig({ cwd: root });

    expect(loaded.config.llm).toEqual({
      provider: "litellm",
      model: "gpt-4.1-mini",
      endpoint: "http://127.0.0.1:4000/v1",
      apiKeyEnv: "LITELLM_API_KEY",
      timeoutMs: 15000
    });
  });

  it("loads explicit plugin allowlists without activating plugins", () => {
    const root = createTempDir();
    writeFile(
      root,
      ".codedecay/config.yml",
      [
        "version: 1",
        "plugins:",
        "  enabled:",
        "    - local-security-pack",
        "    - ownership-pack",
        ""
      ].join("\n")
    );

    const loaded = loadCodeDecayConfig({ cwd: root });

    expect(loaded.config.plugins.enabled).toEqual(["local-security-pack", "ownership-pack"]);
  });

  it("loads inline design contract config", () => {
    const root = createTempDir();
    writeFile(
      root,
      ".codedecay/config.yml",
      [
        "version: 1",
        "designContract:",
        "  activeScopeFence: auth-task",
        "  scopeFences:",
        "    - id: auth-task",
        "      allowedAreas: auth",
        "  bannedApis:",
        "    - id: no-random",
        "      files: src/auth/**",
        "      apis: Math.random",
        ""
      ].join("\n")
    );

    const loaded = loadCodeDecayConfig({ cwd: root });

    expect(loaded.config.designContract).toMatchObject({
      activeScopeFence: "auth-task",
      scopeFences: [
        {
          id: "auth-task",
          allowedAreas: ["auth"]
        }
      ],
      bannedApis: [
        {
          id: "no-random",
          files: ["src/auth/**"],
          apis: ["Math.random"]
        }
      ]
    });
  });

  it("loads standalone codedecay.contract.json alongside config defaults", () => {
    const root = createTempDir();
    writeFile(
      root,
      "codedecay.contract.json",
      JSON.stringify({
        version: 1,
        activeScopeFence: "api-task",
        scopeFences: [
          {
            id: "api-task",
            allowedAreas: ["api"]
          }
        ]
      })
    );

    const loaded = loadCodeDecayConfig({ cwd: root });

    expect(loaded.sourcePath).toBeUndefined();
    expect(loaded.designContractSourcePath).toBe(join(root, "codedecay.contract.json"));
    expect(loaded.config.designContract).toMatchObject({
      activeScopeFence: "api-task",
      scopeFences: [{ id: "api-task", allowedAreas: ["api"] }]
    });
  });

  it("loads opt-in memory provider config without enabling hidden defaults", () => {
    const root = createTempDir();
    writeFile(
      root,
      ".codedecay/config.yml",
      [
        "version: 1",
        "memoryProviders:",
        "  providers:",
        "    - local",
        "    - provider: mem0",
        "      endpoint: http://127.0.0.1:8000",
        "      apiKeyEnv: MEM0_API_KEY",
        "    - provider: supermemory",
        "      enabled: false",
        "      endpoint: http://127.0.0.1:3001/",
        "      collection: codedecay",
        ""
      ].join("\n")
    );

    const loaded = loadCodeDecayConfig({ cwd: root });

    expect(loaded.config.memoryProviders).toEqual({
      providers: [
        {
          provider: "local",
          enabled: true
        },
        {
          provider: "mem0",
          enabled: true,
          endpoint: "http://127.0.0.1:8000",
          apiKeyEnv: "MEM0_API_KEY"
        },
        {
          provider: "supermemory",
          enabled: false,
          endpoint: "http://127.0.0.1:3001",
          collection: "codedecay"
        }
      ]
    });
  });
});
