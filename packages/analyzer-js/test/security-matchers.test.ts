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
          confidence: "direct",
          evidence: expect.stringMatching(/AST-confirmed/)
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

  it("keeps an unbound file-system call heuristic when only added diff text is available", () => {
    const rootDir = createTempProject({});

    const result = analyzeJsProject({
      rootDir,
      changedFiles: [
        change(
          "src/api/files.ts",
          "export function GET(req) { return readFileSync(req.query.file, 'utf8'); }"
        )
      ]
    });

    expect(result.securityCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "security-path-traversal",
          file: "src/api/files.ts",
          severity: "medium",
          confidence: "heuristic",
          evidence: expect.stringMatching(/binding|heuristic/i)
        })
      ])
    );
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

  it("does not report CodeDecay matcher tables and deterministic eval fixtures as security vulnerabilities", () => {
    const matcherPath = "packages/redteam/src/edge-cases/plan.ts";
    const evalPath = "scripts/pr-safety-eval.mjs";
    const matcherContent = [
      "const KNOWLEDGE_MATCHERS: Record<string, RegExp> = {",
      '  "jwt-weak-or-shared-secret": /\\b(?:jwt|token).{0,80}\\b(?:secret|hmac)\\b|\\b(?:secret|hmac).{0,80}\\b(?:jwt|token)\\b/i,',
      "};",
      ""
    ].join("\n");
    const evalContent = [
      "const options = parseArgs(process.argv.slice(2));",
      "async function runScenario(scenario, scenarioDir) {",
      "  writeFiles(scenarioDir, scenario.baselineFiles);",
      "  writeFiles(scenarioDir, scenario.riskyFiles);",
      "}",
      ""
    ].join("\n");
    const rootDir = createTempProject({
      [matcherPath]: matcherContent,
      [evalPath]: evalContent
    });

    const result = analyzeJsProject({
      rootDir,
      changedFiles: [
        change(matcherPath, matcherContent),
        change(evalPath, evalContent)
      ]
    });
    const relevantCandidates = (result.securityCandidates ?? []).filter(
      (candidate) =>
        candidate.ruleId === "security-hardcoded-secret" ||
        candidate.ruleId === "security-path-traversal"
    );

    expect(relevantCandidates).toEqual([]);
  });

  it("keeps real literal credentials as direct analyzer findings with parsed evidence", () => {
    const path = "src/config/credentials.ts";
    const content = 'export const STRIPE_SECRET_KEY = "sk_live_1234567890abcdef";\n';
    const rootDir = createTempProject({ [path]: content });

    const result = analyzeJsProject({
      rootDir,
      changedFiles: [change(path, content)]
    });
    const candidate = (result.securityCandidates ?? []).find(
      (item) => item.ruleId === "security-hardcoded-secret"
    );
    const finding = result.findings.find(
      (item) => item.ruleId === "security-hardcoded-secret"
    );

    expect(candidate).toMatchObject({
      file: path,
      line: 1,
      severity: "high",
      confidence: "direct",
      evidence: expect.stringMatching(/Parsed syntax confirms/)
    });
    expect(finding).toMatchObject({
      file: path,
      line: 1,
      severity: "high",
      description: expect.stringMatching(/Parsed syntax confirms/)
    });
  });
});
