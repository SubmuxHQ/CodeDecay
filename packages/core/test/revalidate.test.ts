import { describe, expect, it } from "vitest";
import {
  createRevalidationReport,
  revalidationSubjectId,
  type CodeDecayReport
} from "../src/index";

describe("createRevalidationReport", () => {
  it("marks matching findings as confirmed and suggests memory", () => {
    const previous = reportWithFinding("risky-auth-change", "src/auth/session.ts", 4);
    const current = reportWithFinding("risky-auth-change", "src/auth/session.ts", 4);

    const report = createRevalidationReport({
      previousReport: previous,
      currentReport: current,
      generatedAt: "2026-01-01T00:00:02.000Z"
    });

    expect(report.summary.confirmed).toBe(1);
    expect(report.items[0]).toMatchObject({
      status: "confirmed",
      ruleId: "risky-auth-change"
    });
    expect(report.memorySuggestions).toEqual([
      expect.objectContaining({
        section: "regressions",
        files: ["src/auth/session.ts"]
      })
    ]);
    expect(report.safety).toMatchObject({
      deterministic: true,
      llmCalled: false,
      telemetrySent: false,
      cloudDependency: false
    });
  });

  it("keeps fixed findings in the revalidation history", () => {
    const previous = reportWithFinding("risky-auth-change", "src/auth/session.ts", 4);
    const current = emptyReport();

    const report = createRevalidationReport({
      previousReport: previous,
      currentReport: current,
      currentFiles: [{ path: "src/auth/session.ts", content: null }]
    });

    expect(report.summary.fixed).toBe(1);
    expect(report.items).toEqual([
      expect.objectContaining({
        status: "fixed",
        file: "src/auth/session.ts",
        evidence: ["src/auth/session.ts no longer exists in the current worktree."]
      })
    ]);
  });

  it("marks security candidates fixed when their evidence snippet is gone", () => {
    const previous = reportWithSecurityCandidate("security-sql-injection", "src/api/users.ts", 7, "db.query(userInput)");
    const current = emptyReport();

    const report = createRevalidationReport({
      previousReport: previous,
      currentReport: current,
      currentFiles: [{ path: "src/api/users.ts", content: "db.query('select * from users')\n" }]
    });

    expect(report.summary.fixed).toBe(1);
    expect(report.items[0]).toMatchObject({
      kind: "security-candidate",
      status: "fixed",
      evidence: ["The previous evidence snippet is no longer present."]
    });
  });

  it("marks security candidates uncertain when the snippet remains but the matcher no longer fires", () => {
    const previous = reportWithSecurityCandidate("security-sql-injection", "src/api/users.ts", 7, "db.query(userInput)");
    const current = emptyReport();

    const report = createRevalidationReport({
      previousReport: previous,
      currentReport: current,
      currentFiles: [{ path: "src/api/users.ts", content: "db.query(userInput)\n" }]
    });

    expect(report.summary.uncertain).toBe(1);
    expect(report.items[0]?.evidence[0]).toContain("snippet is still present");
  });

  it("marks weak-test findings fixed when the weak-test rule no longer fires", () => {
    const previous = reportWithFinding("copied-implementation-in-test", "src/auth/session.test.ts", 8);
    const current = emptyReport();

    const report = createRevalidationReport({
      previousReport: previous,
      currentReport: current
    });

    expect(report.summary.fixed).toBe(1);
    expect(report.items[0]).toMatchObject({
      status: "fixed",
      evidence: ["The weak-test rule no longer fires in the current deterministic report."]
    });
  });

  it("honors explicit false-positive and accepted-risk marks", () => {
    const falsePositiveId = revalidationSubjectId({
      kind: "finding",
      ruleId: "risky-auth-change",
      file: "src/auth/session.ts",
      line: 4
    });
    const acceptedRiskId = revalidationSubjectId({
      kind: "security-candidate",
      ruleId: "security-sql-injection",
      file: "src/api/users.ts",
      line: 7
    });
    const previous: CodeDecayReport = {
      ...reportWithFinding("risky-auth-change", "src/auth/session.ts", 4),
      securityCandidates: [
        {
          ruleId: "security-sql-injection",
          title: "SQL injection candidate",
          description: "Unsafe SQL string construction.",
          severity: "high",
          confidence: "direct",
          file: "src/api/users.ts",
          line: 7,
          snippet: "db.query(userInput)",
          evidence: "request input reaches SQL"
        }
      ]
    };

    const report = createRevalidationReport({
      previousReport: previous,
      currentReport: previous,
      falsePositiveIds: [falsePositiveId],
      acceptedRiskIds: [acceptedRiskId]
    });

    expect(report.summary["false-positive"]).toBe(1);
    expect(report.summary["accepted-risk"]).toBe(1);
    expect(report.items.map((item) => item.status)).toEqual(["false-positive", "accepted-risk"]);
  });
});

function emptyReport(): CodeDecayReport {
  return {
    tool: "CodeDecay",
    version: "0.0.0-test",
    generatedAt: "2026-01-01T00:00:01.000Z",
    summary: {
      mergeRiskScore: 0,
      decayScore: 0,
      securityScore: 0,
      riskLevel: "low",
      findingCounts: { low: 0, medium: 0, high: 0 }
    },
    changedFiles: [],
    impactedAreas: [],
    findings: [],
    recommendedTests: []
  };
}

function reportWithFinding(ruleId: string, file: string, line: number): CodeDecayReport {
  return {
    ...emptyReport(),
    findings: [
      {
        ruleId,
        title: "Auth changed",
        description: "Auth behavior changed.",
        severity: "high",
        category: "regression",
        file,
        line
      }
    ],
    summary: {
      ...emptyReport().summary,
      findingCounts: { low: 0, medium: 0, high: 1 }
    }
  };
}

function reportWithSecurityCandidate(ruleId: string, file: string, line: number, snippet: string): CodeDecayReport {
  return {
    ...emptyReport(),
    securityCandidates: [
      {
        ruleId,
        title: "SQL injection candidate",
        description: "Unsafe SQL string construction.",
        severity: "high",
        confidence: "direct",
        file,
        line,
        snippet,
        evidence: "request input reaches SQL"
      }
    ],
    securityAnalysis: {
      scannedFiles: [file],
      candidateCount: 1,
      skippedFiles: []
    }
  };
}
