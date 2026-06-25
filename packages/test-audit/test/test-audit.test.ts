import { describe, expect, it } from "vitest";
import { createAnalysisReport, type AnalyzerResult, type FileChange } from "@submuxhq/codedecay-core";
import { createTestProofAudit, missingTestRuleIds, weakTestRuleIds } from "../src/index";

describe("createTestProofAudit", () => {
  it("marks source changes without test changes as missing proof", () => {
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
    expect(audit.changedSourceFiles).toEqual(["src/api/users.ts"]);
    expect(audit.changedTestFiles).toEqual([]);
    expect(audit.missingTestFindings.map((finding) => finding.ruleId)).toEqual(["missing-nearby-tests"]);
    expect(audit.recommendedChecks).toContain(
      "Add or run tests that exercise src/api/users.ts through its public behavior path."
    );
  });

  it("marks changed tests with weak signals as weak proof", () => {
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
    expect(audit.weakTestFindings.map((finding) => finding.ruleId)).toEqual(["test-without-assertions"]);
    expect(audit.recommendedChecks).toEqual(
      expect.arrayContaining([
        "Add meaningful assertions to src/auth/session.test.ts.",
        "Strengthen src/auth/session.test.ts with assertions, negative cases, and real-boundary coverage."
      ])
    );
  });

  it("marks changed tests without weak signals as present proof", () => {
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
          testChange("packages/test-audit/test/index.test.ts"),
          testChange("packages/test-audit/__tests__/fixture.ts")
        ],
        analyzerResult: {
          impactedAreas: [],
          findings: [],
          recommendedTests: []
        }
      })
    );

    expect(audit.changedSourceFiles).toContain("packages/test-audit/src/index.ts");
    expect(audit.changedTestFiles).toEqual([
      "packages/test-audit/__tests__/fixture.ts",
      "packages/test-audit/test/index.test.ts"
    ]);
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
