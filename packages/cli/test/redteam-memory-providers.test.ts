import { describe, expect, it } from "vitest";
import type { CodeDecayMemory } from "@submuxhq/codedecay-memory";
import type { MemoryProvider } from "@submuxhq/codedecay-memory";
import { loadConfiguredRedteamMemory } from "../src/memory/configured-providers";
import { createHighRiskRepo, createTempDir, run, writeFile } from "./helpers";

describe("redteam configured memory providers", () => {
  it("merges configured external memory as untrusted context", async () => {
    const rootDir = createTempDir();
    const localMemory = createMemory({
      invariants: [
        {
          name: "Local auth invariant",
          description: "Local sessions must fail closed."
        }
      ]
    });
    const externalMemory = createMemory({
      commands: [
        {
          name: "External smoke",
          command: "pnpm test external-memory"
        }
      ],
      regressions: [
        {
          title: "External regression",
          description: "Previous checkout retry broke.",
          check: "retry failed payment"
        }
      ]
    });

    const context = await loadConfiguredRedteamMemory({
      rootDir,
      localMemory: {
        memory: localMemory,
        sourcePath: `${rootDir}/.codedecay/memory.json`
      },
      memoryProviders: {
        providers: [
          { provider: "local", enabled: true },
          { provider: "mem0", enabled: true, apiKeyEnv: "MEM0_API_KEY", projectId: "codedecay" }
        ]
      },
      providerFactories: {
        mem0: () => fakeProvider("mem0", externalMemory, "mem0:test")
      }
    });

    expect(context.memory.invariants).toHaveLength(1);
    expect(context.memory.commands).toEqual(
      expect.arrayContaining([expect.objectContaining({ command: "pnpm test external-memory" })])
    );
    expect(context.memory.regressions).toEqual(
      expect.arrayContaining([expect.objectContaining({ title: "External regression" })])
    );
    expect(context.sourcePath).toContain("mem0:test");
    expect(context.providerSources).toEqual([
      expect.objectContaining({
        provider: "local",
        kind: "local",
        status: "loaded",
        untrusted: true
      }),
      expect.objectContaining({
        provider: "mem0",
        kind: "external",
        status: "loaded",
        sourcePath: "mem0:test",
        untrusted: true
      })
    ]);
  });

  it("records external memory provider failures without throwing", async () => {
    const rootDir = createTempDir();
    const context = await loadConfiguredRedteamMemory({
      rootDir,
      localMemory: {
        memory: createMemory(),
        sourcePath: undefined
      },
      memoryProviders: {
        providers: [
          { provider: "local", enabled: true },
          { provider: "supermemory", enabled: true, apiKeyEnv: "SUPERMEMORY_API_KEY" }
        ]
      },
      providerFactories: {
        supermemory: () => ({
          id: "supermemory",
          name: "Supermemory",
          kind: "external",
          load: () => {
            throw new Error("test provider unavailable");
          }
        })
      }
    });

    expect(context.memory).toEqual(createMemory());
    expect(context.sourcePath).toBeUndefined();
    expect(context.providerSources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: "supermemory",
          kind: "external",
          status: "failed",
          error: "test provider unavailable",
          untrusted: true
        })
      ])
    );
  });

  it("shows configured provider failures in redteam reports", async () => {
    const repo = createHighRiskRepo();
    writeFile(
      repo,
      ".codedecay/config.yml",
      [
        "version: 1",
        "memoryProviders:",
        "  providers:",
        "    - local",
        "    - provider: mem0",
        "      enabled: true",
        "      apiKeyEnv: MEM0_API_KEY",
        ""
      ].join("\n")
    );

    const result = await run(["redteam", "--format", "json"], repo);
    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(report.memory.providerFailures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: "mem0",
          kind: "external",
          status: "failed",
          untrusted: true
        })
      ])
    );
    expect(report.memory.providerFailures[0].error).toContain("MEM0_API_KEY");
    expect(report.safety.notes).toContain("Explicitly configured external memory providers were loaded as untrusted context.");
  });

  it("carries configured provider failures into agent bundles", async () => {
    const repo = createHighRiskRepo();
    writeFile(
      repo,
      ".codedecay/config.yml",
      [
        "version: 1",
        "memoryProviders:",
        "  providers:",
        "    - local",
        "    - provider: supermemory",
        "      enabled: true",
        "      apiKeyEnv: SUPERMEMORY_API_KEY",
        ""
      ].join("\n")
    );

    const result = await run(["agent", "--format", "json"], repo);
    const bundle = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(bundle.evidence.memory.providerFailures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: "supermemory",
          kind: "external",
          status: "failed",
          untrusted: true
        })
      ])
    );
  });
});

function fakeProvider(id: string, memory: CodeDecayMemory, sourcePath: string): MemoryProvider {
  return {
    id,
    name: `${id} provider`,
    kind: "external",
    load: () => ({
      memory,
      sourcePath
    })
  };
}

function createMemory(memory: Partial<CodeDecayMemory> = {}): CodeDecayMemory {
  return {
    version: 1,
    flows: [],
    commands: [],
    invariants: [],
    architecture: [],
    regressions: [],
    ...memory
  };
}
