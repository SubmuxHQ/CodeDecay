import { describe, expect, it } from "vitest";
import { loadCodeDecayConfig } from "../src/index";
import { createTempDir, writeFile } from "./helpers/config";

describe("capability policy config normalization", () => {
  it("defaults capabilityPolicy to deny-all", () => {
    const loaded = loadCodeDecayConfig({ cwd: createTempDir() });

    expect(loaded.config.safety.capabilityPolicy).toEqual({
      version: 1,
      allow: []
    });
  });

  it("loads explicit capability allow rules", () => {
    const root = createTempDir();
    writeFile(
      root,
      ".codedecay/config.yml",
      [
        "version: 1",
        "safety:",
        "  allowCommands: true",
        "  capabilityPolicy:",
        "    version: 1",
        "    allow:",
        "      - capability: artifact.persist",
        "        paths:",
        "          - .codedecay/local",
        "      - capability: network",
        "        hosts:",
        "          - 127.0.0.1",
        ""
      ].join("\n")
    );

    const loaded = loadCodeDecayConfig({ cwd: root });

    expect(loaded.config.safety.capabilityPolicy).toEqual({
      version: 1,
      allow: [
        {
          capability: "artifact.persist",
          paths: [".codedecay/local"]
        },
        {
          capability: "network",
          hosts: ["127.0.0.1"]
        }
      ]
    });
  });

  it("rejects unknown capability kinds", () => {
    const root = createTempDir();
    writeFile(
      root,
      ".codedecay/config.yml",
      [
        "version: 1",
        "safety:",
        "  capabilityPolicy:",
        "    allow:",
        "      - capability: launch.missiles",
        ""
      ].join("\n")
    );

    expect(() => loadCodeDecayConfig({ cwd: root })).toThrow(/capability must be one of/);
  });
});
