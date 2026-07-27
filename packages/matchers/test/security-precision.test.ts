import { describe, expect, it } from "vitest";
import { scanSecurityCandidates } from "../src/index";

describe("security matcher precision", () => {
  it("ignores credential words in regex tables, rule ids, comments, and fixture strings", () => {
    const result = scanSecurityCandidates({
      files: [
        {
          path: "packages/redteam/src/edge-cases/plan.ts",
          content: [
            "const KNOWLEDGE_MATCHERS: Record<string, RegExp> = {",
            '  "jwt-weak-or-shared-secret": /\\b(?:jwt|token).{0,80}\\b(?:secret|hmac)\\b|\\b(?:secret|hmac).{0,80}\\b(?:jwt|token)\\b/i,',
            "};",
            'const rule = { ruleId: "security-hardcoded-secret" };',
            '// const API_SECRET = "real-looking-secret-value";',
            'const fixture = \'const PASSWORD = "real-looking-password";\';',
            'it("reports a hardcoded secret", () => expect(rule).toBeDefined());',
            ""
          ].join("\n")
        }
      ]
    });

    expect(ruleCandidates(result, "security-hardcoded-secret")).toEqual([]);
  });

  it("reports parsed credential assignments but ignores placeholders", () => {
    const result = scanSecurityCandidates({
      files: [
        {
          path: "src/config.ts",
          content: [
            'const STRIPE_SECRET_KEY = "sk_live_1234567890abcdef";',
            'const config = { password: "correct-horse-battery-staple" };',
            'config.accessToken = "token_1234567890abcdef";',
            'const placeholderSecret = "example-secret-placeholder";',
            ""
          ].join("\n")
        }
      ]
    });
    const candidates = ruleCandidates(result, "security-hardcoded-secret");

    expect(candidates).toHaveLength(3);
    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          line: 1,
          confidence: "direct",
          severity: "high"
        }),
        expect.objectContaining({
          line: 2,
          confidence: "direct",
          severity: "high"
        }),
        expect.objectContaining({
          line: 3,
          confidence: "direct",
          severity: "high"
        })
      ])
    );
    expect(candidates.every((candidate) => /parsed|syntax/i.test(candidate.evidence))).toBe(true);
  });

  it("does not taint internal fixture parameters because unrelated process arguments exist", () => {
    const result = scanSecurityCandidates({
      files: [
        {
          path: "scripts/pr-safety-eval.mjs",
          content: [
            "const options = parseArgs(process.argv.slice(2));",
            "async function runScenario(scenario, scenarioDir) {",
            "  writeFiles(scenarioDir, scenario.baselineFiles);",
            "  writeFiles(scenarioDir, scenario.riskyFiles);",
            "}",
            ""
          ].join("\n")
        }
      ]
    });

    expect(ruleCandidates(result, "security-path-traversal")).toEqual([]);
  });

  it("requires an actual file-system sink fed by request-controlled data", () => {
    const result = scanSecurityCandidates({
      files: [
        {
          path: "src/api/files.ts",
          content: [
            "import { readFileSync, writeFileSync } from 'node:fs';",
            "export function GET(req) {",
            "  const requestedPath = req.query.file;",
            "  return readFileSync(requestedPath, 'utf8');",
            "}",
            "export function readInternalFixture(filePath) {",
            "  return readFileSync(filePath, 'utf8');",
            "}",
            "export function writeFixture(rootDir, files) {",
            "  return writeFiles(rootDir, files);",
            "}",
            ""
          ].join("\n")
        }
      ]
    });
    const candidates = ruleCandidates(result, "security-path-traversal");

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      line: 4,
      confidence: "direct",
      severity: "high"
    });
    expect(candidates[0]?.evidence).toMatch(/request-controlled|untrusted/i);
  });

  it("tracks route aliases, process arguments, and bound file-system aliases", () => {
    const result = scanSecurityCandidates({
      files: [
        {
          path: "src/api/download.ts",
          content: [
            "import { readFileSync as readUploadedBytes } from 'node:fs';",
            "export function GET(input) {",
            "  return readUploadedBytes(input.file, 'utf8');",
            "}",
            ""
          ].join("\n")
        },
        {
          path: "scripts/read-file.mjs",
          content: [
            "import * as fs from 'node:fs';",
            "const path = process.argv[2];",
            "fs.readFileSync(path, 'utf8');",
            ""
          ].join("\n")
        },
        {
          path: "src/internal/cache.ts",
          content: [
            "import { readFileSync } from 'node:fs';",
            "export function readCache(cachePath) {",
            "  return readFileSync(cachePath, 'utf8');",
            "}",
            ""
          ].join("\n")
        }
      ]
    });
    const candidates = ruleCandidates(result, "security-path-traversal");

    expect(candidates).toEqual([
      expect.objectContaining({
        file: "scripts/read-file.mjs",
        line: 3,
        confidence: "direct"
      }),
      expect.objectContaining({
        file: "src/api/download.ts",
        line: 3,
        confidence: "direct"
      })
    ]);
  });

  it("does not leak or overrule file-system bindings across function scopes", () => {
    const result = scanSecurityCandidates({
      files: [
        {
          path: "src/api/scoped-files.ts",
          content: [
            "import { readFileSync } from 'node:fs';",
            "export function GET(req, readFileSync) {",
            "  return readFileSync(req.query.file, 'utf8');",
            "}",
            "export function loadFromDisk(request) {",
            "  const read = require('node:fs').readFileSync;",
            "  return read(request.path, 'utf8');",
            "}",
            "export function inspectFixture(read, request) {",
            "  return read(request.path);",
            "}",
            ""
          ].join("\n")
        },
        {
          path: "src/api/scoped-receiver.ts",
          content: [
            "import * as fs from 'node:fs';",
            "export function POST(request, fs) {",
            "  return fs.readFileSync(request.body.path, 'utf8');",
            "}",
            ""
          ].join("\n")
        }
      ]
    });
    const candidates = ruleCandidates(result, "security-path-traversal");

    expect(candidates).toHaveLength(3);
    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: "src/api/scoped-files.ts",
          line: 3,
          severity: "medium",
          confidence: "heuristic"
        }),
        expect.objectContaining({
          file: "src/api/scoped-files.ts",
          line: 7,
          severity: "high",
          confidence: "direct"
        }),
        expect.objectContaining({
          file: "src/api/scoped-receiver.ts",
          line: 3,
          severity: "medium",
          confidence: "heuristic"
        })
      ])
    );
  });

  it("keeps unbound request-path snippets as heuristic evidence", () => {
    const result = scanSecurityCandidates({
      files: [
        {
          path: "src/api/files.ts",
          content: [
            "export function GET(req) {",
            "  return readFileSync(req.query.file, 'utf8');",
            "}",
            ""
          ].join("\n")
        }
      ]
    });

    expect(ruleCandidates(result, "security-path-traversal")).toEqual([
      expect.objectContaining({
        line: 2,
        severity: "medium",
        confidence: "heuristic",
        evidence: expect.stringMatching(/binding|heuristic/i)
      })
    ]);
  });

  it("keeps parse-fallback findings visibly heuristic", () => {
    const result = scanSecurityCandidates({
      files: [
        {
          path: "src/config.ts",
          content: ['const API_SECRET = "sk_live_1234567890abcdef";', "}"].join("\n")
        },
        {
          path: "src/api/files.ts",
          content: [
            "import { readFileSync } from 'node:fs';",
            "export function GET(req) {",
            "  return readFileSync(req.query.file, 'utf8');"
          ].join("\n")
        }
      ]
    });

    expect(ruleCandidates(result, "security-hardcoded-secret")).toEqual([
      expect.objectContaining({
        confidence: "heuristic",
        severity: "medium",
        evidence: expect.stringMatching(/parse|heuristic/i)
      })
    ]);
    expect(ruleCandidates(result, "security-path-traversal")).toEqual([
      expect.objectContaining({
        confidence: "heuristic",
        severity: "medium",
        evidence: expect.stringMatching(/parse|heuristic/i)
      })
    ]);
  });
});

function ruleCandidates(
  result: ReturnType<typeof scanSecurityCandidates>,
  ruleId: string
): ReturnType<typeof scanSecurityCandidates>["candidates"] {
  return result.candidates.filter((candidate) => candidate.ruleId === ruleId);
}
