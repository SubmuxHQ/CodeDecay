import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AnalyzerResult, FileChange, ImpactedArea } from "@submuxhq/codedecay-core";
import { applyMemoryContext, loadCodeDecayMemory } from "../src/index";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("CodeDecay memory", () => {
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

  it("adds memory findings and recommended checks for impacted changes", () => {
    const changedFiles: FileChange[] = [
      {
        path: "src/auth/session.ts",
        status: "modified",
        additions: 1,
        deletions: 0,
        addedLines: [{ line: 3, content: "return { role: 'admin' };" }]
      }
    ];
    const impactedAreas: ImpactedArea[] = [
      {
        name: "Authentication and authorization",
        kind: "auth",
        risk: "high",
        files: ["src/auth/session.ts"]
      }
    ];
    const analyzerResult: AnalyzerResult = {
      findings: [],
      impactedAreas,
      recommendedTests: []
    };

    const result = applyMemoryContext({
      memory: {
        version: 1,
        flows: [{ name: "Login flow", areas: ["auth"], checks: ["missing token"] }],
        commands: [{ name: "Auth tests", command: "pnpm test auth", areas: ["auth"] }],
        invariants: [{ name: "Auth fails closed", description: "Missing users must not become admins.", areas: ["auth"], severity: "high" }],
        architecture: [{ title: "Session boundary", note: "Session parsing feeds all API routes.", files: ["src/auth/*"] }],
        regressions: [{ title: "Anonymous admin", description: "Fallback user became admin.", areas: ["auth"], check: "missing token request" }]
      },
      changedFiles,
      impactedAreas,
      analyzerResult
    });

    expect(result.findings.map((finding) => finding.ruleId)).toEqual(
      expect.arrayContaining(["memory-invariant-impacted", "memory-past-regression-area", "memory-architecture-note"])
    );
    expect(result.recommendedTests).toEqual(
      expect.arrayContaining([
        "Verify invariant: Auth fails closed",
        "Regression check: missing token request",
        "Verify flow: Login flow",
        "Flow check (Login flow): missing token",
        "Run project command: Auth tests (pnpm test auth)"
      ])
    );
  });
});

function createTempDir(): string {
  const root = join(tmpdir(), `codedecay-memory-${randomUUID()}`);
  mkdirSync(root, { recursive: true });
  tempRoots.push(root);
  return root;
}

function writeJson(root: string, path: string, value: unknown): void {
  writeText(root, path, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(root: string, path: string, contents: string): void {
  const fullPath = join(root, path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, contents, "utf8");
}
