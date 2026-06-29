import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AnalyzerResult, FileChange, ImpactedArea } from "@submuxhq/codedecay-core";
import {
  applyMemoryContext,
  createLocalMemoryProvider,
  createMemoryProviderRegistry,
  importCodeDecayMemory,
  learnCodeDecayMemory,
  loadCodeDecayMemory,
  loadCodeDecayMemoryFromProvider,
  writeCodeDecayMemory,
  type MemoryProvider
} from "../src/index";
import { createTempDir, fakeProvider, writeJson, writeText } from "./helpers/memory";

describe("CodeDecay memory providers", () => {
  it("loads local memory through the local provider", () => {
    const root = createTempDir();
    writeJson(root, ".codedecay/memory.json", {
      version: 1,
      flows: [{ name: "Checkout", areas: ["api"] }]
    });

    const provider = createLocalMemoryProvider();
    const loaded = loadCodeDecayMemoryFromProvider(provider, { rootDir: root });

    expect(provider).toMatchObject({
      id: "local",
      name: "Local .codedecay memory",
      kind: "local"
    });
    expect(loaded.sourcePath).toBe(join(root, ".codedecay/memory.json"));
    expect(loaded.memory.flows[0]?.name).toBe("Checkout");
  });

  it("supports custom memory providers for future adapters", () => {
    const provider: MemoryProvider = {
      id: "custom",
      name: "Custom memory provider",
      kind: "external",
      load: () => ({
        memory: {
          version: 1,
          flows: [{ name: "Billing flow", areas: ["api"] }],
          commands: [],
          invariants: [],
          architecture: [],
          regressions: []
        }
      })
    };

    const loaded = loadCodeDecayMemoryFromProvider(provider, { rootDir: createTempDir() });

    expect(loaded.memory.flows[0]?.name).toBe("Billing flow");
  });

  it("registers memory providers with stable ordering", () => {
    const alpha = fakeProvider("alpha");
    const zeta = fakeProvider("zeta");
    const registry = createMemoryProviderRegistry([zeta, alpha]);

    expect(registry.list().map((provider) => provider.id)).toEqual(["alpha", "zeta"]);
    expect(registry.require("alpha").name).toBe("alpha provider");
  });

  it("loads local memory from the default provider registry", () => {
    const root = createTempDir();
    writeJson(root, ".codedecay/memory.json", {
      version: 1,
      commands: [{ name: "Auth smoke", command: "pnpm test auth", areas: ["auth"] }]
    });

    const registry = createMemoryProviderRegistry();
    const loaded = registry.load("local", { rootDir: root });

    expect(registry.list().map((provider) => provider.id)).toEqual(["local"]);
    expect(loaded.sourcePath).toBe(join(root, ".codedecay/memory.json"));
    expect(loaded.memory.commands[0]).toMatchObject({
      name: "Auth smoke",
      command: "pnpm test auth"
    });
  });

  it("prevents duplicate memory provider ids", () => {
    expect(() => createMemoryProviderRegistry([fakeProvider("local"), fakeProvider("local")])).toThrow(
      /already registered/
    );
  });

  it("validates provider ids and load options", () => {
    const registry = createMemoryProviderRegistry();

    expect(() => registry.require("")).toThrow(/Memory provider id is required/);
    expect(() => registry.load("local", { rootDir: "" })).toThrow(/Memory provider rootDir is required/);
  });
});
