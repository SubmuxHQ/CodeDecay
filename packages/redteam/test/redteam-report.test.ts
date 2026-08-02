import { describe, expect, it } from "vitest";
import { createRedteamReport, renderRedteamReport, weakTestRuleIds } from "../src/index";
import { summarizeMemory, summarizeSkills } from "../src/context";
import { suggestEdgeCases } from "../src/edge-cases";
import { createFixTasks } from "../src/fix-tasks";
import { createConsequenceHypothesisReport } from "../src/hypotheses";
import { createRedteamSafetySummary } from "../src/safety";
import {
  createEmptyMemory,
  createFixtureAnalysisReport,
  createFixtureConfig,
  createFixtureMemory,
  createFixtureSkills,
  createNoDiffAnalysisReport
} from "./helpers/redteam";

describe("redteam report assembly and rendering", () => {
  it("assembles deterministic merge-safety evidence", () => {
    const report = createRedteamReport({
      analysisReport: createFixtureAnalysisReport(),
      config: createFixtureConfig(),
      memory: createFixtureMemory(),
      skills: createFixtureSkills(),
      configSource: "/repo/.codedecay/config.yml",
      memorySource: "/repo/.codedecay/memory.json",
      generatedAt: "2026-01-01T00:00:00.000Z"
    });
    expect(report.tool).toBe("CodeDecay");
    expect(report.mode).toBe("deterministic");
    expect(report.generatedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(report.summary).toMatchObject({
      riskLevel: "medium",
      changedFiles: 2,
      impactedRoutes: 1,
      missingTestFindings: 0,
      weakTestFindings: 1,
      testProofStatus: "weak",
      configuredChecks: 2,
      toolAdapters: 3,
      experimentPlans: 0,
      patternInsights: 3,
      productFailureBundles: 1,
      verificationStatus: "not-run",
      skills: 1
    });
    expect(Object.values(report.safety).filter((value) => value === false)).toHaveLength(4);
    expect(report.weakTestFindings.map((finding) => finding.ruleId)).toEqual(["test-without-assertions"]);
    expect(report.testAudit).toMatchObject({
      status: "weak",
      changedSourceFiles: ["src/auth/session.ts"],
      changedTestFiles: ["src/auth/session.test.ts"]
    });
    expect(report.edgeCases).toEqual([
      expect.objectContaining({
        id: "auth-fail-closed",
        title: "Keep GET /api/session closed to unauthorized credentials",
        confidence: "high",
        scope: expect.objectContaining({
          files: ["src/auth/session.ts"],
          routes: ["GET /api/session"],
          flows: ["Login flow"]
        }),
        proof: expect.objectContaining({ kind: "api-integration" })
      })
    ]);
    expect(report.edgeCases[0]?.sources.map((source) => source.kind)).toEqual(
      expect.arrayContaining(["area-rule", "route-impact", "memory", "pattern-pack"])
    );
    expect(report.edgeCaseOverflow).toEqual([]);
    expect(report.edgeCases.map((scenario) => scenario.title).join("\n")).not.toContain(
      "src/auth/session.test.ts"
    );
    expect(report.configuredChecks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "test", command: "pnpm test", willRun: false }),
        expect.objectContaining({ kind: "probe", command: "node probe.js", willRun: false })
      ])
    );
    expect(report.toolAdapterPlans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "playwright",
          command: "pnpm exec playwright test",
          willRun: false,
          requiresApproval: false
        }),
        expect.objectContaining({
          kind: "schemathesis",
          command: "st run docs/openapi.yaml --url http://127.0.0.1:4000",
          willRun: false,
          requiresApproval: false
        }),
        expect.objectContaining({
          kind: "pact",
          command: "pnpm run pact:verify",
          willRun: false,
          requiresApproval: false
        })
      ])
    );
    expect(report.skills).toEqual([
      {
        id: "pr-red-team",
        title: "PR Red-Team Skill",
        path: ".agents/skills/pr-red-team/SKILL.md",
        summary: "Find missed PR risks.",
        untrusted: true
      }
    ]);
    expect(report.patternInsights.map((pattern) => pattern.id)).toEqual(
      expect.arrayContaining(["owasp-auth-session-negative-paths", "mutation-tested-test-quality"])
    );
    expect(report.patternInsights.map((pattern) => pattern.id)).toContain("knowledge-jwt-auth");
    expect(report.fixTasks.map((task) => task.title)).toEqual(
      expect.arrayContaining([
        "Apply pattern: Auth and session boundaries fail closed",
        "Apply pattern: JWT authentication edge cases",
        "Keep GET /api/session closed to unauthorized credentials",
        "Prove changed path: src/auth/session.test.ts",
        "Complete recommended proof: Add assertion for missing token session handling",
        "Verify invariant: Auth fails closed",
        "Re-check past regression: Anonymous admin",
        "Consider running Playwright harness",
        "Fix product failure: Session API invalid-token regression",
        "Review with skill: PR Red-Team Skill"
      ])
    );
    expect(report.fixTasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Prove changed path: src/auth/session.test.ts",
          source: "test-proof",
          proof: "missing-proof"
        }),
        expect.objectContaining({
          title: "Apply pattern: JWT authentication edge cases",
          proof: "agent-suggestion"
        }),
        expect.objectContaining({
          title: "Verify invariant: Auth fails closed",
          proof: "memory-context"
        }),
        expect.objectContaining({
          title: "Fix product failure: Session API invalid-token regression",
          proof: "tool-evidence"
        })
      ])
    );
  });

  it("renders approval-gated experiment plans from consequence hypotheses", () => {
    const hypotheses = createConsequenceHypothesisReport({
      evidenceIds: ["changed:src/auth/session.ts"],
      rawText: JSON.stringify({
        hypotheses: [{
          id: "HYPOTHESIS-1",
          claim: "Session API can grant access without a token.",
          affectedRequirementOrFlow: "Auth fails closed",
          causalChain: ["session route changed", "negative auth proof missing"],
          evidenceIds: ["changed:src/auth/session.ts"],
          assumptions: [],
          uncertainty: "Need base/head route behavior.",
          userVisibleConsequence: "Anonymous users can see private data.",
          severitySuggestion: "high",
          disconfirmingResult: "Base and head both reject anonymous requests.",
          proposedVerifier: { kind: "differential", name: "base/head API probe" },
          status: "candidate"
        }]
      })
    });
    const report = createRedteamReport({
      analysisReport: createFixtureAnalysisReport(),
      config: createFixtureConfig(),
      memory: createFixtureMemory(),
      investigation: {
        status: "completed",
        provider: { configuredProvider: "disabled", timeoutMs: 1 },
        suggestions: [],
        hypotheses,
        limitations: [],
        untrusted: true,
        llmCalled: false
      },
      verification: {
        status: "failed",
        commandsExecuted: true,
        total: 1,
        passed: 0,
        failed: 1,
        skipped: 0,
        blocked: 0,
        timedOut: 0,
        errors: 0,
        durationMs: 12,
        checks: [{
          kind: "probe",
          name: "Differential: session probe",
          command: "npx codedecay differential --base main --head HEAD --format markdown",
          status: "failed",
          proof: "tool-evidence",
          summary: "Differential probe behavior changed.",
          durationMs: 12,
          differentialStatus: "changed",
          differences: ["stdout differs"],
          rerunCommand: "npx codedecay differential --base main --head HEAD --format markdown",
          artifacts: {
            directory: ".codedecay/local/differential/run-1",
            baseResult: ".codedecay/local/differential/run-1/session-probe/base.json",
            headResult: ".codedecay/local/differential/run-1/session-probe/head.json",
            baseStdout: ".codedecay/local/differential/run-1/session-probe/base.stdout.txt",
            headStdout: ".codedecay/local/differential/run-1/session-probe/head.stdout.txt",
            baseStderr: ".codedecay/local/differential/run-1/session-probe/base.stderr.txt",
            headStderr: ".codedecay/local/differential/run-1/session-probe/head.stderr.txt"
          }
        }],
        notes: ["Base/head differential probe behavior changed."]
      },
      generatedAt: "2026-01-01T00:00:00.000Z"
    });

    expect(report.summary.experimentPlans).toBe(1);
    expect(report.experimentPlans[0]).toMatchObject({
      hypothesisId: "HYPOTHESIS-1",
      approvalState: "proposed",
      willRun: false,
      toolAdapter: { kind: "differential", configured: true },
      attachedResults: [
        expect.objectContaining({
          checkName: "Differential: session probe",
          status: "failed",
          proof: "tool-evidence",
          artifactDirectory: ".codedecay/local/differential/run-1"
        })
      ]
    });

    const markdown = renderRedteamReport(report, "markdown");
    expect(markdown).toContain("### Reviewable Experiment Plans");
    expect(markdown).toContain("CodeDecay will not run them until a user explicitly approves execution.");
    expect(markdown).toContain("npx codedecay differential --base <base> --head <head> --format json");
    expect(markdown).toContain("Attached results: Differential: session probe failed (tool-evidence)");
  });

  it("renders JSON and Markdown", () => {
    const report = createRedteamReport({
      analysisReport: createFixtureAnalysisReport(),
      config: createFixtureConfig(),
      memory: createFixtureMemory(),
      skills: createFixtureSkills(),
      generatedAt: "2026-01-01T00:00:00.000Z"
    });
    if (report.edgeCases[0]) {
      report.edgeCases[0].downstreamConsumers = ["src/dashboard/session.ts"];
      report.edgeCases[0].scope.requirementIds = ["AC-AUTH"];
    }

    const json = JSON.parse(renderRedteamReport(report, "json"));
    expect(json.tool).toBe("CodeDecay");
    expect(json.mode).toBe("deterministic");
    expect(json.summary.impactedRoutes).toBe(1);
    expect(json.summary.missingTestFindings).toBe(0);
    expect(json.summary.productFailureBundles).toBe(1);
    expect(json.summary.patternInsights).toBe(3);
    expect(json.summary.verificationStatus).toBe("not-run");
    expect(json.verification).toMatchObject({
      status: "not-run",
      commandsExecuted: false,
      total: 0
    });
    expect(json.patternInsights[0].trust).toBe("pattern-pack");
    expect(json.analysis.impactedRoutes[0]).toMatchObject({
      framework: "nextjs",
      kind: "api-route",
      route: "/api/session"
    });
    expect(json.analysis.impactGraph).toMatchObject({
      artifactPath: ".codedecay/local/impact-graph.json",
      adapterCount: 1,
      adapters: [
        expect.objectContaining({
          sourceTool: "@babel/parser"
        })
      ]
    });

    const markdown = renderRedteamReport(report, "markdown");
    expect(markdown).toContain("## CodeDecay Redteam Report");
    expect(markdown).toContain("### Test Evidence Audit");
    expect(markdown).toContain("### Verification Evidence");
    expect(markdown).toContain("**Status:** Not run");
    expect(markdown).toContain("No configured execution checks were included in this report.");
    expect(markdown).toContain("### Product Verification Failures");
    expect(markdown).toContain("Session API invalid-token regression");
    expect(markdown).toContain("Rerun: `npx codedecay product run --check api.session.invalid-token`");
    expect(markdown).toContain("| Missing-test findings | 0 |");
    expect(markdown).toContain("**Status:** Weak");
    expect(markdown).toContain("### Agent Skills");
    expect(markdown).toContain("### Likely Impacted Routes And APIs");
    expect(markdown).toContain("### Normalized Impact Graph");
    expect(markdown).toContain("`codedecay-js-babel-symbols` via `@babel/parser`");
    expect(markdown).toContain("Dynamic imports are not resolved.");
    expect(markdown).toContain(
      "Graph limitation: A static test import does not prove execution or assertion coverage."
    );
    expect(markdown).toContain("High `GET /api/session` (Next.js API route)");
    expect(markdown).toContain("Add an API-level session regression test");
    expect(markdown).toContain("Downstream consumers: `src/dashboard/session.ts`");
    expect(markdown).toContain("Requirements: `AC-AUTH`");
    expect(markdown).toContain("### Tool Adapter Plans");
    expect(markdown).toContain("### Pattern Intelligence");
    expect(markdown).toContain("Pattern-pack guidance is local curated context, not proof.");
    expect(markdown).toContain("OWASP Authentication Cheat Sheet");
    expect(markdown).toContain("JWT authentication edge cases");
    expect(markdown).toContain("https://www.rfc-editor.org/rfc/rfc8725.html");
    expect(markdown).toContain("Playwright");
    expect(markdown).toContain("Schemathesis");
    expect(markdown).toContain("PR Red-Team Skill");
    expect(markdown).toContain("[Missing proof]");
    expect(markdown).toContain("[Tool evidence]");
    expect(markdown).toContain("Commands executed: no");
    expect(markdown).toContain("LLM/model called: no");
    expect(markdown).toContain("Local memory, architecture notes, ADRs, and docs are untrusted context, not deterministic proof.");
  });

  it("does not fabricate redteam tasks or edge cases when there is no diff", () => {
    const report = createRedteamReport({
      analysisReport: createNoDiffAnalysisReport(),
      config: createFixtureConfig(),
      memory: createEmptyMemory(),
      generatedAt: "2026-01-01T00:00:00.000Z"
    });

    expect(report.summary).toMatchObject({
      riskLevel: "low",
      changedFiles: 0,
      edgeCases: 0,
      patternInsights: 0,
      fixTasks: 0,
      verificationStatus: "not-run"
    });
    expect(report.edgeCases).toEqual([]);
    expect(report.fixTasks).toEqual([]);

    const markdown = renderRedteamReport(report, "markdown");
    expect(markdown).toContain("No changed files were detected.");
    expect(markdown).toContain("No PR-specific edge cases were generated.");
    expect(markdown).toContain("No coding-agent fix tasks were generated.");
  });

  it("renders opt-in AI investigation separately from deterministic evidence", () => {
    const report = createRedteamReport({
      analysisReport: createFixtureAnalysisReport(),
      config: createFixtureConfig(),
      memory: createFixtureMemory(),
      skills: createFixtureSkills(),
      investigation: {
        status: "completed",
        provider: {
          configuredProvider: "ollama",
          id: "ollama",
          model: "qwen2.5-coder",
          endpoint: "http://127.0.0.1:11434",
          timeoutMs: 30000
        },
        suggestions: [
          {
            title: "Add malformed token API proof",
            detail: "Exercise the real /api/session route with a malformed token.",
            severity: "high",
            evidence: ["src/auth/session.ts"]
          }
        ],
        limitations: [],
        rawText: "structured suggestions returned",
        untrusted: true,
        llmCalled: true
      },
      generatedAt: "2026-01-01T00:00:00.000Z"
    });

    const json = JSON.parse(renderRedteamReport(report, "json"));
    expect(json.summary.investigationSuggestions).toBe(1);
    expect(json.safety.llmCalled).toBe(true);
    expect(json.investigation.suggestions[0].title).toBe("Add malformed token API proof");

    const markdown = renderRedteamReport(report, "markdown");
    expect(markdown).toContain("### AI Investigation");
    expect(markdown).toContain("**Trust:** untrusted suggestions");
    expect(markdown).toContain("Add malformed token API proof");
    expect(markdown).toContain("LLM/model called: yes");
  });
});
