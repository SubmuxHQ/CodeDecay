import { describe, expect, it } from "vitest";
import {
  createAnalysisReport,
  createRequirementTrace,
  normalizeRequirementContext
} from "../src/index";

describe("requirement trace status policy", () => {
  it("keeps mapping, trusted proof, missing proof, failures, and agent suggestions distinct", () => {
    const requirements = normalizeRequirementContext({
      task: "Update product APIs",
      source: { id: "issue-669", kind: "issue", label: "Issue #669" },
      context: {
        acceptanceCriteria: [
          { id: "AC-UNMAPPED", text: "Billing refunds remain available." },
          { id: "AC-IMPLEMENTED", text: "Configuration docs describe the new setting." },
          {
            id: "AC-MISSING",
            text: "Users API returns active users.",
            requiredProof: ["Run the users API integration test."]
          },
          {
            id: "AC-FAILED",
            text: "Export API preserves its response contract.",
            requiredProof: ["Compare export API behavior on base and head."]
          },
          {
            id: "AC-VERIFIED",
            text: "Session API rejects expired sessions.",
            requiredProof: ["Run the session API integration test."]
          },
          { id: "AC-HUMAN", text: "Search API uses the proposed ranking change." }
        ],
        affectedFlows: [
          { name: "Users API", kind: "api" },
          { name: "Export API", kind: "api" },
          { name: "Session API", kind: "api" },
          { name: "Search API", kind: "api" }
        ]
      }
    });
    const report = createAnalysisReport({
      changedFiles: [
        changed("docs/configuration.md"),
        changed("src/api/users.ts"),
        changed("src/api/export.ts"),
        changed("src/api/session.ts"),
        changed("src/api/search.ts")
      ],
      analyzerResult: {
        findings: [],
        impactedAreas: [{
          name: "API",
          kind: "api",
          risk: "medium",
          files: ["src/api/users.ts", "src/api/export.ts", "src/api/session.ts", "src/api/search.ts"]
        }],
        impactedRoutes: [
          route("/api/users", "src/api/users.ts"),
          route("/api/export", "src/api/export.ts"),
          route("/api/session", "src/api/session.ts"),
          route("/api/search", "src/api/search.ts")
        ],
        recommendedTests: [],
        testProofMap: {
          summary: {
            total: 2,
            provenByRuntimeCoverage: 0,
            referencedOnlyStatically: 1,
            weakenedByMocking: 0,
            unproven: 1
          },
          entries: [
            proof("src/api/users.ts", "referenced_only_statically", "static-reference"),
            proof("src/api/export.ts", "unproven", "missing-proof")
          ]
        }
      }
    });

    const trace = createRequirementTrace({
      requirements,
      report,
      externalEvidence: [
        {
          id: "differential-export",
          kind: "differential",
          name: "Export API differential",
          status: "failed",
          trusted: true,
          summary: "Export response changed between base and head.",
          files: ["src/api/export.ts"]
        },
        {
          id: "session-integration",
          kind: "configured-check",
          name: "Session API integration",
          status: "passed",
          trusted: true,
          summary: "Expired session behavior passed.",
          files: ["src/api/session.ts"]
        }
      ],
      agentSuggestions: [{
        title: "Proposed search ranking edit",
        detail: "Change ranking weights in the search API.",
        affectedFlows: ["Search API"],
        evidence: ["src/api/search.ts"]
      }]
    });
    expect(Object.fromEntries(trace.criteria.map((criterion) => [criterion.requirementId, criterion.status]))).toEqual({
      "AC-UNMAPPED": "unmapped",
      "AC-IMPLEMENTED": "implementation-found",
      "AC-MISSING": "proof-missing",
      "AC-FAILED": "proof-failed",
      "AC-VERIFIED": "verified",
      "AC-HUMAN": "needs-human"
    });
    expect(trace.criteria.every((criterion) => criterion.evidence.length > 0)).toBe(true);
    expect(trace.criteria.find((criterion) => criterion.requirementId === "AC-VERIFIED")?.evidence).toEqual(
      expect.arrayContaining([expect.objectContaining({ trusted: true, outcome: "passed" })])
    );
    expect(trace.criteria.find((criterion) => criterion.requirementId === "AC-HUMAN")?.evidence).toEqual(
      expect.arrayContaining([expect.objectContaining({
        kind: "agent-suggestion",
        trusted: false,
        outcome: "untrusted"
      })])
    );
    expect(trace.summary.blockingRequirementIds).toEqual([
      "AC-FAILED",
      "AC-HUMAN",
      "AC-IMPLEMENTED",
      "AC-MISSING",
      "AC-UNMAPPED"
    ]);
  });

  it("does not treat incidental command output as proof of an acceptance criterion", () => {
    const requirements = normalizeRequirementContext({
      task: "Protect the users API",
      source: { id: "issue-693", kind: "issue", label: "Issue #693 UAT" },
      context: {
        acceptanceCriteria: [{
          id: "AC-AUTH",
          text: "An anonymous user cannot list user email addresses.",
          requiredProof: ["Call the real users path as an anonymous user."]
        }],
        affectedFlows: [{ name: "List users", kind: "api" }]
      }
    });
    const report = createAnalysisReport({
      changedFiles: [changed("src/api/users.ts")],
      analyzerResult: {
        findings: [],
        impactedAreas: [{
          name: "API",
          kind: "api",
          risk: "medium",
          files: ["src/api/users.ts"]
        }],
        recommendedTests: []
      }
    });

    const trace = createRequirementTrace({
      requirements,
      report,
      externalEvidence: [{
        id: "generic-test",
        kind: "configured-check",
        name: "Test command 1",
        status: "passed",
        trusted: true,
        summary: "codedecay-user tests passed",
        command: "npm test"
      }]
    });

    expect(trace.criteria[0]).toMatchObject({
      requirementId: "AC-AUTH",
      status: "proof-missing"
    });
    expect(trace.criteria[0]?.evidence).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ target: "generic-test", outcome: "passed" })])
    );
    expect(trace.summary.blockingRequirementIds).toEqual(["AC-AUTH"]);
  });
});

function changed(path: string) {
  return {
    path,
    status: "modified" as const,
    additions: 1,
    deletions: 1,
    addedLines: [{ line: 1, content: "changed" }]
  };
}

function route(path: string, file: string) {
  return {
    framework: "node" as const,
    kind: "api-route" as const,
    route: path,
    methods: ["GET"],
    files: [file],
    risk: "medium" as const,
    reasons: ["Changed API route."],
    recommendedTests: []
  };
}

function proof(
  file: string,
  status: "referenced_only_statically" | "unproven",
  evidence: "static-reference" | "missing-proof"
) {
  return {
    file,
    status,
    evidence,
    proof: "deterministic" as const,
    staticReferences: status === "referenced_only_statically" ? [`test/${file.split("/").at(-1)}.test.ts`] : [],
    routeFiles: [],
    weakenedByMocks: [],
    reasons: ["No runtime proof."],
    repairTask: "Add integration proof."
  };
}
