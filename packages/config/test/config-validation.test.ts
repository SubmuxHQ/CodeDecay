import { describe, expect, it } from "vitest";
import { loadCodeDecayConfig } from "../src/index";
import { createTempDir, writeFile } from "./helpers/config";

describe("CodeDecay config validation", () => {
  it("fails clearly for invalid config", () => {
    const root = createTempDir();
    writeFile(root, ".codedecay/config.yml", "version: 2\n");

    expect(() => loadCodeDecayConfig({ cwd: root })).toThrow(/version must be 1/);
  });

  it("fails clearly for invalid llm provider", () => {
    const root = createTempDir();
    writeFile(root, ".codedecay/config.yml", "version: 1\nllm:\n  provider: hosted\n");

    expect(() => loadCodeDecayConfig({ cwd: root })).toThrow(/llm.provider must be disabled, ollama, or litellm/);
  });

  it("fails clearly for invalid product target URLs", () => {
    const root = createTempDir();
    writeFile(root, ".codedecay/config.yml", "version: 1\nproductTesting:\n  targets:\n    web:\n      baseUrl: localhost:3000\n");

    expect(() => loadCodeDecayConfig({ cwd: root })).toThrow(/productTesting.targets.web.baseUrl must be an http or https URL/);
  });

  it("fails clearly for invalid plugin config", () => {
    const root = createTempDir();
    writeFile(root, ".codedecay/config.yml", "version: 1\nplugins: true\n");

    expect(() => loadCodeDecayConfig({ cwd: root })).toThrow(/plugins must be an object/);
  });

  it("fails clearly for invalid memory provider config", () => {
    const root = createTempDir();
    writeFile(root, ".codedecay/config.yml", "version: 1\nmemoryProviders:\n  providers:\n    - provider: hosted\n");

    expect(() => loadCodeDecayConfig({ cwd: root })).toThrow(
      /memoryProviders\.providers\[0\]\.provider must be local, mem0, or supermemory/
    );
  });

  it("fails clearly for duplicate memory providers", () => {
    const root = createTempDir();
    writeFile(
      root,
      ".codedecay/config.yml",
      "version: 1\nmemoryProviders:\n  providers:\n    - local\n    - provider: local\n"
    );

    expect(() => loadCodeDecayConfig({ cwd: root })).toThrow(/duplicate provider local/);
  });

  it("fails clearly when memory provider apiKeyEnv is not an environment variable name", () => {
    const root = createTempDir();
    writeFile(
      root,
      ".codedecay/config.yml",
      "version: 1\nmemoryProviders:\n  providers:\n    - provider: mem0\n      apiKeyEnv: literal-token-value\n"
    );

    expect(() => loadCodeDecayConfig({ cwd: root })).toThrow(/apiKeyEnv must be a valid environment variable name/);
  });
});
