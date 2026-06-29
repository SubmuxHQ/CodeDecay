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

describe("CodeDecay memory context application", () => {
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
