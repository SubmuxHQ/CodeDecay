import type {
  ApplicablePolicy,
  EngineeringPolicy,
  PolicyChangeClass,
  PolicyScope
} from "./types";

export function resolveApplicablePolicies(
  policies: EngineeringPolicy[],
  changedPaths: string[],
  changeClass: PolicyChangeClass,
  nowIso: string
): { applicable: ApplicablePolicy[]; conflicts: string[]; stale: ApplicablePolicy[] } {
  const applicable: ApplicablePolicy[] = [];
  for (const policy of policies) {
    const matchedScopes = policy.scopes.filter((scope) => scopeMatches(scope, changedPaths, changeClass));
    if (!matchedScopes.length) continue;
    const stale = Boolean(policy.expiresAt && Date.parse(policy.expiresAt) <= Date.parse(nowIso));
    applicable.push({ policy, matchedScopes, stale });
  }

  applicable.sort((a, b) => b.policy.precedence - a.policy.precedence || a.policy.id.localeCompare(b.policy.id));

  const conflicts: string[] = [];
  const byKey = new Map<string, ApplicablePolicy[]>();
  for (const item of applicable) {
    const key = `${item.policy.id}|${item.matchedScopes.map((s) => `${s.kind}:${s.match}`).join(",")}`;
    const bucket = byKey.get(key) ?? [];
    bucket.push(item);
    byKey.set(key, bucket);
  }
  // Conflict: same id from different sources with different requiredEvidence, or same scope+id clash.
  const byId = new Map<string, ApplicablePolicy[]>();
  for (const item of applicable) {
    const bucket = byId.get(item.policy.id) ?? [];
    bucket.push(item);
    byId.set(item.policy.id, bucket);
  }
  for (const [id, items] of byId) {
    if (items.length < 2) continue;
    const evidenceSets = items.map((item) => [...item.policy.requiredEvidence].sort().join("|"));
    const unique = new Set(evidenceSets);
    if (unique.size > 1) {
      conflicts.push(
        `Policy ${id} conflicts across sources (${items.map((i) => i.policy.source).join(" vs ")}): requiredEvidence disagree.`
      );
    }
    const approverSets = items.map((item) => [...item.policy.requiredApprovers].sort().join("|"));
    if (new Set(approverSets).size > 1) {
      conflicts.push(`Policy ${id} conflicts across sources: requiredApprovers disagree.`);
    }
  }

  return {
    applicable,
    conflicts,
    stale: applicable.filter((item) => item.stale)
  };
}

function scopeMatches(scope: PolicyScope, changedPaths: string[], changeClass: PolicyChangeClass): boolean {
  if (scope.kind === "repository") return scope.match === "*" || scope.match === ".";
  if (scope.kind === "change-class") return scope.match === changeClass || scope.match === "*";
  if (scope.kind === "path") return changedPaths.some((path) => pathMatches(scope.match, path));
  if (scope.kind === "package") {
    return changedPaths.some((path) => path === scope.match || path.startsWith(`${scope.match}/`));
  }
  // route/requirement/data/environment: exact token match against changeClass for this slice
  return scope.match === changeClass || scope.match === "*";
}

export function pathMatches(pattern: string, path: string): boolean {
  if (pattern === "*" || pattern === "**") return true;
  if (pattern.endsWith("/**")) {
    const prefix = pattern.slice(0, -3);
    return path === prefix || path.startsWith(`${prefix}/`);
  }
  if (pattern.endsWith("/*")) {
    const prefix = pattern.slice(0, -2);
    if (!path.startsWith(`${prefix}/`)) return false;
    return !path.slice(prefix.length + 1).includes("/");
  }
  if (pattern.includes("*")) {
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*");
    return new RegExp(`^${escaped}$`).test(path);
  }
  return path === pattern || path.startsWith(`${pattern}/`);
}

export function inferChangeClass(changedPaths: string[]): PolicyChangeClass {
  if (!changedPaths.length) return "unknown";
  if (changedPaths.every((path) => path.startsWith("docs/") || path.endsWith(".md"))) return "docs";
  if (changedPaths.some((path) => path.includes("migration") || path.endsWith(".sql"))) return "migration";
  if (changedPaths.some((path) => path.includes(".codedecay/policies/") || path.includes("protected/"))) {
    return "protected-path";
  }
  if (changedPaths.some((path) => path.includes(".test.") || path.includes("__tests__/"))) return "test";
  if (changedPaths.some((path) => path.includes("config") || path.endsWith(".yml") || path.endsWith(".yaml"))) {
    return "config";
  }
  return "source";
}
