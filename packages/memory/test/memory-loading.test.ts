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

describe("CodeDecay memory loading", () => {
  it("returns defaults when memory is missing", () => {
    const root = createTempDir();
    const loaded = loadCodeDecayMemory(root);

    expect(loaded.sourcePath).toBeUndefined();
    expect(loaded.memory.version).toBe(1);
    for (const section of ["flows", "commands", "invariants", "architecture", "regressions"] as const) {
      expect(loaded.memory[section]).toEqual([]);
    }
  });

  it("loads .codedecay/memory.json", () => {
    const root = createTempDir();
    writeJson(root, ".codedecay/memory.json", {
      version: 1,
      flows: [{ name: "Checkout", areas: ["api"], checks: ["failed card retry"] }],
      commands: [{ name: "API smoke", command: "pnpm test:api", areas: ["api"] }],
      invariants: [{ name: "Auth fails closed", description: "Missing users must not become admins.", areas: ["auth"], severity: "high" }],
      architecture: [{ title: "Session boundary", note: "Session parsing feeds all API routes.", files: ["src/auth/*"] }],
      regressions: [{ title: "Anonymous admin", description: "Fallback user became admin.", areas: ["auth"], check: "missing token request", severity: "high" }]
    });

    const loaded = loadCodeDecayMemory(root);

    expect(loaded.sourcePath).toBe(join(root, ".codedecay/memory.json"));
    expect(loaded.memory.flows[0]?.name).toBe("Checkout");
    expect(loaded.memory.invariants[0]?.severity).toBe("high");
  });

  it("fails clearly for invalid memory", () => {
    const root = createTempDir();
    writeJson(root, ".codedecay/memory.json", { version: 2 });

    expect(() => loadCodeDecayMemory(root)).toThrow(/version must be 1/);
  });

  it("fails clearly for malformed memory JSON", () => {
    const root = createTempDir();
    writeText(root, ".codedecay/memory.json", "{");

    expect(() => loadCodeDecayMemory(root)).toThrow(/Invalid CodeDecay memory/);
  });
});
