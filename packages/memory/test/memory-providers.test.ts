import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AnalyzerResult, FileChange, ImpactedArea } from "@submuxhq/codedecay-core";
import {
  applyMemoryContext,
  createLocalMemoryProvider,
  createMem0MemoryProvider,
  createMemoryProviderRegistry,
  importCodeDecayMemory,
  learnCodeDecayMemory,
  loadCodeDecayMemory,
  loadCodeDecayMemoryFromProviderAsync,
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

  it("loads Mem0 memory through an optional async provider", async () => {
    const calls: unknown[] = [];
    class FakeMemoryClient {
      constructor(options: unknown) {
        calls.push(options);
      }

      async search(query: string, options?: Record<string, unknown>) {
        calls.push({ query, options });
        return {
          results: [
            {
              memory: "Checkout API must reject expired sessions.",
              metadata: {
                codedecay: {
                  type: "invariant",
                  name: "Expired session rejection",
                  areas: ["auth"],
                  files: ["src/auth/session.ts"]
                }
              }
            },
            {
              memory: "Run the checkout smoke test after payment changes.",
              metadata: {
                codedecay: {
                  type: "command",
                  name: "Checkout smoke",
                  command: "pnpm test checkout"
                }
              }
            }
          ]
        };
      }
    }

    const provider = createMem0MemoryProvider({
      endpoint: "http://127.0.0.1:8000",
      apiKeyEnv: "MEM0_API_KEY",
      projectId: "codedecay",
      env: { MEM0_API_KEY: "test-key" },
      importModule: async () => ({ MemoryClient: FakeMemoryClient })
    });
    const loaded = await loadCodeDecayMemoryFromProviderAsync(provider, { rootDir: createTempDir() });

    expect(provider).toMatchObject({
      id: "mem0",
      name: "Mem0",
      kind: "external"
    });
    expect(calls[0]).toEqual({
      apiKey: "test-key",
      host: "http://127.0.0.1:8000"
    });
    expect(calls[1]).toEqual({
      query: "CodeDecay project memory",
      options: {
        topK: 20,
        filters: {
          projectId: "codedecay"
        }
      }
    });
    expect(loaded.sourcePath).toBe("mem0:http://127.0.0.1:8000");
    expect(loaded.memory.invariants[0]).toMatchObject({
      name: "Expired session rejection",
      files: ["src/auth/session.ts"],
      areas: ["auth"]
    });
    expect(loaded.memory.commands[0]).toMatchObject({
      name: "Checkout smoke",
      command: "pnpm test checkout"
    });
  });

  it("keeps sync provider loading from accidentally running async Mem0 providers", () => {
    const provider = createMem0MemoryProvider({
      env: { MEM0_API_KEY: "test-key" },
      importModule: async () => ({ MemoryClient: class { async search() { return { results: [] }; } } })
    });

    expect(() => loadCodeDecayMemoryFromProvider(provider, { rootDir: createTempDir() })).toThrow(
      /provider "mem0" is async/
    );
  });

  it("fails clearly when Mem0 is configured without an API key env value", async () => {
    const provider = createMem0MemoryProvider({
      apiKeyEnv: "MEM0_API_KEY",
      env: {}
    });

    await expect(loadCodeDecayMemoryFromProviderAsync(provider, { rootDir: createTempDir() })).rejects.toThrow(
      /requires API key environment variable MEM0_API_KEY/
    );
  });

  it("fails clearly when the optional Mem0 package is unavailable", async () => {
    const provider = createMem0MemoryProvider({
      env: { MEM0_API_KEY: "test-key" },
      importModule: async () => {
        throw new Error("Cannot find package 'mem0ai'");
      }
    });

    await expect(loadCodeDecayMemoryFromProviderAsync(provider, { rootDir: createTempDir() })).rejects.toThrow(
      /requires the optional mem0ai package/
    );
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
