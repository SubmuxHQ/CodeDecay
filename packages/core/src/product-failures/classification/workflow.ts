import {
  looksLikeAuthOrTestDataFailure,
  looksLikeEnvironmentFailure
} from "./heuristics";
import type { ProductFailureClassificationResult } from "./result";
import { asRecord, isFailureStatus, stringValue } from "../utils";

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
