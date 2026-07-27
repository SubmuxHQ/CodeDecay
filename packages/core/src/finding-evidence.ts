import type { Finding } from "./types";

const MEMORY_CONTEXT_RULE_IDS = new Set([
  "memory-architecture-note",
  "memory-invariant-impacted",
  "memory-past-regression-area"
]);

export function isMemoryContextFinding(finding: Pick<Finding, "ruleId">): boolean {
  return [...MEMORY_CONTEXT_RULE_IDS].some(
    (ruleId) => finding.ruleId === ruleId || finding.ruleId.startsWith(`${ruleId}-`)
  );
}
