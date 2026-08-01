import { describe, expect, it } from "vitest";
import {
  applyHypothesisVerifierResults,
  createConsequenceHypothesisReport
} from "../src/hypotheses";

describe("consequence hypotheses", () => {
  it("keeps only schema-valid hypotheses cited to known evidence and ranks by consequence proof value", () => {
    const report = createConsequenceHypothesisReport({
      evidenceIds: ["changed:src/payments/retry.ts", "configured:test:payouts", "verification:test:payouts"],
      observation: {
        providerId: "litellm",
        model: "local-reviewer",
        inputEvidenceIds: ["changed:src/payments/retry.ts"],
        latencyMs: 12,
        costBudgetUsd: 0
      },
      rawText: JSON.stringify({
        hypotheses: [
          {
            id: "HYPOTHESIS-2",
            claim: "Retrying a payout can enqueue the same transfer twice.",
            affectedRequirementOrFlow: "Payout retry flow",
            causalChain: ["retry job changed", "idempotency key is not cited", "queue may accept duplicate transfer"],
            evidenceIds: ["changed:src/payments/retry.ts", "configured:test:payouts"],
            assumptions: ["The queue accepts duplicate payloads without an idempotency key."],
            uncertainty: "Need a real retry check to prove whether queue dedupe still exists.",
            userVisibleConsequence: "A customer could be charged or paid twice after retrying a failed payout.",
            severitySuggestion: "high",
            disconfirmingResult: "A configured payout retry test proves the same transfer id is reused and no second enqueue occurs.",
            proposedVerifier: {
              kind: "configured-check",
              name: "payout retry tests",
              command: "pnpm test payouts"
            },
            status: "candidate"
          },
          {
            id: "HYPOTHESIS-1",
            claim: "Retrying a payout can enqueue the same transfer twice.",
            affectedRequirementOrFlow: "Payout retry flow",
            causalChain: ["duplicate claim"],
            evidenceIds: ["changed:src/payments/retry.ts"],
            assumptions: [],
            uncertainty: "Duplicate.",
            userVisibleConsequence: "Duplicate.",
            severitySuggestion: "high",
            disconfirmingResult: "Duplicate.",
            proposedVerifier: { kind: "human-decision", name: "review" },
            status: "candidate"
          },
          {
            claim: "Fabricated symbol breaks export.",
            affectedRequirementOrFlow: "Export flow",
            causalChain: ["provider cited a symbol CodeDecay did not supply"],
            evidenceIds: ["symbol:does-not-exist"],
            assumptions: [],
            uncertainty: "Uncited.",
            userVisibleConsequence: "Users see broken export.",
            severitySuggestion: "critical",
            disconfirmingResult: "A static analyzer proves the symbol exists.",
            proposedVerifier: { kind: "made-up", name: "unknown" },
            status: "confirmed"
          }
        ]
      })
    });

    expect(report).toMatchObject({
      schemaVersion: 1,
      untrusted: true,
      deterministicRiskChanged: false,
      observation: { providerId: "litellm", model: "local-reviewer", costBudgetUsd: 0 }
    });
    expect(report.hypotheses).toHaveLength(1);
    expect(report.hypotheses[0]).toMatchObject({
      id: "HYPOTHESIS-2",
      rank: 1,
      severitySuggestion: "high",
      proposedVerifier: { kind: "configured-check" },
      evidenceIds: ["changed:src/payments/retry.ts", "configured:test:payouts"]
    });
    expect(report.rejected.map((item) => item.reason).join(" ")).toContain("Duplicate hypothesis claim");
    expect(report.rejected.map((item) => item.reason).join(" ")).toContain("at least one known evidence id");
  });

  it("preserves refuted and inconclusive hypotheses and refuses untrusted confirmation", () => {
    const report = createConsequenceHypothesisReport({
      evidenceIds: ["changed:src/api/users.ts", "verification:test:users"],
      rawText: JSON.stringify({
        hypotheses: [
          {
            id: "HYPOTHESIS-1",
            claim: "Users API may skip role checks.",
            affectedRequirementOrFlow: "Users API",
            causalChain: ["route changed", "authorization evidence is missing"],
            evidenceIds: ["changed:src/api/users.ts"],
            assumptions: ["Roles are still enforced inside this route."],
            uncertainty: "Need route-level proof.",
            userVisibleConsequence: "Unauthorized users could see account data.",
            severitySuggestion: "high",
            disconfirmingResult: "A real route test returns 403 without the role.",
            proposedVerifier: { kind: "product-probe", name: "unauthorized route probe" },
            status: "planned"
          },
          {
            id: "HYPOTHESIS-2",
            claim: "Users API pagination may return stale data.",
            affectedRequirementOrFlow: "Users API",
            causalChain: ["pagination changed", "cache invalidation evidence absent"],
            evidenceIds: ["changed:src/api/users.ts"],
            assumptions: [],
            uncertainty: "Need cache proof.",
            userVisibleConsequence: "Users may see stale records.",
            severitySuggestion: "medium",
            disconfirmingResult: "A differential probe returns identical fresh pages.",
            proposedVerifier: { kind: "differential", name: "base/head API probe" },
            status: "inconclusive"
          }
        ]
      })
    });

    const updated = applyHypothesisVerifierResults(report, [
      {
        hypothesisId: "HYPOTHESIS-1",
        status: "confirmed",
        evidenceIds: ["ai:confidence-only"],
        trusted: false,
        summary: "Model is confident."
      },
      {
        hypothesisId: "HYPOTHESIS-2",
        status: "refuted",
        evidenceIds: ["verification:test:users"],
        trusted: true,
        summary: "Differential API probe matched base behavior."
      }
    ]);

    expect(updated.hypotheses.find((hypothesis) => hypothesis.id === "HYPOTHESIS-1")).toMatchObject({
      status: "needs-human",
      limitations: ["Untrusted verifier output cannot confirm a hypothesis; human or tool evidence is required."]
    });
    expect(updated.hypotheses.find((hypothesis) => hypothesis.id === "HYPOTHESIS-2")).toMatchObject({
      status: "refuted",
      evidenceIds: ["changed:src/api/users.ts", "verification:test:users"]
    });
  });
});
