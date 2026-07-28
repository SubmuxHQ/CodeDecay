import { describe, expect, it } from "vitest";
import { createAnalysisReport, type AnalyzerResult, type FileChange } from "@submuxhq/codedecay-core";
import { createTestProofAudit, missingTestRuleIds, weakTestRuleIds } from "../src/index";

describe("createTestProofAudit", () => {
  it("marks source changes without test changes as missing evidence", () => {
    const audit = createTestProofAudit(
      createReport({
        changedFiles: [sourceChange("src/api/users.ts")],
        analyzerResult: {
          impactedAreas: [],
          findings: [
            {
              ruleId: "missing-nearby-tests",
              title: "Risky source changes without changed tests",
              description: "No nearby tests changed.",
              severity: "high",
              category: "coverage",
              file: "src/api/users.ts",
              line: 1
            }
          ],
          recommendedTests: ["Add or run tests covering src/api/users.ts"]
        }
      })
    );

    expect(audit.status).toBe("missing");
    expect(audit.evidenceMode).toBe("heuristic_only");
    expect(audit.evidenceSummary).toContain("Heuristic-only audit");
    expect(audit.changedSourceFiles).toEqual(["src/api/users.ts"]);
    expect(audit.changedTestFiles).toEqual([]);
    expect(audit.missingTestFindings.map((finding) => finding.ruleId)).toEqual(["missing-nearby-tests"]);
    expect(audit.recommendedChecks).toContain(
      "Add or run tests that exercise src/api/users.ts through its public behavior path."
    );
  });

  it("marks changed tests with weak signals as weak evidence", () => {
    const audit = createTestProofAudit(
      createReport({
        changedFiles: [sourceChange("src/auth/session.ts"), testChange("src/auth/session.test.ts")],
        analyzerResult: {
          impactedAreas: [],
          findings: [
            {
              ruleId: "test-without-assertions",
              title: "Changed test has no assertions",
              description: "The test does not assert behavior.",
              severity: "medium",
              category: "coverage",
              file: "src/auth/session.test.ts",
              line: 3
            }
          ],
          recommendedTests: ["Add real assertions to src/auth/session.test.ts"]
        }
      })
    );

    expect(audit.status).toBe("weak");
    expect(audit.summary).toContain("weak test-evidence signals");
    expect(audit.weakTestFindings.map((finding) => finding.ruleId)).toEqual(["test-without-assertions"]);
    expect(audit.recommendedChecks).toEqual(
      expect.arrayContaining([
        "Add meaningful assertions to src/auth/session.test.ts.",
        "Strengthen src/auth/session.test.ts with assertions, negative cases, and real-boundary coverage."
      ])
    );
  });

  it("turns test-bloat evidence into a concrete scaffolding repair check", () => {
    const audit = createTestProofAudit(
      createReport({
        changedFiles: [sourceChange("src/auth/session.ts"), testChange("src/auth/session.test.ts")],
        analyzerResult: {
          impactedAreas: [],
          findings: [
            {
              ruleId: "test-bloat",
              title: "Disproportionate low-value test growth",
              description:
                "src/auth/session.test.ts adds 200 test lines for 20 source additions and includes 20 mock lines.",
              severity: "high",
              category: "decay",
              file: "src/auth/session.test.ts",
              line: 1
            }
          ],
          recommendedTests: []
        }
      })
    );

    expect(audit.status).toBe("weak");
    expect(audit.recommendedChecks).toContain(
      "Reduce repeated mock or snapshot scaffolding in src/auth/session.test.ts, then keep the smallest behavior-focused proof that exercises the real boundary."
    );
  });

  it("marks changed tests without weak signals as present evidence", () => {
    const audit = createTestProofAudit(
      createReport({
        changedFiles: [sourceChange("src/auth/session.ts"), testChange("src/auth/session.test.ts")],
        analyzerResult: {
          impactedAreas: [],
          findings: [],
          recommendedTests: ["src/auth/session.test.ts"]
        }
      })
    );

    expect(audit.status).toBe("present");
    expect(audit.evidenceMode).toBe("heuristic_only");
    expect(audit.summary).toContain("Changed tests are present");
    expect(audit.weakTestFindings).toEqual([]);
    expect(audit.recommendedChecks).toContain(
      "Run or strengthen src/auth/session.test.ts with assertions, negative cases, and real-boundary coverage."
    );
    expect(audit.recommendedChecks).not.toContain("src/auth/session.test.ts");
  });

  it("does not treat package names containing test as test files", () => {
    const audit = createTestProofAudit(
      createReport({
        changedFiles: [
          sourceChange("packages/test-audit/src/index.ts"),
          sourceChange("packages/core/src/types/test-proof.ts"),
          sourceChange("packages/report/src/markdown/test-evidence.ts"),
          sourceChange("packages/analyzer-js/src/tests/weak-audit/findings.ts"),
          testChange("packages/test-audit/test/index.test.ts"),
          testChange("packages/test-audit/__tests__/fixture.ts"),
          testChange("test_users.py")
        ],
        analyzerResult: {
          impactedAreas: [],
          findings: [],
          recommendedTests: []
        }
      })
    );

    expect(audit.changedSourceFiles).toContain("packages/test-audit/src/index.ts");
    expect(audit.changedSourceFiles).toContain("packages/core/src/types/test-proof.ts");
    expect(audit.changedSourceFiles).toContain("packages/report/src/markdown/test-evidence.ts");
    expect(audit.changedSourceFiles).toContain("packages/analyzer-js/src/tests/weak-audit/findings.ts");
    expect(audit.changedTestFiles).toEqual([
      "packages/test-audit/__tests__/fixture.ts",
      "packages/test-audit/test/index.test.ts",
      "test_users.py"
    ]);
  });

  it("treats Python files as source changes for test-proof audit", () => {
    const audit = createTestProofAudit(
      createReport({
        changedFiles: [sourceChange("src/auth.py")],
        analyzerResult: {
          impactedAreas: [],
          findings: [],
          recommendedTests: []
        }
      })
    );

    expect(audit.status).toBe("missing");
    expect(audit.changedSourceFiles).toEqual(["src/auth.py"]);
    expect(audit.recommendedChecks).toContain(
      "Add or run tests that exercise src/auth.py through its public behavior path."
    );
  });

  it("marks docs-only changes as not applicable", () => {
    const audit = createTestProofAudit(
      createReport({
        changedFiles: [
          {
            path: "docs/usage.md",
            status: "modified",
            additions: 1,
            deletions: 0,
            addedLines: [{ line: 1, content: "Docs" }]
          }
        ],
        analyzerResult: {
          impactedAreas: [],
          findings: [],
          recommendedTests: []
        }
      })
    );

    expect(audit.status).toBe("not_applicable");
    expect(audit.recommendedChecks).toEqual([]);
  });

  it("treats runtime coverage as stronger evidence than changed-test proximity alone", () => {
    const audit = createTestProofAudit(
      createReport({
        changedFiles: [sourceChange("src/api/users.ts")],
        analyzerResult: {
          impactedAreas: [],
          findings: [],
          recommendedTests: [],
          testEvidence: {
            mode: "runtime_augmented",
            sources: [{ kind: "istanbul", path: "coverage/coverage-final.json" }],
            changedSources: [
              {
                path: "src/api/users.ts",
                status: "covered",
                measuredLines: [1],
                coveredLines: [1],
                uncoveredLines: [],
                sourceKinds: ["istanbul"],
                sourcePaths: ["coverage/coverage-final.json"]
              }
            ],
            notes: ["Runtime coverage artifacts were found for the changed source files."]
          }
        }
      })
    );

    expect(audit.status).toBe("present");
    expect(audit.evidenceMode).toBe("runtime_augmented");
    expect(audit.evidenceSummary).toContain("Covered: 1");
    expect(audit.runtimeCoverage[0]?.status).toBe("covered");
  });

  it("uses changed-path proof map gaps when classifying test proof status", () => {
    const audit = createTestProofAudit(
      createReport({
        changedFiles: [sourceChange("src/api/users.ts"), testChange("src/api/users.test.ts")],
        analyzerResult: {
          impactedAreas: [],
          findings: [],
          recommendedTests: [],
          testProofMap: {
            summary: {
              total: 1,
              provenByRuntimeCoverage: 0,
              referencedOnlyStatically: 1,
              weakenedByMocking: 0,
              unproven: 0
            },
            entries: [
              {
                file: "src/api/users.ts",
                symbol: "listUsers",
                line: 1,
                status: "referenced_only_statically",
                evidence: "static-reference",
                proof: "deterministic",
                staticReferences: ["src/api/users.test.ts"],
                routeFiles: [],
                weakenedByMocks: [],
                reasons: [
                  "Referenced by src/api/users.test.ts, but no runtime coverage artifact proves changed lines executed."
                ],
                repairTask:
                  "Strengthen src/api/users.test.ts so it executes src/api/users.ts#listUsers with assertions; static import alone is not proof."
              }
            ]
          }
        }
      })
    );

    expect(audit.status).toBe("weak");
    expect(audit.proofMap?.entries[0]?.status).toBe("referenced_only_statically");
  });

  it("exports stable rule id lists", () => {
    expect(missingTestRuleIds()).toEqual(["missing-nearby-tests"]);
    expect(weakTestRuleIds()).toContain("copied-implementation-in-test");
    expect(weakTestRuleIds()).toEqual([...weakTestRuleIds()].sort((left, right) => left.localeCompare(right)));
  });
});

function createReport(input: {
  changedFiles: FileChange[];
  analyzerResult: AnalyzerResult;
}) {
  return createAnalysisReport({
    changedFiles: input.changedFiles,
    analyzerResult: input.analyzerResult,
    generatedAt: "2026-01-01T00:00:00.000Z"
  });
}

function sourceChange(path: string): FileChange {
  return {
    path,
    status: "modified",
    additions: 1,
    deletions: 0,
    addedLines: [{ line: 1, content: "export const changed = true;" }]
  };
}

function testChange(path: string): FileChange {
  return {
    path,
    status: "modified",
    additions: 1,
    deletions: 0,
    addedLines: [{ line: 1, content: "test('changed', () => {});" }]
  };
}
