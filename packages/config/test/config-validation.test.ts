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
});
