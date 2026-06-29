import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeJsProject } from "../src/index";
import { change, createTempProject } from "./helpers/integration";

describe("analyzeJsProject runtime coverage integration", () => {
  it("treats Istanbul coverage artifacts as runtime-backed evidence", () => {
    const rootDir = createTempProject({
      "src/api/users.ts": "export function listUsers() { return []; }\n"
    });
    mkdirSync(dirname(join(rootDir, "coverage/coverage-final.json")), { recursive: true });
    writeFileSync(
      join(rootDir, "coverage/coverage-final.json"),
      JSON.stringify(
        {
          [join(rootDir, "src/api/users.ts")]: {
            path: join(rootDir, "src/api/users.ts"),
            statementMap: {
              "0": {
                start: { line: 1, column: 0 },
                end: { line: 1, column: 39 }
              }
            },
            s: { "0": 1 }
          }
        },
        null,
        2
      )
    );

    const result = analyzeJsProject({
      rootDir,
      changedFiles: [change("src/api/users.ts", "export function listUsers() { return []; }")]
    });

    expect(result.findings.map((finding) => finding.ruleId)).not.toContain("missing-nearby-tests");
    expect(result.findings.map((finding) => finding.ruleId)).not.toContain("runtime-coverage-miss");
    expect(result.testEvidence?.mode).toBe("runtime_augmented");
    expect(result.testEvidence?.changedSources[0]?.status).toBe("covered");
  });

  it("flags partially covered changed lines from lcov artifacts", () => {
    const rootDir = createTempProject({
      "src/api/users.ts": ["export function listUsers() {", "  return [];", "}", ""].join("\n")
    });
    mkdirSync(dirname(join(rootDir, "coverage/lcov.info")), { recursive: true });
    writeFileSync(
      join(rootDir, "coverage/lcov.info"),
      [
        `SF:${join(rootDir, "src/api/users.ts")}`,
        "DA:1,1",
        "DA:2,0",
        "end_of_record",
        ""
      ].join("\n")
    );

    const result = analyzeJsProject({
      rootDir,
      changedFiles: [
        {
          path: "src/api/users.ts",
          status: "modified",
          additions: 2,
          deletions: 0,
          addedLines: [
            { line: 1, content: "export function listUsers() {" },
            { line: 2, content: "  return [];" }
          ]
        }
      ]
    });

    expect(result.findings.map((finding) => finding.ruleId)).toContain("runtime-coverage-partial");
    expect(result.testEvidence?.changedSources[0]?.status).toBe("partial");
  });

  it("maps Python changed sources through LCOV runtime coverage", () => {
    const rootDir = createTempProject({
      "src/auth.py": ["def refresh_token(token):", "    return token", ""].join("\n")
    });
    mkdirSync(dirname(join(rootDir, "coverage/lcov.info")), { recursive: true });
    writeFileSync(
      join(rootDir, "coverage/lcov.info"),
      [`SF:${join(rootDir, "src/auth.py")}`, "DA:1,1", "DA:2,0", "end_of_record", ""].join("\n")
    );

    const result = analyzeJsProject({
      rootDir,
      changedFiles: [
        {
          path: "src/auth.py",
          status: "modified",
          additions: 2,
          deletions: 0,
          addedLines: [
            { line: 1, content: "def refresh_token(token):" },
            { line: 2, content: "    return token" }
          ]
        }
      ]
    });

    expect(result.testEvidence?.mode).toBe("runtime_augmented");
    expect(result.testEvidence?.changedSources).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "src/auth.py", status: "partial", uncoveredLines: [2] })])
    );
    expect(result.findings.map((finding) => finding.ruleId)).toContain("runtime-coverage-partial");
  });

  it("loads V8 coverage artifacts for changed source files", () => {
    const fileContents = ["export function listUsers() {", "  return [];", "}", ""].join("\n");
    const rootDir = createTempProject({
      "src/api/users.ts": fileContents
    });
    const firstLineEnd = fileContents.indexOf("\n");
    mkdirSync(dirname(join(rootDir, ".v8-coverage/run.json")), { recursive: true });
    writeFileSync(
      join(rootDir, ".v8-coverage/run.json"),
      JSON.stringify(
        {
          result: [
            {
              url: join(rootDir, "src/api/users.ts"),
              functions: [
                {
                  ranges: [
                    {
                      startOffset: 0,
                      endOffset: firstLineEnd,
                      count: 1
                    }
                  ]
                }
              ]
            }
          ]
        },
        null,
        2
      )
    );

    const result = analyzeJsProject({
      rootDir,
      changedFiles: [change("src/api/users.ts", "export function listUsers() {")]
    });

    expect(result.testEvidence?.mode).toBe("runtime_augmented");
    expect(result.testEvidence?.sources).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "v8" })]));
    expect(result.testEvidence?.changedSources[0]?.status).toBe("covered");
  });
});
