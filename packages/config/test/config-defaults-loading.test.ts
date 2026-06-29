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
});
