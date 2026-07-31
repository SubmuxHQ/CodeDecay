import type { ImpactedRoute, RiskLevel } from "@submuxhq/codedecay-core";
import type { TestProofAudit } from "@submuxhq/codedecay-test-audit";
import type { RedteamExecutionStatus, RedteamProofGrade, RedteamVerificationStatus } from "../types";

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

  if (route.framework === "remix") {
    return "Remix route";
  }

  if (route.framework === "fastapi") {
    return "FastAPI route";
  }

  return "Node route handler";
}

export function formatTestProofStatus(status: TestProofAudit["status"]): string {
  if (status === "not_applicable") {
    return "Not applicable";
  }

  return `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}

export function formatExecutionStatus(status: RedteamExecutionStatus): string {
  if (status === "timed_out") {
    return "Timed out";
  }

  return `${status.charAt(0).toUpperCase()}${status.slice(1).replaceAll("_", " ")}`;
}

export function formatProofGrade(grade: RedteamProofGrade): string {
  switch (grade) {
    case "tool-evidence":
      return "Tool evidence";
    case "deterministic-signal":
      return "Deterministic signal";
    case "missing-proof":
      return "Missing proof";
    case "memory-context":
      return "Memory context";
    case "agent-suggestion":
      return "Agent suggestion";
  }
}

export function formatVerificationStatus(status: RedteamVerificationStatus): string {
  switch (status) {
    case "not-run":
      return "Not run";
    case "verified":
      return "Verified";
    case "unverified":
      return "Unverified";
    case "failed":
      return "Failed";
    case "blocked":
      return "Blocked";
  }
}
