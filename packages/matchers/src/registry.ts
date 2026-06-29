import type { SecurityMatcher } from "./types";

export class SecurityMatcherRegistry {
  private readonly matchers = new Map<string, SecurityMatcher>();

  constructor(matchers: SecurityMatcher[] = []) {
    for (const matcher of matchers) {
      this.register(matcher);
    }
  }

  register(matcher: SecurityMatcher): void {
    validateMatcher(matcher);

    if (this.matchers.has(matcher.ruleId)) {
      throw new Error(`Security matcher already registered: ${matcher.ruleId}`);
    }

    this.matchers.set(matcher.ruleId, matcher);
  }

  get(ruleId: string): SecurityMatcher | undefined {
    validateNonEmptyString(ruleId, "Security matcher ruleId");
    return this.matchers.get(ruleId);
  }

  list(): SecurityMatcher[] {
    return [...this.matchers.values()].sort((left, right) => left.ruleId.localeCompare(right.ruleId));
  }
}

export function createSecurityMatcherRegistry(matchers: SecurityMatcher[] = []): SecurityMatcherRegistry {
  return new SecurityMatcherRegistry(matchers);
}

function validateMatcher(matcher: SecurityMatcher): void {
  validateNonEmptyString(matcher.ruleId, "Security matcher ruleId");
  validateNonEmptyString(matcher.title, "Security matcher title");
  validateNonEmptyString(matcher.description, "Security matcher description");

  if (!Array.isArray(matcher.languages) || matcher.languages.length === 0) {
    throw new Error(`Security matcher ${matcher.ruleId} must declare at least one language.`);
  }

  if (!Array.isArray(matcher.filePatterns) || matcher.filePatterns.length === 0) {
    throw new Error(`Security matcher ${matcher.ruleId} must declare at least one file pattern.`);
  }

  if (!Array.isArray(matcher.examples) || matcher.examples.length === 0) {
    throw new Error(`Security matcher ${matcher.ruleId} must include at least one example.`);
  }
}

function validateNonEmptyString(value: string, label: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${label} is required.`);
  }
}
