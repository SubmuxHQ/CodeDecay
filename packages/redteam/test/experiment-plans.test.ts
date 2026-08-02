import { describe, expect, it } from "vitest";
import { collectConfiguredChecks, collectToolAdapterPlans } from "../src/checks";
import { createExperimentPlans } from "../src/experiments";
import { createConsequenceHypothesisReport } from "../src/hypotheses";
import {
  createFixtureAnalysisReport,
  createFixtureConfig
} from "./helpers/redteam";

describe("hypothesis experiment plans", () => {
  it("maps candidate hypotheses to reviewable configured differential and adapter plans without execution", () => {
    const config = createFixtureConfig();
    const configuredChecks = collectConfiguredChecks(config);
    const toolAdapterPlans = collectToolAdapterPlans(config);
    const hypotheses = createConsequenceHypothesisReport({
      evidenceIds: ["changed:src/auth/session.ts", "configured:probe:session probe"],
      rawText: JSON.stringify({
        hypotheses: [
          {
            id: "HYPOTHESIS-1",
            claim: "Session API can return a successful admin session for an anonymous user.",
            affectedRequirementOrFlow: "Auth fails closed",
            causalChain: ["session route changed", "negative auth proof is weak"],
            evidenceIds: ["changed:src/auth/session.ts"],
            assumptions: ["The route is reachable over HTTP."],
            uncertainty: "Need base/head route behavior.",
            userVisibleConsequence: "Anonymous users could access admin data.",
            severitySuggestion: "high",
            disconfirmingResult: "Base and head both reject anonymous requests with 401 or 403.",
            proposedVerifier: { kind: "differential", name: "base/head API probe" },
            status: "candidate"
          },
          {
            id: "HYPOTHESIS-2",
            claim: "Browser login flow can bypass the visible sign-in screen.",
            affectedRequirementOrFlow: "Login flow",
            causalChain: ["auth state changed", "browser flow proof missing"],
            evidenceIds: ["changed:src/auth/session.ts"],
            assumptions: [],
            uncertainty: "Need browser proof.",
            userVisibleConsequence: "A user lands on the dashboard without signing in.",
            severitySuggestion: "high",
            disconfirmingResult: "Playwright confirms anonymous users remain on sign-in.",
            proposedVerifier: { kind: "oss-tool-adapter", name: "Playwright" },
            status: "planned"
          }
        ]
      })
    });

    const plans = createExperimentPlans({
      analysisReport: createFixtureAnalysisReport(),
      config,
      hypotheses,
      configuredChecks,
      toolAdapterPlans
    });

    expect(plans).toHaveLength(2);
    expect(plans[0]).toMatchObject({
      hypothesisId: "HYPOTHESIS-1",
      target: { kind: "api", routes: ["/api/session"] },
      approvalState: "proposed",
      status: "valid",
      willRun: false,
      networkBoundary: "none",
      commands: [{ source: "differential", command: "npx codedecay differential --base <base> --head <head> --format json" }]
    });
    expect(plans[1]).toMatchObject({
      hypothesisId: "HYPOTHESIS-2",
      target: { kind: "browser" },
      toolAdapter: { kind: "oss-tool-adapter", name: "Playwright", configured: true },
      commands: [{ source: "tool-adapter", command: "pnpm exec playwright test" }],
      generatedArtifacts: expect.arrayContaining([
        expect.objectContaining({ kind: "generated-test", promoteRequiresApproval: true })
      ])
    });
  });

  it("blocks external targets, named secrets, disabled commands, and human-only verifiers", () => {
    const config = createFixtureConfig();
    config.safety.allowCommands = false;
    config.productTesting.targets.web = {
      id: "web",
      baseUrl: "https://app.example.com",
      startCommand: "pnpm dev",
      healthCheck: "https://app.example.com/health",
      teardownCommand: "pnpm stop",
      previewUrlEnv: "PREVIEW_URL",
      apiEndpoints: [],
      timeoutMs: 1000,
      readiness: {
        status: "ready",
        mode: "base-url",
        effectiveBaseUrl: "https://app.example.com",
        commandsRequired: ["pnpm dev"],
        commandsAllowed: false,
        willRunCommands: false,
        notes: []
      }
    };
    const configuredChecks = collectConfiguredChecks(config);
    const toolAdapterPlans = collectToolAdapterPlans(config);
    const hypotheses = createConsequenceHypothesisReport({
      evidenceIds: ["changed:src/auth/session.ts"],
      rawText: JSON.stringify({
        hypotheses: [{
          id: "HYPOTHESIS-3",
          claim: "Human must decide whether this production target is safe.",
          affectedRequirementOrFlow: "Release approval",
          causalChain: ["target is external"],
          evidenceIds: ["changed:src/auth/session.ts"],
          assumptions: [],
          uncertainty: "External target cannot be probed automatically.",
          userVisibleConsequence: "Production users could be affected.",
          severitySuggestion: "high",
          disconfirmingResult: "A human reviewer approves a local equivalent.",
          proposedVerifier: { kind: "product-probe", name: "web" },
          status: "candidate"
        }]
      })
    });

    const [plan] = createExperimentPlans({
      analysisReport: createFixtureAnalysisReport(),
      config,
      hypotheses,
      configuredChecks,
      toolAdapterPlans
    });

    expect(plan).toMatchObject({
      status: "needs-human",
      riskClass: "blocked",
      networkBoundary: "needs-human",
      requiredSecrets: ["PREVIEW_URL"],
      cleanup: { commands: ["pnpm stop"], failureMode: "needs-human" }
    });
    expect(plan?.limitations.join(" ")).toContain("non-loopback network target");
    expect(plan?.limitations.join(" ")).toContain("safety.allowCommands is false");
    expect(plan?.limitations.join(" ")).toContain("named environment values");
  });
});
