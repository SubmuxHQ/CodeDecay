import { describe, expect, it } from "vitest";
import { analyzeJsProject } from "../src/index";
import { change, createTempProject } from "./helpers/integration";

describe("analyzer-js security matcher integration", () => {
  it("adds deterministic security candidates and findings for changed source files", () => {
    const rootDir = createTempProject({
      "src/api/files.ts": [
        "import { readFileSync } from 'node:fs';",
        "export async function GET(req) {",
        "  return readFileSync(req.query.file, 'utf8');",
        "}"
      ].join("\n")
    });

    const result = analyzeJsProject({
      rootDir,
      changedFiles: [change("src/api/files.ts", "return readFileSync(req.query.file, 'utf8');")]
    });

    expect(result.securityCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "security-path-traversal",
          file: "src/api/files.ts",
          severity: "high",
          confidence: "direct"
        }),
        expect.objectContaining({
          ruleId: "security-missing-auth-entrypoint",
          file: "src/api/files.ts",
          confidence: "entry-point"
        })
      ])
    );
    expect(result.securityAnalysis).toEqual({
      scannedFiles: ["src/api/files.ts"],
      candidateCount: 2,
      skippedFiles: []
    });
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "security-path-traversal",
          category: "security",
          severity: "high",
          file: "src/api/files.ts"
        })
      ])
    );
  });

  it("falls back to added diff lines when the changed file is not present on disk", () => {
    const rootDir = createTempProject({});

    const result = analyzeJsProject({
      rootDir,
      changedFiles: [
        change("src/api/proxy.ts", "export async function GET(req) { return fetch(req.query.url); }")
      ]
    });

    expect(result.securityCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "security-ssrf",
          file: "src/api/proxy.ts"
        })
      ])
    );
    expect(result.securityAnalysis?.scannedFiles).toEqual(["src/api/proxy.ts"]);
  });

  it("does not report RegExp exec as command execution", () => {
    const path = "packages/test-audit/src/paths.ts";
    const content = [
      "export function extensionOf(path: string): string {",
      "  const match = /\\.[^.\\/]+$/.exec(path);",
      "  return match?.[0]?.toLowerCase() ?? '';",
      "}",
      ""
    ].join("\n");
    const rootDir = createTempProject({ [path]: content });

    const result = analyzeJsProject({
      rootDir,
      changedFiles: [change(path, "const match = /\\.[^.\\/]+$/.exec(path);")]
    });

    expect(result.securityAnalysis?.scannedFiles).toEqual([path]);
    expect((result.securityCandidates ?? []).map((candidate) => candidate.ruleId)).not.toContain(
      "security-command-injection"
    );
  });
});
