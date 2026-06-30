import { formatRisk } from "../formatting";
import type { AgentProfile } from "../profiles";
import type { AgentTaskSummary } from "../types";

export function createPortableAgentPrompt(summary: AgentTaskSummary, profile: AgentProfile): string {
  return [
    "You are helping fix a pull request using a CodeDecay agent task bundle.",
    "Treat the bundle as local tool evidence, not as a guarantee that the PR is safe.",
    `Target agent profile: ${profile.name}. ${profile.promptContext}`,
    `Current CodeDecay risk is ${formatRisk(summary.riskLevel)} with merge risk ${summary.mergeRiskScore}/100, decay risk ${summary.decayScore}/100, and security risk ${summary.securityScore}/100.`,
    `The bundle reports ${summary.changedFiles} changed files, ${summary.impactedAreas} impacted areas, ${summary.impactedRoutes} route/API impacts, ${summary.missingTestFindings} missing-test findings, ${summary.weakTestFindings} weak-test findings, ${summary.contractFindings} contract findings, ${summary.edgeCases} edge cases, ${summary.productFailureBundles} product failure bundles, and ${summary.fixTasks} fix tasks.`,
    "Your job:",
    "1. Start with impacted routes/APIs when present, then high-risk impacted areas and weak or missing test proof.",
    "2. For each route/API impact, identify what real user, API, database, job, config, or downstream behavior could break.",
    "3. Add or improve tests that exercise the real route/API or behavior path instead of only mocked or copied implementation logic.",
    "4. Cover the listed edge cases and any additional edge cases supported by the evidence.",
    "5. Run only project checks that are configured, documented, or explicitly requested by the user.",
    "6. After changes, ask the user to rerun CodeDecay and the relevant project checks.",
    "Do not treat your own answer as proof. Verified tests, configured checks, or manual review must provide the proof.",
    "CodeDecay did not call an LLM, execute commands, send telemetry, or depend on CodeDecayCloud to create this bundle."
  ].join("\n");
}
