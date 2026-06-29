import type { ProductCheckKind } from "../types";
import {
  looksLikeApiRegression,
  looksLikeAuthOrTestDataFailure,
  looksLikeEnvironmentFailure,
  looksLikeGeneratedTestWeakness
} from "./heuristics";
import type { ProductFailureClassificationResult } from "./result";
import {
  asRecord,
  numberValue,
  productFailureClassificationValue,
  stringArray,
  stringValue
} from "../utils";

export function classifyGeneratedProductFailure(
  failure: Record<string, unknown>,
  checkKind: ProductCheckKind
): ProductFailureClassificationResult {
  const explicitClassification = productFailureClassificationValue(failure.classification);
  const explicitConfidence = numberValue(failure.classificationConfidence);
  const explicitEvidence = stringArray(failure.classificationEvidence);
  if (explicitClassification) {
    return {
      classification: explicitClassification,
      confidence: explicitConfidence ?? 0.7,
      evidence: explicitEvidence.length > 0 ? explicitEvidence : ["Classification was provided by the product report."]
    };
  }

  const retryEvidence = asRecord(failure.retryEvidence);
  const text = [
    stringValue(failure.title),
    stringValue(failure.failingStep),
    stringValue(failure.error),
    stringValue(failure.actual),
    stringValue(failure.expected)
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();

  if (stringValue(retryEvidence?.conclusion) === "passed-on-rerun") {
    return {
      classification: "likely-flaky",
      confidence: 0.85,
      evidence: ["The generated check failed initially and passed on a targeted rerun."]
    };
  }

  if (looksLikeEnvironmentFailure(text)) {
    return {
      classification: "environment-failure",
      confidence: 0.75,
      evidence: ["Failure text points to local runner, browser, server, network, or health-check setup."]
    };
  }

  if (looksLikeAuthOrTestDataFailure(text)) {
    return {
      classification: "auth-or-test-data-failure",
      confidence: 0.75,
      evidence: ["Failure text points to authentication, authorization, session, fixture, or seeded test-data setup."]
    };
  }

  if (checkKind === "ui" && looksLikeGeneratedTestWeakness(text)) {
    return {
      classification: "generated-test-weakness",
      confidence: 0.72,
      evidence: ["Failure text points to locator drift, visibility timing, strict-mode locator issues, or brittle generated-test timing."]
    };
  }

  if (stringValue(retryEvidence?.conclusion) === "failed-on-rerun") {
    return {
      classification: "confirmed-regression",
      confidence: 0.78,
      evidence: ["The generated check failed on the initial run and failed again on a targeted rerun."]
    };
  }

  if (checkKind === "api" && looksLikeApiRegression(text)) {
    return {
      classification: "confirmed-regression",
      confidence: 0.72,
      evidence: ["API response evidence points to a server error, undocumented status, or response contract drift."]
    };
  }

  return {
    classification: "unknown",
    confidence: 0.5,
    evidence: ["No deterministic classification rule matched this generated failure."]
  };
}
