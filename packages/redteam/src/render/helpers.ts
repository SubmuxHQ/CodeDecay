import type { ImpactedRoute, RiskLevel } from "@submuxhq/codedecay-core";
import type { TestProofAudit } from "@submuxhq/codedecay-test-audit";

export function formatRisk(level: RiskLevel): string {
  if (level === "high") {
    return "High";
  }

  if (level === "medium") {
    return "Medium";
  }

  return "Low";
}

export function formatRoute(route: ImpactedRoute): string {
  if (route.methods.length === 0) {
    return route.route;
  }

  return `${route.methods.join(", ")} ${route.route}`;
}

export function routeKindLabel(route: ImpactedRoute): string {
  if (route.framework === "nextjs" && route.kind === "api-route") {
    return "Next.js API route";
  }

  if (route.framework === "nextjs" && route.kind === "ui-route") {
    return "Next.js UI route";
  }

  if (route.framework === "nextjs" && route.kind === "middleware") {
    return "Next.js middleware";
  }

  if (route.framework === "express") {
    return "Express route handler";
  }

  if (route.framework === "fastify") {
    return "Fastify route handler";
  }

  return "Node route handler";
}

export function formatTestProofStatus(status: TestProofAudit["status"]): string {
  if (status === "not_applicable") {
    return "Not applicable";
  }

  return `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}
