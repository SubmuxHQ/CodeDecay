import type { ImpactedRoute, RiskLevel } from "@submuxhq/codedecay-core";
import { dedupeStrings } from "@submuxhq/codedecay-core";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

export const HTTP_METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

export function routeImpact(input: {
  framework: ImpactedRoute["framework"];
  kind: ImpactedRoute["kind"];
  route: string;
  methods: string[];
  file: string;
  risk: RiskLevel;
  reasons: string[];
}): ImpactedRoute {
  return {
    framework: input.framework,
    kind: input.kind,
    route: normalizeRoute(input.route),
    methods: dedupeStrings(input.methods.map((method) => method.toUpperCase())),
    files: [input.file],
    risk: input.risk,
    reasons: input.reasons,
    recommendedTests: [`Add or run tests covering ${input.file}`]
  };
}

export function higherRisk(left: RiskLevel, right: RiskLevel): RiskLevel {
  const score = (value: RiskLevel): number => (value === "high" ? 3 : value === "medium" ? 2 : 1);
  return score(left) >= score(right) ? left : right;
}

export function normalizeRouteSegments(path: string): string {
  const segments = path
    .split("/")
    .filter((segment) => segment.length > 0 && !/^\(.+\)$/.test(segment))
    .map((segment) => (segment === "index" ? "" : segment))
    .filter((segment) => segment.length > 0);

  return segments.join("/");
}

export function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}

function normalizeRoute(route: string): string {
  const normalized = `/${route}`.replace(/\/+/g, "/").replace(/\/$/, "");
  return normalized.length === 0 ? "/" : normalized;
}
