import type { DesignBoundaryRule } from "@submuxhq/codedecay-core";

export function boundaryCombinationDescription(
  rule: DesignBoundaryRule,
  filePath: string,
  violationKind: "disallowed" | "allowed"
): string {
  const defaultMessage = violationKind === "disallowed"
    ? `${filePath} crosses disallowed boundary rule "${rule.id}".`
    : `${filePath} is outside allowed boundary rule "${rule.id}".`;
  return appendBoundaryRuleEvidence(rule, [rule.message ?? defaultMessage]).join(" ");
}

export function appendBoundaryRuleEvidence(rule: DesignBoundaryRule, parts: string[]): string[] {
  parts.push(`Rule source: designContract.boundaryRules[id=${rule.id}].`);
  if (rule.rewrite) {
    parts.push(`Rewrite direction: ${rule.rewrite}`);
  }
  return parts;
}
