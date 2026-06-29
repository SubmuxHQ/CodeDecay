import type { ChangedSourceCoverage, TestEvidenceMode } from "@submuxhq/codedecay-core";
import type { TestProofClassificationInput, TestProofStatus } from "./types";

export function classifyTestProof(input: TestProofClassificationInput): TestProofStatus {
  if (input.changedSourceFiles.length === 0 && input.changedTestFiles.length === 0 && input.runtimeCoverage.length === 0) {
    return "not_applicable";
  }

  if (input.runtimeCoverage.some((entry) => entry.status === "not_covered")) {
    return "missing";
  }

  if (input.runtimeCoverage.some((entry) => entry.status === "partial")) {
    return "weak";
  }

  if (input.runtimeCoverage.length > 0 && input.changedSourceFiles.length > 0) {
    const measuredSourceCount = input.runtimeCoverage.filter((entry) => entry.status !== "not_measured").length;
    if (measuredSourceCount === input.changedSourceFiles.length) {
      return input.weakTestFindings.length > 0 ? "weak" : "present";
    }
  }

  if (input.missingTestFindings.length > 0 || (input.changedSourceFiles.length > 0 && input.changedTestFiles.length === 0)) {
    return "missing";
  }

  if (input.weakTestFindings.length > 0) {
    return "weak";
  }

  return "present";
}

export function summarizeStatus(status: TestProofStatus, evidenceMode: TestEvidenceMode): string {
  if (status === "missing") {
    return evidenceMode === "runtime_augmented"
      ? "Changed source behavior is missing runtime-backed test evidence for at least one changed path."
      : "Changed source behavior does not have enough nearby test evidence.";
  }

  if (status === "weak") {
    return evidenceMode === "runtime_augmented"
      ? "Changed behavior has partial runtime coverage or weak deterministic test signals."
      : "Changed tests exist, but deterministic rules found weak test-evidence signals.";
  }

  if (status === "present") {
    return evidenceMode === "runtime_augmented"
      ? "Runtime coverage artifacts include the changed source lines and no weak deterministic signals were found."
      : "Changed tests are present and no deterministic weak-test signals were found.";
  }

  return "No changed source or test files require a test-evidence audit.";
}

export function summarizeEvidence(mode: TestEvidenceMode, runtimeCoverage: ChangedSourceCoverage[]): string {
  if (mode === "heuristic_only") {
    return "Heuristic-only audit. No runtime coverage artifact was found for changed source files.";
  }

  const covered = runtimeCoverage.filter((entry) => entry.status === "covered").length;
  const partial = runtimeCoverage.filter((entry) => entry.status === "partial").length;
  const missing = runtimeCoverage.filter((entry) => entry.status === "not_covered").length;
  const notMeasured = runtimeCoverage.filter((entry) => entry.status === "not_measured").length;
  return `Runtime coverage artifacts were found. Covered: ${covered}, partial: ${partial}, uncovered: ${missing}, not measured: ${notMeasured}.`;
}
