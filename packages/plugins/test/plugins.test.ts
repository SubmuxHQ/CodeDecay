import { describe, expect, it } from "vitest";
import {
  CODEDECAY_PLUGIN_EXTENSION_POINTS,
  createExplicitPluginRegistry,
  createPluginRegistry,
  type CodeDecayPluginManifest
} from "../src/index";

describe("CodeDecay plugin registry", () => {
  it("defines the unified harness extension points", () => {
    expect(CODEDECAY_PLUGIN_EXTENSION_POINTS).toEqual([
      "matcher",
      "language-parser",
      "analyzer",
      "agent-provider",
      "tool-adapter",
      "memory-provider",
      "ownership",
      "notifier"
    ]);
  });

  it("activates only plugins listed by explicit config", () => {
    const registry = createExplicitPluginRegistry({
      availablePlugins: [
        plugin("security-pack", ["matcher"]),
        plugin("slack-notifier", ["notifier"])
      ],
      enabledPluginIds: ["security-pack"]
    });

    expect(registry.listAvailable().map((entry) => entry.id)).toEqual(["security-pack", "slack-notifier"]);
    expect(registry.listActive().map((entry) => entry.id)).toEqual(["security-pack"]);
    expect(registry.findActiveByExtensionPoint("matcher").map((entry) => entry.id)).toEqual(["security-pack"]);
    expect(registry.findActiveByExtensionPoint("notifier")).toEqual([]);
  });

  it("rejects duplicate registration unless override is explicit", () => {
    const registry = createPluginRegistry([plugin("security-pack", ["matcher"])]);

    expect(() => registry.registerAvailable(plugin("security-pack", ["analyzer"]))).toThrow(
      "Plugin already registered: security-pack"
    );

    registry.registerAvailable(plugin("security-pack", ["analyzer"]), { override: true });

    expect(registry.getAvailable("security-pack")?.extensionPoints).toEqual(["analyzer"]);
  });

  it("reports missing duplicate and safety-sensitive plugins as limitations", () => {
    const registry = createExplicitPluginRegistry({
      availablePlugins: [
        plugin("agent-pack", ["agent-provider"], {
          requiresModelProvider: true
        }),
        plugin("playwright-pack", ["tool-adapter"], {
          requiresExecution: true
        })
      ],
      enabledPluginIds: ["agent-pack", "playwright-pack", "missing-pack", "agent-pack"]
    });

    expect(registry.snapshot().limitations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pluginId: "agent-pack",
          severity: "warning",
          message: expect.stringContaining("model calls require explicit LLM/agent provider config")
        }),
        expect.objectContaining({
          pluginId: "playwright-pack",
          severity: "warning",
          message: expect.stringContaining("must still run through packages/execution")
        }),
        expect.objectContaining({
          pluginId: "missing-pack",
          severity: "error",
          message: "Configured plugin missing-pack is not registered locally."
        }),
        expect.objectContaining({
          pluginId: "agent-pack",
          severity: "warning",
          message: "Plugin agent-pack was listed more than once; later duplicates were ignored."
        })
      ])
    );
  });

  it("rejects invalid plugin manifests", () => {
    expect(() => createPluginRegistry([{ ...plugin("bad", ["matcher"]), extensionPoints: [] }])).toThrow(
      "Plugin bad must declare at least one extension point."
    );
  });
});

function plugin(
  id: string,
  extensionPoints: CodeDecayPluginManifest["extensionPoints"],
  safety?: CodeDecayPluginManifest["safety"]
): CodeDecayPluginManifest {
  return {
    id,
    name: id,
    extensionPoints,
    safety
  };
}
