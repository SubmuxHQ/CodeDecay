import type { CapabilityIntentSource } from "./types";

const UNTRUSTED_EVIDENCE_SOURCES = new Set<CapabilityIntentSource>([
  "agent",
  "memory",
  "mcp",
  "generated-experiment",
  "model"
]);

/**
 * Fake agent/tool success claims cannot forge verified capability evidence.
 * Only trusted runtime/tool execution through packages/execution counts.
 */
export function isTrustedCapabilityEvidenceSource(source: CapabilityIntentSource): boolean {
  return source === "user-config" || source === "cli-flag";
}

export function assertTrustedCapabilityEvidence(input: {
  source: CapabilityIntentSource;
  claim: "verified" | "passed" | "safe";
}): { trusted: true } | { trusted: false; reason: string } {
  if (UNTRUSTED_EVIDENCE_SOURCES.has(input.source)) {
    return {
      trusted: false,
      reason: `untrusted source '${input.source}' cannot forge ${input.claim} capability evidence`
    };
  }

  if (!isTrustedCapabilityEvidenceSource(input.source)) {
    return {
      trusted: false,
      reason: `source '${input.source}' is not trusted capability evidence`
    };
  }

  return { trusted: true };
}
