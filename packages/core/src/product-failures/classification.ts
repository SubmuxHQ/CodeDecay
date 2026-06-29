import type {
  ProductCheckKind,
  ProductFailureClassification
} from "../types";
import {
  asRecord,
  isFailureStatus,
  numberValue,
  productFailureClassificationValue,
  stringArray,
  stringValue
} from "./utils";

export interface ProductFailureClassificationResult {
  classification: ProductFailureClassification;
  confidence: number;
  evidence: string[];
}

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

export function classifyProductWorkflowFailure(
  target: Record<string, unknown>,
  status: string,
  reason: string
): ProductFailureClassificationResult {
  const setup = asRecord(target.setup);
  const start = asRecord(target.start);
  const health = asRecord(target.health);
  const readiness = asRecord(target.readiness);
  const text = [reason, stringValue(readiness?.status), stringValue(readiness?.mode)].filter(Boolean).join("\n").toLowerCase();

  if (setup && isFailureStatus(stringValue(setup.status))) {
    return {
      classification: "auth-or-test-data-failure",
      confidence: 0.78,
      evidence: ["The target auth/setup command failed before generated product checks could run."]
    };
  }

  if (
    status === "blocked" ||
    status === "timed_out" ||
    (start && isFailureStatus(stringValue(start.status))) ||
    (health && isFailureStatus(stringValue(health.status))) ||
    looksLikeEnvironmentFailure(text)
  ) {
    return {
      classification: "environment-failure",
      confidence: 0.78,
      evidence: ["The product target failed during startup, preview URL resolution, health checking, or local execution setup."]
    };
  }

  if (looksLikeAuthOrTestDataFailure(text)) {
    return {
      classification: "auth-or-test-data-failure",
      confidence: 0.7,
      evidence: ["Workflow failure text points to auth/session/test-data setup rather than product behavior."]
    };
  }

  return {
    classification: "unknown",
    confidence: 0.45,
    evidence: ["The product target failed before generated check evidence was available."]
  };
}

function looksLikeEnvironmentFailure(text: string): boolean {
  return /\b(econnrefused|enotfound|etimedout|network|dns|port|server was not ready|health|base url|preview url|start command|playwright is not installed|browser executable|cannot find module|timed out waiting for)\b/i.test(
    text
  );
}

function looksLikeAuthOrTestDataFailure(text: string): boolean {
  return /\b(401|403|unauthorized|forbidden|auth|login|session|token|cookie|permission|rbac|fixture|seed|test data|test account|not found.*user|missing user)\b/i.test(
    text
  );
}

function looksLikeGeneratedTestWeakness(text: string): boolean {
  return /\b(locator|strict mode violation|getbyrole|getbylabel|getbytext|selector|element is not visible|element not found|detached from dom|waiting for locator|to be visible|timeout.*locator|click intercepted)\b/i.test(
    text
  );
}

function looksLikeApiRegression(text: string): boolean {
  return /\b(5\d\d|500|502|503|504|server error|documented status|undocumented status|expected .* got|response contract|schema|invalid json)\b/i.test(
    text
  );
}
