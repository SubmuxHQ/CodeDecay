const MISSING_TEST_RULES = new Set(["missing-nearby-tests"]);
const WEAK_TEST_RULES = new Set([
  "test-without-assertions",
  "snapshot-only-test",
  "mocked-changed-source",
  "unrelated-test-change",
  "copied-implementation-in-test",
  "happy-path-only-test",
  "heavy-mocking",
  "test-bloat"
]);

export function isMissingTestRule(ruleId: string): boolean {
  return MISSING_TEST_RULES.has(ruleId);
}

export function isWeakTestRule(ruleId: string): boolean {
  return WEAK_TEST_RULES.has(ruleId);
}

export function weakTestRuleIds(): string[] {
  return [...WEAK_TEST_RULES].sort((left, right) => left.localeCompare(right));
}

export function missingTestRuleIds(): string[] {
  return [...MISSING_TEST_RULES].sort((left, right) => left.localeCompare(right));
}
